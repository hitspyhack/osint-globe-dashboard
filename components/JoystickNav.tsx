"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { GlobeApi } from "@/components/GlobeView";

interface JoystickNavProps {
  apiRef: MutableRefObject<GlobeApi | null>;
}

const MAX_TILT = 80;
/** Altitude ×/÷ per second while a zoom button is held. */
const ZOOM_PER_SEC = 3.2;
/** Heading degrees per second while a rotate button is held. */
const HEADING_PER_SEC = 100;
/** Discrete pan step for keyboard nudges (seconds of stick time at full deflection). */
const KEYBOARD_PAN_SEC = 0.35;

function pad3(value: number): string {
  return String(Math.round(Math.abs(value))).padStart(3, "0");
}

/** Compass-style heading for the readout: 0–360°. */
function compass(heading: number): string {
  return String(Math.round(((heading % 360) + 360) % 360)).padStart(3, "0");
}

/**
 * Navigational joystick — pan, zoom, tilt and heading for the globe.
 *
 * The pad reports a stick deflection every frame while held (springing back
 * to centre on release); zoom and rotate buttons repeat while held. Tilt runs
 * 0° (straight down) to 80° (near horizon). All camera math lives in
 * GlobeView; this component only feeds it stick state.
 */
export default function JoystickNav({ apiRef }: JoystickNavProps) {
  const [tilt, setTilt] = useState(0);
  const [heading, setHeading] = useState(0);

  const padRef = useRef<HTMLDivElement | null>(null);
  const knobRef = useRef<HTMLDivElement | null>(null);
  const stickRef = useRef({ x: 0, y: 0, active: false });
  const panRafRef = useRef(0);
  const panLastRef = useRef(0);
  const holdRafRef = useRef(0);
  const holdLastRef = useRef(0);
  const holdRef = useRef({ zoom: 0, heading: 0 });
  const tiltRef = useRef(0);
  const headingRef = useRef(0);
  tiltRef.current = tilt;
  headingRef.current = heading;

  const stopPanLoop = useCallback(() => {
    if (panRafRef.current) cancelAnimationFrame(panRafRef.current);
    panRafRef.current = 0;
    panLastRef.current = 0;
  }, []);

  const stopHoldLoop = useCallback(() => {
    if (holdRafRef.current) cancelAnimationFrame(holdRafRef.current);
    holdRafRef.current = 0;
    holdLastRef.current = 0;
    holdRef.current = { zoom: 0, heading: 0 };
  }, []);

  useEffect(() => stopPanLoop, [stopPanLoop]);
  useEffect(() => stopHoldLoop, [stopHoldLoop]);

  /* ---- pan pad ---- */

  const panLoop = useCallback(
    (time: number) => {
      const dt = panLastRef.current
        ? Math.min(0.05, (time - panLastRef.current) / 1000)
        : 1 / 60;
      panLastRef.current = time;

      const api = apiRef.current;
      if (api && stickRef.current.active) {
        const { x, y } = stickRef.current;
        if (Math.hypot(x, y) > 0.06) api.panBy(x, y, dt);
      }
      panRafRef.current = requestAnimationFrame(panLoop);
    },
    [apiRef]
  );

  const setKnob = useCallback((x: number, y: number) => {
    const knob = knobRef.current;
    if (!knob) return;
    knob.style.setProperty("--knob-x", `${(x * 34).toFixed(1)}%`);
    knob.style.setProperty("--knob-y", `${(y * 34).toFixed(1)}%`);
  }, []);

  const updateStick = useCallback(
    (clientX: number, clientY: number) => {
      const pad = padRef.current;
      if (!pad) return;
      const rect = pad.getBoundingClientRect();
      let x = (clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
      let y = (clientY - (rect.top + rect.height / 2)) / (rect.height / 2);
      const magnitude = Math.hypot(x, y);
      if (magnitude > 1) {
        x /= magnitude;
        y /= magnitude;
      }
      stickRef.current.x = x;
      stickRef.current.y = -y; // screen y grows downward; stick up is positive
      setKnob(x, y);
    },
    [setKnob]
  );

  const onPadPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      stickRef.current.active = true;
      padRef.current?.setAttribute("data-active", "true");
      updateStick(event.clientX, event.clientY);
      if (!panRafRef.current) {
        panLastRef.current = 0;
        panRafRef.current = requestAnimationFrame(panLoop);
      }
    },
    [panLoop, updateStick]
  );

  const onPadPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!stickRef.current.active) return;
      updateStick(event.clientX, event.clientY);
    },
    [updateStick]
  );

  const releaseStick = useCallback(() => {
    stickRef.current = { x: 0, y: 0, active: false };
    padRef.current?.setAttribute("data-active", "false");
    setKnob(0, 0);
    stopPanLoop();
  }, [setKnob, stopPanLoop]);

  /* ---- tilt / heading ---- */

  const applyTilt = useCallback(
    (value: number) => {
      const next = Math.min(MAX_TILT, Math.max(0, value));
      setTilt(next);
      apiRef.current?.setOrientation(next, headingRef.current);
    },
    [apiRef]
  );

  const applyHeading = useCallback(
    (value: number) => {
      const next = ((value % 360) + 540) % 360 - 180;
      setHeading(next);
      apiRef.current?.setOrientation(tiltRef.current, next);
    },
    [apiRef]
  );

  const onPadKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const api = apiRef.current;
      if (!api) return;
      const nudge: Record<string, [number, number]> = {
        ArrowUp: [0, 1],
        ArrowDown: [0, -1],
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
      };
      const stick = nudge[event.key];
      if (stick) {
        event.preventDefault();
        api.panBy(stick[0], stick[1], KEYBOARD_PAN_SEC);
        return;
      }
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        api.zoomBy(0.6);
      } else if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        api.zoomBy(1.6);
      } else if (event.key === "PageUp") {
        event.preventDefault();
        applyTilt(tiltRef.current + 10);
      } else if (event.key === "PageDown") {
        event.preventDefault();
        applyTilt(tiltRef.current - 10);
      }
    },
    [apiRef, applyTilt]
  );

  const resetOrientation = useCallback(() => {
    setTilt(0);
    setHeading(0);
    apiRef.current?.resetOrientation();
  }, [apiRef]);

  /* ---- hold-to-repeat (zoom + rotate) ---- */

  const holdLoop = useCallback(
    (time: number) => {
      const dt = holdLastRef.current
        ? Math.min(0.05, (time - holdLastRef.current) / 1000)
        : 1 / 60;
      holdLastRef.current = time;

      const api = apiRef.current;
      if (api) {
        const { zoom, heading } = holdRef.current;
        if (zoom !== 0) {
          api.zoomBy(Math.pow(ZOOM_PER_SEC, -zoom * dt));
        }
        if (heading !== 0) {
          applyHeading(headingRef.current + heading * HEADING_PER_SEC * dt);
        }
      }

      if (holdRef.current.zoom !== 0 || holdRef.current.heading !== 0) {
        holdRafRef.current = requestAnimationFrame(holdLoop);
      } else {
        holdRafRef.current = 0;
        holdLastRef.current = 0;
      }
    },
    [apiRef, applyHeading]
  );

  const startHold = useCallback(
    (zoom: number, heading: number) => {
      holdRef.current = { zoom, heading };
      if (!holdRafRef.current) {
        holdLastRef.current = 0;
        holdRafRef.current = requestAnimationFrame(holdLoop);
      }
    },
    [holdLoop]
  );

  const stopHold = useCallback(() => {
    holdRef.current = { zoom: 0, heading: 0 };
  }, []);

  const holdButtonProps = useCallback(
    (zoom: number, heading: number) => ({
      onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        startHold(zoom, heading);
      },
      onPointerUp: stopHold,
      onPointerCancel: stopHold,
      onPointerLeave: stopHold,
      onContextMenu: (event: React.MouseEvent) => event.preventDefault(),
    }),
    [startHold, stopHold]
  );

  return (
    <div className="joystick-nav" role="group" aria-label="Globe navigation joystick">
      <div className="joystick-main">
        <div
          className="joystick-pad"
          ref={padRef}
          tabIndex={0}
          role="application"
          aria-label="Pan the globe — drag the stick, or use the arrow keys"
          onPointerDown={onPadPointerDown}
          onPointerMove={onPadPointerMove}
          onPointerUp={releaseStick}
          onPointerCancel={releaseStick}
          onKeyDown={onPadKeyDown}
        >
          <span className="joystick-crosshair" aria-hidden="true" />
          <span className="joystick-north" aria-hidden="true">
            N
          </span>
          <div className="joystick-knob" ref={knobRef} aria-hidden="true" />
        </div>

        <div className="joystick-zoom">
          <button
            type="button"
            className="joystick-btn"
            aria-label="Zoom in — hold to repeat"
            {...holdButtonProps(1, 0)}
          >
            +
          </button>
          <button
            type="button"
            className="joystick-btn"
            aria-label="Zoom out — hold to repeat"
            {...holdButtonProps(-1, 0)}
          >
            −
          </button>
        </div>
      </div>

      <div className="joystick-panel">
        <div className="joystick-readout" aria-live="off">
          TILT {pad3(tilt)}° · HDG {compass(heading)}°
        </div>

        <div className="joystick-tilt-row">
          <button
            type="button"
            className="joystick-btn joystick-btn-wide"
            aria-label="Rotate view counter-clockwise — hold to repeat"
            title="Rotate counter-clockwise"
            {...holdButtonProps(0, -1)}
          >
            ⟲
          </button>
          <div className="joystick-tilt-slider">
            <span className="hud-label">TILT</span>
            <input
              type="range"
              min={0}
              max={MAX_TILT}
              step={1}
              value={tilt}
              aria-label="Camera tilt, 0 degrees looking straight down to 80 degrees at the horizon"
              onChange={(event) => applyTilt(Number(event.target.value))}
            />
          </div>
          <button
            type="button"
            className="joystick-btn joystick-btn-wide"
            aria-label="Rotate view clockwise — hold to repeat"
            title="Rotate clockwise"
            {...holdButtonProps(0, 1)}
          >
            ⟳
          </button>
        </div>

        <button type="button" className="joystick-reset" onClick={resetOrientation}>
          ⌖ N-UP
        </button>
      </div>
    </div>
  );
}
