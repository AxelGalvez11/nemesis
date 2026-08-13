"use client";

// The document itself — the thing the brief calls "a document that is alive".
//
// Every block is addressable and selectable. Selecting text does not open an editor: it tells
// the command bar what the next instruction is about. That is the whole editing philosophy
// (§16) — the learner directs Nemesis, they do not typeset.

import { Undo2 } from "lucide-react";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";

import { Codicon } from "@/components/desktop-ui/codicon";
import { type CanvasBlock, type LearningCanvas } from "@/lib/learn/canvas-model";
import { isRewritten } from "@/lib/learn/canvas-ops";
import { isRead, offersContinue } from "@/lib/learn/canvas-reading";
import { quotedExcerpt } from "@/lib/learn/canvas-grounding";
import type { NextAction } from "@/lib/learn/canvas-state";
import { cn } from "@/lib/utils";

import { markedTerms, splitByTerms, type MarkedTerm } from "@/lib/learn/canvas-vocabulary";

import { BOTTOM_KEEPOUT, TOP_KEEPOUT } from "./canvas-selection-menu";
import { selectableRegion } from "./use-canvas-selection";

/** The shape every floating popover on this page positions itself with. A plain object rather
 *  than `DOMRect` so a captured `getBoundingClientRect()` snapshot can be stored in state without
 *  the rest of the (mutable, live) `DOMRect` instance tagging along. */
interface AnchorRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

interface CanvasDocumentProps {
  canvas: LearningCanvas;
  selectedIds: string[];
  onSelect: (ids: string[]) => void;
  busyBlockIds: string[];
  /** §11 — restore one passage to the wording it had before the learner rewrote it. */
  onRestore: (blockId: string) => void;
  /** §12 — the learner says they have finished the chunk on screen. */
  onFinishReading: () => void;
  /** A retrieval prompt is up and unanswered, so §12's control must not offer a way past it. */
  awaitingDemonstration: boolean;
  aside: { text: string; blockId: string | null } | null;
  onDismissAside: () => void;
  onToggleCollapsed: (blockId: string, collapsed: boolean) => void;
  /** A marked vocabulary term was clicked. Handled above rather than here because the answer
   *  belongs in the same popover a highlighted word already uses — one definition surface, not
   *  two that happen to look alike. */
  onTerm: (block: CanvasBlock, mark: MarkedTerm, rect: DOMRect) => void;
  /** Reading is the one state whose content has no natural end control, so the move forward is
   *  printed after the last block rather than floating in the chrome. */
  next: NextAction | null;
  onAdvance: () => void;
  busy: boolean;
}

