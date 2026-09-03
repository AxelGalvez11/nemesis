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

import { Children, useCallback, useEffect, useRef, useState } from "react";


import { useAuth } from "@/components/AuthProvider";
import { Codicon } from "@/components/desktop-ui/codicon";
import { DeckDesignPicker, useDeckDesignChoice } from "@/components/workspace/deck/deck-design-picker";
import { deckDesign } from "@/lib/export/deck-designs";
import { faviconUrl, hostnameOf } from "@/lib/favicon";
import type { DeliverableKind } from "@/lib/learn/canvas-deliverables";
import type { CanvasOutput, CanvasSource, LearningCanvas } from "@/lib/learn/canvas-model";
import { ACCEPTED_MATERIAL } from "@/lib/learn/canvas-tasks";
import { DeckReview } from "@/components/workspace/study/deck-review";
import { OutputPreview } from "./output-preview";
import { SourcePreview } from "./source-preview";
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
}: {
  canvas: LearningCanvas;
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
  onSendToChat?: (prompt: string, files: File[]) => void;
  outputTools?: OutputTools;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"sources" | "outputs">("sources");
  // 🔴 THE PASTE-A-LINK FIELD IS GONE — owner cut, 2026-08-23: *"for the sources, I want you to
  // remove the paste URL part because that's not really necessary."* The `onUrl` prop, the draft
  // state and the inline form left with it. `attachUrl` itself survives untouched: grounding and
  // the reply's source cards still file pages through it; only this panel's manual door closed.
  /**
   * The documents open in the docked reader, and which one is in front.
   *
   * 🔴 ONE PIECE OF STATE, NOT TWO, AND THAT IS DELIBERATE. Closing the front tab has to choose a
   * new front tab, which means the list and the choice change together. Held apart, that becomes a
   * `setActive` nested inside a `setOpen` updater — a defect this codebase has already paid for
   * once (see `dictation-doubled-every-sentence`), invisible in a diff and impossible to reason
   * about because the updater runs twice under StrictMode.
   */
  const [docs, setDocs] = useState<{ open: CanvasSource[]; activeId: string | null }>({ activeId: null, open: [] });
  const openDocument = useCallback((source: CanvasSource) => {
    setDocs((current) => ({
      activeId: source.id,
      // Opening something already open brings it forward rather than listing it twice.
      open: current.open.some((entry) => entry.id === source.id) ? current.open : [...current.open, source],
    }));
  }, []);
  const closeDocument = useCallback((id: string) => {
    setDocs((current) => {
      const open = current.open.filter((entry) => entry.id !== id);
      // Closing the front tab falls back to the most recently opened one still there, not to the
      // first: the learner's attention was at the end of the strip, which is where they put it.
      return { activeId: current.activeId === id ? (open[open.length - 1]?.id ?? null) : current.activeId, open };
    });
  }, []);
  const selectDocument = useCallback((id: string) => setDocs((current) => ({ ...current, activeId: id })), []);
  const closePanel = useCallback(() => setDocs({ activeId: null, open: [] }), []);
  /** The one file input both `+` buttons drive. */
  const filePicker = useRef<HTMLInputElement>(null);
  // 🔴 A DECK MADE HERE IS REVIEWED HERE. Owner 2026-08-24: the cards are "an artifact
  // that the user can study", and the canvas's Outputs tab is one of the two places that
  // artifact lives. This row used to be an `<a href="/library?deck=…">`, so studying the
  // deck a canvas had just made meant leaving the canvas. Now the same `DeckReview` the
  // Library mounts opens over the canvas; the Library link still works for anyone who
  // wants the shelf. Null until pressed — mounting it is what triggers the study load.
  const [reviewingDeck, setReviewingDeck] = useState<string | null>(null);
  /** The made artifact open on screen, or null. Mounted beside the panel rather than inside it, so
   *  closing the panel does not tear the document down mid-read — the same arrangement
   *  `SourcePreview` has. */
  const [openedOutput, setOpenedOutput] = useState<CanvasOutput | null>(null);
  const { session } = useAuth();
  const holder = useDismiss(open, () => setOpen(false));

  const outputs = canvas.outputs ?? [];

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
  const websites = canvas.sources.filter((source) => hostnameOf(source.sourceUrl) !== null);
  const documents = canvas.sources.filter((source) => hostnameOf(source.sourceUrl) === null);

  return (
    <div className="pointer-events-auto shrink-0" ref={holder}>
      <button
        aria-expanded={open}
        aria-label="Sources and outputs"
        className={CONTROL}
        onClick={() => setOpen((current) => !current)}
        title="Sources and outputs"
        type="button"
      >
        {/* 🔴 THE REFERENCE'S OWN GLYPH, PICKED OFF A SCREENSHOT THE OWNER SENT (2026-08-25). It
            was `library` — a stack of books, which reads as "go to the Library", a different
            surface this panel is repeatedly mistaken for. `list-unordered` says "the things in
            this canvas, listed", which is what opening it gets you. */}
        <Codicon name="list-unordered" size="20px" />
        {/* §46: a dot, not a count. The number is not the point and a badge reading "3" on every
            screen is noise the eye stops seeing anyway. */}
        {/* Model knowledge counts here too. The dot means "there is something in this panel",
            and a canvas taught entirely from model knowledge has something in it. */}
        {(canvas.sources.length > 0 || modelKnowledge) && (
          <span className="absolute right-[5px] top-[5px] h-[5px] w-[5px] rounded-full bg-(--ui-text-quaternary)" />
        )}
      </button>

      {open && (
        <div className={cn(PANEL, "w-[21rem]")}>
          {/* 🔴🔴 THREE STACKED SECTIONS, NOT TWO TABS — owner ask, 2026-08-25, with screenshots of
              the reference's panel: Outputs, Sources, Inputs, all on one scroll.

              The tabs were not a styling choice and neither is this. A tab hides one half of the
              answer behind a click, and the question this panel exists to answer — *where did this
              come from, and what has it made* — is one question. The learner who opens it to check
              their sources is the same learner who wants to know whether the deck got made. Under
              tabs they had to know which word to press first.

              🔴 THE THIRD SECTION IS NOT NEW INFORMATION, IT IS A SPLIT THIS FILE ALREADY MADE.
              `websites` and `documents` were computed here to decide whether to print headings; the
              reference names them Sources and Inputs and prints both always. What Nemesis went and
              read is genuinely a different thing from what the learner handed it, and the old
              conditional grouping said so only when both happened to be present.

              🔴 SO THE "NO HEADINGS WHEN THERE IS ONLY ONE KIND" RULE IS GONE, AND ITS REASONING IS
              WHY IT COULD GO. It read: *"the panel's own tab already says sources, and Documents
              printed under it is a label restating a label."* True — of a panel with a tab. With
              the tab gone the heading is the only label there is, and a section with no heading is
              a list of files with nothing saying what they are. */}
          {/* 🔴🔴 OUTPUTS AND INPUTS APPEAR ONLY WHEN THEY HOLD SOMETHING — owner, 2026-08-25:
              *"outputs and inputs should only appear when there are some."* They pass no `empty`,
              which is what hides them; Sources passes one and is therefore the shelf that is always
              on screen. That is deliberate and not an accident of the prop: Sources is the panel's
              anchor and carries the `+`, so a canvas with nothing in it still has a door.

              🔴 OUTPUTS HAS NO `+`, AND THIS IS THE ONE PLACE THE REFERENCE IS NOT COPIED. Its
              panel offers "Create a file or site" there. Owner ruling, 2026-08-24: *"remove the
              make flash cards, make slide, make summary note from the output section"* — this panel
              LISTS what a canvas produced, it is not where you produce it, and asking in words is
              the way (§38: *"a phrase to the composer, not a control"*). A `+` here would be those
              three rows returning behind an icon. `outputs-have-no-make-buttons.test.ts` holds it. */}
          <PanelSection label="Outputs">
            {outputs.map((output) => (
              <OutputRow
                canvasId={canvas.id}
                key={output.id}
                onOpen={(chosen) => {
                  // 🔴 THE SHELF CLOSES BEHIND THE ARTIFACT. Left open it floats over the reader it
                  // just launched, hiding the first screen of the document — which is what a
                  // screenshot of this caught.
                  setOpen(false);
                  setOpenedOutput(chosen);
                }}
                onReviewDeck={setReviewingDeck}
                output={output}
              />
            ))}
          </PanelSection>

          {/* 🔴 MODEL KNOWLEDGE IS A SOURCE, WHICH IS WHY IT SITS HERE (N10). A canvas started by
              typing a topic holds no files and a great deal of knowledge, and this shelf answering
              "nothing read from the web" while fifty model-minted facts sit behind it is true about
              web pages and false about provenance — on the one surface a learner opens to ask where
              something came from. The empty sentence now CARRIES that disclosure rather than being
              suppressed by a flag, so there is one line saying one thing. */}
          {/* 🔴🔴 THE MODEL'S OWN KNOWLEDGE IS NOT A SOURCE, AND LISTING IT AS ONE WAS THE DEFECT.
              Owner, 2026-09-01: *"sources will sometimes say 'generated with model knowledge'. I
              don't want it showing its own model knowledge as a source. That's not a source."*
              He is right, and the line was not wrong to exist: a canvas taught entirely from what
              the model knows, answering "nothing read from the web", is true about web pages and
              false about provenance — which is the one question this shelf is opened to ask.
              Both hold. It was FILED wrongly, not written wrongly.

              🔴 SO IT MOVES INTO THE EMPTY SENTENCE RATHER THAN BEING DELETED. That line is
              already the place this panel says "there is nothing here", and it is the only place
              where saying where the answer DID come from cannot be mistaken for a row you could
              open, cite or click. A source list with one entry that is not a source teaches a
              learner that our citations are decorative. */}
          <PanelSection
            empty={
              modelKnowledge
                ? "Nothing read from the web. This was answered from Nemesis's own knowledge."
                : "Nothing read from the web yet."
            }
            label="Sources"
            onAdd={() => filePicker.current?.click()}
          >
            {websites.map((source) => (
              <SourceRow key={source.id} onPreview={openDocument} source={source} />
            ))}
          </PanelSection>

          <PanelSection label="Inputs" onAdd={() => filePicker.current?.click()}>
            {documents.map((source) => (
              <SourceRow key={source.id} onPreview={openDocument} source={source} />
            ))}
          </PanelSection>

          {/* 🔴 THE "ADD SOURCE" ROW MOVED ONTO THE HEADINGS AS THE REFERENCE'S `+`, so the picker
              is opened by two buttons now and the input can no longer live inside either of them.
              `sr-only` rather than `hidden`: a hidden input is not keyboard reachable, and the
              buttons above are what focus travels to anyway. */}
          <input
            accept={ACCEPTED_MATERIAL}
            className="sr-only"
            multiple
            onChange={(event) => {
              if (event.target.files) onFiles(event.target.files);
              setOpen(false);
            }}
            ref={filePicker}
            type="file"
          />
        </div>
      )}

      {/* The real document, in a card, over the canvas — see source-preview.tsx's header for the
          owner ruling. Mounted beside the panel rather than inside it so closing the panel does
          not tear the preview down mid-read. */}
      {/* 🔴 MOUNTED UNCONDITIONALLY, `source` CARRIES THE OPEN/CLOSED STATE. The panel owns the
          learner's dragged width and the inset the canvas is pushed by; both live in hooks, and
          hooks cannot run in a component that only exists while it is open. It returns null when
          `source` is null and declares a zero inset, so a closed panel costs nothing. */}
      <SourcePreview
        activeId={docs.activeId}
        onClose={closePanel}
        onCloseTab={closeDocument}
        onSelect={selectDocument}
        onSendToChat={onSendToChat}
        open={docs.open}
        uid={session?.user.id ?? null}
      />
      {reviewingDeck && <DeckReview deckId={reviewingDeck} onClose={() => setReviewingDeck(null)} />}
      {openedOutput && (
        <OutputPreview
          canvasId={canvas.id}
          // 🔴 COMMENTS DO NOT WAIT FOR THE REVISE WIRING. A host that cannot revise (the dev
          // harness, a surface that has no canvas session) still lets the learner pin notes;
          // only the send button follows `onRevise`. `session` here is the auth session.
          comments={{ preview: false, uid: outputTools?.uid ?? session?.user.id ?? null }}
          onClose={() => setOpenedOutput(null)}
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

/**
 * One labelled shelf in the sources panel, with its own tail.
 *
 * 🔴🔴 IT ALWAYS PRINTS ITS HEADING, INCLUDING WHEN IT IS EMPTY, and that is the point of a stacked
 * panel rather than tabs. A section that vanishes when empty means the learner cannot tell "this
 * canvas has read nothing from the web" from "this panel does not track that" — the second reads
 * as something being lost. The reference does the same: *Sources — No sources yet*, in place,
 * between two sections that do have contents.
 *
 * 🔴 A LONG SHELF IS CAPPED, NOT FOLDED, AND THIS REPLACES A CONTROL THE OWNER ASKED FOR. The old
 * headings collapsed to nothing (2026-08-24: *"the websites in the source panel are supposed to be
 * collapsible"*), which solved a real problem — a lesson that has read twenty pages pushes the
 * learner's own three documents off the bottom. Capping at six with a tail solves the same problem
 * and is what the reference the owner is now pointing at does, so the fold goes rather than sitting
 * beside a second control that does almost the same thing. What is given up: you can no longer take
 * a section to zero. What is gained: the first six of every section are always on screen, which is
 * the case the fold made worse, because folding Websites to reach Documents also hid the websites.
 *
 * 🔴 THE TAIL COUNTS WHAT IS HIDDEN, NOT WHAT EXISTS. "Show 12 more" is a promise about what
 * pressing it does; "Show 18" would be a fact about the list and a lie about the button.
 */
function PanelSection({
  children,
  empty,
  label,
  onAdd,
}: {
  children: React.ReactNode;
  /**
   * What to say in place of the rows when there are none.
   *
   * 🔴🔴 OMITTING IT HIDES THE WHOLE SECTION, AND THAT IS THE PROP'S REAL JOB — owner, 2026-08-25:
   * *"outputs and inputs should only appear when there are some."* The rule lives in the prop shape
   * rather than as a `hideWhenEmpty` boolean beside it, because the two would be able to disagree:
   * a section with an empty sentence AND the hide flag has two answers for one state, and whichever
   * the code happened to check first would win silently.
   */
  empty?: string;
  label: string;
  /** Adds the reference's `+`. Absent on Outputs, deliberately — see the note at the call site. */
  onAdd?: () => void;
}) {
  // 🔴 EVERY SHELF FOLDS, AND EACH KEEPS ITS OWN FLAG — owner, 2026-08-25: *"make sure each section
  // is collapsible."* State lives INSIDE this component, so there is no shared flag to get wrong:
  // shutting a long Sources list must never also take away the documents the learner attached
  // themselves, which is the opposite of what folding is for.
  const [open, setOpen] = useState(true);
  const [all, setAll] = useState(false);
  // 🔴 COUNTED OFF THE RENDERED CHILDREN, NOT OFF A LENGTH THE CALLER PASSES. A caller that
  // filtered its list and forgot to update its count would print a tail that reveals nothing, and
  // nothing would catch it — the number and the rows come from one array.
  const rows = Children.toArray(children).filter(Boolean);
  const hidden = Math.max(0, rows.length - SECTION_ROWS);
  const shown = all ? rows : rows.slice(0, SECTION_ROWS);

  // A shelf with nothing in it and nothing to say about that is not a shelf.
  if (rows.length === 0 && !empty) return null;

  return (
    // 🔴 THE DIVIDER IS `first:border-t-0`, NOT A SEPARATOR THE PARENT PLACES BETWEEN SIBLINGS. Two
    // of the three shelves can vanish, so a parent counting gaps would draw a line above whichever
    // one happened to be first that day. Letting the DOM decide means the rule is "not above the
    // first one", which is what it actually is.
    <section className="border-t border-(--ui-stroke-secondary) pb-1.5 first:border-t-0">
      <div className="flex items-center gap-1">
        {/* 🔴🔴 THE HEADING IS A REAL BUTTON, WHICH IS THE INVARIANT THE OLD `SourceGroup` HELD:
            nothing may look pressable without being pressable, and nothing may be pressable without
            looking it. So it carries a chevron and `aria-expanded` rather than folding invisibly.

            🔴 SENTENCE CASE AT BODY SIZE, CHEVRON AFTER THE WORD — the reference's own composition,
            copied rather than approximated (owner, 2026-08-25: *"copy the exact styling of the
            reference i gave you"*). It was 12px uppercase with the chevron in front, which is a
            table header; the reference reads as a section of a document. */}
        <button
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-[length:var(--canvas-text-body)] text-(--ui-text-secondary) transition-colors hover:text-(--ui-text-primary)"
          onClick={() => setOpen((was) => !was)}
          type="button"
        >
          <span className="min-w-0 truncate">{label}</span>
          {/* 🔴 THE COUNT IS GONE, AND HIDING EMPTY SHELVES IS WHAT PAID FOR IT. It was here because
              a collapsed section with no number is indistinguishable from an empty one — the moment
              somebody concludes their sources were lost. A shelf that is empty no longer renders at
              all, so a visible collapsed one always has something in it and the ambiguity the count
              answered cannot occur. The reference carries no count either. */}
          <Codicon className="shrink-0 text-(--ui-text-quaternary)" name={open ? "chevron-down" : "chevron-right"} size="0.75rem" />
        </button>
        {onAdd && (
          <button
            aria-label={`Add to ${label}`}
            className="flex size-7 shrink-0 items-center justify-center rounded-lg text-(--ui-text-quaternary) transition-colors hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary)"
            onClick={onAdd}
            title={`Add to ${label}`}
            type="button"
          >
            <Codicon name="add" size="0.9rem" />
          </button>
        )}
      </div>
      {open && (
        <>
          {rows.length === 0 ? (
            <p className="m-0 px-2 pb-1 text-[length:var(--canvas-text-small)] leading-relaxed text-(--ui-text-quaternary)">{empty}</p>
          ) : (
            shown
          )}
          {hidden > 0 && (
            // Quiet, and not a row: it opens nothing, so it must not look like the things above it
            // that do. 🔴 A SECOND CONTROL, AND DELIBERATELY A DIFFERENT ONE — the heading takes the
            // whole shelf away, this reveals the rest of one you are already reading. Folding alone
            // means a search's twenty pages push the other shelves off the bottom unless you shut
            // them; capping alone means a long shelf can never be got out of the way.
            <button
              className="mt-0.5 block w-full rounded-lg px-2 py-1 text-left text-[length:var(--canvas-text-small)] text-(--ui-text-tertiary) transition-colors hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary)"
              onClick={() => setAll((was) => !was)}
              type="button"
            >
              {all ? "Show less" : `Show ${hidden} more`}
            </button>
          )}
        </>
      )}
    </section>
  );
}

/** How many rows a section shows before it offers the rest. Six is the reference's own count and
 *  fits all three shelves plus the Add row on one screen at this panel's height. */
const SECTION_ROWS = 6;

export const PANEL_ROW = "block w-full rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-(--ui-bg-tertiary)";

/** What kind of thing an output row is, as the icon rather than as a second line of text.
 *  🔴 `?? "file"` IS THE POINT OF THE LOOKUP. `CanvasOutput.kind` is deliberately a string so a new
 *  producer needs no schema change, so this map is guaranteed to be missing an entry one day and
 *  must degrade to a plausible row instead of an empty gap. */
const OUTPUT_ICONS: Record<string, string> = {
  document: "file",
  flashcards: "layers",
  pdf: "file-pdf",
  sheet: "table",
  note: "note",
  report: "book",
  slides: "device-camera-video",
};

/**
 * One source, as a row that opens the thing it names.
 *
 * 🔴🔴 THE ROWS OPEN. Owner, 2026-08-20: *"the sources box should be more the right and have the
 * actual sources clickable in there."* This panel is the one place a learner goes to ask "where did
 * that come from", and it used to answer with text they could not follow — a list of things that
 * look like links and are not is worse than a list that plainly is not one.
 *
 * 🔴 THE HOST DECIDES THE ROW, NOT A FLAG — the same rule `source-pill.ts` states and the composer
 * chips follow. `sourceUrl` is documented as absent for every file upload and present only for a
 * page, so its presence IS the question "can this be opened, and where?". One idea, spelled once,
 * in three places.
 */
/**
 * The short warning a source row shows when the file did not read properly, or null when it did.
 *
 * 🔴 THE SAME TEST THE MODEL IS GIVEN, so the panel and the answer cannot disagree about whether a
 * document was read. See `readState` in lib/learn/canvas-retrieval.ts. Owner, 2026-09-03: *"It
 * should not pretend that it read something it did not parse successfully."*
 */
function sourceReadWarning(source: CanvasSource): string | null {
  const usable = source.excerpts.filter((excerpt) => excerpt.text.trim().length > 0).length;
  if (usable === 0) return "not read";
  // Recorded facts only: see the note on `readState` for why "one excerpt" was dropped.
  if (source.parseQuality === "degraded") return "partly read";
  return null;
}

function SourceRow({ onPreview, source }: { onPreview: (source: CanvasSource) => void; source: CanvasSource }) {
  const host = hostnameOf(source.sourceUrl);
  // 🔴 ONE LINE, AND THE SECOND ONE IS GONE ON PURPOSE — owner, 2026-08-25: *"remove description
  // for outputs, inputs and sources."* It read `en.wikipedia.org · 1 excerpt` under every row, and
  // three shelves of two-line rows is a wall. Nothing is actually lost: the favicon already says
  // which site a page came from, and an excerpt count is bookkeeping about how Nemesis read
  // something rather than an answer to "what is this". `title` still carries the full name for a
  // hover, which is what a truncated row needs.
  const body = (
    <span className="flex items-center gap-1.5">
      {host ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote favicon service, not a static asset.
        <img alt="" className="shrink-0 rounded-full" height={14} src={faviconUrl(host)} width={14} />
      ) : (
        <Codicon className="shrink-0 text-(--ui-text-quaternary)" name="file" size="0.75rem" />
      )}
      <span className="truncate text-[length:var(--canvas-text-small)] text-(--ui-text-primary)">{source.title}</span>
      {/* 🔴 THE ONE SECOND LINE THAT STAYS, AND IT IS NOT A DESCRIPTION. A source Nemesis could only
          half read has to say so where the source is named; dropping this with the rest would make
          the panel quietly claim a partial read was a whole one. It renders on almost nothing. */}
      {source.coverageNote && (
        <span className="shrink-0 text-[length:var(--canvas-text-meta)] text-amber-500">
          {source.coverageNote.replace(/^\[|\]$/g, "")}
        </span>
      )}
      {/* 🔴🔴 A FILE THAT DID NOT READ MUST NOT LOOK LIKE ONE THAT DID. `coverageNote` above only
          exists when the reader had something to say; a scanned handout produces no note at all, so
          the worst case was the one that rendered as a perfectly ordinary row. Measured on
          production 2026-09-03: a source carrying `parseQuality: "degraded"`, one excerpt for the
          whole file and ZERO passages in the search index, shown with no marking whatsoever. */}
      {!source.coverageNote && sourceReadWarning(source) && (
        <span className="shrink-0 text-[length:var(--canvas-text-meta)] text-amber-500">
          {sourceReadWarning(source)}
        </span>
      )}
    </span>
  );

  if (host && source.sourceUrl) {
    return (
      <a
        className={cn(PANEL_ROW, "no-underline")}
        href={source.sourceUrl}
        rel="noopener noreferrer"
        target="_blank"
        title={source.title}
      >
        {body}
      </a>
    );
  }
  // 🔴🔴 A DOCUMENT OPENS A PREVIEW CARD, NOT THE LIBRARY — owner, 2026-08-23, after clicking one:
  // *"it took me to the old library. It's supposed to take me to a small preview of it, a pop up."*
  // The old anchor's reasoning ("the reader already exists, a preview would be a second answer")
  // lost to the learner's actual context: they are mid-canvas, and a navigation to another surface
  // for "what did I attach?" costs them the room they were in. The old link was also quietly
  // broken — it interpolated the canvas-local slot id (`s1`, `s2`…) into a route that resolves
  // `library_sources.id`, so it 404'd on every canvas regardless.
  return (
    <button className={PANEL_ROW} onClick={() => onPreview(source)} title={source.title} type="button">
      {body}
    </button>
  );
}

/**
 * One thing this canvas made.
 *
 * 🔴 EVERY ROW OPENS THE REAL THING — the deck in review, the note in the Library's reader. A list
 * of made things that cannot be opened is the sources panel's old defect all over again.
 *
 * 🔴 ANYTHING THAT IS A NOTE OPENS AS ONE, matched on what it HAS rather than on what it is called.
 * Keyed to `kind === "note"` this silently broke the moment a second note-shaped output existed: a
 * research report carries a notePath and fell through to the plain div, landing in the list as a
 * row that cannot be opened.
 */
function OutputRow({
  canvasId,
  onOpen,
  onReviewDeck,
  output,
}: {
  canvasId: string;
  onOpen: (output: CanvasOutput) => void;
  onReviewDeck: (deckId: string) => void;
  output: CanvasOutput;
}) {
  // 🔴 ONE LINE, SAME OWNER CUT (2026-08-25). The second line said "Flashcard deck · click to
  // review" — half a restatement of the icon and half an instruction to click a thing that is
  // visibly clickable. What KIND of output this is moves onto the icon, which is where the
  // reference puts it and costs no line at all.
  const body = (
    <span className="flex items-center gap-1.5">
      <Codicon className="shrink-0 text-(--ui-text-quaternary)" name={OUTPUT_ICONS[output.kind] ?? "file"} size="0.75rem" />
      <span className="truncate text-[length:var(--canvas-text-small)] text-(--ui-text-primary)">{output.title}</span>
    </span>
  );
  const row = cn(PANEL_ROW, "no-underline");

  // 🔴🔴 A NOTE OPENS THE ARTIFACT CARD, NOT THE OLD LIBRARY. Owner, 2026-08-25, with a screenshot
  // of `/library/classic` showing "Couldn't reach your notes": *"i dont want anything to route to
  // this old library."* This was an `<a href="/library/classic?note=…">` — a navigation off the
  // canvas, to a surface being retired, for the question "what did you just write for me".
  //
  // The card fetches the note's body by path (the lists carry titles, not text) and renders it
  // through the same parser the writers use, so a note is now the same kind of object as a document
  // or a spreadsheet: something you open where you are.
  if (output.notePath) {
    return (
      <button className={row} onClick={() => onOpen(output)} type="button">
        {body}
      </button>
    );
  }
  if (output.kind === "flashcards" && output.deckId) {
    const deckId = output.deckId;
    return (
      <button className={row} onClick={() => onReviewDeck(deckId)} type="button">
        {body}
      </button>
    );
  }
  // 🔴 A DECK OPENS BESIDE THE CANVAS NOW, LIKE EVERY OTHER ARTIFACT (owner, 2026-08-25). It was
  // the last row that navigated away, so checking what Nemesis had made meant leaving the canvas
  // that made it. The full page is still there and the panel links out to it — it holds the twenty
  // designs and the real geometry, which a 38rem column cannot.
  if (output.kind === "slides" && output.deck) {
    return (
      <button className={row} onClick={() => onOpen(output)} type="button">
        {body}
      </button>
    );
  }
  // 🔴🔴 THE FILE IS BUILT AT CLICK TIME FROM WHAT THE ROW CARRIES — the same arrangement the deck
  // has had since it shipped, and for the same reason: a .docx, a PDF and a CSV are each a
  // deterministic function of this content plus the format, so nothing was ever uploaded and there
  // is nothing to fetch back. It also means a row cannot go stale against a bucket.
  //
  // 🔴 GUARDED ON THE PAYLOAD, NOT ON THE KIND. An output whose markdown failed to save is a row
  // that would download an empty file, which is worse than a row that plainly does not download.
  // 🔴🔴 THE ROW OPENS THE ARTIFACT; IT NO LONGER DOWNLOADS IT. Owner, 2026-08-25: *"it should
  // create an artifact as 'output' not just straight download."* A row whose only action is to put
  // a file in Downloads is a link that happens to be listed — you cannot read what Nemesis wrote
  // before deciding you want it, and seeing your own document again means downloading it twice.
  // `OutputPreview` shows it and carries the download button; the file is still built at click
  // time, one click further in.
  //
  // 🔴 STILL GUARDED ON THE PAYLOAD, NOT THE KIND. An output whose content failed to save would
  // open an empty card, which is the same dead end wearing a nicer coat.
  if ((output.kind === "document" || output.kind === "pdf" || output.kind === "sheet") && (output.markdown || output.sheet)) {
    return (
      <button className={row} onClick={() => onOpen(output)} type="button">
        {body}
      </button>
    );
  }
  return <div className="px-2 py-1.5">{body}</div>;
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
