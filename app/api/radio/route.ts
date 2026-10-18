import { type NextRequest } from "next/server";
import { envelope, failure, fetchJson } from "@/lib/server/upstream";

export const dynamic = "force-dynamic";

const MIRRORS = [
  "https://de1.api.radio-browser.info",
  "https://fi1.api.radio-browser.info",
  "https://nl1.api.radio-browser.info",
  "https://at1.api.radio-browser.info",
];

interface Station {
  stationuuid?: string;
  name?: string;
  url?: string;
  url_resolved?: string;
  homepage?: string;
  codec?: string;
  bitrate?: number;
  country?: string;
  tags?: string;
  geo_lat?: number | null;
  geo_long?: number | null;
}

/** Geo-located broadcast stations from the Radio Browser directory. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const limit = Math.min(Number.parseInt(params.get("limit") ?? "400", 10) || 400, 1000);
  const query = new URLSearchParams({
    hidebroken: "true",
    has_geo_info: "true",
    order: "votes",
    reverse: "true",
    limit: String(limit),
  });

  for (const mirror of MIRRORS) {
    try {
      const { data, cached } = await fetchJson<Station[]>(
        `${mirror}/json/stations/search?${query}`,
        { ttlSeconds: 3600, headers: { "User-Agent": "osint-globe-dashboard/0.3" } }
      );

      const items = (Array.isArray(data) ? data : [])
        .map((station) => {
          const lat = Number.parseFloat(String(station.geo_lat));
          const lng = Number.parseFloat(String(station.geo_long));
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
          return {
            id: station.stationuuid ?? `${lat},${lng}`,
            name: (station.name ?? "Unknown station").trim(),
            lat,
            lng,
            streamUrl: station.url_resolved || station.url,
            codec: station.codec,
            bitrate: Number.parseFloat(String(station.bitrate)) || undefined,
            country: station.country,
            tags: station.tags,
            homepage: station.homepage,
          };
        })
        .filter((station): station is NonNullable<typeof station> => station !== null);

      return envelope({ items, count: items.length, source: "Radio Browser", cached });
    } catch {
      continue;
    }
  }

  return failure("Radio Browser mirrors unavailable");
}