export function CanvasDocument({
  canvas,
  selectedIds,
  onSelect,
  busyBlockIds,
  onRestore,
  onFinishReading,
  awaitingDemonstration,
  aside,
  onDismissAside,
  onToggleCollapsed,
  onTerm,
  next,
  onAdvance,
  busy,
}: CanvasDocumentProps) {
  const root = useRef<HTMLDivElement>(null);
  const [openSource, setOpenSource] = useState<{ blockId: string; rect: AnchorRect } | null>(null);

  // A browser selection spanning several blocks selects all of them. Read on selectionchange
  // rather than on click, so dragging across two paragraphs behaves the way it looks.
  //
  // 🔴 `Selection.containsNode(el, true)` is the wrong test here and silently selects nothing.
  // It asks whether the ELEMENT sits inside the selection, so highlighting a sentence within a
  // paragraph never matches that paragraph's own block element — only a selection that swallowed
  // the whole block would. `Range.intersectsNode` asks whether the two overlap at all, in either
  // direction, which is the actual question. Caught in the browser; every selection-scoped
  // command was a no-op before this.
  const readSelection = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !root.current) return;
    const anchor = selection.anchorNode;
    if (!anchor || !root.current.contains(anchor)) return;

    const ranges: Range[] = [];
    for (let i = 0; i < selection.rangeCount; i += 1) ranges.push(selection.getRangeAt(i));

    const ids: string[] = [];
    // Document order, because the ids become the model's edit scope and a jumbled order would
    // make an insert land in a place the learner did not point at.
    for (const element of root.current.querySelectorAll<HTMLElement>("[data-block-id]")) {
      const id = element.dataset.blockId;
      if (id && ranges.some((range) => range.intersectsNode(element))) ids.push(id);
    }
    if (ids.length > 0) onSelect(ids);
  }, [onSelect]);

  useEffect(() => {
    document.addEventListener("selectionchange", readSelection);
    return () => document.removeEventListener("selectionchange", readSelection);
  }, [readSelection]);

  // 🔴 NO SELF-REPORT HIDING (J1, owner 2026-08-13). This used to filter the list down by a
  // per-block field the learner set with a one-click mastery-claim button, plus a bulk control
  // that reversed it. Both are gone, deliberately, not merely unreachable: a learner CLAIMING
  // knowledge is not a demonstration of it, and hiding material on that claim was changing the
  // curriculum without evidence. Nemesis believes what the learner demonstrates, not what they
  // say. (The underlying field, and what reads it elsewhere, is not this file's concern —
  // Runtime owns that boundary.)
  const visible = canvas.blocks;
  const sourceBlock = openSource ? (visible.find((block) => block.id === openSource.blockId) ?? null) : null;

  return (
    <div className="mx-auto w-full max-w-(--canvas-column) px-6 pb-40" ref={root}>
      {visible.map((block) => (
        <BlockView
          aside={aside?.blockId === block.id ? aside.text : null}
          block={block}
          busy={busyBlockIds.includes(block.id)}
          read={isRead(block)}
          onRestore={() => onRestore(block.id)}
          canvas={canvas}
          key={block.id}
          onDismissAside={onDismissAside}
          onToggleCollapsed={() => onToggleCollapsed(block.id, !block.collapsed)}
          onTerm={onTerm}
          onToggleSource={(rect) =>
            setOpenSource((current) => (current?.blockId === block.id ? null : { blockId: block.id, rect }))
          }
          selected={selectedIds.includes(block.id)}
          sourceOpen={openSource?.blockId === block.id}
        />
      ))}

      {/* §12 — "There should be a 'continue' button once user finishes reading, at the bottom of
          the paragraph chunk."

          🔴 THIS IS THE CONTROL THAT WAS ALREADY HERE, REPOINTED. `nextAction` still offers
          `{ to: "recall", label: "I've read this" }` for a reading canvas — the same position, the
          same meaning — and then refuses it, because `recall` is an evidence stage and the
          six-stage retirement closed every entrance to those. Measured, not assumed: `nextAction`
          on a `learn` canvas holding one block returns `null`, so nothing has rendered here for
          weeks. The control was right; its DESTINATION was the problem.

          🔴 ONE CONTROL AT THE END OF THE MATERIAL, NEVER ONE PER BLOCK. A real import stored 197
          blocks; a per-block Continue would be 197 presses with 196 paragraphs still visible
          underneath. §12's "bottom of the paragraph chunk" is the chunk Nemesis presented.

          🔴 AND IT CANNOT APPEAR WHILE AN ANSWER IS OWED. §17 forbids a Continue after an answer,
          but the reason it is IMPOSSIBLE rather than merely absent is N3: a control that moves the
          learner on while a demonstration is owed is a way to press past the question. The
          predicate lives in canvas-reading.ts beside the composer's equivalent, so the two doors
          cannot disagree.

          Restrained per §19 and §12: an inline control ending a passage, not a call to action. It
          keeps the outline the previous control earned — "the move forward exists here" without
          competing with the content above it. */}
      {offersContinue({
        awaitingDemonstration,
        busy,
        hasUnreadMaterial: visible.some((block) => !isRead(block)),
      }) && (
        <button
          className="mt-10 rounded-full px-4 py-2 text-[0.8125rem] text-(--ui-text-secondary) ring-1 ring-(--ui-stroke-secondary) transition-colors hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary)"
          onClick={onFinishReading}
          type="button"
        >
          Continue
        </button>
      )}

      {/* 🔴 CORRECTION — THIS IS DEAD IN EVERY CASE, AND #584 SAID OTHERWISE.
          That comment claimed `targeted_relearn` "is reading material rather than an evidence
          stage and still offers a move". The first half is true and the second is false: its only
          move goes to `retest`, which IS retired, so `nextAction` refuses it exactly as it refuses
          `learn`. The mistake came from reading a true statement about the STATE in
          canvas-state.ts as a statement about the CONTROL.

          Measured across every state a canvas can be observed in — evidence stages excluded,
          because `normaliseCanvas` coerces those to `learn` on read — `nextAction` returns null
          for ALL of them. See canvas-dead-controls.test.ts, which pins it.

          🔴 LEFT IN PLACE ANYWAY, DELIBERATELY. Removing it is a separate decision: it would take
          six session methods with it, and whether any of that machinery should come back is the
          owner's call, not a cleanup. The audit reports; it does not delete. */}
      {next && (
        <button
          className="mt-10 ml-3 rounded-full px-4 py-2 text-[0.8125rem] text-(--ui-text-secondary) ring-1 ring-(--ui-stroke-secondary) transition-colors hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary) disabled:opacity-40"
          disabled={busy}
          onClick={onAdvance}
          type="button"
        >
          {next.label}
        </button>
      )}

      {openSource && sourceBlock && (
        <CanvasSourcePreview block={sourceBlock} canvas={canvas} onClose={() => setOpenSource(null)} rect={openSource.rect} />
      )}
    </div>
  );
}

