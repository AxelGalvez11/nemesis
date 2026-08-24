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

import { useCallback, useEffect, useRef, useState } from "react";

import type { ScoreVisual } from "@/lib/learn/canvas-visual";

/**
 * Where the piano samples come from.
 *
 * Owner 2026-08-24: *"for the music, is there any… should we add, like, a piano sound so that
 * users can hear it?"* Yes, and at no new dependency: the engraver already in this file ships a
 * synthesiser beside its renderer, so the notation that draws the staff also plays it.
 *
 * 🔴 NAMED HERE RATHER THAN LEFT TO THE LIBRARY'S DEFAULT, WHICH IS THE SAME URL. A silent
 * default is a third party the codebase never wrote down; spelled out, it is one line to point at
 * a copy we host the day that matters. The precedent for the learner's browser fetching a static
 * asset directly is already set by the figure lane, whose pictures load straight from Wikimedia.
 *
 * 🔴 THE TRAILING SLASH IS LOAD-BEARING — the library appends `${instrument}-mp3.js` to this
 * string with no separator of its own.
 */
const SOUNDFONT_URL = "https://paulrosen.github.io/midi-js-soundfonts/abcjs/";

/**
 * General MIDI program 0 — acoustic grand piano.
 *
 * 🔴 PINNED, BECAUSE THE ALTERNATIVE IS WHATEVER THE TUNE ASKED FOR. ABC can name its own
 * instrument, and a scale written by a model with a stray `%%MIDI program` line would arrive as a
 * harpsichord or a tuba. One instrument, always, is what "hear the notes" means; the learner is
 * checking a pitch, not auditioning a patch.
 */
const ACOUSTIC_GRAND_PIANO = 0;

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
  /**
   * The engraved tune, kept so playback does not re-parse the notation.
   *
   * 🔴 A REF, NOT STATE, AND THAT IS NOT AN OPTIMISATION. Putting the tune in state would rerender
   * on every engraving, and the effect that engraves depends on nothing else — so a rerender would
   * engrave again, which would set the state again. A ref is what keeps the loop from existing.
   */
  const engraved = useRef<import("abcjs").TuneObject | null>(null);
  const player = useRef<import("abcjs").MidiBuffer | null>(null);
  const [playing, setPlaying] = useState(false);
  /** Whether this browser can play at all. Unknown until the engraver has loaded. */
  const [audible, setAudible] = useState(false);
  /** A press that could not produce sound. Said in words rather than left as a dead button. */
  const [soundFailed, setSoundFailed] = useState(false);

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
        // 🔴 KEPT ONLY AFTER THE ENGRAVING PASSED ITS OWN CHECKS. A tune the renderer produced no
        // lines for is exactly the tune the synthesiser would produce no notes for, and offering
        // Play beside a refused score is the dead control this codebase keeps rebuilding.
        engraved.current = tune ?? null;
        setAudible(library.synth.supportsAudio());
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

  /**
   * 🔴🔴 SOUND MUST NOT OUTLIVE THE SCORE. A learner who presses Play and then sends another
   * message unmounts this component mid-tune, and a `MidiBuffer` nobody stops keeps playing into
   * a page that no longer shows the notes it is playing. The cleanup runs on unmount AND whenever
   * the notation changes, because a new tune in the same frame is the same problem.
   */
  useEffect(() => {
    return () => {
      player.current?.stop();
      player.current = null;
    };
  }, [visual.abc]);

  const toggle = useCallback(async () => {
    if (player.current) {
      player.current.stop();
      player.current = null;
      setPlaying(false);
      return;
    }
    const tune = engraved.current;
    if (!tune) return;
    setSoundFailed(false);
    try {
      const library = await import("abcjs");
      // 🔴 THE AUDIO CONTEXT IS BUILT INSIDE THE PRESS, AND THAT IS A BROWSER RULE RATHER THAN A
      // PREFERENCE. Every engine starts a context suspended unless it was created during a user
      // gesture; one made when the score first drew would be silent and give no error saying so.
      const audioContext = new AudioContext();
      await audioContext.resume();
      const synth = new library.synth.CreateSynth();
      await synth.init({
        audioContext,
        onEnded: () => {
          player.current = null;
          setPlaying(false);
        },
        options: { program: ACOUSTIC_GRAND_PIANO, soundFontUrl: SOUNDFONT_URL },
        visualObj: tune,
      });
      await synth.prime();
      player.current = synth;
      setPlaying(true);
      synth.start();
    } catch {
      // Samples blocked, offline, or refused by the engine. One press, one honest sentence.
      player.current = null;
      setPlaying(false);
      setSoundFailed(true);
    }
  }, []);

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
        <>
          {/* 🔴 THE BUTTON EXISTS ONLY WHERE IT CAN WORK. `audible` is the engraver's own answer
              about this browser, and `!failure` means there is a real tune behind it — the two
              conditions between them are what stop this becoming a control that does nothing,
              which is the defect this codebase repeats most. */}
          {audible && (
            <div className="mt-2 flex items-center gap-2">
              <button
                aria-label={playing ? "Stop the music" : "Hear this played on a piano"}
                className="rounded-lg bg-(--ui-bg-tertiary) px-2.5 py-1 text-[length:var(--canvas-text-meta)] text-(--ui-text-secondary) transition-colors hover:bg-(--ui-control-hover-background) hover:text-(--ui-text-primary)"
                onClick={() => void toggle()}
                type="button"
              >
                {playing ? "Stop" : "Play"}
              </button>
              {soundFailed && (
                <span className="text-[length:var(--canvas-text-meta)] text-(--ui-text-tertiary)">
                  The piano samples could not be loaded.
                </span>
              )}
            </div>
          )}
          {/* 🔴 THE NOTATION STAYS INSPECTABLE, the rule every computed depiction keeps: anybody
              can read the exact string the engraving came from. Folded because a tune's ABC runs
              long where a SMILES runs short; folded is still on the record. */}
          <details className="mt-2">
            <summary className="cursor-pointer text-[length:var(--canvas-text-meta)] text-(--ui-text-quaternary)">
              ABC notation
            </summary>
            <pre className="mt-1 overflow-x-auto font-mono text-[length:var(--canvas-text-meta)] text-(--ui-text-tertiary)">
              {visual.abc}
            </pre>
          </details>
        </>
      )}
    </div>
  );
}
