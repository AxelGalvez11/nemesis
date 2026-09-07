"use client";

// The controls that float at the top right of the canvas.
//
// 🔴 THEY FLOAT. There is no toolbar, no bar background, no full-width border and no container
// of any kind — they sit directly on the same uninterrupted sheet the title and the back button
// sit on. `canvas-shell.test.ts` asserts the class lists carry no border or background utility,
// because the regression this replaced was a 1px line across every pixel of the viewport, which
// is the single detail that makes a workspace read as "an app page" instead of a document.
//
// Each opens a panel that also floats. A panel is an overlay: it closes on outside-click and on
// Escape, and it never pushes the document sideways.
//
// What each one is FOR is the part worth keeping straight (owner, 2026-08-30, cutting the row
// to two: *"remove this entire panel … remove the 'progress' map"*):
//
//   ▣  Sources & Outputs   what went IN, and what Nemesis made
//   ⌥  Course map          the course's outline and mastery marks — lives in course-map.tsx
//
// Objectives, Territory (Minimap) and the `⋯` options menu all lived here; their tombstones
// below say where each went and why. `SessionControl` stays exported and unrendered (its own
// note explains that), which is why `MenuItem` is still in the file.

import type { AnnotationNote } from "@/lib/learn/annotation-note";
import { Children, useCallback, useEffect, useRef, useState } from "react";


import { useAuth } from "@/components/AuthProvider";
import { Codicon } from "@/components/desktop-ui/codicon";
import { SourcesGlyph } from "@/components/icons";
import { DeckDesignPicker, useDeckDesignChoice } from "@/components/workspace/deck/deck-design-picker";
import { deckDesign } from "@/lib/export/deck-designs";
import { faviconUrl, hostnameOf } from "@/lib/favicon";
import type { DeliverableKind } from "@/lib/learn/canvas-deliverables";
import type { CanvasOutput, CanvasSource, LearningCanvas } from "@/lib/learn/canvas-model";
import { fileMark } from "@/lib/learn/kind-mark";
import { ACCEPTED_MATERIAL } from "@/lib/learn/canvas-tasks";
import { OutputPreview } from "./output-preview";
import { documentKey, outputKey, useDocumentDock } from "./document-dock";
import { SourcePreview } from "./source-preview";
import { WorkPanel } from "./work-panel";
import type { ExtractionOutcome } from "@/lib/learn/knowledge-extraction";
import { entrySummary, groupByDay, type TranscriptEntry } from "@/lib/learn/session-transcript";
import { cn } from "@/lib/utils";


/** Close on outside click and Escape. Shared so the three panels cannot drift apart in how they
 *  dismiss — an overlay that only closes one of the two ways feels broken in a way people
 *  rarely report and always notice. */
export function useDismiss(open: boolean, close: () => void) {
  const holder = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!holder.current?.contains(event.target as Node)) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [close, open]);
  return holder;
}

