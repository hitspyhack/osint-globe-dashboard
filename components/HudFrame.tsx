"use client";

import { useEffect, useState } from "react";
import { telemetry } from "@/lib/telemetry";
import { formatUtcClock } from "@/lib/time";
import { APP_NAME, APP_TAGLINE, APP_VERSION } from "@/lib/version";
import { formatLatLng, altitudeToZoom } from "@/lib/geo";
import { BASEMAP_BY_ID, SENSOR_BY_ID } from "@/lib/layers";
import type { BasemapId, SensorId } from "@/types";

interface HudFrameProps {
  sensor: SensorId;
  basemap: BasemapId;
  entityCount: number;
  activeLayers: number;
  totalLayers: number;
  onlineLayers: number;
  simTime: Date;
  live: boolean;
}

/**
 * True only after hydration.
 *
 * The UTC clock is derived from `Date.now()`, which differs between the
 * server render and the client render — rendering it before mount is a
 * guaranteed hydration mismatch.
 */
function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

function useTelemetryPulse(intervalMs = 250) {
  const [snapshot, setSnapshot] = useState({ ...telemetry });

  useEffect(() => {
    let last = 0;
    let frame = 0;

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      if (now - last < intervalMs) return;
      last = now;
      setSnapshot({ ...telemetry });
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [intervalMs]);

  return snapshot;
}

/** Frame chrome: reticle, corner brackets, status strip and telemetry block. */
export default function HudFrame({
  sensor,
  basemap,
  entityCount,
  activeLayers,
  totalLayers,
  onlineLayers,
  simTime,
  live,
}: HudFrameProps) {
  const pulse = useTelemetryPulse();
  const mounted = useMounted();
  const sensorDef = SENSOR_BY_ID[sensor];
  const map = BASEMAP_BY_ID[basemap];
  const clock = formatUtcClock(simTime);

  const degrade = pulse.fps > 0 && pulse.fps < 30;

  return (
    <div className={`hud-frame sensor-${sensor}`} aria-hidden="true">
      <div className="hud-corners">
        <span className="corner corner-tl" />
        <span className="corner corner-tr" />
        <span className="corner corner-bl" />
        <span className="corner corner-br" />
      </div>

      <div className="hud-reticle">
        <span className="reticle-h" />
        <span className="reticle-v" />
        <span className="reticle-ring" />
      </div>

      <div className="hud-scanline" />

      {/* Top status strip */}
      <div className="hud-top">
        <div className="hud-chip hud-chip-title">
          <span className="hud-dot" />
          {APP_NAME.toUpperCase()}
          <span className="hud-chip-dim">/ {APP_TAGLINE.toUpperCase()}</span>
          <span className="hud-version">v{APP_VERSION}</span>
        </div>

        <div className="hud-chip">
          <span className="hud-label">UTC</span>
          <span className={`hud-value ${live ? "" : "hud-value-live"}`} suppressHydrationWarning>
            {mounted ? clock : "--:--:--Z"}
          </span>
          {!live && <span className="hud-tag hud-tag-amber">SIM</span>}
        </div>

        <div className="hud-chip">
          <span className="hud-label">SENSOR</span>
          <span className="hud-value">{sensorDef.name}</span>
        </div>

        <div className="hud-chip hud-hide-sm">
          <span className="hud-label">TRACKS</span>
          <span className="hud-value">{entityCount.toLocaleString("en-US")}</span>
        </div>

        <div className="hud-chip hud-hide-sm">
          <span className="hud-label">FEEDS</span>
          <span className={`hud-value ${onlineLayers < activeLayers ? "hud-value-warn" : ""}`}>
            {onlineLayers}/{activeLayers}
          </span>
          <span className="hud-chip-dim">of {totalLayers}</span>
        </div>

        <div className="hud-chip hud-hide-sm">
          <span className="hud-label">FPS</span>
          <span className={`hud-value ${degrade ? "hud-value-warn" : ""}`}>{pulse.fps || "—"}</span>
        </div>
      </div>

      {/* Bottom telemetry block */}
      <div className="hud-telemetry">
        <div className="hud-telemetry-row">
          <span className="hud-label">CAM</span>
          <span className="hud-value">{formatLatLng(pulse.lat, pulse.lng, 2)}</span>
        </div>
        <div className="hud-telemetry-row">
          <span className="hud-label">ALT</span>
          <span className="hud-value">{pulse.altitude.toFixed(3)} R</span>
        </div>
        <div className="hud-telemetry-row">
          <span className="hud-label">ZOOM</span>
          <span className="hud-value">z{altitudeToZoom(pulse.altitude)}</span>
        </div>
        <div className="hud-telemetry-row">
          <span className="hud-label">CUR</span>
          <span className="hud-value">
            {pulse.pointerLat === null || pulse.pointerLng === null
              ? "———"
              : formatLatLng(pulse.pointerLat, pulse.pointerLng, 2)}
          </span>
        </div>
        <div className="hud-telemetry-row hud-hide-sm">
          <span className="hud-label">DRAW</span>
          <span className="hud-value">{pulse.drawCalls.toLocaleString("en-US")}</span>
        </div>
        <div className="hud-telemetry-row">
          <span className="hud-label">SHAPES</span>
          <span className={`hud-value ${pulse.objects > 0 ? "hud-value-live-on" : ""}`}>
            {pulse.objects.toLocaleString("en-US")}
          </span>
        </div>
      </div>

      <div className="hud-attribution">{map.attribution}</div>
    </div>
  );
}