interface BlockViewProps {
  block: CanvasBlock;
  canvas: LearningCanvas;
  selected: boolean;
  busy: boolean;
  /** §12 — the learner has said they finished reading this chunk. */
  read: boolean;
  /** §11 — put this passage back the way it was written. */
  onRestore: () => void;
  aside: string | null;
  sourceOpen: boolean;
  onDismissAside: () => void;
  onToggleCollapsed: () => void;
  onToggleSource: (rect: AnchorRect) => void;
  onTerm: (block: CanvasBlock, mark: MarkedTerm, rect: DOMRect) => void;
}

function BlockView({
  block,
  canvas,
  selected,
  busy,
  read,
  onRestore,
  aside,
  sourceOpen,
  onDismissAside,
  onToggleCollapsed,
  onToggleSource,
  onTerm,
}: BlockViewProps) {
  return (
    <section
      className={cn(
        "group relative -mx-4 rounded-lg px-4 py-1.5 transition-colors",
        // 🔴 No block-wide tint any more. It existed when the block WAS the selection, but the
        // browser's own highlight now shows the exact words — and painting the whole paragraph
        // grey underneath a toolbar that says "these two words" tells the learner two different
        // things about what they just selected. The composer's chip still names the wider scope.
        // 🔴 §11: THE PASSAGE ITSELF ENTERS THE PROCESSING STATE, and it does it in the product's
        // one motion language. `animate-pulse` was a whole-element opacity throb — a "wait"
        // signal, which §20 rules out in favour of "information forming from left to right". A
        // paragraph being rewritten is information being formed, so it gets the same travelling
        // band the thinking preview uses. See globals.css for why it carries no fill.
        busy && "canvas-rewriting",
        // §12 / §7 — "resolved history stays accessible but recedes". Material the learner has
        // said they finished goes quieter and STAYS WHERE IT IS, at full length.
        // 🔴 NOT `collapsed`, AND NOT HIDDEN. J1 removed a one-click control from this very
        // surface that filtered blocks out of the document on a learner's own claim; folding a
        // passage to a one-line chevron on a reading click rebuilds that with a nicer label.
        // Opacity only — nothing moves, nothing reflows, and scrolling back reads it normally.
        read && !busy && "opacity-60 transition-opacity duration-500",
      )}
      data-block-id={block.id}
      data-selected={selected ? "true" : undefined}
    >
      {block.collapsed ? (
        <button
          className="flex w-full items-center gap-2 py-1 text-left text-[0.8125rem] text-(--ui-text-quaternary) hover:text-(--ui-text-secondary)"
          onClick={onToggleCollapsed}
          type="button"
        >
          <Codicon name="chevron-right" size="0.75rem" />
          {block.content.slice(0, 90)}…
        </button>
      ) : (
        <>
        <BlockBody block={block} canvas={canvas} onTerm={onTerm} onToggleSource={onToggleSource} sourceOpen={sourceOpen} />
        {/* §11 — *"Keep the old version internally so it can be restored."* The rewrite happened in
            place and there is exactly ONE explanation on screen; this is the way back to the other
            one, and it is deliberately not a second copy of the text sitting underneath.
            🔴 QUIET, AND ONLY ON BLOCKS THE LEARNER CHANGED. The teaching loop rewrites blocks too,
            through the same op — `applyRewrite` is what keeps those out of this, so nobody is
            offered an undo for something they did not do. */}
        {!busy && isRewritten(block) && (
          <button
            // 🔴 DRAWN AT REST, NOT ON HOVER — and I wrote it the other way first. #578 spent a
            // whole section on exactly this spelling in the Library, where 62 of 62 row controls
            // were `opacity-0` until the pointer crossed them and had no affordance at all on a
            // touch screen. The argument does not stop applying because this surface is quieter.
            // Restraint is the COLOUR and the SIZE here, not the visibility.
            className="mt-1 flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[0.75rem] text-(--ui-text-quaternary) transition-colors hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-secondary)"
            onClick={onRestore}
            type="button"
          >
            <Undo2 size={12} strokeWidth={1.7} />
            Show how this was written
          </button>
        )}
        </>
      )}

      {block.note && !block.collapsed && (
        <p className="mt-2 border-l-2 border-(--ui-accent)/40 py-0.5 pl-3 text-[0.875rem] leading-relaxed text-(--ui-text-secondary)">
          {block.note}
        </p>
      )}

      {/* Concept labels are NOT printed here at all — not under every block, and no longer on
          hover either (owner 2026-08-13). They were printed once, and consecutive blocks on the
          same idea repeated the same line: clutter on a page whose whole argument is that the
          content is the interface. The hover version was quieter but had the same problem and a
          worse one — a concept id is Nemesis's internal name for an object, so putting it on the
          primary Canvas is the lesson engine showing through the material.
          Concepts are what the diagnosis speaks in. They surface THERE, and nowhere else. */}

      {/* 🔴 NOTHING HOVERS OVER A BLOCK ANY MORE (J3, owner 2026-08-13). The floating hover
          toolbar carried a "where this came from" button, a "where did this come from?" button
          and a concept label. The two buttons went with J3; the label went when the owner ruled
          on it the same day. There is no hover layer on a block left to add to — if something
          ever needs one again, that is a new decision, not a slot standing open.
          Provenance survives as two DIFFERENT, quieter things:
          a citation marker inline with cited text (see `BlockBody`/`BlockText`'s `onToggleSource`
          below — it reads as a footnote, not a control the learner operates on the block) and,
          for uncited content, the existing capability to select text and ask — `learning-
          canvas.tsx`'s `submit()` already routes a selection plus "where"/"which source"/"what
          source" to `session.askAbout`, so nothing needed adding for that half; a dedicated
          per-block button for it would have been the toolbar shape J3 asks to retire, not the
          capability. */}
      {/* The popover itself no longer renders here -- see `CanvasSourcePreview`, rendered once
          at the `CanvasDocument` level so it can float free of this block's own stacking
          context, the same way `CanvasSelectionMenu` already does for the term-lookup popover. */}

      {/* An answer about this block is ordinary explanation, so it is not boxed. A quiet rule
          and the indent say "this is about the paragraph above" — a card would say "this is a
          component", which is the thing the surface is trying not to look like. */}
      {aside && (
        <div className="mt-3 border-l-2 border-(--ui-stroke-secondary) py-0.5 pl-4 text-[0.9375rem] leading-relaxed text-(--ui-text-secondary)">
          {aside}
          <button
            className="mt-2 block text-[0.6875rem] text-(--ui-text-quaternary) hover:text-(--ui-text-secondary)"
            onClick={onDismissAside}
            type="button"
          >
            Dismiss
          </button>
        </div>
      )}
    </section>
  );
}

