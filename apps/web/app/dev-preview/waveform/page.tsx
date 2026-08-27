"use client";

// DEV-ONLY PREVIEW — the dictation strip, driven without a microphone.
//
// 🔴 IT EXISTS BECAUSE THIS STRIP HAS BEEN RE-TUNED THREE TIMES ON REPORTS ALONE. It only mounts
// while dictation is live, so every claim about its smoothness has come from reading the code and
// every correction has come from the owner watching production. `publishMicLevel` is the same
// channel the dictation hook writes to, so feeding it here exercises the real component on the
// real path — the microphone is the only thing replaced.
//
//     ?hz=25   how often synthetic levels are published (the real meter runs at 80ms / 12.5Hz)
//
// The readout counts animation frames, which is the number the owner has actually been asking for.

import { useEffect, useRef, useState } from "react";

import { CanvasVoiceBars } from "@/components/workspace/learn/canvas-voice-bars";
import { publishMicLevel, resetMicLevel } from "@/lib/workspace/mic-level";

export default function WaveformPreviewPage() {
  const [fps, setFps] = useState(0);
  const frames = useRef(0);

  useEffect(() => {
    const hz = Number(new URLSearchParams(window.location.search).get("hz")) || 12.5;
    // A slow swell plus a faster wobble, so the strip shows both a rising level and real variation
    // rather than a flat line. Deterministic: no randomness, so two runs look the same.
    const started = performance.now();
    const meter = window.setInterval(() => {
      const t = (performance.now() - started) / 1000;
      publishMicLevel(Math.min(1, 0.35 + 0.3 * Math.sin(t * 1.1) + 0.2 * Math.sin(t * 7)));
    }, 1000 / hz);

    let raf = 0;
    const count = () => { frames.current += 1; raf = requestAnimationFrame(count); };
    raf = requestAnimationFrame(count);
    const ticker = window.setInterval(() => {
      setFps(frames.current);
      frames.current = 0;
    }, 1000);

    return () => {
      window.clearInterval(meter);
      window.clearInterval(ticker);
      cancelAnimationFrame(raf);
      resetMicLevel();
    };
  }, []);

  return (
    <main className="min-h-dvh bg-(--ui-bg-editor) p-16" data-workspace>
      <p className="mb-6 text-[length:var(--canvas-text-small)] text-(--ui-text-secondary)">
        Dictation strip, fed synthetic levels. Frames in the last second: <b data-fps>{fps}</b>
        <br />
        {/* 🔴 IT READS 0 IN A BACKGROUNDED TAB, AND THAT IS THE BROWSER RATHER THAN THE STRIP:
            `requestAnimationFrame` does not fire while a tab is hidden. Keep this page focused to
            read it. The strip's own smoothness is provable without focus — a FRACTIONAL transform
            on the track, or a fractional height on the last bar, can only come from a per-frame
            loop; a stepped animation lands on whole values. */}
        <span className="text-(--ui-text-quaternary)">
          Reads 0 unless this tab is focused — rAF does not run in a hidden tab.
        </span>
      </p>
      <div className="flex w-[560px] items-center rounded-full px-4 py-3 ring-1 ring-(--ui-stroke-tertiary)">
        <CanvasVoiceBars live />
      </div>
    </main>
  );
}
