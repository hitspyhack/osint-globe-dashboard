"use client";

import { BASEMAPS } from "@/lib/layers";
import type { BasemapId } from "@/types";

interface SettingsPanelProps {
  basemap: BasemapId;
  onBasemap: (basemap: BasemapId) => void;
  autoRotate: boolean;
  onAutoRotate: (value: boolean) => void;
  mergePoints: boolean;
  onMergePoints: (value: boolean) => void;
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

      <section className="settings-section">
        <h3 className="settings-label">RENDER</h3>
        <label className="settings-toggle">
          <input
            type="checkbox"
            checked={autoRotate}
            onChange={(event) => onAutoRotate(event.target.checked)}
          />
          <span>Auto-rotate</span>
        </label>
        <label className="settings-toggle">
          <input
            type="checkbox"
            checked={mergePoints}
            onChange={(event) => onMergePoints(event.target.checked)}
          />
          <span>
            Merge points
            <em>faster with huge feeds, disables clicking</em>
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
