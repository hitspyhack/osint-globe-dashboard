"use client";

import { BASEMAPS } from "@/lib/layers";
import type { BasemapId, ElevationStatus } from "@/types";

interface SettingsPanelProps {
  basemap: BasemapId;
  onBasemap: (basemap: BasemapId) => void;
  autoRotate: boolean;
  onAutoRotate: (value: boolean) => void;
  mergePoints: boolean;
  onMergePoints: (value: boolean) => void;
  objectShapes: boolean;
  onObjectShapes: (value: boolean) => void;
  matrixRain: boolean;
  onMatrixRain: (value: boolean) => void;
  elevationEnabled: boolean;
  onElevationEnabled: (value: boolean) => void;
  elevationExaggeration: number;
  onElevationExaggeration: (value: number) => void;
  elevationOpacity: number;
  onElevationOpacity: (value: number) => void;
  elevationStatus: ElevationStatus;
  showJoystick: boolean;
  onShowJoystick: (value: boolean) => void;
  onShare: () => void;
  onScreenshot: () => void;
  onClose: () => void;
}

export default function SettingsPanel({
  basemap,
  onBasemap,
  autoRotate,
  onAutoRotate,
  mergePoints,
  onMergePoints,
  objectShapes,
  onObjectShapes,
  matrixRain,
  onMatrixRain,
  elevationEnabled,
  onElevationEnabled,
  elevationExaggeration,
  onElevationExaggeration,
  elevationOpacity,
  onElevationOpacity,
  elevationStatus,
  showJoystick,
  onShowJoystick,
  onShare,
  onScreenshot,
  onClose,
}: SettingsPanelProps) {
  return (
    <div className="settings-panel">
      <header className="panel-header">
        <h2 className="panel-title">OPTICS</h2>
        <button className="icon-btn" onClick={onClose} aria-label="Close settings">
          ✕
        </button>
      </header>

      <section className="settings-section">
        <h3 className="settings-label">BASEMAP</h3>
        <div className="settings-row">
          {BASEMAPS.map((map) => (
            <button
              key={map.id}
              className={`settings-chip ${map.id === basemap ? "settings-chip-on" : ""}`}
              onClick={() => onBasemap(map.id)}
            >
              {map.name}
            </button>
          ))}
        </div>
      </section>

      <section className="settings-section elevation-settings">
        <div className="settings-section-head">
          <h3 className="settings-label">ELEVATION / DEM</h3>
          <span className={`elevation-status elevation-status-${elevationStatus.phase}`}>
            {elevationStatus.phase === "loading"
              ? `LOADING ${elevationStatus.progress}%`
              : elevationStatus.phase === "ready"
                ? "DEM READY"
                : elevationStatus.phase === "error"
                  ? "SOURCE OFFLINE"
                  : "OPT-IN"}
          </span>
        </div>
        <label className="settings-toggle elevation-toggle">
          <input
            type="checkbox"
            checked={elevationEnabled}
            onChange={(event) => onElevationEnabled(event.target.checked)}
          />
          <span>
            Show 3D terrain
            <em>Terrarium global elevation tiles · loaded only when enabled</em>
          </span>
        </label>
        <label className="elevation-range-label" htmlFor="elevation-exaggeration">
          <span>VERTICAL EXAGGERATION</span>
          <strong>{elevationExaggeration}×</strong>
        </label>
        <input
          id="elevation-exaggeration"
          className="elevation-range"
          type="range"
          min={1}
          max={100}
          step={1}
          value={elevationExaggeration}
          disabled={!elevationEnabled}
          onChange={(event) => onElevationExaggeration(Number(event.target.value))}
          aria-label="Elevation vertical exaggeration, from 1 to 100 times"
        />
        <div className="elevation-scale-labels"><span>1× TRUE SCALE</span><span>100×</span></div>
        <label className="elevation-range-label" htmlFor="elevation-opacity">
          <span>SURFACE OPACITY</span>
          <strong>{elevationOpacity}%</strong>
        </label>
        <input
          id="elevation-opacity"
          className="elevation-range"
          type="range"
          min={0}
          max={100}
          step={1}
          value={elevationOpacity}
          disabled={!elevationEnabled}
          onChange={(event) => onElevationOpacity(Number(event.target.value))}
          aria-label="Terrain surface opacity, from fully transparent to fully opaque"
        />
        <div className="elevation-scale-labels"><span>0% TRANSPARENT</span><span>100% OPAQUE</span></div>
        <div className="elevation-legend" aria-hidden="true"><i /><i /><i /><i /><i /></div>
        {elevationStatus.phase === "loading" && (
          <div className="elevation-progress"><i style={{ width: `${elevationStatus.progress}%` }} /></div>
        )}
        {elevationStatus.phase === "ready" && (
          <p className="elevation-note">
            Global relief sampled from 64 public tiles · elevations {Math.round(elevationStatus.minMeters ?? 0).toLocaleString()} to {Math.round(elevationStatus.maxMeters ?? 0).toLocaleString()} m.
          </p>
        )}
        {elevationStatus.phase === "error" && <p className="elevation-error">{elevationStatus.error}</p>}
        <p className="elevation-note">Land height is displaced over the imagery; ocean depth remains color-coded. Attribution: AWS Open Data / Terrarium.</p>
      </section>

      <section className="settings-section">
        <h3 className="settings-label">RENDER</h3>
        <label className="settings-toggle">
          <input
            type="checkbox"
            checked={autoRotate}
            onChange={(event) => onAutoRotate(event.target.checked)}
          />
          <span>
            Earth spin reference
            <em>one turn per sidereal day · 23h 56m</em>
          </span>
        </label>
        <label className="settings-toggle">
          <input
            type="checkbox"
            checked={objectShapes}
            onChange={(event) => onObjectShapes(event.target.checked)}
          />
          <span>
            3D entity shapes
            <em>jets, hulls, satellites, masts… instead of columns</em>
          </span>
        </label>
        <label className="settings-toggle">
          <input
            type="checkbox"
            checked={mergePoints}
            onChange={(event) => onMergePoints(event.target.checked)}
          />
          <span>
            Merge points
            <em>faster fallback columns for huge feeds, disables their clicking</em>
          </span>
        </label>
        <label className="settings-toggle">
          <input
            type="checkbox"
            checked={matrixRain}
            onChange={(event) => onMatrixRain(event.target.checked)}
          />
          <span>
            Digital rain
            <em>Matrix overlay across the console</em>
          </span>
        </label>
        <label className="settings-toggle">
          <input
            type="checkbox"
            checked={showJoystick}
            onChange={(event) => onShowJoystick(event.target.checked)}
          />
          <span>
            Navigation joystick
            <em>pan, zoom, tilt and heading — bottom right</em>
          </span>
        </label>
      </section>

      <section className="settings-section">
        <h3 className="settings-label">EXPORT</h3>
        <div className="settings-row">
          <button className="action-btn" onClick={onScreenshot}>
            SCREENSHOT
          </button>
          <button className="action-btn" onClick={onShare}>
            COPY LINK
          </button>
        </div>
      </section>
    </div>
  );
}
