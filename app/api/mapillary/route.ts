import { type NextRequest } from "next/server";
import { envelope, failure, fetchJson, resolveKeys } from "@/lib/server/upstream";

export const dynamic = "force-dynamic";

/**
 * Mapillary street-level imagery adapter.
 *
 * Mapillary's Graph API v4 needs an access token (free from the developer
 * dashboard — https://www.mapillary.com/dashboard/developers). The route
 * proxies `GET /images` for the current view so the token stays server-side
 * when set via .env.local; POWER UP panel keys arrive on the x-ogd-keys
 * header and win over the environment.
 *
 * Mapillary bboxes are city-scale: wide views are skipped instead of
 * hammering a request the API would reject.
 */

interface MapillaryFeature {
  id?: string;
  geometry?: { type?: string; coordinates?: [number, number] | number[] };
  properties?: {
    compass_angle?: number;
    thumb_1024_url?: string;
    captured_at?: number;
    is_pano?: boolean;
  };
}

const MAX_ITEMS = 400;
/** Widest bbox edge, in degrees, that we will query (~440 km at the equator). */
const MAX_BBOX_SPAN_DEG = 4;

function normalise(features: MapillaryFeature[]) {
  return features
    .map((feature) => {
      const coords = feature.geometry?.coordinates;
      const lng = coords?.[0];
      const lat = coords?.[1];
      if (typeof lat !== "number" || typeof lng !== "number") return null;
      const properties = feature.properties ?? {};
      return {
        id: String(feature.id ?? `${lat},${lng}`),
        lat,
        lng,
        thumbUrl: properties.thumb_1024_url,
        capturedAt: typeof properties.captured_at === "number" ? properties.captured_at : undefined,
        isPano: Boolean(properties.is_pano),
        compassAngle: properties.compass_angle,
      };
    })
    .filter((image): image is NonNullable<typeof image> => image !== null)
    .slice(0, MAX_ITEMS);
}

export async function GET(request: NextRequest) {
  const keys = resolveKeys(request);
  const token = keys.MAPILLARY?.trim();
  if (!token) {
    return failure("Mapillary access token required — add one in POWER UP", true);
  }

  const params = request.nextUrl.searchParams;
  const bbox = params.get("bbox");
  if (!bbox) {
    return failure("bbox query parameter required");
  }

  // Our console bbox format is south,west,north,east; Mapillary wants
  // minLng,minLat,maxLng,maxLat.
  const [south, west, north, east] = bbox
    .split(",")
    .map((value) => Number.parseFloat(value));
  if (![south, west, north, east].every((value) => Number.isFinite(value))) {
    return failure("malformed bbox");
  }
  if (
    Math.max(Math.abs(north - south), Math.abs(east - west)) > MAX_BBOX_SPAN_DEG ||
    north <= south ||
    east <= west
  ) {
    // A zoomed-out view is not a query Mapillary can answer — answer cleanly
    // instead of surfacing an upstream error.
    return envelope({ items: [], count: 0, source: "Mapillary — zoom in to query" });
  }

  const query = new URLSearchParams({
    access_token: token,
    bbox: `${west},${south},${east},${north}`,
    fields: "id,geometry,compass_angle,thumb_1024_url,captured_at,is_pano",
  });

  try {
    const { data, cached } = await fetchJson<{ features?: MapillaryFeature[] }>(
      `https://graph.mapillary.com/images?${query.toString()}`,
      { ttlSeconds: 60, headers: { "User-Agent": "osint-globe-dashboard/0.4" } }
    );

    const items = normalise(data.features ?? []);
    return envelope({ items, count: items.length, source: "Mapillary", cached });
  } catch (error) {
    return failure(error instanceof Error ? error.message : "Mapillary feed unavailable");
  }
}
