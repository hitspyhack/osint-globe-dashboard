"use client";

import { useState, useEffect } from "react";
import type { TimelineState } from "@/types";

interface TimelineScrubberProps {
  onDateChange?: (date: Date) => void;
}

export default function TimelineScrubber({ onDateChange }: TimelineScrubberProps) {
  const [state, setState] = useState<TimelineState>({
    startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    endDate: new Date().toISOString(),
    currentDate: new Date().toISOString(),
    playing: false,
    speed: 1,
  });

  const startDate = new Date(state.startDate);
  const endDate = new Date(state.endDate);
  const currentDate = new Date(state.currentDate);

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    if (state.playing) {
      interval = setInterval(() => {
        setState((prev) => {
          const current = new Date(prev.currentDate);
          const increment = 60 * 60 * 1000 * prev.speed;
          const next = new Date(current.getTime() + increment);

          if (next >= endDate) {
            return { ...prev, playing: false, currentDate: endDate.toISOString() };
          }

          onDateChange?.(next);
          return { ...prev, currentDate: next.toISOString() };
        });
      }, 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [state.playing, state.speed, endDate, onDateChange]);

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const timestamp = Number(e.target.value);
    const date = new Date(timestamp);
    setState((prev) => ({ ...prev, currentDate: date.toISOString() }));
    onDateChange?.(date);
  };

  const togglePlay = () => {
    setState((prev) => ({ ...prev, playing: !prev.playing }));
  };

  const setSpeed = (speed: number) => {
    setState((prev) => ({ ...prev, speed }));
  };

  const progress =
    ((currentDate.getTime() - startDate.getTime()) /
      (endDate.getTime() - startDate.getTime())) *
    100;

  return (
    <div className="absolute bottom-20 left-1/2 z-20 w-3/4 -translate-x-1/2 rounded-lg border border-slate-700 bg-slate-900/95 p-3 shadow-xl backdrop-blur">
      <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
        <span>{startDate.toLocaleDateString()}</span>
        <span className="font-semibold text-sky-400">
          {currentDate.toLocaleString()}
        </span>
        <span>{endDate.toLocaleDateString()}</span>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={togglePlay}
          className="flex h-8 w-8 items-center justify-center rounded bg-sky-600 text-white hover:bg-sky-500"
        >
          {state.playing ? "⏸" : "▶"}
        </button>

        <input
          type="range"
          min={startDate.getTime()}
          max={endDate.getTime()}
          value={currentDate.getTime()}
          onChange={handleSeek}
          className="flex-1 accent-sky-500"
        />

        <div className="flex gap-1">
          {[0.5, 1, 2, 5].map((s) => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              className={`px-2 py-1 text-xs rounded ${
                state.speed === s
                  ? "bg-sky-600 text-white"
                  : "bg-slate-700 text-slate-300 hover:bg-slate-600"
              }`}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>

      <div className="mt-2 h-1 w-full bg-slate-700">
        <div
          className="h-full bg-sky-500 transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
