"use client";

// Engraving staff notation from ABC — the music half of the notation pattern.
//
// 🔴 THE SMILES-DRAWER PATTERN, DELIBERATELY, DOWN TO THE FALLBACK. The spec carries canonical
// notation; a trusted library computes the drawing from it; when the library refuses, the notation
// itself is shown in monospace rather than an error box, because the teaching text around it stands
// on its own and a box announcing an absence is the decoration §41 refuses.
//
// 🔴 LOADED IN AN EFFECT, NOT IMPORTED AT MODULE SCOPE. The engraver reaches for the DOM while
// drawing and weighs a few hundred kilobytes — both the server-bundle problem and the "lesson with
// no music in it" problem the chemistry renderer already solved this way.
//
// 🔴 THE INK IS SWEPT TO `currentColor` AFTER ENGRAVING, AND THAT REPLACES A THEME DEPENDENCY. The
// library bakes literal colours into its SVG attributes, which is the chemistry lane's redraw-on-
// theme problem — but unlike a molecule, a staff is one colour of ink, so pointing every fill and
// stroke at `currentColor` once lets the CSS cascade recolour it live in both themes with no
// second engraving.

import { useEffect, useRef, useState } from "react";

import type { ScoreVisual } from "@/lib/learn/canvas-visual";

/** Why nothing was engraved. Named so a blank frame is diagnosable, exactly as elsewhere. */
type ScoreFailure =
  /** The engraving library could not be loaded — offline, blocked, or not installed. */
  | "renderer-unavailable"
  /**
   * The library got nothing drawable out of the string.
   *
   * 🔴 DETECTED BY ABSENCE, NOT BY EXCEPTION, AND THAT IS THE LIBRARY'S OWN BEHAVIOUR. The engraver
   * does not throw on a broken tune — it renders what it can, which for garbage is a tune object
   * with no lines in it. An empty result is the refusal; the `catch` below is only for genuine
   * crashes.
   */
  | "score-unparsable";

export function MusicScore({ visual }: { visual: ScoreVisual }) {
  const target = useRef<HTMLDivElement | null>(null);
  const [failure, setFailure] = useState<ScoreFailure | null>(null);

  useEffect(() => {
    let cancelled = false;
    const element = target.current;
    if (!element) return;

    void (async () => {
      let library: typeof import("abcjs");
      try {
        library = await import("abcjs");
      } catch {
        if (!cancelled) setFailure("renderer-unavailable");
        return;
      }
      if (cancelled) return;
      try {
        element.replaceChildren();
        const [tune] = library.renderAbc(element, visual.abc, {
          add_classes: true,
          paddingbottom: 6,
          paddingleft: 0,
          paddingright: 0,
          paddingtop: 6,
          responsive: "resize",
          selectTypes: [],
          staffwidth: 560,
        });
        if (cancelled) return;
        const lines = (tune as { lines?: unknown[] } | undefined)?.lines;
        if (!Array.isArray(lines) || lines.length === 0) {
          element.replaceChildren();
          setFailure("score-unparsable");
          return;
        }
        for (const node of element.querySelectorAll("path, text, rect, line, ellipse, circle")) {
          if (node.getAttribute("fill") !== "none") node.setAttribute("fill", "currentColor");
          const stroke = node.getAttribute("stroke");
          if (stroke && stroke !== "none") node.setAttribute("stroke", "currentColor");
        }
        setFailure(null);
      } catch {
        if (!cancelled) {
          element.replaceChildren();
          setFailure("score-unparsable");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [visual.abc]);

  return (
    <div>
      <div
        aria-label={visual.learningGoal}
        className="text-(--ui-text-primary)"
        ref={target}
        role="img"
        style={{ display: failure ? "none" : "block" }}
      />
      {failure ? (
        <pre className="overflow-x-auto font-mono text-[length:var(--canvas-text-body)] text-(--ui-text-secondary)">
          {visual.abc}
        </pre>
      ) : (
        // 🔴 THE NOTATION STAYS INSPECTABLE, the rule every computed depiction keeps: anybody can
        // read the exact string the engraving came from. Folded because a tune's ABC runs long
        // where a SMILES runs short; folded is still on the record.
        <details className="mt-2">
          <summary className="cursor-pointer text-[length:var(--canvas-text-meta)] text-(--ui-text-quaternary)">
            ABC notation
          </summary>
          <pre className="mt-1 overflow-x-auto font-mono text-[length:var(--canvas-text-meta)] text-(--ui-text-tertiary)">
            {visual.abc}
          </pre>
        </details>
      )}
    </div>
  );
}
