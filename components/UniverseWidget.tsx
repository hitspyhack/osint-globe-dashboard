"use client";

import { useEffect, useState } from "react";
import { earthOrbitState, earthRotationAngle, formatOrbitalPosition } from "@/lib/astronomy";

interface UniverseWidgetProps {
  date: Date;
}

/**
 * Compact inertial reference inset: a real-date heliocentric orbit estimate,
 * with the Earth marker advanced through its eccentric orbit.
 */
export default function UniverseWidget({ date }: UniverseWidgetProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const orbit = earthOrbitState(date);
  const siderealAngle = earthRotationAngle(date);
  const siderealHours = siderealAngle / 15;
  const siderealClock = `${String(Math.floor(siderealHours)).padStart(2, "0")}:${String(
    Math.floor((siderealHours % 1) * 60)
  ).padStart(2, "0")}`;
  const centerX = 92;
  const centerY = 57;
  const orbitRadiusX = 61;
  const orbitRadiusY = 36;
  const earthX = centerX + orbit.xAu * orbitRadiusX;
  const earthY = centerY - orbit.yAu * orbitRadiusY;

  return (
    <aside className="universe-widget" aria-label="Earth heliocentric position and rotation">
      <header className="universe-widget-head">
        <span className="universe-widget-title"><i /> INERTIAL REFERENCE</span>
        <span className="universe-widget-live">UTC / J2000</span>
      </header>

      <svg className="universe-orbit" viewBox="0 0 184 116" role="img" aria-label="Earth's position in its orbit around the Sun">
        <defs>
          <radialGradient id="universe-sun-glow">
            <stop offset="0" stopColor="#fff7ad" />
            <stop offset="0.45" stopColor="#fb923c" />
            <stop offset="1" stopColor="#fb923c" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="universe-earth-shade" cx="30%" cy="30%">
            <stop offset="0" stopColor="#7dd3fc" />
            <stop offset="0.55" stopColor="#2563eb" />
            <stop offset="1" stopColor="#0b1b45" />
          </radialGradient>
        </defs>
        <ellipse
          cx={centerX}
          cy={centerY}
          rx={orbitRadiusX}
          ry={orbitRadiusY}
          className="universe-orbit-line"
        />
        <line x1={centerX} y1={centerY} x2={earthX} y2={earthY} className="universe-radius" />
        <circle cx={centerX} cy={centerY} r="12" fill="url(#universe-sun-glow)" opacity="0.8" />
        <circle cx={centerX} cy={centerY} r="4.1" className="universe-sun" />
        <g transform={`translate(${earthX} ${earthY})`}>
          <circle r="6.3" fill="url(#universe-earth-shade)" stroke="#bae6fd" strokeWidth="0.7" />
          <path d="M-2.8,-4.1 L-0.4,-3.2 L0.4,-1.1 L2.8,-0.5 L2.1,1.1 L0.8,1.3 L-0.3,3.4 L-2.2,2.5 L-3.4,0.4 Z" fill="#34d399" opacity="0.9" />
          <path d="M-5.6,-1.4 L-4.1,-2.6 L-3.3,-1.4 L-4.5,-0.5 Z" fill="#34d399" opacity="0.78" />
          <line
            x1="0"
            y1="-9"
            x2="0"
            y2="9"
            className="universe-earth-axis"
            transform={`rotate(${siderealAngle})`}
          />
        </g>
        <text x="98" y="72" className="universe-sun-label">SUN</text>
        <text x="8" y="109" className="universe-orbit-note">ECCENTRIC ORBIT · NOT TO SCALE</text>
      </svg>

      <footer className="universe-readout">
        <span><b>EARTH</b> {formatOrbitalPosition(orbit)}</span>
        <span>{orbit.orbitalSpeedKms.toFixed(2)} km/s</span>
        <span className="universe-readout-dim">GMST {siderealClock} · SIDEREAL SPIN 23h 56m</span>
      </footer>
    </aside>
  );
}
