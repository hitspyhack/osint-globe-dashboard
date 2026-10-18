import { type NextRequest } from "next/server";
import { envelope, failure, fetchJson } from "@/lib/server/upstream";

export const dynamic = "force-dynamic";

interface UsgsFeature {
  id: string;
  properties: {
    mag: number | null;
    place: string | null;
    time: number;
    url: string | null;
    tsunami: number;
    alert: string | null;
    type: string | null;
  };
  geometry: { coordinates: [number, number, number] | null };
}

const API = "https://earthquake.usgs.gov/fdsnws/event/1/query";
const FEEDS = [
  "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson",
  "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson",
];

function normalise(features: UsgsFeature[]) {
  return features
    .map((feature) => {
      const coords = feature.geometry?.coordinates;
      if (!coords) return null;
      const [lng, lat, depth] = coords;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return {
        id: feature.id,
        mag: feature.properties?.mag ?? 0,
        place: feature.properties?.place ?? "Unknown region",
        lat,
        lng,
        depthKm: depth ?? 0,
        time: feature.properties?.time ?? 0,
        url: feature.properties?.url ?? undefined,
        tsunami: Boolean(feature.properties?.tsunami),
        alert: feature.properties?.alert ?? null,
      };
    })
    .filter((quake): quake is NonNullable<typeof quake> => quake !== null);
}

/** USGS seismicity. Supports `start`/`end`/`minmag` for timeline scrubbing. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const start = params.get("start");
  const end = params.get("end");
  const minMag = params.get("minmag");

  const query = new URLSearchParams({ format: "geojson", orderby: "time" });
  if (start) query.set("starttime", start);
  if (end) query.set("endtime", end);
  query.set("minmagnitude", minMag ?? "2.5");
  query.set("limit", "2000");

  try {
    const { data, cached } = await fetchJson<{ features?: UsgsFeature[] }>(`${API}?${query}`, {
      ttlSeconds: 120,
    });
    const items = normalise(data.features ?? []);
    return envelope({ items, count: items.length, source: "USGS FDSN", cached });
  } catch {
    for (const feed of FEEDS) {
      try {
        const { data, cached } = await fetchJson<{ features?: UsgsFeature[] }>(feed, {
          ttlSeconds: 120,
        });
        const items = normalise(data.features ?? []);
        return envelope({ items, count: items.length, source: "USGS summary feed", cached });
      } catch {
        continue;
      }
    }
    return failure("USGS feed unavailable");
  }
}
