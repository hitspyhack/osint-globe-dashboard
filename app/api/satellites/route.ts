import { type NextRequest } from "next/server";
import { envelope, failure, fetchUpstream } from "@/lib/server/upstream";

export const dynamic = "force-dynamic";

/** CelesTrak groups we expose. Anything not listed falls back to `stations`. */
const GROUPS = new Set([
  "stations",
  "weather",
  "noaa",
  "goes",
  "resource",
  "gps-ops",
  "glonass-ops",
  "galileo",
  "beidou",
  "geo",
  "science",
  "starlink",
  "oneweb",
  "iridium",
  "military",
]);

const MAX_PER_GROUP = 400;

/** TLE catalogue for a CelesTrak group, cached for an hour. */
export async function GET(request: NextRequest) {
  const requested = request.nextUrl.searchParams.get("group") ?? "stations";
  const group = GROUPS.has(requested) ? requested : "stations";

  try {
    const { body, cached } = await fetchUpstream(
      `https://celestrak.org/NORAD/elements/gp.php?GROUP=${group}&FORMAT=tle`,
      { ttlSeconds: 3600 }
    );

    const lines = body
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const satellites: Array<{ name: string; noradId: number; tle: string; group: string }> = [];
    for (let i = 0; i < lines.length; i += 1) {
      if (!lines[i].startsWith("1 ")) continue;
      const line1 = lines[i];
      const line2 = lines[i + 1];
      if (!line2?.startsWith("2 ")) continue;

      const previous = i > 0 ? lines[i - 1] : "";
      const isDataLine = previous.startsWith("1 ") || previous.startsWith("2 ");
      const noradId = Number.parseInt(line1.slice(2, 7), 10);
      if (!Number.isFinite(noradId)) continue;

      satellites.push({
        name: i > 0 && !isDataLine ? previous : `NORAD ${noradId}`,
        noradId,
        tle: `${line1}\n${line2}`,
        group,
      });
      i += 1;
      if (satellites.length >= MAX_PER_GROUP) break;
    }

    return envelope({
      items: satellites,
      count: satellites.length,
      source: `CelesTrak:${group}`,
      cached,
    });
  } catch (error) {
    return failure(error instanceof Error ? error.message : "satellite catalogue unavailable");
  }
}
