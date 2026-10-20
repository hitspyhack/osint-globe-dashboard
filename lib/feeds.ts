import { apiUrl } from "@/lib/api-url";
import { keysToHeaders } from "@/lib/keys";

export interface FeedCandidate<T> {
  /** URL to try. */
  url: string;
  /** Label reported back as the "source" when this candidate wins. */
  label: string;
  /** Turn the raw payload into the shape the app wants. */
  parse: (raw: unknown) => T;
  init?: RequestInit;
}

export interface FeedSuccess<T> {
  items: T;
  source: string;
}

export class FeedError extends Error {
  readonly attempts: string[];

  constructor(message: string, attempts: string[]) {
    super(message);
    this.name = "FeedError";
    this.attempts = attempts;
  }
}

function createRequestSignal(parent: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const abortFromParent = () => controller.abort(parent?.reason);

  if (parent?.aborted) abortFromParent();
  else parent?.addEventListener("abort", abortFromParent, { once: true });

  return {
    signal: controller.signal,
    cleanup() {
      clearTimeout(timeout);
      parent?.removeEventListener("abort", abortFromParent);
    },
  };
}

export interface FeedOptions {
  timeoutMs?: number;
  headers?: Record<string, string>;
  /** Aborted when the component unmounts or the layer is switched off. */
  signal?: AbortSignal;
}

/**
 * Try each candidate in order and return the first one that answers.
 *
 * Candidates are usually [our own /api proxy, the upstream URL]. The proxy is
 * preferred because it caches and hides credentials; falling back to a direct
 * browser request keeps the console alive when the proxy cannot reach the
 * network (offline dev, locked-down sandbox, self-hosted without egress).
 */
export async function fetchFirst<T>(
  candidates: FeedCandidate<T>[],
  options: FeedOptions = {}
): Promise<FeedSuccess<T>> {
  const { timeoutMs = 12_000, headers = {}, signal } = options;
  const attempts: string[] = [];
  /** First candidate that answered successfully but carried no items. */
  let empty: FeedSuccess<T> | null = null;

  for (const candidate of candidates) {
    const request = createRequestSignal(signal, timeoutMs);
    try {
      const response = await fetch(apiUrl(candidate.url), {
        ...candidate.init,
        headers: { ...headers, ...(candidate.init?.headers ?? {}) },
        signal: request.signal,
        cache: "no-store",
      });

      if (!response.ok) {
        attempts.push(`${candidate.label}: HTTP ${response.status}`);
        continue;
      }

      const text = await response.text();
      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch {
        payload = text; // TLE catalogues and CSV feeds come back as plain text
      }

      const items = candidate.parse(payload);

      // A parse that yields nothing is not a win: upstream shape drift and
      // throttled responses parse "successfully" into empty lists, which used
      // to shadow healthy mirrors and report the layer online with 0 items.
      // Keep the first empty answer as a fallback and try the next candidate.
      if (Array.isArray(items) && items.length === 0) {
        if (!empty) empty = { items, source: candidate.label };
        attempts.push(`${candidate.label}: 0 items`);
        continue;
      }

      return { items, source: candidate.label };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      attempts.push(`${candidate.label}: ${reason}`);
      if (signal?.aborted) break;
    } finally {
      request.cleanup();
    }
  }

  // Every candidate failed or came back empty: a legitimate empty feed is
  // still better than an error (e.g. a region with nothing to report).
  if (empty) return empty;

  throw new FeedError(attempts.join(" · ") || "no candidates", attempts);
}

/** Envelope returned by our own `/api/*` routes. */
export interface Envelope {
  ok?: boolean;
  items?: unknown;
  error?: string;
  needsKey?: boolean;
  source?: string;
}

export function parseEnvelope(raw: unknown): unknown {
  const envelope = raw as Envelope;
  if (!envelope || typeof envelope !== "object") return [];
  if (envelope.ok === false) {
    throw new Error(envelope.error ?? "upstream error");
  }
  return envelope.items ?? [];
}

export function feedHeaders(keys: Record<string, string>): Record<string, string> {
  return keysToHeaders(keys);
}
