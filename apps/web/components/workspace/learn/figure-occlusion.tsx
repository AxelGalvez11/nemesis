"use client";

// A diagram with one part covered, asking to be named (§46.6).
//
// 🔴 THE COGNITION ENGINE DECIDES WHEN THIS APPEARS, NOT THE LEARNER. The rule is explicit: image
// occlusion "should not become a separate 'image occlusion mode' the learner manually manages. The
// cognition engine decides when a visual retrieval interaction is useful." So this component takes
// a decision that has already been made — an objective whose capability is `locate` — and renders
// it. It has no mode, no toggle, and no opinion about which label is hidden; `labelForRound` in
// lib/learn/figure-labels.ts owns that, and owns it deterministically so a session can be replayed.
//
// 🔴 AND IT IS NOT A SECOND ANSWER SURFACE. The learner types or speaks into the one composer, the
// same as every other task (§48, and `canvas-shell.test.ts` guards it). This draws the question;
// it does not collect the answer.
//
// 🔴 THE COVER IS OPAQUE, NOT A BLUR. A blurred label is often still legible at a glance, and a
// learner who half-reads it produces evidence about their eyesight rather than their memory. The
// whole point of occlusion is that the answer is genuinely not on screen.

import { useEffect, useState } from "react";

import { figureAssetUrl } from "@/lib/learn/figure-asset-url";
import type { FigureLabel } from "@/lib/learn/figure-labels";
import { cn } from "@/lib/utils";

export interface FigureOcclusionProps {
  /** A URL the browser can load. NOT a parser's figure key — see `StoredFigureOcclusion`. */
  src: string;
  /** Every part this diagram names. */
  labels: readonly FigureLabel[];
  /** The one being asked about, which is therefore the one covered. */
  hidden: FigureLabel;
  /**
   * Show the covered label again.
   *
   * 🔴 ONLY EVER TRUE AFTER AN ANSWER IS IN. Revealing before the learner commits turns retrieval
   * into recognition, and the evidence would record a demonstration of neither.
   */
  revealed?: boolean;
  /** Alternative text for the figure as a whole. */
  caption?: string;
}

/** How much of the image's width a cover spans. The labels carry a centre, not a box — the model
 *  reports where a word is, not how wide it is — so the cover is a fixed patch around that point.
 *  Generous enough to hide a two-word label at typical figure sizes. */
const COVER_W = 0.18;
const COVER_H = 0.07;

