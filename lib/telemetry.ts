/**
 * A tiny mutable telemetry store.
 *
 * The globe writes camera/pointer/FPS data at frame rate; the HUD reads it on
 * its own schedule. Keeping it out of React state avoids re-rendering the whole
 * console 60 times a second.
 */
export interface TelemetryState {
  fps: number;
  lat: number;
  lng: number;
  altitude: number;
  pointerLat: number | null;
  pointerLng: number | null;
  drawCalls: number;
  triangles: number;
  tileCount: number;
}

export const telemetry: TelemetryState = {
  fps: 0,
  lat: 0,
  lng: 0,
  altitude: 2.5,
  pointerLat: null,
  pointerLng: null,
  drawCalls: 0,
  triangles: 0,
  tileCount: 0,
};

export function resetTelemetry(): void {
  telemetry.fps = 0;
  telemetry.pointerLat = null;
  telemetry.pointerLng = null;
}
