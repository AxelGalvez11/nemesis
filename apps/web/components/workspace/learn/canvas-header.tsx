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
import type { DeliverableKind } from "@/lib/learn/canvas-deliverables";
import type { LearningCanvas } from "@/lib/learn/canvas-model";

import { CanvasAudioBar } from "./canvas-audio-bar";
import { CanvasViewControl, MinimapControl, OptionsMenu, SourcesControl } from "./canvas-controls";
import { CourseMapControl } from "./course-map";
import type { CanvasView } from "@/lib/learn/canvas-view";
import type { TranscriptEntry } from "@/lib/learn/session-transcript";
import type { PolicyRuntime } from "./use-policy-runtime";
import type { PlanSource, PlanTerritory } from "@/lib/learn/curriculum-plan";
import type { CanvasVoice as CanvasVoiceState } from "./use-canvas-voice";

interface CanvasHeaderProps {
  canvas: LearningCanvas;
  onFiles: (files: FileList | File[]) => void;
  /** Threaded straight to SourcesControl — see its own prop comments. */
  outputTools?: import("./canvas-controls").OutputTools;
  onMakeDeliverable?: (kind: DeliverableKind) => void;
  making?: DeliverableKind | null;
  /** A question asked from inside the open document. Threaded through rather than resolved here:
   *  the header knows nothing about turns, and the canvas already owns exactly one route for one. */
  onSendToChat?: (prompt: string, files: File[]) => void;
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
    /** The one source a scaffold-built plan owes its credit to, or null. See learning-canvas. */
    planCredit: PlanSource | null;
    /** Focus the canvas on one part of the course, from the map. */
    onPickCourseScope: (scope: { label: string; identityKeys: readonly string[] }) => void;
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
  /**
   * The audio of the answer on screen, so the top row can carry its transport.
   *
   * 🔴 THE SAME CONTROLLER THE ANSWER'S OWN ROW READS, NEVER A SECOND ONE. `useResponseAudio` is
   * called once, by the voice hook; handing this row its own would give one answer two playheads
   * and a pause button that pauses nothing. See `canvas-audio-bar.tsx` for why the transport lives
   * up here and the start button stays down there.
   */
  replyAudio?: CanvasVoiceState["replyAudio"];
  /**
   * Which of the two views is on screen, and how to swap them.
   *
   * 🔴 THE HEADER IS TOLD, IT DOES NOT DECIDE. The preference is held by `learning-canvas.tsx`
   * because the OVERLAY is rendered there; a header that owned it would be a control holding state
   * that something else has to read back out of it.
   *
   * 🔴 OPTIONAL, AND ABSENT MEANS NO CONTROL. A canvas with nothing recorded yet passes neither,
   * and the menu simply has no view row — a row whose only message is that it has nothing to
   * switch would be an empty control, which is worse than none.
   */
  view?: CanvasView;
  onToggleView?: () => void;
}

