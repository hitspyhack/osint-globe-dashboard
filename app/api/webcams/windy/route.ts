import { type NextRequest } from "next/server";
import { envelope, failure, fetchJson, resolveKeys } from "@/lib/server/upstream";

export const dynamic = "force-dynamic";

/** Windy webcams. Requires a Windy API key (env or POWER UP panel). */
export async function GET(request: NextRequest) {
  const keys = resolveKeys(request);
  const key = keys.WINDY;

  if (!key) {
    return envelope({
      items: [],
      count: 0,
      needsKey: true,
      error: "Windy API key required",
      source: "none",
    });
  }

  const params = request.nextUrl.searchParams;
  const bbox = params.get("bbox") ?? "-180,-85,180,85";
  const limit = Math.min(Number.parseInt(params.get("limit") ?? "200", 10) || 200, 500);

  try {
    const { data, cached } = await fetchJson<{
      result?: { webcams?: Array<Record<string, any>> };
      webcams?: Array<Record<string, any>>;
    }>(
      `https://api.windy.com/webcams/api/v3/webcams?bbox=${encodeURIComponent(
        bbox
      )}&limit=${limit}`,
      { ttlSeconds: 600, headers: { "x-windy-api-key": key } }
    );

    const list = data.result?.webcams ?? data.webcams ?? [];
    const items = list
      .map((cam) => {
        const lat = Number.parseFloat(cam.location?.latitude ?? cam.latitude);
        const lng = Number.parseFloat(cam.location?.longitude ?? cam.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        return {
          id: String(cam.webcamId ?? cam.id ?? `${lat},${lng}`),
          lat,
          lng,
          title: cam.title ?? cam.location?.city ?? "Public camera",
          imageUrl: cam.image?.current?.preview ?? cam.images?.current?.preview,
          embedUrl: cam.player?.day?.embed ?? cam.player?.live?.embed,
          source: "windy",
        };
      })
      .filter((cam): cam is NonNullable<typeof cam> => cam !== null);

    return envelope({ items, count: items.length, source: "Windy", cached });
  } catch (error) {
    return failure(error instanceof Error ? error.message : "Windy unavailable", true);
  }
}
