const UTC_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

/** `2026-10-18 14:52:03Z` */
export function formatUtc(date: Date | number): string {
  const d = typeof date === "number" ? new Date(date) : date;
  return `${UTC_FORMATTER.format(d).replace(",", "")}Z`;
}

/** `14:52:03Z` */
export function formatUtcClock(date: Date | number): string {
  const d = typeof date === "number" ? new Date(date) : date;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}Z`;
}

/** `4m ago`, `3h ago`, `2d ago` — always relative to *now*. */
export function formatRelative(timestamp: number | undefined, now = Date.now()): string {
  if (!timestamp) return "—";
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (seconds < 45) return "just now";
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)}h ago`;
  if (seconds < 2_592_000) return `${Math.round(seconds / 86_400)}d ago`;
  return new Date(timestamp).toISOString().slice(0, 10);
}

/** Countdown to a future timestamp: `T-02d 04:31:12`. */
export function formatCountdown(target: number, now = Date.now()): string {
  const delta = target - now;
  const sign = delta < 0 ? "+" : "-";
  const abs = Math.abs(delta);
  const days = Math.floor(abs / 86_400_000);
  const hours = Math.floor((abs % 86_400_000) / 3_600_000);
  const minutes = Math.floor((abs % 3_600_000) / 60_000);
  const seconds = Math.floor((abs % 60_000) / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `T${sign}${String(days).padStart(2, "0")}d ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