export function CanvasHeader({
  canvas,
  onFiles,
  onMakeDeliverable,
  making,
  onSendToChat,
  outputTools,
  onRename,
  onDelete,
  activeTaskId,
  modelKnowledge = false,
  minimap,
  transcript = [],
  voice,
  replyAudio,
  view,
  onToggleView,
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
      {/* 🔴🔴 ONE POSITIONING CONTEXT FOR EVERY PANEL ON THIS ROW (owner 2026-08-30: *"Can you make
          sure source panel and map are both right side aligned?"*). This was a bare fragment, so
          each control positioned its own panel against ITSELF and the boxes opened wherever their
          glyph happened to sit — measured 80px apart on a canvas with a course, because two more
          glyphs stand between Sources and the map. One `relative` here, right-anchored with the
          row, and they share an edge whatever is on screen.
          🔴 THE CONTROLS' OWN WRAPPERS ARE NO LONGER `relative`, which is what makes this the
          ancestor they resolve against — see the note on `PANEL` in canvas-controls.tsx.
          🔴 `shrink-0` BECAUSE THE TITLE BESIDE IT IS `flex-1`: without it a long canvas name
          squeezes the glyphs instead of truncating itself. */}
      <div className="relative flex h-full shrink-0 items-center gap-1">
          {/* 🔴 THREE GLYPHS AND A MENU — owner call, 2026-08-19: "i only want icons for 'x' on
              left, 'source and outputs' and 'progress' for the minimap of objectives", then "add a
              '⋯' for options". The `×` is `canvas-surface.tsx`'s and is not in this row.
              🔴 THE `⋯` IS NOW THE READ-ALOUD TOGGLE ITSELF, not a menu (owner, 2026-08-25,
              circling it). Objectives and the session record had already left that menu on
              2026-08-20 and the mic option on 2026-08-25, so what the click revealed was a single
              row. The toggle moved OUT rather than being deleted with the menu — voice was only
              ever reachable from there. */}
          {/* 🔴 BEFORE THE ICONS, WHICH IS WHERE THE OWNER PUT IT (2026-08-25, choosing between the
              two edges of this row). It takes no width at all while nothing is playing — see the
              `grid-cols-[0fr]` note in canvas-audio-bar.tsx — so the canvas title keeps every pixel
              it has today and this row does not reflow when the audio ends. */}
          {replyAudio && <CanvasAudioBar audio={replyAudio} />}
          {/* 🔴🔴 EVERY GLYPH ON THIS ROW NOW EARNS ITS PLACE — owner, 2026-08-30: "Why are
              there so many icons? ... they should only show up when they are actually needed."
              Sources appears once the panel has anything to say: an attached source, a made
              output, or the model-knowledge disclosure a sourceless canvas owes (N10). A brand
              new canvas shows a bare title and the `⋯`, and controls ARRIVE AND STAY as the
              session earns them — appearing once is the Minimap's own precedent; what the owner
              banned on 2026-08-19 was chrome that comes AND GOES. The view switch and read-aloud
              moved INTO the `⋯` (see OptionsMenu), which is where his 2026-08-19 row kept
              options in the first place. */}
          {(canvas.sources.length > 0 || (canvas.outputs ?? []).length > 0 || modelKnowledge) && (
            <SourcesControl canvas={canvas} making={making} modelKnowledge={modelKnowledge} onFiles={onFiles} onMakeDeliverable={onMakeDeliverable} onSendToChat={onSendToChat} outputTools={outputTools} />
          )}
          {/* 🔴🔴 THE MAP APPEARS ONLY WHERE THERE IS SOMETHING TO MAP — owner, 2026-08-24: "the map
              icon should only appear if there is a course active." On an ordinary conversation there
              is no plan, no territory worth narrowing and nothing to recommend from, so the panel
              opened onto its own empty state: a control whose only message is that it has nothing to
              say. `planTitle` is the honest test — it is set when a course plan has actually been
              applied to this canvas and null on every other one. */}
          {minimap.planTitle !== null && (
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
          )}
          {/* 🔴🔴 ITS OWN GLYPH, BESIDE PROGRESS RATHER THAN INSIDE IT (owner 2026-08-29, on the
              shape: *"similar to source panel that is a squarish circlish type of box component"*).
              The two boxes answer different questions from different data — Progress reads the
              learner model, the map reads the AUTHOR'S plan — and `canvas-controls.tsx` states the
              rule this obeys: *"a plan is a third thing in that corner, and it stays third"*.
              🔴 SAME CONDITION AS THE MAP GLYPH ABOVE. `planTitle` is set only once a course has
              actually been applied, so neither control exists on an ordinary conversation. */}
          {minimap.planTitle !== null && minimap.plan && minimap.plan.length > 0 && (
            <CourseMapControl
              activeLabel={minimap.focus.kind === "selection" ? minimap.focus.label : null}
              credit={minimap.planCredit}
              evidence={minimap.evidence}
              onPick={minimap.onPickCourseScope}
              plan={minimap.plan}
              title={minimap.planTitle}
            />
          )}
          {/* 🔴 THE VIEW DOOR IS A GLYPH AGAIN (owner 2026-08-30: *"there should be a way to
              chat mode to canvas mode"*). It sat inside the `⋯` from 2026-08-27 and the owner
              could not find it — a door is not a door if it is behind another door. Same gate as
              always: both props arrive only once there is a conversation to leave, and then the
              control stays for the session. */}
          {view && onToggleView && <CanvasViewControl onToggleView={onToggleView} view={view} />}
          {/* Last on the row: it is about how the product behaves, not about this page.
              Read-aloud and the teaching style live inside it. */}
          <OptionsMenu voice={voice} />
      </div>
    </>
  );
}