export function FigureOcclusion({ caption, hidden, labels, revealed = false, src }: FigureOcclusionProps) {
  const [loaded, setLoaded] = useState(false);

  return (
    <figure className="mx-auto w-full max-w-(--canvas-column)">
      {/* 🔴 THE OVERLAY IS POSITIONED AGAINST THE RENDERED IMAGE, NOT THE VIEWPORT. Labels are
          fractions of the picture (see figure-labels.ts), so the covers must live in a box that IS
          the picture — `relative` here, `absolute` percentages inside. A cover placed against
          anything else drifts the moment the column width changes, which on a phone means covering
          the wrong part of the diagram and marking the learner wrong for reading it correctly. */}
      <div className="relative inline-block w-full">
        {/* eslint-disable-next-line @next/next/no-img-element -- a parsed figure is an arbitrary
            runtime URL, not a build-time asset, so next/image's loader has nothing to optimise. */}
        {/* 🔴 THE FADE IS SKIPPED UNDER REDUCED MOTION, AND IT IS THE ONLY MOTION ON THIS SCREEN.
            A learner who has asked their system for less motion is answering a retrieval question
            while the subject of that question fades in — 200ms of the diagram being partly there is
            200ms of reading it badly. `motion-reduce:transition-none` snaps it to loaded instead;
            the picture still appears only once it has decoded, so nothing flashes either way. */}
        <img
          alt={caption ?? "Diagram"}
          className={cn(
            "w-full rounded-xl transition-opacity duration-200 motion-reduce:transition-none",
            loaded ? "opacity-100" : "opacity-0",
          )}
          onLoad={() => setLoaded(true)}
          src={src}
        />

        {/* 🔴🔴🔴 HIDE ALL, GUESS ONE — OWNER, 2026-08-25: *"make it hide all and guess one. thats
            how it should be."* That is Anki's own mode name, and this comment used to argue the
            opposite at length: that every OTHER label staying visible was the interaction, because
            spatial knowledge is knowing where things sit relative to each other.

            The flaw in that argument is what the learner can READ. The options offered beside this
            picture are the diagram's own other labels, so leaving them legible printed the wrong
            answers on the figure — a learner could match the covered box to the one option not
            visible and never recall anything. That is the recognition-instead-of-recall failure
            this component's own header warns about three paragraphs up.

            🔴 THE ASKED-ABOUT PART IS STILL MARKED, so the learner knows WHICH one to name: it
            takes the accent colour while the rest are plain covers. Same distinction
            `occlusionMaskState` draws for a study card between `target-covered` and `covered`. */}
        {loaded && !revealed && labels.map((label) => (
          <span
            aria-hidden="true"
            className={cn(
              "absolute rounded-md",
              label.text === hidden.text
                ? "bg-(--ui-text-primary) ring-2 ring-(--ui-learner)"
                : "bg-(--ui-text-primary)/85",
            )}
            data-occlusion-cover={label.text === hidden.text ? "target" : ""}
            key={label.text}
            style={coverStyle(label)}
          />
        ))}

        {/* After the answer is in, the same box shows what was under it. Same position, so the eye
            does not have to search for what it was just asked about. */}
        {loaded && revealed && (
          <span
            className="absolute flex items-center justify-center rounded-md bg-(--ui-learner) px-1 text-[length:var(--canvas-text-meta)] font-medium text-white"
            data-occlusion-revealed=""
            style={coverStyle(hidden)}
          >
            {hidden.text}
          </span>
        )}
      </div>

      {/* 🔴 NO LEGEND, NO COUNT, NO "3 of 7 labels". §23 bans the step counter and §9 bans progress
          theatre; a diagram that announces how much of itself is left to learn is exactly that. */}
      {labels.length > 0 && (
        <figcaption className="sr-only">
          {caption ? `${caption}. ` : ""}
          {`Diagram with ${labels.length} labelled parts; one is covered.`}
        </figcaption>
      )}
    </figure>
  );
}

/** The cover box for a label, as percentages of the rendered picture. */
function coverStyle(label: FigureLabel): React.CSSProperties {
  return {
    height: `${COVER_H * 100}%`,
    // Centred on the point the model reported, and clamped so a label near an edge is still fully
    // covered rather than half-covered with the answer peeking out of the side.
    left: `${clamp(label.x - COVER_W / 2) * 100}%`,
    top: `${clamp(label.y - COVER_H / 2) * 100}%`,
    width: `${COVER_W * 100}%`,
  };
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * The same diagram, fetched from where ingestion stored it.
 *
 * 🔴 THE SIGNING HOP IS THE WHOLE REASON THIS WRAPPER EXISTS. The visual-assets bucket is
 * private, so a stored path is not loadable until it is signed for the current session.
 * Doing that inside `FigureOcclusion` would make a pure renderer asynchronous; doing it in
 * the screen above would put an effect behind that screen's early returns, where hook order
 * is not stable. One small component owns "turn a path into something an <img> can load".
 *
 * 🔴 NOTHING IS RENDERED UNTIL THERE IS A REAL URL, AND NOTHING IS RENDERED IF THERE IS
 * NEVER ONE. No placeholder frame, no spinner, no alt-text box: the previous behaviour put
 * the parser's own figure key into `src`, which asked this application for a path that has
 * never existed, and the learner sat looking at a broken image while answering. An absent
 * diagram is a worse question than a present one; a broken diagram is a worse screen than
 * either.
 */
export function StoredFigureOcclusion({
  path,
  ...rest
}: Omit<FigureOcclusionProps, "src"> & { path: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setUrl(null);
    void figureAssetUrl(path).then((signed) => {
      // The path can change while a signature is in flight — the policy moves to another
      // figure. Applying a stale URL would show the previous question's diagram under the
      // current question's prompt, which is the kind of wrong that still looks fine.
      if (live) setUrl(signed);
    });
    return () => {
      live = false;
    };
  }, [path]);

  if (!url) return null;
  return <FigureOcclusion {...rest} src={url} />;
}
