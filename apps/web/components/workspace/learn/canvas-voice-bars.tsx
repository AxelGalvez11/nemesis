"use client";

// The waveform the composer becomes while it is listening.
//
// 🔴 IT IS LIVE, NOT AN ANIMATION. Bar heights come from the real microphone amplitude the
// dictation hook publishes, because the whole job of this thing is to be evidence that Nemesis
// is actually hearing you. A decorative loop would look identical while the microphone was
// dead, which is precisely the failure it needs to make visible.
//
// Geometry is copied from the reference: 3px bars on a 6px step (3px gap), rounded, vertically
// centred, never touching the composer's edge. Unspoken time reads as a row of low dots rather
// than a flat line, so the strip reads as "waiting for you" instead of "broken".

import { useEffect, useRef, useState } from "react";

import { subscribeMicLevel } from "@/lib/workspace/mic-level";

/** Sampling cadence. Slow enough that the strip is readable rather than hyperactive — the
 *  reference has restrained motion, and a bar per frame is noise, not information.
 *
 *  🔴 100ms, NOT THE ORIGINAL 55ms (owner, 2026-08-26: "the dictation animation needs to be a
 *  little bit slower... a bit too fast right now"). 55ms is ~18 steps/second, which at the 6px
 *  step below is 109px/s of scroll. 100ms is not a guess: it is the integration window a
 *  broadcast PPM (peak programme meter) uses for exactly this judgement call — how often a level
 *  meter should refresh so it reads as calm evidence of loudness rather than jitter. At 100ms the
 *  strip scrolls at 60px/s, a 45% slowdown that reads as "a little slower" rather than sluggish,
 *  and it still updates at 10Hz — comfortably above the ~8Hz floor where a stepped strip stops
 *  reading as motion and starts reading as a series of jumps.
 *
 *  🔴 AND IT IS ALREADY THIS APP'S OWN ANSWER TO THE SAME QUESTION. `WAVEFORM_SAMPLE_MS` in
 *  `@/lib/workspace/waveform-history.ts` — the recorder's rolling waveform, a different feature
 *  sampling the same kind of live mic level for a visual — is independently 100. Not imported
 *  from here (the two strips are unrelated features and should not become coupled by sharing a
 *  literal), but landing on the same number the recorder already uses is a second, independent
 *  confirmation that 100ms is this app's settled answer for "how often should a live level
 *  reading move," not a one-off guess for this file alone. */
const SAMPLE_MS = 100;
const MIN_BAR = 4;
const MAX_BAR = 41;
/** Height of a dot in the not-yet-spoken run. */
const IDLE_BAR = 3;

export function CanvasVoiceBars({ live }: { live: boolean }) {
  const [samples, setSamples] = useState<number[]>([]);
  const track = useRef<HTMLDivElement>(null);
  const [capacity, setCapacity] = useState(64);
  // Smoothed across ticks: raw RMS jitters hard enough to read as flicker rather than speech.
  const smoothed = useRef(0);
  const heard = useRef(false);

  useEffect(() => {
    const measure = () => {
      const width = track.current?.clientWidth ?? 0;
      if (width > 0) setCapacity(Math.max(8, Math.floor(width / 6)));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [live]);

  useEffect(() => {
    if (!live) {
      setSamples([]);
      smoothed.current = 0;
      heard.current = false;
      return;
    }
    let level = 0;
    const stop = subscribeMicLevel((value) => {
      level = value;
    });
    const timer = window.setInterval(() => {
      // 🔴 RE-DERIVED FOR THE NEW CADENCE, NOT CARRIED OVER FROM IT. This line is a discrete
      // first-order low-pass filter — `y = y*(1-a) + level*a`, run once per SAMPLE_MS — and a
      // filter like that has a real, wall-clock time constant: `tau = -SAMPLE_MS / ln(1-a)`. At
      // the old 55ms tick with a=0.4, tau is ~108ms. Slowing SAMPLE_MS to 100ms while leaving
      // a=0.4 untouched would have nearly doubled tau to ~216ms — the strip would take almost
      // twice as long to show a real word arriving, which is exactly the "responsiveness
      // accidentally halved" this constant's coupling to the sample rate warns about. Only the
      // strip's own step rate should slow down, not how fast it notices you speaking. Solving
      // `1-a' = exp(-SAMPLE_MS / tau)` for the new 100ms cadence holds tau at ~108ms again, so a
      // real amplitude change surfaces on the bars exactly as fast as it did before this fix.
      smoothed.current = smoothed.current * 0.395 + level * 0.605;
      // Below this the room is quiet; recording it as a tall bar would claim speech that did
      // not happen. The pre-speech run stays dots until something is actually said.
      if (smoothed.current > 0.06) heard.current = true;
      const height = heard.current
        ? Math.round(MIN_BAR + Math.min(1, smoothed.current) * (MAX_BAR - MIN_BAR))
        : IDLE_BAR;
      setSamples((current) => [...current, height].slice(-capacity));
    }, SAMPLE_MS);
    return () => {
      stop();
      window.clearInterval(timer);
    };
  }, [live, capacity]);

  // The strip fills from the right, so the not-yet-recorded head reads as the quiet dots the
  // reference shows before speech starts.
  const pad = Math.max(0, capacity - samples.length);

  return (
    <div
      aria-hidden
      className="flex h-[41px] min-w-0 flex-1 items-center justify-start gap-[3px] overflow-hidden"
      ref={track}
    >
      {Array.from({ length: pad }, (_, index) => (
        <span
          className="w-[3px] shrink-0 rounded-full bg-(--ui-text-quaternary)"
          key={`idle-${index}`}
          style={{ height: `${IDLE_BAR}px` }}
        />
      ))}
      {samples.map((height, index) => (
        <span
          className="w-[3px] shrink-0 rounded-full bg-(--ui-text-tertiary)"
          key={`bar-${index}`}
          style={{ height: `${height}px` }}
        />
      ))}
    </div>
  );
}
