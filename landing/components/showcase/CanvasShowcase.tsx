"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { bands, clamp01 } from "./progress";
import { DiagramScene } from "./scenes/DiagramScene";
import { AnatomyScene } from "./scenes/AnatomyScene";
import { MathPlotScene } from "./scenes/MathPlotScene";
import { CalculusScene } from "./scenes/CalculusScene";

/**
 * The product showcase: one Canvas that changes what it renders as you scroll.
 *
 * ── WHY THIS REPLACED TWO SECTIONS ────────────────────────────────────────────
 *
 * There used to be a Canvas mock that cycled on a timer, and below it three
 * separate demonstrations of three representations. Both were making the same
 * claim, which meant the page argued the point twice and proved it neither
 * time: three demos side by side show three surfaces, and the claim is that
 * there is only ever one.
 *
 * So there is one Canvas here. It does not unmount, it is not rebuilt between
 * scenes, and it keeps its frame the whole way down. The only thing that
 * changes is what is inside it. A visitor watching a diagram become an organ
 * become a graph become an equation, inside a frame that never moves, does not
 * need to be told that the surface adapts.
 *
 * ── THE PAIRS ARE THE ARGUMENT ────────────────────────────────────────────────
 *
 * Four scenes, two pairs. Circulation as a flow diagram, then the heart itself
 * in three dimensions — the Canvas deciding that space explains what boxes and
 * arrows could not. Then a parabola with a secant collapsing onto a tangent,
 * then that same limit written symbolically — the Canvas deciding the picture
 * has done its work and the notation should take over.
 *
 * Each pair is one idea in two representations. That is a much narrower claim
 * than "we support four content types", and it is the claim that is actually
 * true.
 *
 * ── NO CHROME ─────────────────────────────────────────────────────────────────
 *
 * No dots, no step counter, no mode labels, no captions naming what you are
 * looking at, no explanation of the transition. Every one of those would be the
 * page narrating an effect the reader can already see. Text inside a scene is
 * different — the diagram's labels, the heart's one annotation, the plot's
 * slope readout and the calculus are the lesson, not chrome about the lesson.
 */

const SCENES = 4;

/**
 * Scroll length. Roughly one viewport of travel per scene plus a little for the
 * pin to settle, which is enough for a state to register and short enough that
 * nobody feels held hostage. This is the number to change if the sequence ever
 * feels laboured; it is not a scroll-jack and the reader sets the pace.
 */
const VH_PER_SCENE = 88;

export function CanvasShowcase() {
  const sectionRef = useRef<HTMLElement>(null);
  const [progress, setProgress] = useState(0);
  const [armed, setArmed] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    setReduced(!!window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  // Position in, position out. One rAF-coalesced read of the section's rect per
  // frame; no scroll handler ever does layout work directly, because a listener
  // that calls getBoundingClientRect on every scroll event runs many times per
  // frame and each call forces a synchronous layout.
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;

    let raf = 0;
    const read = () => {
      raf = 0;
      const rect = el.getBoundingClientRect();
      const travel = rect.height - window.innerHeight;
      setProgress(travel <= 0 ? 0 : clamp01(-rect.top / travel));
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(read);
    };

    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    read();
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);

  // The heart model is 313 KB. Nobody who bounces off the hero should pay for
  // it, so the 3D scene stays dormant until this section is within a screen of
  // being needed. It arms once and never disarms — a reader who scrolls back up
  // should not have to download it again.
  useEffect(() => {
    const el = sectionRef.current;
    if (!el || armed) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setArmed(true);
      },
      { rootMargin: "100% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [armed]);

  const slices = useMemo(() => bands(progress, SCENES), [progress]);
  // bands() always returns SCENES entries, but the compiler cannot know that.
  const [diagram, anatomy, plot, calculus] = slices as [
    (typeof slices)[number],
    (typeof slices)[number],
    (typeof slices)[number],
    (typeof slices)[number],
  ];

  return (
    <section className="shw" id="canvas" ref={sectionRef} style={{ height: `${SCENES * VH_PER_SCENE + 30}vh` }}>
      <div className="shw-stick">
        <div className="wrap shw-inner">
          <h2 className="shw-head">one canvas. whatever learning requires.</h2>

          {/* The frame is the argument. It has a border and it never moves, so
              the four representations are legibly the same surface rather than
              four things shown in sequence. */}
          <div className="shw-canvas">
            <SceneLayer presence={diagram.presence}>
              <DiagramScene t={diagram.local} />
            </SceneLayer>
            <SceneLayer presence={anatomy.presence}>
              <AnatomyScene t={anatomy.local} armed={armed} active={anatomy.presence > 0.02} reduced={reduced} />
            </SceneLayer>
            <SceneLayer presence={plot.presence}>
              <MathPlotScene t={plot.local} />
            </SceneLayer>
            <SceneLayer presence={calculus.presence}>
              <CalculusScene t={calculus.local} />
            </SceneLayer>
          </div>

          <p className="shw-line">See it. Move it. Work it out.</p>
        </div>
      </div>
    </section>
  );
}

/**
 * One scene's slot in the frame.
 *
 * Stacked, not swapped. Every scene stays mounted for the life of the page and
 * only its opacity changes, because unmounting the 3D scene would destroy its
 * WebGL context — and a canvas whose context has been force-lost can never get
 * another one, so scrolling back up would leave a permanent hole.
 *
 * `visibility` follows opacity so a fully faded scene cannot intercept a click,
 * and it is deliberately not `display:none`, which would drop the layout box
 * and let the 3D canvas resize itself to zero.
 */
function SceneLayer({ presence, children }: { readonly presence: number; readonly children: React.ReactNode }) {
  return (
    <div
      className="shw-layer"
      style={{
        opacity: presence,
        visibility: presence <= 0.001 ? "hidden" : "visible",
      }}
      aria-hidden={presence <= 0.5}
    >
      {children}
    </div>
  );
}
