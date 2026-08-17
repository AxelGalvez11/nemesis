"use client";

import { useLayoutEffect, useRef } from "react";

import { AnatomyScene } from "../scenes/AnatomyScene";
import { MathPlotScene } from "../scenes/MathPlotScene";
import { ChemistryScene } from "../scenes/ChemistryScene";
import { sessionState, type CursorTarget, type FigureKind, type SurfaceItem } from "./script";

/**
 * A miniature, real Nemesis session, rendered inside the landing page's Canvas.
 *
 * ── IT IS THE PRODUCT'S OWN COMPONENTS, REBUILT, NOT REDESIGNED ───────────────
 *
 * `landing` and `apps/web` are separate Next applications with separate token
 * systems, so this cannot import `CanvasComposer` — but every number in it is
 * that component's. The pill is 52px tall with a 26px radius and 12px of side
 * padding; its icon buttons are 36×36 with 20px glyphs; the input is 16px on
 * 26px. The send button is filled with the product's accent, because
 * `canvas-composer.tsx` argues at length that a grey arrow reads as disabled.
 * `Continue` is the real control from `canvas-policy-view.tsx` — a ring-1 pill
 * BELOW the material, with the product's actual label. The learner's words use
 * `learner-utterance.tsx`'s treatment: a tinted bubble in the learner colour that
 * hugs its text and NEVER takes a verdict tone. The thinking state is
 * `canvas-thinking.tsx`: a 6px pulsing dot and a caption at the foot, never a
 * scrim over the content.
 *
 * 🔴 TWO COLOURS ARE IMPORTED FROM THE APP AND THE REST OF THIS PAGE IS
 * ACHROMATIC ON PURPOSE. `--shw-action` and `--shw-learner` are the app's real
 * `--ui-action` and `--ui-learner`. They are not decoration: §35.1 of the product
 * contract makes the learner colour mean "this came from you", which is the
 * single most important thing a visitor has to read off this animation. A grey
 * bubble would say a sentence appeared; a blue one says the learner produced it.
 *
 * ── WHAT NEVER MOVES ──────────────────────────────────────────────────────────
 *
 * The frame and the composer. The composer is outside the act's fade entirely —
 * it does not dim, shift or reflow between acts, because a session where the
 * input moves is not one surface, it is a slideshow with a text box drawn on it.
 */

/** Where the cursor waits before a journey: near the composer, off to one side. */
const REST = { x: 0.66, y: 0.9 } as const;

