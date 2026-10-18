/** Lightweight solar-system ephemeris helpers (UTC, good to a few arcminutes). */

const DAY_MS = 86_400_000;
const J2000_MS = Date.UTC(2000, 0, 1, 12, 0, 0, 0);
const EARTH_ECCENTRICITY = 0.0167086;
const EARTH_ORBITAL_SPEED_KMS = 29.7847;

function wrapDegrees(value: number): number {
  return ((value % 360) + 360) % 360;
}

function solarEclipticState(date: Date): { longitudeDeg: number; meanAnomalyDeg: number } {
  const daysSinceJ2000 = (date.getTime() - J2000_MS) / DAY_MS;
  const meanLongitude = wrapDegrees(280.46 + 0.985_647_4 * daysSinceJ2000);
  const meanAnomalyDeg = wrapDegrees(357.528 + 0.985_600_3 * daysSinceJ2000);
  const meanAnomaly = (meanAnomalyDeg * Math.PI) / 180;
  const longitudeDeg = wrapDegrees(
    meanLongitude +
      1.915 * Math.sin(meanAnomaly) +
      0.02 * Math.sin(2 * meanAnomaly)
  );

  return { longitudeDeg, meanAnomalyDeg };
}

export interface EarthOrbitState {
  /** Heliocentric ecliptic position, with x/y in astronomical units. */
  xAu: number;
  yAu: number;
  distanceAu: number;
  longitudeDeg: number;
  orbitalSpeedKms: number;
}

/**
 * Earth's approximate heliocentric position for a UTC instant.
 * The orbital eccentricity and annual phase are included; this is an
 * ephemeris illustration, not a navigation-grade planetary solution.
 */
export function earthOrbitState(date: Date): EarthOrbitState {
  const { longitudeDeg: sunLongitude, meanAnomalyDeg } = solarEclipticState(date);
  const meanAnomaly = (meanAnomalyDeg * Math.PI) / 180;
  const longitudeDeg = wrapDegrees(sunLongitude + 180);
  const longitude = (longitudeDeg * Math.PI) / 180;
  const distanceAu =
    1.00014 -
    0.01671 * Math.cos(meanAnomaly) -
    0.00014 * Math.cos(2 * meanAnomaly);

  return {
    xAu: distanceAu * Math.cos(longitude),
    yAu: distanceAu * Math.sin(longitude),
    distanceAu,
    longitudeDeg,
    orbitalSpeedKms: EARTH_ORBITAL_SPEED_KMS * Math.sqrt(2 / distanceAu - 1),
  };
}

/** Greenwich mean sidereal angle; UTC is used in place of UT1. */
export function earthRotationAngle(date: Date): number {
  const julianDate = date.getTime() / DAY_MS + 2_440_587.5;
  return wrapDegrees(280.460_618_37 + 360.985_647_366_29 * (julianDate - 2_451_545));
}

/**
 * OrbitControls uses 2.0 for one camera orbit in 30 seconds at 60 fps.
 * This converts the control to one revolution per sidereal day.
 */
export const SIDEREAL_AUTO_ROTATE_SPEED = (2 * 30) / 86_164.090_5;

export function formatOrbitalPosition(orbit: EarthOrbitState): string {
  return `${orbit.distanceAu.toFixed(3)} AU`;
}
