import { envelope, failure, fetchJson } from "@/lib/server/upstream";

export const dynamic = "force-dynamic";

interface OpenNotify {
  iss_position?: { latitude?: string; longitude?: string };
  timestamp?: number;
  message?: string;
}

/** Current ISS position, with a second source as backup. */
export async function GET() {
  try {
    const { data, cached } = await fetchJson<OpenNotify>(
      "https://api.open-notify.org/iss-now.json",
      { ttlSeconds: 5 }
    );

    const lat = Number.parseFloat(data.iss_position?.latitude ?? "");
    const lng = Number.parseFloat(data.iss_position?.longitude ?? "");
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error("bad payload");

    return envelope({
      items: [
        {
          lat,
          lng,
          altitudeKm: 420,
          timestamp: (data.timestamp ?? Math.floor(Date.now() / 1000)) * 1000,
          source: "Open Notify",
        },
      ],
      count: 1,
      source: "Open Notify",
      cached,
    });
  } catch {
    try {
      const { data, cached } = await fetchJson<Record<string, unknown>>(
        "https://api.wheretheiss.at/v1/satellites/25544",
        { ttlSeconds: 5 }
      );
      const lat = Number.parseFloat(String(data.latitude));
      const lng = Number.parseFloat(String(data.longitude));
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error("bad payload");

      return envelope({
        items: [
          {
            lat,
            lng,
            altitudeKm: Number.parseFloat(String(data.altitude)) || 420,
            velocityKph: Number.parseFloat(String(data.velocity)) || undefined,
            timestamp: (Number.parseFloat(String(data.timestamp)) || Date.now() / 1000) * 1000,
            source: "Where the ISS at?",
          },
        ],
        count: 1,
        source: "Where the ISS at?",
        cached,
      });
    } catch (error) {
      return failure(error instanceof Error ? error.message : "ISS feed unavailable");
    }
  }
}
