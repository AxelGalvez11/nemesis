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
// (`canvas-controls.tsx` — Sources; `course-map.tsx` — the course map). All of it legitimately disappears
// during a retrieval (`minimal`), which is exactly why the exit must not be able to travel
// with it.
//
// 🔴 STILL NOT A HEADER BAR. No container, no background, no border, no shadow, no backdrop —
// those assertions moved to canvas-surface.tsx along with the element that carries them.

import { Codicon } from "@/components/desktop-ui/codicon";
import type { DeliverableKind } from "@/lib/learn/canvas-deliverables";
import type { LearningCanvas } from "@/lib/learn/canvas-model";

import { CanvasAudioBar } from "./canvas-audio-bar";
import { CanvasViewControl, SourcesControl } from "./canvas-controls";
import { CourseMapControl } from "./course-map";
import type { TranscriptEntry } from "@/lib/learn/session-transcript";
import type { PolicyRuntime } from "./use-policy-runtime";
import type { PlanSource, PlanTerritory } from "@/lib/learn/curriculum-plan";
import type { CanvasVoice as CanvasVoiceState } from "./use-canvas-voice";

interface CanvasHeaderProps {
  canvas: LearningCanvas;
  /** The chat↔canvas door's inputs. Withheld by the canvas until a conversation exists; the
   *  control renders only when both arrive. See CanvasViewControl. */
  view?: import("@/lib/learn/canvas-view").CanvasView;
  onToggleView?: () => void;
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
  /** The narrow slice the course map needs (§H). Not the whole `PolicyRuntime`: this header has
   *  no other use for it, and a wider prop would invite a second, unrelated control to reach into
   *  runtime internals it does not need. 🔴 `coverage`/`territories`/`setFocus` left this slice
   *  with `MinimapControl` (owner, 2026-08-30) — the map is the one panel in this corner now. */
  minimap: Pick<PolicyRuntime, "evidence" | "focus"> & {
    /** The course, projected. Null on most canvases, and null means NO map control at all. */
    plan: readonly PlanTerritory[] | null;
    planTitle: string | null;
    /** The one source a scaffold-built plan owes its credit to, or null. See learning-canvas. */
    planCredit: PlanSource | null;
    /** Focus the canvas on one part of the course, from the map. */
    onPickCourseScope: (scope: { label: string; identityKeys: readonly string[] }) => void;
    /** Back out to the whole course — the map's own "Whole course" row (see course-map.tsx). */
    onClearCourseScope: () => void;
  };
  /** Whether this canvas holds knowledge that provably came from the model rather than from
   *  attached material — disclosed in the Sources panel so a sourceless canvas does not report
   *  "Nothing attached yet" while it teaches from model knowledge (N10). */
  modelKnowledge?: boolean;
  /** The session record, read from the append-only evidence log. Empty means the control is
   *  disabled rather than absent: "nothing has happened yet" is a real state worth being able to
   *  see, and a control that vanishes reads as a feature that broke. */
  transcript?: readonly TranscriptEntry[];
  /**
   * The audio of the answer on screen, so the top row can carry its transport.
   *
   * 🔴 THE SAME CONTROLLER THE ANSWER'S OWN ROW READS, NEVER A SECOND ONE. `useResponseAudio` is
   * called once, by the voice hook; handing this row its own would give one answer two playheads
   * and a pause button that pauses nothing. See `canvas-audio-bar.tsx` for why the transport lives
   * up here and the start button stays down there.
   */
  replyAudio?: CanvasVoiceState["replyAudio"];
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
          {/* 🔴 TWO GLYPHS AT MOST, EACH GATED — owner, 2026-08-30: Sources & outputs, and the
              course map on a course canvas. The `×` is `canvas-surface.tsx`'s and is not in this
              row. The 2026-08-19 lineup ("sources… progress… a '⋯' for options") is dead: Progress
              merged into the map and the `⋯` menu's rows died with their features — the tombstones
              in canvas-controls.tsx carry the owner's words for each. */}
          {/* 🔴 BEFORE THE ICONS, WHICH IS WHERE THE OWNER PUT IT (2026-08-25, choosing between the
              two edges of this row). It takes no width at all while nothing is playing — see the
              `grid-cols-[0fr]` note in canvas-audio-bar.tsx — so the canvas title keeps every pixel
              it has today and this row does not reflow when the audio ends. */}
          {replyAudio && <CanvasAudioBar audio={replyAudio} />}
          {/* 🔴🔴 EVERY GLYPH ON THIS ROW EARNS ITS PLACE — owner, 2026-08-30: "Why are there so
              many icons? ... they should only show up when they are actually needed." Sources
              appears once the panel has anything to say: an attached source, a made output, or
              the model-knowledge disclosure a sourceless canvas owes (N10). A brand new canvas
              shows a bare title and no glyphs at all, and controls ARRIVE AND STAY as the session
              earns them — what the owner banned on 2026-08-19 was chrome that comes AND GOES. */}
          {(canvas.sources.length > 0 || (canvas.outputs ?? []).length > 0 || modelKnowledge) && (
            <SourcesControl canvas={canvas} making={making} modelKnowledge={modelKnowledge} onFiles={onFiles} onMakeDeliverable={onMakeDeliverable} onSendToChat={onSendToChat} outputTools={outputTools} />
          )}
          {/* 🔴🔴 THE ONE COURSE PANEL — `MinimapControl` ("Progress") was cut beside it, owner
              2026-08-30: *"remove the 'progress' map since the course map is pretty much the same
              thing."* He was measurably right: a row click in either panel ended in the same
              `setFocus` call, so the corner held two doors to one action. What Progress alone
              carried — the way back OUT of a narrowed focus — moved into the map as its
              "Whole course" row, threaded here as `onClearCourseScope`.
              🔴 THE MAP STILL APPEARS ONLY WHERE THERE IS SOMETHING TO MAP — owner, 2026-08-24:
              "the map icon should only appear if there is a course active." `planTitle` is the
              honest test: set once a course plan has actually been applied, null on every other
              canvas, so an ordinary conversation has no course glyph at all. */}
          {minimap.planTitle !== null && minimap.plan && minimap.plan.length > 0 && (
            <CourseMapControl
              activeLabel={minimap.focus.kind === "selection" ? minimap.focus.label : null}
              credit={minimap.planCredit}
              evidence={minimap.evidence}
              onPick={minimap.onPickCourseScope}
              onWhole={minimap.onClearCourseScope}
              plan={minimap.plan}
              title={minimap.planTitle}
            />
          )}
          {/* 🔴 NO `⋯` ANY MORE. The options menu and every row in it died on 2026-08-30 — the
              tombstone in canvas-controls.tsx carries the owner's words and where each row's
              feature went. A brand-new canvas still shows a bare title and nothing else. */}
          {/* 🔴 THE VIEW DOOR CAME BACK THE SAME EVENING THE MENU DIED — owner: *"there should be
              a way to chat mode to canvas mode"*. A glyph this time, not a buried row, and gated
              like everything else here: both props arrive only once there is a conversation to
              leave, and then the control stays for the session. */}
          {view && onToggleView && <CanvasViewControl onToggleView={onToggleView} view={view} />}
      </div>
    </>
  );
}
