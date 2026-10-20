"use client";

import { useEffect, useRef } from "react";

/**
 * Matrix-style digital rain on a canvas.
 *
 * Rendered as a passive overlay (pointer-events: none) for the HUD theme:
 * behind the boot splash, or across the whole console when enabled in OPTICS.
 * The simulation is deliberately cheap — one draw call per column per frame
 * with a translucent clear, no DOM, no React re-renders.
 */

const GLYPHS =
  "ｦｧｨｩｪｫｬｭｮｯｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789:・.=*+-<>¦｜╱╲";

interface MatrixRainProps {
  /** 0–1, canvas opacity. */
  opacity?: number;
  className?: string;
  /** Glyph cell size in px. Smaller = denser rain. */
  cellSize?: number;
}

export default function MatrixRain({
  opacity = 0.16,
  className = "",
  cellSize = 16,
}: MatrixRainProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const devicePixelRatio = Math.min(2, window.devicePixelRatio || 1);
    let columns = 0;
    let speeds: number[] = [];
    let offsets: number[] = [];
    let frames = 0;
    let frame = 0;

    const resize = () => {
      const width = canvas.clientWidth || 1;
      const height = canvas.clientHeight || 1;
      canvas.width = Math.floor(width * devicePixelRatio);
      canvas.height = Math.floor(height * devicePixelRatio);
      columns = Math.ceil(width / cellSize);
      speeds = Array.from({ length: columns }, () => 0.4 + Math.random() * 0.9);
      offsets = Array.from({ length: columns }, () => Math.random() * -60);
      context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
      // Opaque clear on resize so the first frame starts from black.
      context.fillStyle = "#010803";
      context.fillRect(0, 0, width, height);
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const draw = () => {
      frame = requestAnimationFrame(draw);
      frames += 1;
      // Half-rate trail decay keeps the classic smear without extra cost.
      if (frames % 2 !== 0) return;

      const width = canvas.clientWidth || 1;
      const height = canvas.clientHeight || 1;
      context.fillStyle = "rgba(1, 8, 3, 0.14)";
      context.fillRect(0, 0, width, height);
      context.font = `${cellSize - 2}px ui-monospace, monospace`;
      context.textBaseline = "top";

      for (let column = 0; column < columns; column += 1) {
        const x = column * cellSize;
        offsets[column] += speeds[column];
        const head = offsets[column];

        // Leading glyph: hot white-green.
        context.fillStyle = "#c8ffd8";
        context.fillText(GLYPHS[(Math.random() * GLYPHS.length) | 0], x, head * cellSize);

        // Trailing run behind the head.
        for (let trail = 1; trail <= 8; trail += 1) {
          const y = (head - trail) * cellSize;
          if (y < -cellSize || y > height + cellSize) continue;
          const shade = 1 - trail / 9;
          context.fillStyle = `rgba(0, ${Math.round(120 + 135 * shade)}, ${Math.round(48 + 55 * shade)}, ${0.9 * shade + 0.1})`;
          context.fillText(GLYPHS[(Math.random() * GLYPHS.length) | 0], x, y);
        }

        // Reset the column once its head leaves the screen.
        if (head * cellSize > height + 8 * cellSize) {
          offsets[column] = -Math.random() * 30;
          speeds[column] = 0.4 + Math.random() * 0.9;
        }
      }
    };

    frame = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [cellSize]);

  return (
    <canvas
      ref={canvasRef}
      className={`pointer-events-none ${className}`}
      style={{ opacity }}
      aria-hidden="true"
    />
  );
}
