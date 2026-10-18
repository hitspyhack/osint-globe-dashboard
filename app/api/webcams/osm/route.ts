import { type NextRequest } from "next/server";
import { envelope, failure, fetchUpstream } from "@/lib/server/upstream";

export const dynamic = "force-dynamic";

const OVERPASS_MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

/** Public cameras mapped in OpenStreetMap — keyless, but Overpass is slow. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const bbox = params.get("bbox") ?? "-180,-85,180,85";
  const [west, south, east, north] = bbox.split(",").map((value) => Number.parseFloat(value));
  const bounds =
    [west, south, east, north].every((value) => Number.isFinite(value))
      ? { south, west, north, east }
      : { south: -85, west: -180, north: 85, east: 180 };

  const query = `[out:json][timeout:60];
(
  node["webcam"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});
  node["contact:webcam"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});
);
out tags center 400;`;

  for (const mirror of OVERPASS_MIRRORS) {
    try {
      const { body, cached } = await fetchUpstream(mirror, {
        method: "POST",
        body: `data=${encodeURIComponent(query)}`,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        ttlSeconds: 3600,
      });

      const parsed = JSON.parse(body) as { elements?: Array<Record<string, any>> };
      const items = (parsed.elements ?? [])
        .map((node) => {
          const lat = node.lat ?? node.center?.lat;
          const lng = node.lon ?? node.center?.lon;
          if (typeof lat !== "number" || typeof lng !== "number") return null;
          const tags = node.tags ?? {};
          return {
            id: `osm-${node.id}`,
            lat,
            lng,
            title: tags.name ?? tags.description ?? "OSM camera",
            imageUrl: tags.image,
            embedUrl: tags["contact:webcam"] ?? tags.webcam ?? tags.website ?? tags.url,
            source: "osm",
          };
        })
        .filter((cam): cam is NonNullable<typeof cam> => cam !== null);

      return envelope({ items, count: items.length, source: "OpenStreetMap", cached });
    } catch {
      continue;
    }
  }

  return failure("Overpass mirrors unavailable");
}
