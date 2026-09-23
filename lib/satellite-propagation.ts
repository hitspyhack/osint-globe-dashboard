import { Satrec, propagate, gstime, satellite } from "satellite.js";

export interface PropagatedSatellite {
  name: string;
  noradId: number;
  lat: number;
  lng: number;
  altitude: number;
  velocity: number;
  footprint: number;
  timestamp: Date;
}

export function propagateSatellite(tleLine1: string, tleLine2: string, timestamp: Date = new Date()): PropagatedSatellite | null {
  try {
    // satellite.js v5: Satrec is a class with static create method
    if (!Satrec || typeof Satrec.create !== 'function') {
      console.warn("Satrec.create not available, skipping satellite propagation");
      return null;
    }

    const sat = Satrec.create(tleLine1, tleLine2);
    const positionAndVelocity = propagate(sat, timestamp);
    
    if (!positionAndVelocity.position || !positionAndVelocity.velocity) {
      return null;
    }

    const gmst = gstime(timestamp);
    const positionGd = satellite.eciToGeodetic(positionAndVelocity.position, gmst);
    
    const lat = positionGd.latitude * (180 / Math.PI);
    const lng = positionGd.longitude * (180 / Math.PI);
    const altitude = positionGd.height; // km
    
    const velocity = Math.sqrt(
      positionAndVelocity.velocity.x ** 2 +
      positionAndVelocity.velocity.y ** 2 +
      positionAndVelocity.velocity.z ** 2
    );
    
    // Approximate footprint radius (km) based on altitude
    const earthRadius = 6371;
    const footprint = Math.acos(earthRadius / (earthRadius + altitude)) * earthRadius;

    return {
      name: sat.satnum.toString(),
      noradId: sat.satnum,
      lat,
      lng,
      altitude,
      velocity,
      footprint,
      timestamp,
    };
  } catch (e) {
    console.error("Satellite propagation error:", e);
    return null;
  }
}

export function propagateSatellites(
  satellites: Array<{ name: string; noradId: number; tle: string }>,
  timestamp: Date = new Date()
): PropagatedSatellite[] {
  return satellites
    .map((sat) => {
      const [line1, line2] = sat.tle.split("\\n");
      if (!line1 || !line2) return null;
      return propagateSatellite(line1, line2, timestamp);
    })
    .filter((s): s is PropagatedSatellite => s !== null);
}
