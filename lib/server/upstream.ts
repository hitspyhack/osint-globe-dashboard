import { NextResponse } from "next/server";
import { KEYS_HEADER } from "@/lib/keys.shared";
import type { ApiEnvelope, ApiKeyMap } from "@/types";

/** Timeout for any upstream request made by an API route. */
export const UPSTREAM_TIMEOUT_MS = 12_000;

/**
 * Cache for upstream responses, keyed by URL.
 *
 * Next.js `fetch` caching is keyed on the request, but several of our adapters
 * hit rotating mirrors, and a small in-process cache keeps the console snappy
 * (and keeps us inside free-tier rate limits) during development.
 */
interface CacheEntry {
  body: string;
  status: number;
  headers: Record<string, string>;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<CacheEntry>>();

export interface UpstreamOptions {
  /** Seconds to keep the response around. */
  ttlSeconds?: number;
  headers?: Record<string, string>;
  method?: "GET" | "POST";
  body?: string;
  /** Skip the cache entirely (POST queries, keyed feeds). */
  noCache?: boolean;
}

function decode(headerValue: string | null): ApiKeyMap {
  if (!headerValue) return {};
  try {
    const json = Buffer.from(headerValue, "base64").toString("utf-8");
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === "object" ? (parsed as ApiKeyMap) : {};
  } catch {
    return {};
  }
}

/**
 * Keys can arrive either from the POWER UP panel (base64 header) or from the
 * server environment (.env.local). Panel keys win so the UI is self-service.
 */
export function resolveKeys(request: Request): ApiKeyMap {
  const fromHeader = decode(request.headers.get(KEYS_HEADER));
  const fromEnv: ApiKeyMap = {
    WINDY: process.env.WINDY_WEBCAMS_API_KEY ?? "",
    AIS: process.env.AIS_API_KEY ?? process.env.SPIRE_API_KEY ?? process.env.MARINETRAFFIC_API_KEY ?? "",
    FIRMS: process.env.FIRMS_MAP_KEY ?? process.env.NASA_FIRMS_KEY ?? "",
    OPENSKY_USER: process.env.OPENSKY_USERNAME ?? "",
    OPENSKY_PASS: process.env.OPENSKY_PASSWORD ?? "",
  };

  return { ...fromEnv, ...fromHeader };
}

async function request(url: string, options: UpstreamOptions): Promise<CacheEntry> {
  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers: options.headers,
    body: options.body,
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    cache: "no-store",
  });

  const body = await response.text();
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === "content-type") headers[key] = value;
  });

  return { body, status: response.status, headers, expiresAt: 0 };
}

export async function fetchUpstream(
  url: string,
  options: UpstreamOptions = {}
): Promise<{ body: string; status: number; headers: Record<string, string>; cached: boolean }> {
  const ttl = (options.ttlSeconds ?? 60) * 1000;
  const key = `${options.method ?? "GET"}:${options.body ?? ""}:${url}`;

  if (!options.noCache) {
    const hit = cache.get(key);
    if (hit && hit.expiresAt > Date.now()) {
      return { body: hit.body, status: hit.status, headers: hit.headers, cached: true };
    }
    const pending = inflight.get(key);
    if (pending) {
      const entry = await pending;
      return { body: entry.body, status: entry.status, headers: entry.headers, cached: true };
    }
  }

  const promise = request(url, options)
    .then((entry) => {
      entry.expiresAt = Date.now() + ttl;
      cache.set(key, entry);
      return entry;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, promise);
  const entry = await promise;
  return { body: entry.body, status: entry.status, headers: entry.headers, cached: false };
}

/** Fetch upstream and parse it as JSON. */
export async function fetchJson<T>(
  url: string,
  options: UpstreamOptions = {}
): Promise<{ data: T; cached: boolean }> {
  const { body, cached } = await fetchUpstream(url, options);
  return { data: JSON.parse(body) as T, cached };
}

export function envelope<T>(payload: Partial<ApiEnvelope<T>>): NextResponse {
  return NextResponse.json(
    {
      ok: payload.ok ?? true,
      items: payload.items ?? [],
      count: payload.count,
      source: payload.source,
      fetchedAt: payload.fetchedAt ?? Date.now(),
      cached: payload.cached,
      error: payload.error,
      needsKey: payload.needsKey,
    },
    {
      headers: {
        "cache-control": "no-store",
      },
    }
  );
}

export function failure(message: string, needsKey = false): NextResponse {
  return envelope({ ok: false, items: [], error: message, needsKey });
}

/** Try a list of mirror URLs until one answers. */
export async function fetchFirstMirror<T>(
  urls: string[],
  options: UpstreamOptions = {}
): Promise<{ data: T; source: string; cached: boolean }> {
  let lastError = "all mirrors failed";
  let index = 0;

  for (const url of urls) {
    try {
      const { data, cached } = await fetchJson<T>(url, options);
      return { data, source: `mirror#${index}`, cached };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    index += 1;
  }

  throw new Error(lastError);
}
