"use client";

// The canvas's top controls, MINUS the exit.
//
// 🔴 THE `×` LEFT THIS FILE ON PURPOSE (UX brief §38.2) — it now lives in `canvas-surface.tsx`,
// above the render branch, and the floating `<header>` element went with it. The reason is not
// tidiness: §38.1 takes the navigation rail off screen inside a canvas, which makes the `×` the
// only way out, and an exit that lives here is an exit only the branches that render this
// component have. One of them did not, and that state (resolving the canvas's knowledge) painted a
// page with nothing on it to leave by. See the note at the top of canvas-surface.tsx.
//
// What is left is genuinely optional chrome: the canvas's name and the floating panels
// (`canvas-controls.tsx` — Sources, Objectives, Territory). All of it legitimately disappears
// during a retrieval (`minimal`), which is exactly why the exit must not be able to travel
// with it.
//
// 🔴 STILL NOT A HEADER BAR. No container, no background, no border, no shadow, no backdrop —
// those assertions moved to canvas-surface.tsx along with the element that carries them.

import { Codicon } from "@/components/desktop-ui/codicon";
import type { LearningCanvas } from "@/lib/learn/canvas-model";

import { MinimapControl, OptionsControl, SourcesControl } from "./canvas-controls";
import type { AutoDictation, VoiceMode } from "@/lib/learn/voice-preferences";
import type { TranscriptEntry } from "@/lib/learn/session-transcript";
import type { PolicyRuntime } from "./use-policy-runtime";
import type { PlanTerritory } from "@/lib/learn/curriculum-plan";
import type { CanvasVoice as CanvasVoiceState } from "./use-canvas-voice";

interface CanvasHeaderProps {
  canvas: LearningCanvas;
  onFiles: (files: FileList | File[]) => void;
  /** A pasted web link, filed as a source. See `SourcesControl`'s own prop comment. */
  onUrl?: (url: string) => void;
  onRename: (title: string) => void;
  onDelete: () => void;
  /** The card or question being answered right now, so the objectives panel can say which one
   *  the canvas is actually working on rather than guessing from state alone. */
  activeTaskId?: string | null;
  /** The narrow slice `MinimapControl` needs — territory, focus, the current decision's
   *  objective, and the source-side disclosure facts (§H). Not the whole `PolicyRuntime`: this
   *  header has no other use for it, and a wider prop would invite a second, unrelated control to
   *  reach into runtime internals it does not need. */
  minimap: Pick<PolicyRuntime, "coverage" | "evidence" | "focus" | "outcome" | "setFocus" | "territories"> & {
    decidedObjectiveKey: string | null;
    /** The course, projected — see MinimapControl's own prop comment. Null on most canvases. */
    plan: readonly PlanTerritory[] | null;
    planTitle: string | null;
  };
  /** Whether this canvas holds knowledge that provably came from the model rather than from
   *  attached material — disclosed in the Sources panel so a sourceless canvas does not report
   *  "Nothing attached yet" while it teaches from model knowledge (N10). */
  modelKnowledge?: boolean;
  /**
   * Voice mode's control, or absent where the canvas has no voice to offer.
   *
   * 🔴 SUPPLIED BY THE CALLER, NOT OWNED HERE. The preference has to outlive this component —
   * the header unmounts on every retrieval (`minimal`), and state kept here would reset voice
   * mode every time a question appeared.
   */
  /** The session record, read from the append-only evidence log. Empty means the control is
   *  disabled rather than absent: "nothing has happened yet" is a real state worth being able to
   *  see, and a control that vanishes reads as a feature that broke. */
  transcript?: readonly TranscriptEntry[];
  /**
   * 🔴 THE HOOK'S OWN TYPE, NOT A THIRD COPY OF IT. This shape was written out by hand here AND in
   * the sibling that passes it through, so `useCanvasVoice` gaining a field left two declarations
   * behind and the compiler pointed at the consumer rather than at the omission. Referencing the
   * source means adding a control to the voice hook can never again require remembering two other
   * files.
   */
  voice?: CanvasVoiceState["header"];
}

export function CanvasHeader({
  canvas,
  onFiles,
  onUrl,
  onRename,
  onDelete,
  activeTaskId,
  modelKnowledge = false,
  minimap,
  transcript = [],
  voice,
}: CanvasHeaderProps) {
  return (
    <>
      {/* Navigational context, not the page's heading — the lesson supplies its own hierarchy
          and a second large title on the same screen competes with it.
          🔴 Stays `pointer-events-none` (inherited). It is `flex-1`, so making it clickable
          turned a full-width strip of dead label into a click trap: the document scrolls
          underneath it, and selecting the top line of text hit the title instead. */}
      {/* 🔴🔴 ALWAYS SHOWN NOW — owner call, 2026-08-19: "why do the icons on the right disappear?".
          This whole row used to be withheld while a question was on screen (`minimal`), on the
          reasoning that a fast recall is answered in about a second, so every glyph visible is read
          BEFORE the answer forms and the canvas's own name teaches nothing. That reasoning is sound
          and the effect was not: chrome that comes and goes reads as the page breaking, and the
          reference the canvas is being matched to keeps its chrome constant through everything.
          🔴 THE TITLE CAME BACK WITH THE ICONS, deliberately and not as a side effect — `minimal`
          gated both, and a row that keeps its controls but loses its name is a third state nobody
          asked for. */}
      <span className="min-w-0 flex-1 truncate text-[length:var(--canvas-text-small)] text-(--ui-text-secondary)">
        {canvas.title || "New canvas"}
      </span>

      {/* §1: compact controls, floating. Not a toolbar — see the note at the top of
          canvas-controls.tsx for what that costs when it slips.
          🔴 ABSENT DURING A RETRIEVAL, and the `×` is deliberately the only thing left. The
          controls are not removed from the product — they are the session's, and the session is
          where they belong; this is the one second inside it where the learner is producing an
          answer and every glyph on screen is competition.
          🔴 THE SESSION (⋯) CONTROL IS GONE, DELIBERATELY — owner call, 2026-08-13. `SessionControl`
          in canvas-controls.tsx is untouched and still exports rename + delete; it is simply not
          rendered here any more. Rename has no other UI path today (tracked as a follow-up: give
          canvas-home's SessionRow, which already has pin/move/delete, a rename affordance too) —
          an accepted, named cost, not a silent one. Delete is unaffected: canvas-home's own
          per-row delete already reaches the same `deleteCanvas` this control called. */}
      <>
          {/* 🔴 THREE GLYPHS AND A MENU — owner call, 2026-08-19: "i only want icons for 'x' on
              left, 'source and outputs' and 'progress' for the minimap of objectives", then "add a
              '⋯' for options". The `×` is `canvas-surface.tsx`'s and is not in this row.
              Objectives, the session record and voice moved INSIDE `OptionsControl`; none of them
              was deleted, and voice especially could not be, because that button was the only way
              into voice mode. */}
          <SourcesControl canvas={canvas} modelKnowledge={modelKnowledge} onFiles={onFiles} onUrl={onUrl} />
          <MinimapControl
            coverage={minimap.coverage}
            decidedObjectiveKey={minimap.decidedObjectiveKey}
            evidence={minimap.evidence}
            focus={minimap.focus}
            outcome={minimap.outcome}
            plan={minimap.plan}
            planTitle={minimap.planTitle}
            setFocus={minimap.setFocus}
            territories={minimap.territories}
          />
          <OptionsControl
            activeTaskId={activeTaskId}
            canvas={canvas}
            entries={transcript}
            voice={voice}
          />
      </>
    </>
  );
}