// 🔴🔴 36×36 WITH A 20px GLYPH — MEASURED OFF CHATGPT, 2026-08-20, AND THIS REVERSES THE 08-12
// COMPACT PASS ON PURPOSE. The comment that stood here said the row went to 28×28 by "design
// judgement", and ended with its own caveat: *"not measured against anything external, this row has
// no ChatGPT equivalent to match."* There is one, and it has now been measured in the owner's own
// browser:
//
//     ChatGPT header button   36×36, radius 8px, glyph 20×20
//     Nemesis (before)        28×28, radius 13.5px (a full pill), glyph 14–15px
//
// So the box was 78% of the reference and the glyph 75% of it. Owner's instruction: *"make sure the
// canvas icons in upper header also match sizing and colour of chatgpt."* A judgement made in the
// absence of a reference is exactly the kind that a reference should overturn.
//
// 🔴 THE RADIUS MOVES FROM A PILL TO 8px, WHICH IS PART OF THE SAME MEASUREMENT. At 28px,
// `rounded-lg` computed to 13.5px — half the box — so these read as circles. ChatGPT's are rounded
// SQUARES at 8px, and at 36px `rounded-lg` is that. Pinned in px so it cannot drift with the box.
//
// 🔴 THE COLOUR WAS ALREADY RIGHT AND IS LEFT ALONE. `--ui-text-tertiary` composites to ≈#969696;
// ChatGPT's secondary header glyph is #8f8f8f. Within a hair, and both go to full-strength text on
// hover. Changing it to chase three units of grey would be a change nobody could see.
// 🔴🔴 `pointer-events-auto` IS LOAD-BEARING, AND ITS ABSENCE WAS A LIVE DEAD CONTROL. The strip
// these sit in is `pointer-events-none` by design — `canvas-surface.tsx` explains why: an invisible
// full-width band across the top of the sheet would otherwise swallow clicks meant for the document
// scrolling underneath it. Every child therefore has to switch clicks back ON for itself, and the
// exit `×` does so explicitly.
//
// This constant did not, and the read-aloud control applied it directly — so that toggle in the
// canvas header could not be clicked at all. Measured in a browser on 2026-08-26: computed
// `pointer-events: none`, `elementFromPoint` at its centre returning the strip instead of the
// button. It looked correct, it hovered nothing, and it did nothing. `SourcesControl` and
// `MinimapControl` were unaffected only by accident — each wraps itself in a `pointer-events-auto`
// div for its panel, which is why three controls in one row disagreed about whether they worked.
//
// 🔴 FIXED IN THE SHARED CONSTANT RATHER THAN AT THE CALL SITE, because the call site is exactly
// what forgot. A control added to this row tomorrow inherits a working one instead of inheriting
// the bug; `canvas-conversation-view.test.ts` holds the property by name.
// 🔴🔴 EXPORTED SINCE 2026-08-29, BECAUSE A SECOND FILE DRAWS ONE OF THESE BOXES NOW. The owner, on
// the course map: *"I would like it to be similar to source panel that is a squarish circlish type
// of box component."* `course-map.tsx` is that box, and it imports these rather than restating
// them — a second copy of `rounded-2xl … shadow … ring-1` is two panels that look alike today and
// drift the first time either is adjusted, which is the failure this file already records for
// Objectives vs Territory and for the plan tree.
export const CONTROL =
  // 🔴 `relative` IS FOR THE BADGE, AND IT MOVED HERE ON 2026-08-30 SO THE PANELS COULD LINE UP.
  // Two of these buttons carry a 5px dot at their own top-right. It used to resolve against the
  // control's WRAPPER, which was `relative` and exactly button-sized, so it landed correctly by
  // coincidence. The wrappers are no longer positioned (see the note on `PANEL`), and without this
  // the dots would fly to the corner of the whole glyph row. A badge belongs to its button.
  "pointer-events-auto relative flex h-[36px] w-[36px] items-center justify-center rounded-[8px] text-(--ui-text-tertiary) " +
  "transition-colors hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary)";

// 🪦 `CanvasViewControl` — THE CHAT↔CANVAS DOOR, PULLED 2026-09-01 BY THE OWNER: *"yeah pull the
// glyph"*, on being told the glyph was still in the header while the view it opens is parked
// (*"we hid the canvas view to work on it later"*).
//
// 🔴 THE VIEW ITSELF IS NOT DELETED, AND THAT IS THE POINT. `useCanvasView`, `CanvasView`,
// `canvasViewAction` and every `view === "conversation"` gate are untouched; the canvas simply
// opens on the conversation and has no way to leave it. Deleting the machinery to remove a button
// is how a parked feature becomes an unbuilt one.
//
// 🔴 IT ALSO CLOSES THE LAST DOOR TO THE FULL-PAGE REWIND. Going back on the rail scrolls the
// conversation (#1011); the overlay only ever appeared on this view, or as the fallback for a
// moment the thread does not draw. With the view unreachable, so is the first of those.
//
// Restoring it is: this component (glyph = destination, `canvasViewAction` owns the words), the
// `view`/`onToggleView` props on `CanvasHeader`, and `conversationOffered` in learning-canvas —
// the gate that kept it off a bare canvas. Its guards live in canvas-chat-is-the-product.test.ts.


