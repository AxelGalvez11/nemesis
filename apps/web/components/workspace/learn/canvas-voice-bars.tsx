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

/**
 * How far the strip travels per sample: a 3px bar plus the 3px gap beside it.
 *
 * 🔴 IT IS THE ANIMATION'S DISTANCE AND IT MUST MATCH THE MARKUP. If the two disagree the strip
 * slides the wrong distance every sample and visibly creeps; `canvas-voice-bars.test.ts` reads both
 * numbers off this file and refuses a mismatch.
 */
const BAR_PITCH = 6;

export function CanvasVoiceBars({ live }: { live: boolean }) {
  const track = useRef<HTMLDivElement>(null);
  const shift = useRef<HTMLDivElement>(null);
  const [capacity, setCapacity] = useState(64);

  /**
   * 🔴🔴🔴 THE STRIP IS DRIVEN BY ONE ANIMATION FRAME LOOP, AND NOTHING HERE IS REACT STATE.
   *
   * Owner, twice: *"it should be, like, sixty frames per second or more because it still looks a
   * bit laggy."* The version this replaces held the samples in `useState` and glided with a CSS
   * transition restarted on every one — so ten times a second React reconciled sixty-odd spans AND
   * a transition was cancelled and re-declared mid-flight. Both are frame-droppers, and neither is
   * fixed by an easing curve.
   *
   * Now: samples live in a ref, the spans are a FIXED POOL rendered once, and a single `rAF` writes
   * `style.height` and one `transform` per frame. While the microphone is open this component does
   * not re-render at all. That is what "sixty or more" actually costs — the browser paints at its
   * own refresh rate because nothing is competing with it.
   *
   * 🔴 THE SAMPLING CADENCE IS UNTOUCHED, AND THAT IS DELIBERATE. Earlier the same day the owner
   * asked for the strip to be SLOWER, and `SAMPLE_MS = 100` plus the re-derived 0.395/0.605 blend
   * are pinned to it. How often the strip LEARNS something and how often it PAINTS are different
   * questions; raising the sample rate to buy smoothness would quietly reverse that instruction.
   */
  const heights = useRef<number[]>([]);
  const smoothed = useRef(0);
  const heard = useRef(false);
  const sampledAt = useRef(0);
  const frame = useRef(0);

  useEffect(() => {
    const measure = () => {
      const width = shift.current?.clientWidth ?? 0;
      if (width > 0) setCapacity(Math.max(8, Math.floor(width / BAR_PITCH)));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [live]);

  useEffect(() => {
    if (!live) {
      heights.current = [];
      smoothed.current = 0;
      heard.current = false;
      return;
    }

    let level = 0;
    const stop = subscribeMicLevel((value) => {
      level = value;
    });

    const timer = window.setInterval(() => {
      // 🔴 RE-DERIVED FOR THIS CADENCE, NOT CARRIED OVER FROM THE OLD ONE. This line is a discrete
      // first-order low-pass filter — `y = y*(1-a) + level*a`, run once per SAMPLE_MS — and such a
      // filter has a real, wall-clock time constant: `tau = -SAMPLE_MS / ln(1-a)`. At the original
      // 55ms tick with a=0.4, tau is ~108ms. Slowing to 100ms while leaving a=0.4 alone would have
      // nearly doubled tau to ~216ms, so the strip would take twice as long to show a real word
      // arriving. Only the STEP RATE was meant to slow, never the responsiveness. Solving
      // `1-a' = exp(-SAMPLE_MS / tau)` holds tau at ~108ms again.
      smoothed.current = smoothed.current * 0.395 + level * 0.605;
      // Below this the room is quiet; recording it as a tall bar would claim speech that did not
      // happen. The pre-speech run stays dots until something is actually said.
      if (smoothed.current > 0.06) heard.current = true;
      const height = heard.current
        ? Math.round(MIN_BAR + Math.min(1, smoothed.current) * (MAX_BAR - MIN_BAR))
        : IDLE_BAR;
      heights.current = [...heights.current, height].slice(-capacity);
      sampledAt.current = performance.now();
    }, SAMPLE_MS);

    // 🔴 SOMEBODY WHO ASKED THE SYSTEM TO STOP MOVING STILL HAS TO SEE THAT IT IS LISTENING, so the
    // bars keep updating and only the between-sample easing is dropped. `globals.css` makes the
    // same trade for `.canvas-forming`.
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const draw = () => {
      frame.current = requestAnimationFrame(draw);
      const bars = track.current?.children;
      if (!bars) return;
      // 0 at the instant a sample lands, 1 by the time the next one is due.
      const t = still ? 1 : Math.min(1, (performance.now() - sampledAt.current) / SAMPLE_MS);
      const pad = Math.max(0, capacity - heights.current.length);

      // 🔴🔴 THE TRANSFORM AND THE CONTENT SHIFT ARE EQUAL AND OPPOSITE, AND THE SIGN IS THE WHOLE
      // TRICK. A sample moves every bar one place LEFT in the list, so at the instant it lands the
      // track is pushed one pitch RIGHT — putting every bar back where the eye last saw it — and
      // eased to zero over exactly one sample period. The result is a constant 60px/s glide instead
      // of a 6px jump every 100ms. Getting this sign backwards doubles the jump instead of
      // cancelling it.
      // 🔴🔴 ON THE TRACK, NOT ON THE FRAME AROUND IT — measured in a real browser, where the frame
      // reported `transform: none` and the strip was sliding its own clipping box 6px sideways
      // instead of scrolling the bars inside it. `shift` is the fixed, overflow-hidden window the
      // strip is read through; `track` is the row that moves behind it. Transforming the window
      // moves the window.
      if (track.current) {
        track.current.style.transform = `translate3d(${(1 - t) * BAR_PITCH}px, 0, 0)`;
      }

      for (let at = 0; at < bars.length; at += 1) {
        const bar = bars[at] as HTMLElement;
        const index = at - pad;
        const spoken = index >= 0;
        // 🔴🔴 ONLY THE NEWEST BAR EASES, AND THAT FALLS OUT OF THE TRANSFORM RATHER THAN BEING A
        // SEPARATE ANIMATION. Because the track is pushed a full pitch right at t=0, every existing
        // bar is drawn exactly where its own value was already showing — so it needs no easing at
        // all and gets none. The last bar is the one slot that was off the right edge a moment ago,
        // so it is the only thing that would POP. It grows from the idle dot as it slides in.
        const to = spoken ? heights.current[index] ?? IDLE_BAR : IDLE_BAR;
        const newest = spoken && index === heights.current.length - 1;
        bar.style.height = `${newest ? IDLE_BAR + (to - IDLE_BAR) * t : to}px`;
        bar.dataset.spoken = spoken ? "true" : "false";
      }
    };
    frame.current = requestAnimationFrame(draw);

    return () => {
      stop();
      window.clearInterval(timer);
      cancelAnimationFrame(frame.current);
    };
  }, [live, capacity]);

  return (
    <div
      aria-hidden
      className="flex h-[41px] min-w-0 flex-1 items-center justify-start overflow-hidden"
      ref={shift}
    >
      {/* 🔴 A FIXED POOL, RENDERED ONCE. The spans never move, are never added and are never
          removed while the microphone is open — the loop above only writes their heights. That is
          what takes React off the hot path entirely; the previous version rebuilt this list ten
          times a second. */}
      <div className="flex min-w-0 items-center gap-[3px] will-change-transform" ref={track}>
        {Array.from({ length: capacity }, (_, index) => (
          <span
            className="w-[3px] shrink-0 rounded-full bg-(--ui-text-quaternary) data-[spoken=true]:bg-(--ui-text-tertiary)"
            key={index}
            style={{ height: `${IDLE_BAR}px` }}
          />
        ))}
      </div>
    </div>
  );
}