/** Deliberately plain typography. Headings are the only scale change; emphasis is weight, not
 *  colour. A study document that looks like a dashboard is harder to read, not easier.
 *
 *  🔴 THE SELECTABLE MARKER GOES ON THE ELEMENT THAT HOLDS `block.content` AND NOTHING ELSE.
 *  The `<section>` around it also contains the block's note, its hover concept labels, the
 *  source panel and any aside — measuring character offsets from there would silently count all
 *  of that, and every offset would be plausible and wrong. */
function BlockBody({
  block,
  canvas,
  onTerm,
  onToggleSource,
  sourceOpen,
}: {
  block: CanvasBlock;
  canvas: LearningCanvas;
  onTerm: (block: CanvasBlock, mark: MarkedTerm, rect: DOMRect) => void;
  onToggleSource: (rect: AnchorRect) => void;
  sourceOpen: boolean;
}) {
  const mark = selectableRegion(block.id, {
    blockId: block.id,
    rewritable: true,
    ...(block.conceptIds?.length ? { conceptIds: block.conceptIds } : {}),
  });

  // 🔴 THE CITATION MARKER (J3, owner 2026-08-13; reshaped for the compact-UI pass). A quiet
  // mark beside the text it supports, always present rather than hover-revealed — evidence
  // behind the Canvas, not a control floating over it. Only for blocks that actually cite an
  // excerpt; a block with nothing to point at gets no mark, same rule `canvas-selection-menu.tsx`
  // already uses for the term-lookup popover ("provenance where it exists, and silence where it
  // does not — implying the learner's own material said something it never said is worse than no
  // citation"). This exact gate is unchanged from the first pass; only the glyph and what opens
  // changed.
  const cited = (block.sourceRefs?.length ?? 0) > 0;
  // 🔴 A NUMBER, KEYED TO THE SOURCE'S OWN POSITION, NOT THE BLOCK'S OR THE REF'S. `canvas.sources`
  // is the attached-materials list; teaching rewrites blocks constantly ("Simpler" replaces one
  // outright) but never silently reorders what was attached. Numbering off render order would
  // renumber every citation above an edit; numbering off this list is numbering that survives one.
  const indices = citationIndices(block, canvas);
  const label = indices.length > 0 ? `[${indices.join(",")}]` : "•";
  const body = (
    <>
      <BlockText block={block} canvas={canvas} onTerm={onTerm} />
      {cited && (
        <button
          aria-label="Where this came from"
          className={cn(
            "ml-0.5 align-super text-[0.625rem] font-medium leading-none tabular-nums transition-colors",
            sourceOpen ? "text-(--ui-text-primary)" : "text-(--ui-text-quaternary) hover:text-(--ui-text-primary)",
          )}
          onClick={(event) => onToggleSource(event.currentTarget.getBoundingClientRect())}
          title="Where this came from"
          type="button"
        >
          {label}
        </button>
      )}
    </>
  );

  // 🔴 EVERY SIZE BELOW IS SMALLER THAN THE PREVIOUS PASS -- compact-UI spec, point 1 ("reduce
  // visual scale of body text/headings/labels in session mode"). Design judgement, not measured:
  // this is the reading column, which has no ChatGPT equivalent to read a number off. Kept
  // conservative -- one step down, not two -- because this is the thing being read for minutes
  // at a stretch, not a label glanced at once; the composer's input text has its own, unrelated
  // 16px floor (see canvas-composer.tsx) that this reduction does not touch or approach.
  switch (block.type) {
    case "heading":
      return (
        <h2
          className="mt-8 text-[1.25rem] font-semibold leading-snug tracking-[-0.01em] text-(--ui-text-primary) first:mt-0"
          {...mark}
        >
          {body}
        </h2>
      );
    case "concept":
      return (
        <div className="my-2.5 border-l-2 border-(--ui-accent) py-1 pl-4">
          <p className="text-[1rem] font-medium leading-relaxed text-(--ui-text-primary)" {...mark}>
            {body}
          </p>
        </div>
      );
    case "callout":
      // Emphasis by rule and indent, not by filling a rectangle. A page of tinted panels reads
      // as a dashboard; the point of this surface is that it reads as something written.
      return (
        <div className="my-2.5 border-l-2 border-(--ui-stroke-primary) py-0.5 pl-4">
          <p className="text-[0.875rem] leading-relaxed text-(--ui-text-secondary)" {...mark}>
            {body}
          </p>
        </div>
      );
    case "example":
      return (
        <p className="my-2 pl-4 text-[0.875rem] leading-relaxed text-(--ui-text-secondary)" {...mark}>
          {body}
        </p>
      );
    case "citation":
      return (
        <p className="my-1.5 text-[0.75rem] leading-relaxed text-(--ui-text-tertiary)" {...mark}>
          {body}
        </p>
      );
    default:
      return (
        <p className="my-2 text-[0.9375rem] leading-[1.65] text-(--ui-text-primary)" {...mark}>
          {body}
        </p>
      );
  }
}

