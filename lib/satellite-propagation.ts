import {
  eciToGeodetic,
  gstime,
  propagate,
  twoline2satrec,
  type EciVec3,
  type PositionAndVelocity,
  type SatRec,
} from "satellite.js";
import { EARTH_RADIUS_KM, toDeg } from "@/lib/geo";

export interface PropagatedSatellite {
  name: string;
  noradId: number;
  lat: number;
  lng: number;
  /** Kilometres above the ellipsoid. */
  altitude: number;
  /** km/s */
  velocity: number;
  /** Sensor footprint radius in km (0° minimum elevation). */
  footprint: number;
  timestamp: Date;
}

export interface SatelliteInput {
  name: string;
  noradId: number;
  /** Two TLE lines separated by a newline. */
  tle: string;
}

/** TLE lines, tolerant of `\r\n`, stray blanks and a leading name line. */
export function splitTle(tle: string): [string, string] | null {
  const lines = tle
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (let i = 0; i < lines.length - 1; i += 1) {
    if (lines[i].startsWith("1 ") && lines[i + 1].startsWith("2 ")) {
      return [lines[i], lines[i + 1]];
    }
  }
  return null;
}

/** Angular radius (km on the surface) visible from a given altitude. */
export function footprintRadius(altitudeKm: number, minElevationDeg = 0): number {
  const epsilon = (minElevationDeg * Math.PI) / 180;
  const centralAngle =
    Math.acos((EARTH_RADIUS_KM * Math.cos(epsilon)) / (EARTH_RADIUS_KM + altitudeKm)) - epsilon;
  return centralAngle * EARTH_RADIUS_KM;
}

function asVec3(value: EciVec3<number> | boolean | undefined): EciVec3<number> | null {
  if (!value || typeof value === "boolean") return null;
  return value;
}

function toGeodetic(result: PositionAndVelocity, timestamp: Date) {
  const position = asVec3(result.position);
  const velocity = asVec3(result.velocity);
  if (!position) return null;

  const geodetic = eciToGeodetic(position, gstime(timestamp));
  const lat = toDeg(geodetic.latitude);
  const lng = toDeg(geodetic.longitude);
  const altitude = geodetic.height;

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(altitude)) return null;

  const speed = velocity
    ? Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y + velocity.z * velocity.z)
    : 0;

  return { lat, lng, altitude, velocity: speed };
}

/** Propagate a single satellite to an instant. */
export function propagateSatellite(
  tleLine1: string,
  tleLine2: string,
  timestamp: Date = new Date()
): PropagatedSatellite | null {
  try {
    const satrec: SatRec | null = twoline2satrec(tleLine1, tleLine2);
    // twoline2satrec returns null-ish values on malformed input.
    if (!satrec || typeof satrec !== "object") return null;

    const result = propagate(satrec, timestamp);
    const fix = toGeodetic(result, timestamp);
    if (!fix) return null;

    const noradId = Number.parseInt(String(satrec.satnum ?? ""), 10);

    return {
      name: String(satrec.satnum ?? ""),
      noradId: Number.isFinite(noradId) ? noradId : 0,
      lat: fix.lat,
      lng: fix.lng,
      altitude: fix.altitude,
      velocity: fix.velocity,
      footprint: footprintRadius(fix.altitude),
      timestamp,
    };
  } catch (error) {
    console.warn("Satellite propagation failed:", error);
    return null;
  }
}

/** Propagate a whole catalogue, dropping anything that fails. */
export function propagateSatellites(
  satellites: SatelliteInput[],
  timestamp: Date = new Date()
): PropagatedSatellite[] {
  const results: PropagatedSatellite[] = [];

  for (const input of satellites) {
    const lines = splitTle(input.tle);
    if (!lines) continue;
    const position = propagateSatellite(lines[0], lines[1], timestamp);
    if (!position) continue;
    results.push({ ...position, name: input.name, noradId: input.noradId });
  }

  return results;
}

/**
 * Ground track for a satellite — sampled symmetrically around `timestamp` so
 * the trail leads and follows the current position.
 */
export function groundTrack(
  input: SatelliteInput,
  timestamp: Date = new Date(),
  minutes = 50,
  samples = 60
): Array<{ lat: number; lng: number }> {
  const lines = splitTle(input.tle);
  if (!lines) return [];

  const satrec = twoline2satrec(lines[0], lines[1]);
  if (!satrec || typeof satrec !== "object") return [];

  const points: Array<{ lat: number; lng: number }> = [];
  const half = (minutes * 60_000) / 2;

  for (let i = 0; i <= samples; i += 1) {
    const offset = -half + (i / samples) * half * 2;
    const date = new Date(timestamp.getTime() + offset);
    const result = propagate(satrec, date);
    const fix = toGeodetic(result, date);
    if (!fix) continue;

    let { lng } = fix;
    const previous = points[points.length - 1];
    if (previous) {
      // Unwrap longitude so the polyline does not snap across the antimeridian.
      while (lng - previous.lng > 180) lng -= 360;
      while (lng - previous.lng < -180) lng += 360;
    }

    points.push({ lat: fix.lat, lng });
  }

  return points;
}
