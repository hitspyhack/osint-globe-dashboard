import type { Pov } from "@/types";

export const EARTH_RADIUS_KM = 6371;
/** globe.gl renders the globe with a radius of 100 world units. */
export const GLOBE_RADIUS_UNITS = 100;

/** Convert kilometres to globe.gl altitude units (fractions of globe radius). */
export function kmToGlobeUnits(km: number): number {
  return km / EARTH_RADIUS_KM;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

/** Great-circle distance in kilometres. */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function formatLatLng(lat: number, lng: number, digits = 3): string {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lng >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(digits)}°${ns} ${Math.abs(lng).toFixed(digits)}°${ew}`;
}

export function formatNumber(value: number, digits = 0): string {
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** Human altitude: 12.4 km for aviation, 550 km for orbital. */
export function formatAltitude(km: number | undefined): string {
  if (km === undefined || !Number.isFinite(km)) return "—";
  return `${formatNumber(km, km < 100 ? 1 : 0)} km`;
}

/** Slippy tile helpers (Web Mercator, XYZ scheme). */
export function lonToTileX(lng: number, level: number): number {
  return Math.floor(((lng + 180) / 360) * 2 ** level);
}

export function latToTileY(lat: number, level: number): number {
  const latRad = toRad(lat);
  return Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * 2 ** level
  );
}

export interface Bounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

/**
 * Rough visible footprint for a globe.gl point-of-view.
 * `altitude` is in globe radii (2.5 ≈ whole globe in frame, 0.1 ≈ city).
 */
export function boundsFromPov({ lat, lng, altitude }: Pov): Bounds {
  const halfSpan = clamp(altitude * 34, 0.6, 88);
  return {
    minLat: clamp(lat - halfSpan, -89, 89),
    maxLat: clamp(lat + halfSpan, -89, 89),
    minLng: clamp(lng - halfSpan * 1.4, -180, 180),
    maxLng: clamp(lng + halfSpan * 1.4, -180, 180),
  };
}

/** Zoom level for a slippy tile set that roughly matches a globe altitude. */
export function altitudeToZoom(altitude: number): number {
  return clamp(Math.round(Math.log2(2.6 / Math.max(altitude, 0.002))), 1, 12);
}

export interface SubsolarPoint {
  lat: number;
  lng: number;
}

/**
 * Subsolar point (where the sun is directly overhead) for a given instant.
 *
 * Low-precision solar position from the Astronomical Almanac: good to roughly
 * 0.01°, which is far more than a terminator overlay needs.
 */
export function subsolarPoint(date: Date): SubsolarPoint {
  const j2000 = Date.UTC(2000, 0, 1, 12, 0, 0, 0);
  const n = (date.getTime() - j2000) / 86_400_000; // days since J2000.0

  const meanLongitude = toRad((280.46 + 0.985_647_4 * n) % 360);
  const meanAnomaly = toRad((357.528 + 0.985_600_3 * n) % 360);
  const eclipticLongitude =
    meanLongitude + toRad(1.915 * Math.sin(meanAnomaly) + 0.02 * Math.sin(2 * meanAnomaly));
  const obliquity = toRad(23.439 - 0.000_000_4 * n);

  const declination = Math.asin(Math.sin(obliquity) * Math.sin(eclipticLongitude));
  const rightAscension = Math.atan2(
    Math.cos(obliquity) * Math.sin(eclipticLongitude),
    Math.cos(eclipticLongitude)
  );

  // Greenwich mean sidereal time, in hours, then degrees.
  let gmstHours = (18.697_374_558 + 24.065_709_824_419_08 * n) % 24;
  if (gmstHours < 0) gmstHours += 24;

  let lng = toDeg(rightAscension) - gmstHours * 15;
  lng = ((lng + 540) % 360) - 180;

  return { lat: toDeg(declination), lng };
}

/** Destination point given a start, initial bearing and angular distance. */
export function destinationPoint(
  lat: number,
  lng: number,
  bearingDeg: number,
  angularDistanceRad: number
): { lat: number; lng: number } {
  const φ1 = toRad(lat);
  const λ1 = toRad(lng);
  const θ = toRad(bearingDeg);
  const δ = angularDistanceRad;

  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 =
    λ1 +
    Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));

  return {
    lat: toDeg(φ2),
    lng: ((toDeg(λ2) + 540) % 360) - 180,
  };
}

/** Circle of points around a centre — used for sensor footprints. */
export function circlePolygon(
  lat: number,
  lng: number,
  radiusKm: number,
  segments = 64
): Array<[number, number]> {
  const angular = radiusKm / EARTH_RADIUS_KM;
  const points: Array<[number, number]> = [];
  for (let i = 0; i <= segments; i += 1) {
    const bearing = (i / segments) * 360;
    const p = destinationPoint(lat, lng, bearing, angular);
    points.push([p.lng, p.lat]);
  }
  return points;
}

/**
 * Day/night terminator as a closed ring of [lng, lat] pairs, 90° from the
 * subsolar point.
 */
export function terminatorRing(date: Date, segments = 180): Array<[number, number]> {
  const sun = subsolarPoint(date);
  const bearingToPole = sun.lat >= 0 ? 0 : 180;
  const anti = destinationPoint(sun.lat, sun.lng, bearingToPole, Math.PI / 2);
  const ring: Array<[number, number]> = [];
  for (let i = 0; i <= segments; i += 1) {
    const bearing = (i / segments) * 360;
    const p = destinationPoint(anti.lat, anti.lng, bearing, Math.PI / 2);
    ring.push([p.lng, p.lat]);
  }
  return ring;
}

/** Total great-circle length of a polyline, in kilometres. */
export function pathLengthKm(points: Array<{ lat: number; lng: number }>): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += haversineKm(points[i - 1].lat, points[i - 1].lng, points[i].lat, points[i].lng);
  }
  return total;
}

/** Parse "38.7, -9.1" style input from the search box. */
export function parseCoords(input: string): { lat: number; lng: number } | null {
  const match = input.match(/^\s*(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (!match) return null;
  const lat = Number.parseFloat(match[1]);
  const lng = Number.parseFloat(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}