/** The block's text, with at most a couple of words quietly marked as "there is more here".
 *
 *  🔴 THE MARKS ARE A RENDERING, NOT A REWRITE. `block.content` is never altered to hold them:
 *  the ranges are computed fresh on every render from the text as it currently stands, so a
 *  block that "Simpler" rewrote simply loses the marks whose words are gone. Nothing is stored,
 *  so nothing can go stale, and a copy-paste of the paragraph carries the learner's material and
 *  not our annotations.
 *
 *  A dotted rule rather than a colour: colour competes with the prose for the same channel the
 *  writing already uses for emphasis, and this is meant to be findable rather than noticeable. */
function BlockText({
  block,
  canvas,
  onTerm,
}: {
  block: CanvasBlock;
  canvas: LearningCanvas;
  onTerm: (block: CanvasBlock, mark: MarkedTerm, rect: DOMRect) => void;
}) {
  const marks = markedTerms(block, canvas);
  // The overwhelmingly common case, and worth keeping as a plain string: wrapping every
  // paragraph in fragments to render nothing would put React nodes between the learner and
  // their own text for no reason.
  if (marks.length === 0) return <>{block.content}</>;

  return (
    <>
      {splitByTerms(block.content, marks).map((run, index) =>
        run.mark ? (
          <button
            className="cursor-help border-b border-dotted border-(--ui-text-quaternary) bg-transparent p-0 text-left font-[inherit] text-[length:inherit] leading-[inherit] text-[color:inherit] hover:border-(--ui-text-secondary)"
            key={`${run.mark.start}-${index}`}
            onClick={(event) => {
              // 🔴 A click that ENDS a drag is not a click on the word. Without this, selecting
              // a phrase that happens to finish inside a marked term fires the definition
              // popover on mouse-up and replaces the toolbar the learner was reaching for.
              if (!window.getSelection()?.isCollapsed) return;
              onTerm(block, run.mark!, event.currentTarget.getBoundingClientRect());
            }}
            title={`What does "${run.text}" mean here?`}
            type="button"
          >
            {run.text}
          </button>
        ) : (
          <Fragment key={`t-${index}`}>{run.text}</Fragment>
        ),
      )}
    </>
  );
}