// 🔴🔴 EVERY PANEL HANGS OFF THE ROW, NOT OFF ITS OWN GLYPH (owner 2026-08-30: *"Can you make sure
// source panel and map are both right side aligned?"*).
//
// `-right-2` resolves against the nearest positioned ancestor. Each control used to be that
// ancestor, so a panel's right edge was ITS OWN BUTTON's right edge + 8 — and the buttons sit at
// different places in the row. Measured at 1470px on a canvas with a course: Sources' button ends
// at 1338 and the course map's at 1418, so the two boxes opened **80px apart**, jumping sideways as
// you moved between them.
//
// The positioned ancestor is now the glyph row itself (`canvas-header.tsx` wraps it), which is
// right-anchored at 12px, so every panel shares one right edge whatever glyphs happen to be on
// screen. 🔴 The control wrappers must therefore NOT be `relative` — that is what this depends on,
// and it is why the badge moved onto `CONTROL` above.
// 🔴 `right-0`, NOT `-right-2`. The negative inset was right while a panel hung off a 36px BUTTON —
// it let the box overhang that button's own padding. Against the row it just pushed every panel 9px
// past the header, leaving the box 3px from the edge of the window (measured 1467 of 1470). At
// `right-0` the panels line up with the glyph row and keep the canvas's own 12px margin.
export const PANEL =
  "absolute right-0 top-full z-40 mt-1.5 max-h-[70vh] overflow-y-auto rounded-2xl bg-(--ui-bg-elevated) " +
  "p-1.5 shadow-[0_8px_32px_rgba(0,0,0,0.12)] ring-1 ring-(--ui-stroke-tertiary)";

// ---------------------------------------------------------------- sources + outputs

/** One control, two roles (§2). Sources are what Nemesis grounds on; outputs are what it made
 *  at the learner's request. They belong to the same session and are emphatically not the same
 *  kind of thing, so the distinction is preserved in the panel even while outputs is empty —
 *  merging them now would be the hard thing to undo later. */
/** The verbs an open output needs, built where the canvas session lives (learning-canvas). */
export interface OutputTools {
  onRevise: (output: CanvasOutput, ask: import("@/lib/learn/revise-output").ReviseAsk) => Promise<string | null>;
  onUndo: (output: CanvasOutput) => void;
  uid: string | null;
}

