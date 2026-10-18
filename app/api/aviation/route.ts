import { type NextRequest } from "next/server";
import { envelope, failure, fetchJson, resolveKeys } from "@/lib/server/upstream";

export const dynamic = "force-dynamic";

interface OpenSkyState {
  0: string; // icao24
  1: string | null; // callsign
  2: string; // origin country
  5: number | null; // longitude
  6: number | null; // latitude
  7: number | null; // baro altitude (m)
  8: boolean; // on ground
  9: number | null; // velocity (m/s)
  10: number | null; // true track
  11: number | null; // vertical rate
  13: number | null; // geo altitude (m)
  14: string | null; // squawk
}

const MAX_AIRCRAFT = 6000;

function normalise(states: OpenSkyState[]) {
  return states
    .filter((state) => Number.isFinite(state[6]) && Number.isFinite(state[5]) && !state[8])
    .slice(0, MAX_AIRCRAFT)
    .map((state) => ({
      icao24: state[0],
      callsign: (state[1] ?? "").trim() || "UNKNOWN",
      lat: state[6] as number,
      lng: state[5] as number,
      altitude: state[7] ?? state[13] ?? 0,
      velocity: state[9] ?? 0,
      heading: state[10] ?? 0,
      verticalRate: state[11] ?? 0,
      squawk: state[14] ?? undefined,
      origin: state[2],
    }));
}

function normaliseAdsb(list: Record<string, any>[]) {
  return list
    .map((aircraft) => {
      const lat = Number.parseFloat(aircraft.lat);
      const lng = Number.parseFloat(aircraft.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      const altBaro = aircraft.alt_baro === "ground" ? 0 : Number.parseFloat(aircraft.alt_baro) || 0;
      return {
        icao24: aircraft.hex ?? "unknown",
        callsign: (aircraft.flight ?? aircraft.r ?? "UNKNOWN").trim(),
        lat,
        lng,
        altitude: altBaro * 0.3048,
        velocity: (Number.parseFloat(aircraft.gs) || 0) * 0.514_444,
        heading: Number.parseFloat(aircraft.track ?? aircraft.true_heading) || 0,
        verticalRate: (Number.parseFloat(aircraft.baro_rate) || 0) * 0.005_08,
        squawk: aircraft.squawk ?? undefined,
        origin: aircraft.ownOp ?? undefined,
        type: aircraft.t ?? undefined,
        registration: aircraft.r ?? undefined,
      };
    })
    .filter((aircraft): aircraft is NonNullable<typeof aircraft> => aircraft !== null);
}

/** Live ADS-B traffic. `?scope=mil` returns military/state aircraft only. */
export async function GET(request: NextRequest) {
  const keys = resolveKeys(request);
  const scope = request.nextUrl.searchParams.get("scope");

  if (scope === "mil") {
    try {
      const { data, cached } = await fetchJson<{ ac: Record<string, any>[] }>(
        "https://api.adsb.lol/v2/mil",
        { ttlSeconds: 30 }
      );
      const items = normaliseAdsb(data.ac ?? []);
      return envelope({ items, count: items.length, source: "adsb.lol", cached });
    } catch {
      try {
        const { data, cached } = await fetchJson<{ ac: Record<string, any>[] }>(
          "https://api.airplanes.live/v2/mil",
          { ttlSeconds: 30 }
        );
        const items = normaliseAdsb(data.ac ?? []);
        return envelope({ items, count: items.length, source: "airplanes.live", cached });
      } catch (error) {
        return failure(error instanceof Error ? error.message : "military feed unavailable");
      }
    }
  }

  const auth =
    keys.OPENSKY_USER && keys.OPENSKY_PASS
      ? `Basic ${Buffer.from(`${keys.OPENSKY_USER}:${keys.OPENSKY_PASS}`).toString("base64")}`
      : undefined;

  try {
    const { data, cached } = await fetchJson<{ states?: OpenSkyState[] }>(
      "https://opensky-network.org/api/states/all",
      { ttlSeconds: 20, headers: auth ? { Authorization: auth } : undefined }
    );
    const items = normalise(data.states ?? []);
    return envelope({ items, count: items.length, source: "OpenSky Network", cached });
  } catch {
    // OpenSky rate-limits anonymous callers hard; fall back to keyless mirrors.
    try {
      const { data, cached } = await fetchJson<{ ac: Record<string, any>[] }>(
        "https://api.adsb.lol/v2/point/20/0/250",
        { ttlSeconds: 20 }
      );
      const items = normaliseAdsb(data.ac ?? []).slice(0, 2500);
      return envelope({ items, count: items.length, source: "adsb.lol (regional)", cached });
    } catch (error) {
      return failure(error instanceof Error ? error.message : "aviation feed unavailable");
    }
  }
}