/** Stable per-source numbering for the citation marker, keyed to the source's own position in
 *  `canvas.sources` rather than to the block's position or the order refs were written — see the
 *  comment at the call site in `BlockBody`. A block citing more than one source prints more than
 *  one index in the same bracket; either way there is exactly one marker and one popover. */
function citationIndices(block: CanvasBlock, canvas: LearningCanvas): number[] {
  const cited = new Set((block.sourceRefs ?? []).map((ref) => ref.sourceId));
  const indices: number[] = [];
  canvas.sources.forEach((source, index) => {
    if (cited.has(source.id)) indices.push(index + 1);
  });
  return indices;
}

/** "Where did this come from?" — a quiet, dismissible popover anchored to the citation marker
 *  that opened it, replacing the old panel that printed inline and pushed the rest of the
 *  document down. Answered from the excerpt ids the block was generated with, never by asking
 *  the model, which would let it invent a source — SourcePanel's original guarantee, unchanged.
 *
 *  🔴 THE CLAMPING IS `canvas-selection-menu.tsx`'s, NOT REINVENTED. Both float over the same
 *  page, with the same title scrim at the top and the same composer pill at the bottom, so the
 *  safe band is identical — `TOP_KEEPOUT`/`BOTTOM_KEEPOUT` are imported rather than re-guessed,
 *  and a second popover that drifted from the first the next time either clearance changed is
 *  exactly the bug this avoids.
 *
 *  No "Open source" link: there is no source-viewer route today, and inventing a destination for
 *  it would be a worse answer than not offering it (see the compact-UI deliverable notes). */
