import { type NextRequest } from "next/server";
import { envelope, failure, fetchJson, fetchUpstream, resolveKeys } from "@/lib/server/upstream";

export const dynamic = "force-dynamic";

/**
 * Active wildfires.
 *
 * With a NASA FIRMS `map_key` we serve VIIRS hotspot detections (dense, ~daily).
 * Without one we fall back to NASA EONET wildfire events, which are keyless but
 * coarser (one polygon per incident).
 */

interface FirmsDetection {
  latitude: number;
  longitude: number;
  brightness: number;
  frp: number;
  confidence: string;
  acq_date: string;
  acq_time: string;
  satellite: string;
}

function parseFirmsCsv(csv: string): FirmsDetection[] {
  const [header, ...rows] = csv.trim().split("\n");
  if (!header) return [];
  const columns = header.split(",").map((column) => column.trim());
  const index = (name: string) => columns.indexOf(name);

  const latIdx = index("latitude");
  const lngIdx = index("longitude");
  const brightIdx = index("bright_ti4") >= 0 ? index("bright_ti4") : index("brightness");
  const frpIdx = index("frp");
  const confIdx = index("confidence");
  const dateIdx = index("acq_date");
  const timeIdx = index("acq_time");
  const satIdx = index("satellite");

  return rows
    .map((row) => {
      const cells = row.split(",");
      const lat = Number.parseFloat(cells[latIdx]);
      const lng = Number.parseFloat(cells[lngIdx]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return {
        latitude: lat,
        longitude: lng,
        brightness: Number.parseFloat(cells[brightIdx]) || 0,
        frp: Number.parseFloat(cells[frpIdx]) || 0,
        confidence: (cells[confIdx] ?? "").trim(),
        acq_date: (cells[dateIdx] ?? "").trim(),
        acq_time: (cells[timeIdx] ?? "").trim(),
        satellite: (cells[satIdx] ?? "").trim(),
      } satisfies FirmsDetection;
    })
    .filter((detection): detection is FirmsDetection => detection !== null);
}

export async function GET(request: NextRequest) {
  const keys = resolveKeys(request);

  if (keys.FIRMS) {
    try {
      const { body, cached } = await fetchUpstream(
        `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${encodeURIComponent(
          keys.FIRMS
        )}/VIIRS_SNPP_NRT/world/1`,
        { ttlSeconds: 900 }
      );

      if (body.trim().startsWith("{") || body.includes("Invalid")) {
        throw new Error(body.slice(0, 120));
      }

      const detections = parseFirmsCsv(body).slice(0, 4000);
      const items = detections.map((detection, index) => ({
        id: `viirs-${detection.acq_date}-${detection.latitude.toFixed(3)}-${detection.longitude.toFixed(
          3
        )}-${index}`,
        title: `Thermal anomaly · ${detection.satellite || "VIIRS"}`,
        lat: detection.latitude,
        lng: detection.longitude,
        date: `${detection.acq_date} ${detection.acq_time.padStart(4, "0")}`.trim(),
        category: "wildfires",
        source: "NASA FIRMS",
        magnitude: `${Math.round(detection.frp)} MW`,
        confidence: detection.confidence,
      }));

      return envelope({ items, count: items.length, source: "NASA FIRMS (VIIRS)", cached });
    } catch {
      /* fall through to EONET */
    }
  }

  try {
    const { data, cached } = await fetchJson<{
      events?: Array<{
        id: string;
        title: string;
        geometries?: Array<{ date?: string; coordinates?: unknown }>;
        sources?: Array<{ id?: string; url?: string }>;
      }>;
    }>("https://eonet.gsfc.nasa.gov/api/v2.1/events?category=wildfires&days=5&status=open", {
      ttlSeconds: 600,
    });

    const items = (data.events ?? [])
      .map((event) => {
        const latest = event.geometries?.[event.geometries.length - 1];
        const raw = latest?.coordinates;
        let lng: number | undefined;
        let lat: number | undefined;
        if (Array.isArray(raw) && typeof raw[0] === "number" && typeof raw[1] === "number") {
          [lng, lat] = raw as [number, number];
        }
        if (lat === undefined || lng === undefined) return null;
        return {
          id: event.id,
          title: event.title,
          lat,
          lng,
          date: latest?.date,
          category: "wildfires",
          source: "NASA EONET",
          sourceUrl: event.sources?.[0]?.url,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    return envelope({
      items,
      count: items.length,
      source: "NASA EONET:wildfires",
      needsKey: !keys.FIRMS,
      cached,
    });
  } catch (error) {
    return failure(error instanceof Error ? error.message : "wildfire feed unavailable");
  }
}
