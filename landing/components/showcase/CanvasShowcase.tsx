"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { NemesisMark } from "@/components/NemesisMark";
import { bands, clamp01, handoff } from "./progress";
import { DiagramScene } from "./scenes/DiagramScene";
import { AnatomyScene } from "./scenes/AnatomyScene";
import { MathPlotScene } from "./scenes/MathPlotScene";
import { CalculusScene } from "./scenes/CalculusScene";
import { ChemistryScene } from "./scenes/ChemistryScene";
import { EquilibriumScene } from "./scenes/EquilibriumScene";

/**
 * The product showcase: one Canvas that changes what it renders, on its own.
 *
 * ── IT PLAYS ITSELF ───────────────────────────────────────────────────────────
 *
 * This was scroll-driven — a tall pinned section where the reader's scroll
 * position chose the representation. That made the whole sequence scrubbable,
 * which was elegant, and it also made watching the product require work: you had
 * to keep scrolling to see the thing that was supposed to be showing you what it
 * does, and stopping to look meant the demonstration stopped too.
 *
 * Now it runs on a clock. A visitor can stop scrolling entirely and watch the
 * same Canvas cycle. The page scrolls normally and this section is an ordinary
 * height, so nothing is pinned and nothing is hijacked.
 *
 * What is lost, honestly: you cannot scrub back to re-watch a step. That is the
 * cost of autoplay, and for a front door whose job is "glance at this and
 * understand", it is the right trade.
 *
 * ── THE CLOCK IS STILL NORMALISED PROGRESS ────────────────────────────────────
 *
 * The scenes did not change. Each is still a pure function of one 0..1 number;
 * the only difference is where that number comes from. bands() and handoff()
 * take normalised progress and know nothing about its source, so swapping a
 * scroll fraction for a clock fraction preserves both properties they were
 * verified for: the frame is never empty, and two representations are never
 * superimposed.
 *
 * ── THE PAIRS ARE THE ARGUMENT ────────────────────────────────────────────────
 *
 * Circulation as a flow diagram, then the heart itself in three dimensions — the
 * Canvas deciding space explains what boxes could not. Then a parabola with a
 * secant collapsing onto a tangent, then that same limit written symbolically.
 * Then a reaction's energy profile, then why a lower barrier leaves the yield
 * alone. Each pair is one idea in two representations, which is a much narrower
 * claim than "we support six content types", and the one that is actually true.
 *
 * ── WHY A THIRD PAIR, AND WHY CHEMISTRY ───────────────────────────────────────
 *
 * There were two pairs, and between them they were biology twice and mathematics
 * twice. CLAUDE.md's standing test for anything on this product is whether it
 * works for a law student and a mechanical engineering student, and a front door
 * whose every worked example is a heart or an integral quietly answers "no". The
 * owner asked for maths, biology and chemistry, so the set is now one pair each.
 *
 * A pair, not a single scene, deliberately: adding one lone chemistry diagram
 * would have made the section three pairs of representations plus an orphan, and
 * the orphan is the one that reads as "another content type we support".
 *
 * 🔴 THE NEXT ADDITION SHOULD BE NON-STEM. Three disciplines is what was asked
 * for and it is still three sciences. A law or history pair — a causal chain
 * drawn, then the same argument in prose — is the obvious fourth, and the shape
 * of this file is what makes it a two-file change rather than a rewrite.
 *
 * ── NO CHROME ─────────────────────────────────────────────────────────────────
 *
 * No dots, no tabs, no arrows, no step counter, no mode labels. The reader is
 * not being told there are four features; they are watching one surface change
 * its mind. Text inside a scene is different — the diagram's labels, the heart's
 * one annotation, the plot's readout and the calculus are the lesson itself.
 */

const SCENES = 6;

/**
 * Seconds per scene, including the hold at the end.
 *
 * Calm on purpose. The slowest thing in here is the calculus, which asks the
 * reader to follow a substitution; at six seconds that is a glance and a shrug.
 * Nine gives each state time to be understood.
 *
 * Deliberately NOT shortened when the third pair arrived, though six scenes at
 * nine seconds is a 54s cycle and a visitor who watches for twenty seconds sees
 * two of them. Trimming the dwell to make more scenes fit in a glance would trade
 * the one property these were tuned for — that each state can actually be
 * followed — for an impression of variety. The line under the frame names the
 * three disciplines instead, which buys the same breadth in a second of reading
 * and costs the teaching nothing.
 */