function CanvasSourcePreview({
  block,
  canvas,
  rect,
  onClose,
}: {
  block: CanvasBlock;
  canvas: LearningCanvas;
  rect: AnchorRect;
  onClose: () => void;
}) {
  const holder = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (!holder.current?.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const found = (block.sourceRefs ?? [])
    .map((ref) => quotedExcerpt(canvas.sources, ref))
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  // An estimate, not a measurement — the same convention `canvas-selection-menu.tsx` uses for its
  // own open/closed heights. `max-h` plus `overflow-y-auto` on the rendered box means a wrong
  // estimate costs an internal scrollbar, never a layout break.
  const height = Math.min(280, 96 + found.length * 84);
  const width = 320;

  const bandTop = TOP_KEEPOUT;
  const bandBottom = window.innerHeight - BOTTOM_KEEPOUT;
  const fits = (candidate: number) => candidate >= bandTop && candidate + height <= bandBottom;
  const preferBelow = rect.bottom + 8;
  const preferAbove = rect.top - height - 8;
  const top = fits(preferBelow)
    ? preferBelow
    : fits(preferAbove)
      ? preferAbove
      : Math.max(bandTop, Math.min(preferBelow, bandBottom - height));

  const centred = (rect.left + rect.right) / 2 - width / 2;
  const left = Math.max(12, Math.min(centred, window.innerWidth - width - 12));

  return (
    <div className="fixed z-40" ref={holder} style={{ top: `${top}px`, left: `${left}px`, width: `${width}px` }}>
      <div className="max-h-[280px] overflow-y-auto rounded-2xl bg-(--ui-bg-elevated) p-3.5 shadow-[0_8px_32px_rgba(0,0,0,0.14)] ring-1 ring-(--ui-stroke-tertiary)">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[0.6875rem] uppercase tracking-wide text-(--ui-text-quaternary)">Where this came from</p>
          <button
            aria-label="Dismiss"
            className="-mr-1 -mt-0.5 shrink-0 text-(--ui-text-quaternary) hover:text-(--ui-text-primary)"
            onClick={onClose}
            type="button"
          >
            <Codicon name="close" size="0.6875rem" />
          </button>
        </div>

        {found.length === 0 ? (
          <p className="mt-2 text-[0.8125rem] leading-relaxed text-(--ui-text-tertiary)">
            This part wasn&rsquo;t taken from your material — Nemesis wrote it from general knowledge.
          </p>
        ) : (
          found.map(({ excerpt, source }) => (
            <div className="mt-2.5 first:mt-2" key={excerpt.id}>
              <p className="text-[0.75rem] font-medium text-(--ui-text-primary)">
                {source.title}
                {excerpt.label ? ` · ${excerpt.label}` : ""}
              </p>
              <p className="mt-1 border-l-2 border-(--ui-stroke-primary) pl-2.5 text-[0.8125rem] leading-relaxed text-(--ui-text-secondary)">
                {excerpt.text.length > 400 ? `${excerpt.text.slice(0, 400)}…` : excerpt.text}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
