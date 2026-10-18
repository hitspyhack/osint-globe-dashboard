"use client";

import { useEffect, useMemo, useState } from "react";
import { formatUtc, toIsoDate } from "@/lib/time";

interface TimelineBarProps {
  /** Current simulation time. */
  simTime: Date;
  live: boolean;
  speed: number;
  onScrub: (date: Date) => void;
  onToggleLive: () => void;
  onSpeed: (speed: number) => void;
  onClose: () => void;
}

const SPEEDS = [1, 10, 60, 360];
const WINDOW_DAYS = 30;

/**
 * Time controls.
 *
 * Scrubbing pins the console to a historical instant: satellite positions are
 * re-propagated and the USGS / EONET windows follow it.
 */
export default function TimelineBar({
  simTime,
  live,
  speed,
  onScrub,
  onToggleLive,
  onSpeed,
  onClose,
}: TimelineBarProps) {
  const [playing, setPlaying] = useState(false);

  const end = useMemo(() => Date.now(), []);
  const start = end - WINDOW_DAYS * 86_400_000;

  useEffect(() => {
    if (!playing || live) return;

    const timer = setInterval(() => {
      const next = new Date(simTime.getTime() + speed * 60_000);
      if (next.getTime() >= end) {
        setPlaying(false);
        onScrub(new Date(end));
        return;
      }
      onScrub(next);
    }, 1000);

    return () => clearInterval(timer);
  }, [playing, live, simTime, speed, end, onScrub]);

  const progress = ((simTime.getTime() - start) / (end - start)) * 100;

  return (
    <div className="timeline-bar">
      <div className="timeline-head">
        <span className="hud-label">MISSION CLOCK</span>
        <span className="timeline-time">{formatUtc(simTime)}</span>
        <button className={`live-btn ${live ? "live-btn-on" : ""}`} onClick={onToggleLive}>
          {live ? "● LIVE" : "GO LIVE"}
        </button>
        <button className="icon-btn" onClick={onClose} aria-label="Close timeline">
          ✕
        </button>
      </div>

      <div className="timeline-controls">
        <button
          className="timeline-btn"
          onClick={() => {
            if (live) onToggleLive();
            setPlaying((value) => !value);
          }}
        >
          {playing ? "❚❚" : "▶"}
        </button>

        <input
          type="range"
          className="timeline-range"
          min={start}
          max={end}
          step={60_000}
          value={Math.min(Math.max(simTime.getTime(), start), end)}
          onChange={(event) => {
            if (live) onToggleLive();
            setPlaying(false);
            onScrub(new Date(Number(event.target.value)));
          }}
        />

        <div className="timeline-speeds">
          {SPEEDS.map((value) => (
            <button
              key={value}
              className={`speed-btn ${value === speed ? "speed-btn-on" : ""}`}
              onClick={() => onSpeed(value)}
            >
              {value < 60 ? `${value}m` : `${value / 60}h`}
            </button>
          ))}
        </div>
      </div>

      <div className="timeline-scale">
        <span>{toIsoDate(new Date(start))}</span>
        <span className="timeline-progress-wrap">
          <span className="timeline-progress" style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
        </span>
        <span>{toIsoDate(new Date(end))}</span>
      </div>
    </div>
  );
}