export function SourcesControl({
  canvas,
  modelKnowledge = false,
  onFiles,
  onMakeDeliverable,
  making = null,
  onSendToChat,
  outputTools,
  onWebSearch,
  webSearchArmed = false,
  workPanelOpen = false,
  onToggleWorkPanel,
}: {
  canvas: LearningCanvas;
  /** Declare Web search for the next send: the card's Web search row (docs/chatgpt-work-chat-reference.md §5). */
  onWebSearch?: () => void;
  webSearchArmed?: boolean;
  /** Whether the Outputs/Sources card stands. Held by the canvas, which also narrows the thread for it. */
  workPanelOpen?: boolean;
  onToggleWorkPanel?: () => void;
  /** Whether this canvas holds knowledge that provably came from the model rather than from
   *  attached material. See `canvas-provenance.ts` for why it is not simply "no sources". */
  modelKnowledge?: boolean;
  onFiles: (files: FileList | File[]) => void;
  /** Make a deliverable from this canvas (owner 2026-08-25) — absent while a caller has not
   *  wired it, in which case the tab only lists. */
  onMakeDeliverable?: (kind: DeliverableKind) => void;
  /** Which deliverable is being made, for the busy row. */
  making?: DeliverableKind | null;
  /** A question asked FROM the open document: a highlighted passage or a marked area, with one of
   *  the reader's actions on it. Absent means the reader shows no action bar at all — see
   *  `SourcePreview`. */
  onSendToChat?: (prompt: string, files: File[], notes?: readonly AnnotationNote[], said?: string) => void;
  outputTools?: OutputTools;
}) {
  // 🔴 OPEN BY DEFAULT AND REMEMBERED, LIKE THEIRS (docs/chatgpt-work-chat-reference.md §5). The
  // popover this replaced opened closed and shut on any outside click; the card stands until the
  // toggle is pressed again. The state lives in learning-canvas.tsx, because the thread and the
  // composer have to re-centre beside the card and they are not this control's children.
  const open = workPanelOpen;
  // 🔴 THE PASTE-A-LINK FIELD IS GONE — owner cut, 2026-08-23: *"for the sources, I want you to
  // remove the paste URL part because that's not really necessary."* The `onUrl` prop, the draft
  // state and the inline form left with it. `attachUrl` itself survives untouched: grounding and
  // the reply's source cards still file pages through it; only this panel's manual door closed.
  /**
   * The documents open in the docked reader, and which one is in front.
   *
   * 🔴 IT MOVED TO `document-dock.tsx` AND THAT MOVE IS THE FIX (owner 2026-09-03: *"clicking on
   * the inline source chip should open documents on the right sidebar, NOT this new sidebar"*).
   * This state was a private `useState` in this component, so nothing outside it could open a
   * document here — and a citation chip, which renders deep inside the policy view, could not reach
   * it at all. A second reading pane was built rather than a wire, and the chip led to the worse
   * of the two viewers. Sharing the state is what let the second pane be deleted.
   *
   * The rules it carries — one piece of state rather than two, and where the front tab falls back
   * to when you close it — moved with it unchanged; see that file.
   */
  const dock = useDocumentDock();
  const { activeId, closeAll: closePanel, open: openDocs, openDocument } = dock;
  // 🔴 THE PANEL'S PROPS ARE STILL SOURCE IDS; THE DOCK'S KEYS ARE NOT. One list now holds
  // documents and outputs, and a `CanvasSource.id` and a `CanvasOutput.id` are uuids from different
  // tables — so the dock keys them by kind and this is where a document id becomes one. See
  // `DockItem` for why the two spaces are kept disjoint by construction.
  const closeDocument = useCallback((id: string) => dock.close(documentKey(id)), [dock]);
  const selectDocument = useCallback((id: string) => dock.select(documentKey(id)), [dock]);
  /** The one file input both `+` buttons drive. */
  const filePicker = useRef<HTMLInputElement>(null);
  // 🔴 A DECK MADE HERE IS REVIEWED HERE. Owner 2026-08-24: the cards are "an artifact
  // that the user can study", and the canvas's Outputs tab is one of the two places that
  // artifact lives. This row used to be an `<a href="/library?deck=…">`, so studying the
  // deck a canvas had just made meant leaving the canvas. Now the same `DeckReview` the
  // Library mounts opens over the canvas; the Library link still works for anyone who
  // wants the shelf. Null until pressed — mounting it is what triggers the study load.
  /** The made artifact open on screen, or null. Mounted beside the panel rather than inside it, so
   *  closing the panel does not tear the document down mid-read — the same arrangement
   *  `SourcePreview` has. */
  /**
   * The artifact in front, or null.
   *
   * 🔴 IT COMES FROM THE DOCK NOW, AND IT USED TO BE A `useState` HERE (owner, 2026-09-03: *"i dont
   * want this, documents, lectures, and everything should open in one sidebar"*). Held here it knew
   * nothing about the open documents, so opening a study guide while a lecture was open put a
   * SECOND panel on top of the first — two rectangles, two tab strips, two headers, stacked. One
   * list means one thing is in front, and the other tabs are still there behind it.
   */
  const openedOutput = dock.active?.kind === "output" ? dock.active.output : null;
  const { session } = useAuth();

  const outputs = canvas.outputs ?? [];
  // 🔴 THE READING PANE WINS THE EDGE. While anything is docked the card would sit on top of it,
  // so it stands down and comes back when the last tab closes; the toggle still says it is open.
  const docked = dock.items.length > 0;
  const showing = open && !docked;

  // 🔴🔴 THE SPLIT THE PANEL IS BUILT ON, owner 2026-08-24 asking for the reference's shape: *"can
  // we just have it grouped under something that says websites with a websites icon or globe
  // icon".* It used to decide only WHETHER to print headings — both, or neither. It now decides
  // which shelf a source lands on, and both shelves are always labelled: what Nemesis went and read
  // is a different thing from what the learner handed it, and that stays true on a canvas that
  // happens to have only one of them.
  //
  // 🔴 THE HOST DECIDES, exactly as `SourceRow` below decides. `sourceUrl` is documented as absent
  // for every upload and present only for a page, so one idea stays spelled once — see
  // `source-pill.ts` and the composer chips, which follow the same rule.
  // 🔴 FILES ONLY (owner's answer, 2026-09-06: Sources lists "Files + Web search"). The pages
  // Nemesis read on its own stay where the answer cites them, as its source cards.
  const documents = canvas.sources.filter((source) => hostnameOf(source.sourceUrl) === null);

  return (
    <div className="pointer-events-auto shrink-0">
      {/* 🔴 THEIR "Files and sources" TOGGLE: `aria-pressed`, pressed while the card stands. No dot
          any more: the card itself says what is in it, and theirs carries none. */}
      <button
        aria-label="Files and sources"
        aria-pressed={open}
        className={cn(CONTROL, open && "bg-(--ui-bg-tertiary) text-(--ui-text-primary)")}
        data-testid="canvas-work-panel-toggle"
        onClick={onToggleWorkPanel}
        title="Files and sources"
        type="button"
      >
        {/* 🔴 THEIR OWN GLYPH SINCE 2026-09-06, lifted from their sprite (components/icons.tsx).
            `list-unordered` was the nearest codicon to a screenshot; this is the mark itself. */}
        <SourcesGlyph />
      </button>
      {showing && (
        <WorkPanel
          documents={documents}
          modelKnowledge={modelKnowledge}
          onFiles={onFiles}
          onOpenDocument={openDocument}
          onOpenOutput={(chosen) => {
            if (chosen.kind === "flashcards" && chosen.deckId) dock.openDeck(chosen.deckId, chosen.title);
            else dock.openOutput(chosen);
          }}
          onWebSearch={onWebSearch}
          outputs={outputs}
          webSearchArmed={webSearchArmed}
        />
      )}
      {/* The real document, in a card, over the canvas — see source-preview.tsx's header for the
          owner ruling. Mounted beside the panel rather than inside it so closing the panel does
          not tear the preview down mid-read. */}
      {/* 🔴 MOUNTED UNCONDITIONALLY, `source` CARRIES THE OPEN/CLOSED STATE. The panel owns the
          learner's dragged width and the inset the canvas is pushed by; both live in hooks, and
          hooks cannot run in a component that only exists while it is open. It returns null when
          `source` is null and declares a zero inset, so a closed panel costs nothing. */}
      <SourcePreview
        activeId={activeId}
        activeKey={dock.activeKey}
        items={dock.items}
        onClose={closePanel}
        onCloseKey={dock.close}
        onCloseTab={closeDocument}
        onSelect={selectDocument}
        onSelectKey={dock.select}
        onSendToChat={onSendToChat}
        open={openDocs}
        uid={session?.user.id ?? null}
      />
      {openedOutput && (
        <OutputPreview
          activeKey={dock.activeKey}
          canvasId={canvas.id}
          items={dock.items}
          onCloseKey={dock.close}
          onSelectKey={dock.select}
          // 🔴 COMMENTS DO NOT WAIT FOR THE REVISE WIRING. A host that cannot revise (the dev
          // harness, a surface that has no canvas session) still lets the learner pin notes;
          // only the send button follows `onRevise`. `session` here is the auth session.
          comments={{ preview: false, uid: outputTools?.uid ?? session?.user.id ?? null }}
          onClose={() => dock.close(outputKey(openedOutput.id))}
          onRevise={outputTools?.onRevise}
          onUndo={outputTools?.onUndo}
          // 🔴 THE FRESH ROW, NOT THE STATE COPY — a revision lands in `canvas.outputs`, and the
          // object captured at open time predates it. Same rule as the canvas-level mount.
          output={(canvas.outputs ?? []).find((row) => row.id === openedOutput.id) ?? openedOutput}
        />
      )}
    </div>
  );
}


