const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/+$/, "");

/**
 * Resolve only this app's API paths against the hosted Next.js backend.
 * Normal web builds stay same-origin; the packaged Capacitor UI uses the
 * configured HTTPS API origin because it is served from capacitor://localhost.
 */
export function apiUrl(path: string): string {
  if (!API_BASE_URL || !path.startsWith("/api/")) return path;
  return `${API_BASE_URL}${path}`;
}

/** The hosted app origin is also the share-link destination for native builds. */
export function appOrigin(): string {
  return API_BASE_URL || window.location.origin;
}
