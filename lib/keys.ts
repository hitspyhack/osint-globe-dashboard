import { KEYS_HEADER } from "@/lib/keys.shared";
import type { ApiKeyMap } from "@/types";

const STORAGE_KEY = "osint-globe.keys.v1";

export { KEYS_HEADER };

/** Keys live in localStorage: they never leave the browser except to our own API routes. */
export function loadKeys(): ApiKeyMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as ApiKeyMap) : {};
  } catch {
    return {};
  }
}

export function saveKeys(keys: ApiKeyMap): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
  } catch {
    /* storage disabled — keys stay in memory only */
  }
}

export function clearKeys(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* noop */
  }
}

function encode(value: string): string {
  if (typeof window === "undefined") return Buffer.from(value, "utf-8").toString("base64");
  return window.btoa(unescape(encodeURIComponent(value)));
}

/** Attach POWER UP keys to a request to one of our own API routes. */
export function keysToHeaders(keys: ApiKeyMap): Record<string, string> {
  const cleaned = Object.entries(keys)
    .filter(([, value]) => Boolean(value && value.trim()))
    .reduce<ApiKeyMap>((acc, [id, value]) => {
      acc[id] = value.trim();
      return acc;
    }, {});

  if (Object.keys(cleaned).length === 0) return {};
  return { [KEYS_HEADER]: encode(JSON.stringify(cleaned)) };
}

export function hasKey(keys: ApiKeyMap, id: string | undefined): boolean {
  if (!id) return false;
  return Boolean(keys[id] && keys[id].trim());
}
