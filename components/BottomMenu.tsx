"use client";

import { useState } from "react";

export default function BottomMenu() {
  const [showLayers, setShowLayers] = useState(false);
  const [activeLayer, setActiveLayer] = useState<string | null>(null);

  const toggleLayer = (layer: string) => {
    setActiveLayer(activeLayer === layer ? null : layer);
    const toggles = (window as any).__globeToggles;
    if (toggles) {
      if (layer === "iss") toggles.setShowISS((prev: boolean) => !prev);
      if (layer === "earthquakes") toggles.setShowEarthquakes((prev: boolean) => !prev);
      if (layer === "wildfires") toggles.setShowWildfires((prev: boolean) => !prev);
    }
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
          <button className="menu-btn">📊 Dashboard</button>
          <button className="menu-btn">⚙️ Settings</button>
        </div>
      </div>

      {showLayers && (
        <div className="layer-panel">
          <h3>Active Layers</h3>
          <label className="layer-item">
            <input
              type="checkbox"
              checked={activeLayer === "iss"}
              onChange={() => toggleLayer("iss")}
            />
            🛰️ ISS Tracker
          </label>
          <label className="layer-item">
            <input
              type="checkbox"
              checked={activeLayer === "earthquakes"}
              onChange={() => toggleLayer("earthquakes")}
            />
            🌋 Earthquakes (7d)
          </label>
          <label className="layer-item">
            <input
              type="checkbox"
              checked={activeLayer === "wildfires"}
              onChange={() => toggleLayer("wildfires")}
            />
            🔥 Wildfires / Volcanoes (30d)
          </label>
          <label className="layer-item">
            <input type="checkbox" />
            🚢 Maritime (AIS)
          </label>
          <label className="layer-item">
            <input type="checkbox" />
            ✈️ Aeronautical (ADS-B)
          </label>
          <label className="layer-item">
            <input type="checkbox" />
            📹 Webcams
          </label>
        </div>
      )}
    </>
  );
}
