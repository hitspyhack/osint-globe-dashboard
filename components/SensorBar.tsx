"use client";

import { SENSORS } from "@/lib/layers";
import type { SensorId } from "@/types";

interface SensorBarProps {
  sensor: SensorId;
  onChange: (sensor: SensorId) => void;
}

/** Sensor-look selector — the GLSL post-processing stack for the globe. */
export default function SensorBar({ sensor, onChange }: SensorBarProps) {
  const active = SENSORS.find((item) => item.id === sensor);

  return (
    <div className="sensor-bar">
      <div className="sensor-chips">
        {SENSORS.map((item) => (
          <button
            key={item.id}
            className={`sensor-chip ${item.id === sensor ? "sensor-chip-on" : ""}`}
            onClick={() => onChange(item.id)}
            title={`${item.hint} · key ${item.hotkey}`}
          >
            {item.name}
            <span className="sensor-key">{item.hotkey}</span>
          </button>
        ))}
      </div>
      {active && <div className="sensor-hint">{active.hint}</div>}
    </div>
  );
}
