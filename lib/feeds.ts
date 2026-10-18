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

  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate.url, {
        ...candidate.init,
        headers: { ...headers, ...(candidate.init?.headers ?? {}) },
        signal: signal ?? AbortSignal.timeout(timeoutMs),
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
      return { items, source: candidate.label };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      attempts.push(`${candidate.label}: ${reason}`);
    }
  }

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
