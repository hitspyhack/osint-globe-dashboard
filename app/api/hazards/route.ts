import { type NextRequest } from "next/server";
import { envelope, failure, fetchJson } from "@/lib/server/upstream";

export const dynamic = "force-dynamic";

/**
 * NASA EONET natural events.
 *
 * Examples: `?category=wildfires&days=2`, `?category=volcanoes&days=30`.
 * The timeline can pin a window with `start` / `end` (ISO dates).
 */
const CATEGORIES = new Set([
  "wildfires",
  "volcanoes",
  "severeStorms",
  "floods",
  "drought",
  "earthquakes",
  "landslides",
  "snow",
  "seaLakeIce",
  "dustHaze",
  "manmade",
  "waterColor",
  "temperatureExtremes",
]);

interface EonetEvent {
  id: string;
  title: string;
  closed?: string | null;
  sources?: Array<{ id?: string; url?: string }>;
  geometries?: Array<{
    date?: string;
    type?: string;
    coordinates?: unknown;
    magnitudeValue?: number;
    magnitudeUnit?: string;
  }>;
}

type EonetGeometry = NonNullable<EonetEvent["geometries"]>[number];

function coordsOf(geometry: EonetGeometry): [number, number] | null {
  const raw = geometry?.coordinates;
  if (Array.isArray(raw) && typeof raw[0] === "number" && typeof raw[1] === "number") {
    return [raw[0] as number, raw[1] as number];
  }
  // Polygons arrive as [[[lng, lat], ...]] — take the first ring's first point.
  if (Array.isArray(raw) && Array.isArray(raw[0]) && Array.isArray(raw[0][0])) {
    const point = raw[0][0] as number[];
    if (typeof point[0] === "number" && typeof point[1] === "number") {
      return [point[0], point[1]];
    }
  }
  return null;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const requested = params.get("category") ?? "wildfires";
  const category = CATEGORIES.has(requested) ? requested : "wildfires";
  const days = Math.min(Number.parseInt(params.get("days") ?? "7", 10) || 7, 365);
  const start = params.get("start");
  const end = params.get("end");

  const query = new URLSearchParams({ category, days: String(days), status: "open" });
  if (start) query.set("start", start);
  if (end) query.set("end", end);

  try {
    const { data, cached } = await fetchJson<{ events?: EonetEvent[] }>(
      `https://eonet.gsfc.nasa.gov/api/v2.1/events?${query}`,
      { ttlSeconds: 300 }
    );

    const items = (data.events ?? [])
      .map((event) => {
        const geometries: EonetEvent["geometries"] = event.geometries ?? [];
        const latest = geometries[geometries.length - 1];
        if (!latest) return null;
        const coords = coordsOf(latest);
        if (!coords) return null;
        return {
          id: event.id,
          title: event.title,
          lat: coords[1],
          lng: coords[0],
          date: latest.date ?? undefined,
          category,
          source: event.sources?.[0]?.id,
          sourceUrl: event.sources?.[0]?.url,
          closed: Boolean(event.closed),
          magnitude:
            latest.magnitudeValue !== undefined
              ? `${latest.magnitudeValue} ${latest.magnitudeUnit ?? ""}`.trim()
              : undefined,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    return envelope({ items, count: items.length, source: `NASA EONET:${category}`, cached });
  } catch (error) {
    return failure(error instanceof Error ? error.message : "EONET unavailable");
  }
}