const SCENE_SECONDS = 9;
const CYCLE = SCENES * SCENE_SECONDS;

/**
 * Fraction of a scene spent finishing its content, before it simply sits there.
 *
 * The choreography completes at 78% and the last 22% — about two seconds — is a
 * hold on the finished state. Without it every scene would still be moving at
 * the instant it began to fade, so nothing would ever be seen resolved, which is
 * the moment each of these is actually making its point.
 */
const CONTENT = 0.78;

/**
 * Transition length as a fraction of the whole cycle. 0.016 of 36 seconds is
 * about 0.58s on each side of a boundary — a soft handover a little over a
 * second end to end, which is a change of medium rather than a slide change.
 */
const EDGE = 0.016;

/** How long after the last interaction before playback resumes. */
const RESUME_AFTER = 2.5;

export function CanvasShowcase() {
  const sectionRef = useRef<HTMLElement>(null);
  const [progress, setProgress] = useState(0);
  const [armed, setArmed] = useState(false);
  const [reduced, setReduced] = useState(false);

  // Live values the rAF loop reads. Kept in refs so changing them never
  // restarts the loop or re-runs the effect that owns it.
  const onScreen = useRef(false);
  const lastInteract = useRef(-Infinity);

  useEffect(() => {
    setReduced(!!window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  /**
   * The clock.
   *
   * READ FROM WALL TIME, not accumulated per frame. Summing clamped deltas is
   * the usual pattern and it is wrong here: any environment that throttles
   * requestAnimationFrame — a background tab, a heavily loaded machine, an
   * embedded webview — delivers fewer frames, so the sequence silently runs slow
   * and a "nine second" scene takes however long the frame budget allowed. Wall
   * time makes the pacing real regardless of how often we are called.
   *
   * The two offsets are what make that safe. `origin` is when the cycle
   * started; pausing records the moment and, on resume, pushes `origin` forward
   * by exactly the paused duration, so a pause holds the frame rather than
   * letting the sequence run on invisibly and jump when it comes back.
   */
  useEffect(() => {
    if (reduced) return;

    let raf = 0;
    let origin = performance.now() / 1000;
    let pausedAt: number | null = null;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const t = now / 1000;

      // Held while off screen, and while the reader is actually MANIPULATING
      // something — dragging the heart. Moving the pointer across the Canvas used
      // to hold it too, with RESUME_AFTER as the mitigation, and that was wrong:
      // a reader whose cursor happens to rest over the section re-arms the hold
      // with every small movement, so the one thing on the page whose whole job
      // is to demonstrate change sits frozen for as long as they look at it.
      // Removed at the owner's direction 2026-08-17. Hovering is not an
      // instruction to stop.
      const held = !onScreen.current || t - lastInteract.current < RESUME_AFTER;
      if (held) {
        if (pausedAt === null) pausedAt = t;
        return;
      }
      if (pausedAt !== null) {
        origin += t - pausedAt;
        pausedAt = null;
      }

      setProgress(((t - origin) % CYCLE) / CYCLE);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [reduced]);

  /**
   * Visibility, and arming.
   *
   * `armed` is one-way: the heart model is 313 KB and should not download for a
   * visitor who bounces off the hero, but once it is here a reader scrolling
   * away and back should not fetch it again.
   */
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        const e = entries[0];
        if (!e) return;
        onScreen.current = e.isIntersecting;
        if (e.isIntersecting) setArmed(true);
      },
      { rootMargin: "10% 0px", threshold: 0.01 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const note = () => {
    lastInteract.current = performance.now() / 1000;
  };

  /**
   * Under reduced motion the Canvas holds on the first representation, fully
   * drawn. Not blank, and not cycling: a reader who asked the system to stop
   * moving things should still see what the Canvas is.
   */
  const p = reduced ? CONTENT * (1 / SCENES) : progress;

  const slices = useMemo(() => bands(p, SCENES, EDGE), [p]);
  const thinking = reduced ? 0 : handoff(p, SCENES, EDGE);

  // bands() always returns SCENES entries; the compiler cannot know that.
  const [diagram, anatomy, plot, calculus, chemistry, equilibrium] = slices as [
    (typeof slices)[number],
    (typeof slices)[number],
    (typeof slices)[number],
    (typeof slices)[number],
    (typeof slices)[number],
    (typeof slices)[number],
  ];

  /** Content finishes at CONTENT and holds for the remainder of the band. */
  const content = (local: number) => clamp01(local / CONTENT);

  return (
    <section className="shw" id="canvas" ref={sectionRef}>
      {/* wrap-wide, not wrap. The reading column is 1180 and the Canvas is the one
          thing on this page that is not reading — capping it there left it at
          1040px on a 1440 screen with the viewport budget nowhere near spent. */}
      <div className="wrap-wide shw-inner">
        <h2 className="shw-head">One Canvas. Whatever learning requires.</h2>

        {/* The frame is the argument. It has a border, a fixed size, and it does
            not move for the whole sequence — four representations appearing
            inside a box that holds still are legibly one surface. */}
        {/* onPointerDown only. A drag on the 3D scene is a real interaction and
            should hold the clock; a pointer merely passing over the frame is not. */}
        <div className="shw-canvas" onPointerDown={note}>
          <SceneLayer presence={diagram.presence}>
            <DiagramScene t={content(diagram.local)} />
          </SceneLayer>
          <SceneLayer presence={anatomy.presence}>
            <AnatomyScene
              t={content(anatomy.local)}
              armed={armed}
              active={anatomy.presence > 0.02}
              reduced={reduced}
            />
          </SceneLayer>
          <SceneLayer presence={plot.presence}>
            <MathPlotScene t={content(plot.local)} />
          </SceneLayer>
          <SceneLayer presence={calculus.presence}>
            <CalculusScene t={content(calculus.local)} />
          </SceneLayer>
          <SceneLayer presence={chemistry.presence}>
            <ChemistryScene t={content(chemistry.local)} />
          </SceneLayer>
          <SceneLayer presence={equilibrium.presence}>
            <EquilibriumScene t={content(equilibrium.local)} />
          </SceneLayer>

          {/* The handover. Small on purpose — this is a motion language, not a
              logo placement, and a full-size mark between scenes would turn a
              product demonstration into a brand reel. */}
          <div className="shw-thinking" style={{ opacity: thinking }} aria-hidden="true">
            <NemesisMark state={thinking > 0.05 ? "processing" : "static"} size={34} />
          </div>
        </div>

        {/* The disciplines are named here rather than labelled on the frame. A
            54-second cycle means a visitor sees two scenes, so the breadth has to
            be readable in a second; a mode label inside the Canvas would be the
            chrome this section deliberately does without. */}
        <p className="shw-line">Biology. Mathematics. Chemistry. One surface.</p>
      </div>
    </section>
  );
}

/**
 * One scene's slot in the frame.
 *
 * Stacked, not swapped. Every scene stays mounted for the life of the page and
 * only its appearance changes, because unmounting the 3D scene would destroy its
 * WebGL context — and a canvas whose context has been force-lost can never get
 * another one, so the next time round the cycle would leave a permanent hole.
 *
 * The transition is a crossfade with a very small amount of movement: a scene
 * arrives from six pixels below at 99% scale and leaves the same way. Enough
 * that the change reads as the content settling rather than as a hard cut, small
 * enough that it never reads as a slide transition. The shell does not move at
 * all — only what is inside it.
 *
 * `visibility` follows opacity so a faded scene cannot intercept a pointer, and
 * it is deliberately not `display:none`, which would drop the layout box and let
 * the 3D canvas resize itself to zero.
 */
function SceneLayer({ presence, children }: { readonly presence: number; readonly children: React.ReactNode }) {
  const hidden = presence <= 0.001;
  const away = 1 - presence;
  return (
    <div
      className="shw-layer"
      style={{
        opacity: presence,
        transform: `translateY(${away * 6}px) scale(${1 - away * 0.012})`,
        visibility: hidden ? "hidden" : "visible",
      }}
      aria-hidden={presence <= 0.5}
    >
      {children}
    </div>
  );
}
