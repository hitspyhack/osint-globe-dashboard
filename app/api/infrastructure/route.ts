import { type NextRequest } from "next/server";
import { envelope, failure, fetchUpstream } from "@/lib/server/upstream";

export const dynamic = "force-dynamic";

const OVERPASS_MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

/**
 * Curated OSM installations: airfields, ports, military areas and nuclear
 * plants. The Overpass answer is cached for 12 hours — it is expensive.
 */
const QUERY = `[out:json][timeout:120];
(
  node["aeroway"="aerodrome"]["iata"](-85,-180,85,180);
  node["landuse"="harbour"](-85,-180,85,180);
  way["landuse"="military"](-85,-180,85,180);
  node["power"="plant"]["plant:source"="nuclear"](-85,-180,85,180);
);
out tags center 2000;`;

interface Element {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string>;
}

function classify(tags: Record<string, string>): string | null {
  if (tags.aeroway === "aerodrome") return "Airfield";
  if (tags.landuse === "harbour") return "Port";
  if (tags.landuse === "military") return "Military";
  if (tags.power === "plant") return "Nuclear";
  return null;
}

export async function GET(request: NextRequest) {
  const kinds = request.nextUrl.searchParams.get("kinds");

  for (const mirror of OVERPASS_MIRRORS) {
    try {
      const { body, cached } = await fetchUpstream(mirror, {
        method: "POST",
        body: `data=${encodeURIComponent(QUERY)}`,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        ttlSeconds: 43_200,
      });

      const parsed = JSON.parse(body) as { elements?: Element[] };
      const items = (parsed.elements ?? [])
        .map((element) => {
          const kind = classify(element.tags ?? {});
          const lat = element.lat ?? element.center?.lat;
          const lng = element.lon ?? element.center?.lon;
          if (!kind || typeof lat !== "number" || typeof lng !== "number") return null;
          return {
            id: `osm-${kind}-${element.type}-${element.id}`,
            lat,
            lng,
            name:
              element.tags?.name ??
              element.tags?.["name:en"] ??
              element.tags?.ref ??
              element.tags?.iata ??
              `${kind} installation`,
            kind,
          };
        })
        .filter((site): site is NonNullable<typeof site> => site !== null)
        .filter((site) => !kinds || kinds.split(",").includes(site.kind));

      return envelope({ items, count: items.length, source: "OpenStreetMap (Overpass)", cached });
    } catch {
      continue;
    }
  }

  return failure("Overpass mirrors unavailable");
}