// 🔴🔴 THE THREE "MAKE …" ROWS ARE NOT COMING BACK — owner, 2026-08-24: "remove the make flash
// cards, make slide, make summary note from the output section." This panel LISTS what a canvas has
// produced; it is not where you produce it. Asking in words is the way — "make me flashcards from
// this" works from any conversation since the deliverables stopped requiring lesson blocks — and
// that is what §38 already required of every other learning request: *"a phrase to the composer,
// not a control."* `makeDeliverable` itself is untouched and still reached from the composer, so
// that deleted a door and not a feature. `outputs-have-no-make-buttons.test.ts` holds the absence.

// ---------------------------------------------------------------- territory (minimap)
//
// 🔴🔴 `MinimapControl` (the Progress glyph and its territory panel) IS GONE — owner, 2026-08-30:
// *"remove the 'progress' map since the course map is pretty much the same thing."* Measured
// before the cut: a row click in EITHER panel ended in the same `policy.setFocus({kind:
// "selection"})`, so two adjacent course-only glyphs opened two right-aligned boxes that steered
// one thing. `course-map.tsx` is the survivor and absorbed the one affordance only this panel
// had: the "Whole course" row that clears a narrowed focus (H6's rule rides along — a row click
// passes a FocusScope and nothing else). `ObjectivesPanel` left in the same cut: nothing had
// mounted it since objectives left the header on 2026-08-20.

