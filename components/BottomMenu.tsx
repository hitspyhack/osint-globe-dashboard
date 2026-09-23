"use client";

import { useState } from "react";

export default function BottomMenu() {
  const [showLayers, setShowLayers] = useState(false);
  const [layers, setLayers] = useState<Record<string, boolean>>({
    iss: true,
    earthquakes: true,
    wildfires: true,
    webcams: true,
    vessels: true,
    aircraft: true,
    satellites: true,
  });

  const toggleLayer = (layer: string) => {
    setLayers((prev) => {
      const next = { ...prev, [layer]: !prev[layer] };
      const toggles = (window as any).__globeToggles;
      if (toggles) {
        const setter = `set${layer.charAt(0).toUpperCase()}${layer.slice(1)}`;
        toggles[setter]?.((_: boolean) => next[layer]);
      }
      return next;
    });
  };

  return (
    <>
      <div className="bottom-menu">
        <div className="bottom-menu-content">
          <button
            className="menu-btn"
            onClick={() => setShowLayers(!showLayers)}
          >
            🗺️ Layers
          </button>
          <button className="menu-btn">🔍 Search</button>
          <button className="menu-btn">🕒 Timeline</button>
          <button className="menu-btn">⚙️ Settings</button>
        </div>
      </div>

      {showLayers && (
        <div className="layer-panel">
          <h3>Active Layers</h3>
          <label className="layer-item">
            <input
              type="checkbox"
              checked={layers.iss}
              onChange={() => toggleLayer("iss")}
            />
            🛰️ ISS Tracker
          </label>
          <label className="layer-item">
            <input
              type="checkbox"
              checked={layers.earthquakes}
              onChange={() => toggleLayer("earthquakes")}
            />
            🌋 Earthquakes (7d)
          </label>
          <label className="layer-item">
            <input
              type="checkbox"
              checked={layers.wildfires}
              onChange={() => toggleLayer("wildfires")}
            />
            🔥 Wildfires / Volcanoes (30d)
          </label>
          <label className="layer-item">
            <input
              type="checkbox"
              checked={layers.webcams}
              onChange={() => toggleLayer("webcams")}
            />
            📹 Webcams (Windy + OSM)
          </label>
          <label className="layer-item">
            <input
              type="checkbox"
              checked={layers.vessels}
              onChange={() => toggleLayer("vessels")}
            />
            🚢 Maritime (AIS)
          </label>
          <label className="layer-item">
            <input
              type="checkbox"
              checked={layers.aircraft}
              onChange={() => toggleLayer("aircraft")}
            />
            ✈️ Aeronautical (ADS-B)
          </label>
          <label className="layer-item">
            <input
              type="checkbox"
              checked={layers.satellites}
              onChange={() => toggleLayer("satellites")}
            />
            🛰️ Satellites (TLE)
          </label>
        </div>
      )}
    </>
  );
}
