import { type NextRequest } from "next/server";
import { envelope, failure, fetchJson, resolveKeys } from "@/lib/server/upstream";

export const dynamic = "force-dynamic";

/**
 * Maritime AIS adapter.
 *
 * AIS has no reliable keyless global feed, so this layer needs a provider key
 * (free tier is enough for personal use):
 *
 *   AISHub        — free registration, bbox queries, JSON output
 *   Spire         — commercial, global
 *   MarineTraffic — commercial, fleet or global
 *   Datalastic    — commercial, radius queries
 *
 * Set one via .env.local (`AIS_API_KEY`) or paste it into POWER UP.
 */

interface Bbox {
  south: number;
  north: number;
  west: number;
  east: number;
}

function parseBbox(raw: string | null): Bbox {
  if (!raw) {
    return { south: -85, north: 85, west: -180, east: 180 };
  }
  const [south, west, north, east] = raw.split(",").map((value) => Number.parseFloat(value));
  if ([south, west, north, east].some((value) => !Number.isFinite(value))) {
    return { south: -85, north: 85, west: -180, east: 180 };
  }
  return { south, west, north, east };
}

async function fromAisHub(key: string, bbox: Bbox) {
  const url =
    `https://data.aishub.net/ws.php?username=${encodeURIComponent(key)}` +
    `&format=1&output=json&compress=0` +
    `&latmin=${bbox.south}&latmax=${bbox.north}&lonmin=${bbox.west}&lonmax=${bbox.east}`;

  const { data, cached } = await fetchJson<Array<Record<string, any>>>(url, { ttlSeconds: 60 });
  const items = (data ?? [])
    .map((vessel) => ({
      mmsi: String(vessel.MMSI ?? vessel.mmsi ?? ""),
      name: vessel.NAME ?? vessel.name ?? "",
      lat: Number.parseFloat(vessel.LATITUDE ?? vessel.latitude),
      lng: Number.parseFloat(vessel.LONGITUDE ?? vessel.longitude),
      speed: Number.parseFloat(vessel.SPEED ?? vessel.speed) || undefined,
      course: Number.parseFloat(vessel.COURSE ?? vessel.course) || undefined,
      type: vessel.TYPE ? String(vessel.TYPE) : vessel.type,
      destination: vessel.DESTINATION ?? vessel.destination,
      flag: vessel.FLAG ?? vessel.flag,
    }))
    .filter((vessel) => vessel.mmsi && Number.isFinite(vessel.lat) && Number.isFinite(vessel.lng));

  return { items, source: "AISHub", cached };
}

async function fromSpire(key: string) {
  const { data, cached } = await fetchJson<{ data?: Array<Record<string, any>> }>(
    "https://api.spire.com/vessels",
    { ttlSeconds: 60, headers: { Authorization: `Bearer ${key}` } }
  );
  const items = (data.data ?? [])
    .map((vessel) => {
      const position = vessel.last_position ?? vessel.position ?? {};
      const lat = Number.parseFloat(position.latitude ?? position.lat);
      const lng = Number.parseFloat(position.longitude ?? position.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return {
        mmsi: String(vessel.mmsi ?? vessel.id ?? ""),
        name: vessel.name ?? vessel.ship_name ?? "",
        lat,
        lng,
        speed: Number.parseFloat(position.speed ?? position.sog) || undefined,
        course: Number.parseFloat(position.course ?? position.cog) || undefined,
        type: vessel.ship_type ?? vessel.type,
        destination: vessel.destination?.destination ?? vessel.destination,
        flag: vessel.flag ?? vessel.flag_state,
      };
    })
    .filter((vessel) => vessel && Number.isFinite(vessel.lat));

  return { items, source: "Spire", cached };
}

async function fromDatalastic(key: string, bbox: Bbox) {
  const centerLat = (bbox.north + bbox.south) / 2;
  const centerLng = (bbox.east + bbox.west) / 2;
  const radiusNm = Math.min(
    500,
    Math.max(20, Math.max(bbox.north - bbox.south, bbox.east - bbox.west) * 30)
  );

  const { data, cached } = await fetchJson<{ data?: { vessels?: Array<Record<string, any>> } }>(
    `https://api.datalastic.com/api/v0/vessels_inradius?api-key=${encodeURIComponent(
      key
    )}&lat=${centerLat}&lon=${centerLng}&radius=${Math.round(radiusNm)}`,
    { ttlSeconds: 120 }
  );

  const items = (data.data?.vessels ?? [])
    .map((vessel) => ({
      mmsi: String(vessel.mmsi ?? ""),
      name: vessel.name ?? "",
      lat: Number.parseFloat(vessel.lat),
      lng: Number.parseFloat(vessel.lon),
      speed: Number.parseFloat(vessel.speed) || undefined,
      course: Number.parseFloat(vessel.course) || undefined,
      type: vessel.type_name ?? vessel.type,
      destination: vessel.destination,
      flag: vessel.flag,
    }))
    .filter((vessel) => Number.isFinite(vessel.lat) && Number.isFinite(vessel.lng));

  return { items, source: "Datalastic", cached };
}

export async function GET(request: NextRequest) {
  const keys = resolveKeys(request);
  const bbox = parseBbox(request.nextUrl.searchParams.get("bbox"));

  const key = keys.AIS;
  if (!key) {
    return envelope({
      items: [],
      count: 0,
      needsKey: true,
      error: "AIS provider key required — add one in POWER UP",
      source: "none",
    });
  }

  const attempts: Array<() => Promise<{ items: unknown[]; source: string; cached: boolean }>> = [
    () => fromAisHub(key, bbox),
    () => fromSpire(key),
    () => fromDatalastic(key, bbox),
  ];

  let lastError = "AIS provider request failed";
  for (const attempt of attempts) {
    try {
      const result = await attempt();
      if (result.items.length === 0) {
        lastError = `${result.source} returned no vessels (wrong key type?)`;
        continue;
      }
      return envelope({ items: result.items, count: result.items.length, source: result.source, cached: result.cached });
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  return failure(lastError, true);
}