export function SessionCanvas({ t, reduced }: { readonly t: number; readonly reduced: boolean }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLDivElement>(null);
  const sendRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);

  const state = sessionState(t);

  /**
   * The cursor is positioned from MEASURED element boxes, every frame.
   *
   * 🔴 NOT FROM PERCENTAGES. `Continue` sits under a passage whose height depends
   * on how the text wrapped, and the send button's x moves with the composer's
   * width — both of which change with the viewport. A cursor animated to a fixed
   * coordinate points confidently at empty space at any width but the one it was
   * tuned at, and that is the single detail that would make this read as a cheap
   * mock rather than as a session.
   *
   * Written imperatively in a layout effect rather than through state: the
   * component already re-renders every frame from the clock, and routing a
   * measured value back through `setState` would schedule a second render for
   * every one of those.
   */
  useLayoutEffect(() => {
    const cursor = cursorRef.current;
    const frame = frameRef.current;
    if (!cursor || !frame) return;

    const c = state.cursor;
    if (!c || c.visible <= 0.001) {
      cursor.style.opacity = "0";
      return;
    }

    const box = frame.getBoundingClientRect();
    const anchorOf = (key: CursorTarget | "rest"): { x: number; y: number } | null => {
      if (key === "rest") return { x: box.width * REST.x, y: box.height * REST.y };
      const el =
        key === "continue" ? continueRef.current : key === "input" ? inputRef.current : sendRef.current;
      if (!el) return null;
      const r = el.getBoundingClientRect();
      // The input is aimed at where a caret would land, not at its middle — a
      // pointer parked in the centre of a wide text field looks lost.
      const x = key === "input" ? r.left + 34 : r.left + r.width / 2;
      return { x: x - box.left, y: r.top + r.height / 2 - box.top };
    };

    const from = anchorOf(c.from);
    const to = anchorOf(c.to);
    if (!from || !to) {
      cursor.style.opacity = "0";
      return;
    }

    const p = c.progress;
    // A shallow arc rather than a straight line. A pointer that travels on a
    // perfect diagonal reads as a tween; a slight bow reads as a hand.
    const arc = Math.sin(p * Math.PI) * -14;
    const x = from.x + (to.x - from.x) * p;
    const y = from.y + (to.y - from.y) * p + arc;

    cursor.style.opacity = String(c.visible);
    cursor.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${1 - c.pressing * 0.18})`;
  });

  const { act, composer, continueButton, figure, outgoing, surface } = state;

  return (
    /* `data-dense` is read only by the phone layout. Once the question, the
       learner's answer, the verdict and the refinement are all up, four blocks of
       text plus a figure plus a 52px composer do not fit a 484px frame — measured
       at 360×780, where the refinement overlapped the pill by 16px. On a phone
       the figure yields at that point; on a desktop the attribute does nothing. */
    <div className="sess" data-dense={surface.length >= 3 ? "true" : undefined} ref={frameRef}>
      {/* ── The figures ────────────────────────────────────────────────────────
          🔴 ALL THREE STAY MOUNTED FOR THE LIFE OF THE PAGE. The anatomy scene
          owns a WebGL context, and a context that has been force-lost can never
          be reacquired — unmounting it between acts would leave a permanent hole
          the second time round. Only opacity and visibility change. */}
      {/* 🔴 THE ARRIVING FIGURE IS FADED BY THE ACT, THE LEAVING ONE IS NOT.
          Applying the act's opacity to this whole element would fade the outgoing
          figure by it too — and the outgoing figure's job during a handover is to
          be the thing still leaving. Held apart, the two cross; multiplied
          together, the new one snapped in at full strength over a ghost. */}
      <div className="sess-figure">
        <FigureLayer kind="anatomy" opacity={state.actOpacity * figure.opacity} show={figure.kind === "anatomy"} t={figure.t} reduced={reduced} />
        <FigureLayer kind="plot" opacity={state.actOpacity * figure.opacity} show={figure.kind === "plot"} t={figure.t} reduced={reduced} />
        <FigureLayer kind="chemistry" opacity={state.actOpacity * figure.opacity} show={figure.kind === "chemistry"} t={figure.t} reduced={reduced} />
        {/* The act leaving keeps its figure on screen while it fades, so the
            handover is two things crossing rather than a gap. */}
        {outgoing && outgoing.figure !== figure.kind && (
          <div className="sess-figure-out" style={{ opacity: outgoing.opacity }}>
            <FigureLayer kind={outgoing.figure} opacity={1} show t={1} reduced={reduced} />
          </div>
        )}
      </div>

      {/* ── The learning surface ───────────────────────────────────────────── */}
      <div className="sess-surface" style={{ opacity: state.actOpacity }}>
        <p className="sess-subject">{act.subject}</p>
        <div className="sess-stack">
          {surface.map((item) => (
            <SurfaceLine item={item} key={item.key} />
          ))}

          {continueButton.opacity > 0.001 && (
            <div className="sess-continue-row" style={{ opacity: continueButton.opacity }}>
              <button
                className="sess-continue"
                ref={continueRef}
                style={{ transform: `scale(${1 - continueButton.pressed * 0.05})` }}
                tabIndex={-1}
                type="button"
              >
                Continue
              </button>
            </div>
          )}
        </div>
      </div>

      {outgoing && (
        <div className="sess-surface sess-surface-out" style={{ opacity: outgoing.opacity }} aria-hidden="true">
          <p className="sess-subject">{outgoing.act.subject}</p>
          <div className="sess-stack">
            {outgoing.surface.map((item) => (
              <SurfaceLine item={item} key={`out-${item.key}`} />
            ))}
          </div>
        </div>
      )}

      {/* ── Nemesis thinking ───────────────────────────────────────────────────
          The product's own: a 6px pulsing dot and a caption, sitting above the
          composer. Never a scrim — everything the learner was reading stays
          legible, which is the entire argument in `canvas-thinking.tsx`. */}
      <div className="sess-thinking" style={{ opacity: state.thinking }}>
        <span className="sess-thinking-dot" />
        <span className="sess-thinking-label">Reading your answer</span>
      </div>

      {/* ── The composer ───────────────────────────────────────────────────────
          🔴 OUTSIDE EVERY FADE. It does not belong to an act. */}
      <div className="sess-composer">
        <div className="sess-pill">
          <div className="sess-input" ref={inputRef}>
            {composer.groups.every((g) => g.opacity < 0.02) ? (
              <span className="sess-placeholder">{composer.placeholder}</span>
            ) : (
              <span className="sess-typed">
                {composer.groups.map((g, i) => (
                  <span key={i} style={{ opacity: g.opacity }}>
                    {g.text}{" "}
                  </span>
                ))}
                <span className="sess-caret" />
              </span>
            )}
          </div>

          <div className="sess-icon" aria-hidden="true">
            <MicGlyph />
          </div>

          <div
            className="sess-send"
            ref={sendRef}
            style={{
              opacity: composer.sendOpacity,
              transform: `scale(${(0.9 + composer.sendOpacity * 0.1) * (1 - composer.sendPressed * 0.12)})`,
            }}
          >
            <ArrowGlyph />
          </div>
        </div>
      </div>

      {/* The synthetic pointer. Positioned entirely from the layout effect. */}
      <div className="sess-cursor" ref={cursorRef} aria-hidden="true">
        <CursorGlyph />
      </div>
    </div>
  );
}

function SurfaceLine({ item }: { readonly item: SurfaceItem }) {
  const style = { opacity: item.opacity, transform: `translateY(${item.lift}px)` };
  if (item.kind === "utterance") {
    // The learner's own words: a tinted bubble that hugs its text, and never
    // carries a verdict colour. See learner-utterance.tsx.
    return (
      <p className="sess-utterance" style={style}>
        {item.text}
      </p>
    );
  }
  if (item.kind === "question") return <p className="sess-question" style={style}>{item.text}</p>;
  if (item.kind === "verdict") return <p className="sess-verdict" style={style}>{item.text}</p>;
  if (item.kind === "refine") return <p className="sess-refine" style={style}>{item.text}</p>;
  return <p className="sess-teach" style={style}>{item.text}</p>;
}

/**
 * One figure's slot.
 *
 * `visibility` follows the show flag rather than `display`, so a hidden 3D scene
 * keeps its layout box and its canvas is never resized to zero.
 */
function FigureLayer({
  kind,
  show,
  t,
  reduced,
  opacity,
}: {
  readonly kind: FigureKind;
  readonly show: boolean;
  readonly t: number;
  readonly reduced: boolean;
  readonly opacity: number;
}) {
  return (
    <div
      className="sess-figure-slot"
      style={{ opacity: show ? opacity : 0, visibility: show ? "visible" : "hidden" }}
    >
      {kind === "anatomy" && <AnatomyScene t={t} armed active={show} reduced={reduced} />}
      {kind === "plot" && <MathPlotScene t={t} />}
      {kind === "chemistry" && <ChemistryScene t={t} />}
    </div>
  );
}

function MicGlyph() {
  return (
    <svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="7.25" y="2.25" width="5.5" height="9.5" rx="2.75" />
      <path d="M4.5 9.5a5.5 5.5 0 0 0 11 0" strokeLinecap="round" />
      <path d="M10 15v2.5" strokeLinecap="round" />
    </svg>
  );
}

function ArrowGlyph() {
  return (
    <svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M10 16V5" strokeLinecap="round" />
      <path d="M5.5 9.5 10 5l4.5 4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A plain arrow pointer. Drawn rather than an emoji so it follows the theme. */
function CursorGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22">
      <path
        d="M5 2.5 18.5 12 12 12.8 8.7 18.8z"
        fill="var(--bg)"
        stroke="var(--text)"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}