// ---------------------------------------------------------------- session menu

/** Session management only (§48). Quiz me, Explain simpler and Start recall are learning
 *  actions and belong to the canvas itself — putting them here would make this the place people
 *  look for the thing they want, which is the opposite of what a ⋯ menu is for. */
export function SessionControl({
  canvas,
  onRename,
  onDelete,
}: {
  canvas: LearningCanvas;
  onRename: (title: string) => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(canvas.title);
  const holder = useDismiss(open, () => {
    setOpen(false);
    setRenaming(false);
  });

  const commit = () => {
    const title = draft.trim();
    if (title && title !== canvas.title) onRename(title);
    setRenaming(false);
    setOpen(false);
  };

  return (
    <div className="pointer-events-auto shrink-0" ref={holder}>
      <button
        aria-expanded={open}
        aria-label="Session options"
        className={CONTROL}
        onClick={() => {
          setDraft(canvas.title);
          setOpen((current) => !current);
        }}
        title="Session options"
        type="button"
      >
        <Codicon name="kebab-vertical" size="20px" />
      </button>

      {open && (
        <div className={cn(PANEL, "w-[15rem]")}>
          {renaming ? (
            <input
              autoFocus
              className="w-full rounded-lg bg-(--ui-bg-tertiary) px-2.5 py-2 text-[length:var(--canvas-text-small)] text-(--ui-text-primary) outline-none"
              onBlur={commit}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") commit();
                if (event.key === "Escape") setRenaming(false);
              }}
              placeholder="Name this session"
              value={draft}
            />
          ) : (
            <>
              <MenuItem icon="edit" label="Rename session" onClick={() => setRenaming(true)} />
              {/* 🔴 Pin and Move to folder are NOT here. Both need columns the table does not
                  have yet, and a menu item that quietly does nothing is worse than an absent
                  one — the learner cannot tell the difference between "did not work" and "did
                  not happen", so they try again. They arrive with the columns. */}
              <MenuItem
                danger
                icon="trash"
                label="Delete session"
                onClick={() => {
                  setOpen(false);
                  onDelete();
                }}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[length:var(--canvas-text-small)] transition-colors hover:bg-(--ui-bg-tertiary)",
        danger ? "text-(--ui-text-tertiary) hover:text-red-500" : "text-(--ui-text-secondary)",
      )}
      onClick={onClick}
      type="button"
    >
      <Codicon name={icon} size="0.75rem" />
      {label}
    </button>
  );
}

// ---------------------------------------------------------------- voice mode / options menu
//
// 🔴🔴 THE `⋯` OPTIONS MENU IS GONE ENTIRELY — owner, 2026-08-30, pointing at it on screen:
// *"remove this entire panel, deepseek should decide how to best teach material … also remove
// the read outloud … why is latest output option even there in the first place?"* All three of
// its rows died with their features in the same change, so nothing here survives unreachable
// (this codebase's most-repeated defect):
//
//   - Teaching style (Direct/Guided/Socratic): deleted from `@nemesis/shared` and from the turn
//     packet. The model picks its own pedagogy; a learner who wants to be quizzed or led asks in
//     words, and `thinking-stance.ts` still answers the question by default.
//   - Read responses aloud (autoplay): the mode is gone from `use-canvas-voice.ts`. Every answer
//     keeps its own play button and the transport bar still appears while audio plays — manual
//     playback was always the same path autoplay pressed play on.
//   - Focus on the latest output: the one-answer view is gone with `canvas-view.ts`. The
//     conversation is the only view, which ends the answer-view family of "history is missing"
//     reports for good.
//
// `MenuItem` below survives because `SessionControl` (kept, unrendered) still uses it.

// ---------------------------------------------------------------- session record

/**
 * What happened in this session, on request.
 *
 * 🔴 A PANEL, NEVER A COLUMN. The teaching surface shows one cognitive object and lets the rest go
 * quiet; a permanent log beside it is the thing that whole design exists to avoid. But "the
 * interface is calm" is not an answer to a learner asking what they said an hour ago, so the record
 * exists and lives exactly one press away — behind the same kind of control as Sources and
 * Objectives, and gone during a retrieval with them.
 *
 * 🔴 IT READS THE EVIDENCE LOG, WHICH IS APPEND-ONLY. `canvas-events.ts` is a capped ring buffer
 * that drops its oldest rows, so a transcript built on it would silently lose the beginning of
 * every long session — which is the part worth looking back at.
 */
/**
 * What happened in this session, as a panel body. See `ObjectivesPanel` for why this stopped being
 * its own header button on 2026-08-19; the reasoning about the record itself is unchanged and
 * still lives above `groupByDay`.
 */
function SessionRecordPanel({
  entries,
  locale,
}: {
  entries: readonly TranscriptEntry[];
  locale?: string;
}) {
  const days = groupByDay(entries, locale);

  if (entries.length === 0) {
    return (
      <p className="px-2 py-2 text-[length:var(--canvas-text-small)] text-(--ui-text-tertiary)">
        Nothing has happened yet.
      </p>
    );
  }

  return (
    <>
      {days.map((group) => (
            <div key={group.day}>
              <p className="px-2 pb-1 pt-2 text-[length:var(--canvas-text-meta)] text-(--ui-text-quaternary)">
                {group.day}
              </p>
              {group.entries.map((entry) => (
                <div className="rounded-lg px-2 py-1.5" key={entry.id}>
                  <p className="text-[length:var(--canvas-text-small)] text-(--ui-text-primary)">{entry.objective}</p>
                  <p className="mt-0.5 text-[length:var(--canvas-text-meta)] text-(--ui-text-tertiary)">
                    {entrySummary(entry)}
                  </p>
                  {/* Their own words, quoted rather than narrated — the same rule §K holds on the
                      teaching surface: quote the learner, never tell them what they said. */}
                  {entry.said && (
                    <p className="mt-1 text-[length:var(--canvas-text-meta)] italic text-(--ui-text-quaternary)">
                      “{entry.said.slice(0, 160)}{entry.said.length > 160 ? "…" : ""}”
                    </p>
                  )}
                </div>
              ))}
            </div>
          ))}
    </>
  );
}
