import { type NextRequest } from "next/server";
import { envelope, failure, fetchJson } from "@/lib/server/upstream";

export const dynamic = "force-dynamic";

interface NominatimResult {
  place_id?: number;
  display_name: string;
  lat: string;
  lon: string;
  type?: string;
  category?: string;
  importance?: number;
  boundingbox?: string[];
}

/**
 * Server-side Nominatim geocoding. Going through our own origin lets us set a
 * real User-Agent (required by the usage policy) and cache repeated lookups.
 */
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q");
  if (!query || query.trim().length < 2) {
    return envelope({ items: [], count: 0, source: "Nominatim" });
  }

  const params = new URLSearchParams({
    q: query.trim(),
    format: "jsonv2",
    limit: "6",
    addressdetails: "1",
  });

  try {
    const { data, cached } = await fetchJson<NominatimResult[]>(
      `https://nominatim.openstreetmap.org/search?${params}`,
      {
        ttlSeconds: 86_400,
        headers: {
          "User-Agent": "osint-globe-dashboard/0.3 (OSINT globe console)",
          "Accept-Language": "en",
        },
      }
    );

    const items = (Array.isArray(data) ? data : []).map((result) => ({
      id: String(result.place_id ?? `${result.lat},${result.lon}`),
      label: result.display_name,
      lat: Number.parseFloat(result.lat),
      lng: Number.parseFloat(result.lon),
      type: result.type,
      category: result.category,
      // Nominatim returns [south, north, west, east].
      bbox: result.boundingbox
        ? {
            south: Number.parseFloat(result.boundingbox[0]),
            north: Number.parseFloat(result.boundingbox[1]),
            west: Number.parseFloat(result.boundingbox[2]),
            east: Number.parseFloat(result.boundingbox[3]),
          }
        : undefined,
    }));

    return envelope({ items, count: items.length, source: "Nominatim", cached });
  } catch (error) {
    return failure(error instanceof Error ? error.message : "geocoder unavailable");
  }
}
