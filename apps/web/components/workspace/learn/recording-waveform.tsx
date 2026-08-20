"use client";

// The rolling waveform (owner 2026-07-27: "why not just have an audio waveform
// to show students that the audio is being picked up?").
//
// Drawn on a canvas from an animation frame reading a ref, NOT from React
// state. Ten array updates a second through state would re-render the chat
// screen underneath it at the same rate, which is exactly the trap the mic
// level channel was built to avoid (see lib/workspace/mic-level.ts).
//
// Bars the silence gate skipped are drawn faint instead of hidden: someone
// watching should be able to see the recorder stand down during a quiet stretch
// and understand why, rather than wonder whether it broke.

import { useEffect, useRef } from "react";

import { barHeight, WAVEFORM_BARS, type WaveBar } from "@/lib/workspace/waveform-history";

interface RecordingWaveformProps {
  bars: { current: WaveBar[] };
  /** Paused recorders draw dimmer, so the whole strip reads as standing by. */
  active: boolean;
  className?: string;
}

const BAR_GAP = 2;

export function RecordingWaveform({ bars, active, className }: RecordingWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let frame = 0;

    const draw = () => {
      frame = window.requestAnimationFrame(draw);
      const context = canvas.getContext("2d");
      if (!context) return;

      // Match the backing store to the CSS box so bars are crisp on a retina
      // screen; doing it every frame also survives the panel being resized.
      const ratio = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (width === 0 || height === 0) return;
      if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);
      }
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);

      const history = bars.current;
      const slot = width / WAVEFORM_BARS;
      const barWidth = Math.max(1, slot - BAR_GAP);
      const middle = height / 2;
      const accent = getComputedStyle(canvas).getPropertyValue("--waveform-color").trim() || "currentColor";

      for (const [index, bar] of history.entries()) {
        // Mirrored around the centre line — the shape people recognise as sound.
        const full = barHeight(bar.level, height * 0.9);
        const x = index * slot;
        context.globalAlpha = bar.captured ? (activeRef.current ? 0.9 : 0.4) : 0.16;
        context.fillStyle = accent;
        const rounded = Math.min(barWidth / 2, 1.5);
        context.beginPath();
        context.roundRect(x, middle - full / 2, barWidth, full, rounded);
        context.fill();
      }
      context.globalAlpha = 1;
    };

    frame = window.requestAnimationFrame(draw);
    return () => window.cancelAnimationFrame(frame);
  }, [bars]);

  return (
    <canvas
      aria-hidden
      className={className}
      ref={canvasRef}
      // The colour lives in CSS so the canvas follows the theme rather than
      // hard-coding a hex that breaks in light mode.
      style={{ ["--waveform-color" as string]: "var(--theme-primary)", height: "100%", width: "100%" }}
    />
  );
}
