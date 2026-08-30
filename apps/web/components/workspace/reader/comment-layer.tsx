"use client";

// The ANNOTATE layer: pins, drawn boxes, and the note that creates them.
//
// Owner, 2026-08-28: *"This is supposed to be more of an annotate with a comment type of edit"* —
// and the measured reference is Claude Design's comment mode (docs/claude-design-reference.md).
// What this copies from it, deliberately:
//
//   · Commenting is a MODE with both gestures said out loud ("Click to comment, drag to draw a
//     box"), because neither is discoverable and a mode is the only way one drag can stop meaning
//     text-selection.
//   · The note box has TWO buttons — "Add comment" keeps it for the learner, "Send to Nemesis"
//     hands it over — one anchor, two destinations. That split IS the design.
//   · 🔴 NOTHING IS SAVED UNTIL A BUTTON IS PRESSED. Cancel and Escape leave the document exactly
//     as it was; a drawn box exists only on screen until the note lands.
//
// And what it deliberately does differently: the drawing is a BOX, not freehand ink. The box is
// the product's existing, tested primitive (`use-region-drag.ts` — fractions, the pointerup rule,
// the crop pipeline), and a box around a thing serves "circle this and ask" just as well while
// surviving zoom and resize. Ink can come later without moving anything built here.
//
// 🔴 EVERYTHING RENDERS THROUGH PORTALS INTO THE UNIT ELEMENTS THE VIEWS REGISTER. Pins must
// scroll WITH the page they are pinned to; a fixed overlay repainting on scroll events is the
// janky version of what the browser does for free when the pin is simply inside the page's box.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Codicon } from "@/components/desktop-ui/codicon";
import type { CommentAnchor, DocumentComment } from "@/lib/workspace/document-comments";
import { cn } from "@/lib/utils";

import { useRegionDrag, type RegionAnchor, type RegionBox } from "./use-region-drag";

/** A note not yet saved: where it points, and where its box should open on screen. */
export interface CommentDraftSpot {
  unit: number;
  anchor: CommentAnchor;
  at: { left: number; top: number };
}

export function CommentLayer({
  commenting,
  units,
  comments,
  unitLabel,
  boxesDrawable,
  blockSnap,
  onKeep,
  onSend,
  onResolve,
  onDelete,
}: {
  /** The mode. Off = this layer draws saved pins and nothing else captures the pointer. */
  commenting: boolean;
  /** unit number -> the element that IS that page/slide/sheet, as the views registered them. */
  units: ReadonlyMap<number, HTMLElement>;
  comments: readonly DocumentComment[];
  unitLabel: string;
  /**
   * Whether a drag draws a box here. False on a flowing document, where the page reflows with the
   * panel width and a box drawn over paragraphs would point at different words tomorrow.
   */
  boxesDrawable: boolean;
  /** Snap point comments to the nearest `[data-comment-block]` (flowing documents). */
  blockSnap: boolean;
  onKeep: (draft: { unit: number; anchor: CommentAnchor; body: string }) => Promise<boolean>;
  /**
   * Hand the note to Nemesis as well as keeping it. Null when the host has no chat lane —
   * the button is then not rendered at all, the same absent-not-inert rule the reader's
   * action bar follows.
   */
  onSend: ((draft: { unit: number; anchor: CommentAnchor; body: string }) => void) | null;
  onResolve: (comment: DocumentComment) => void;
  onDelete: (comment: DocumentComment) => void;
}) {
  const [draft, setDraft] = useState<CommentDraftSpot | null>(null);
  const [openThread, setOpenThread] = useState<{ comment: DocumentComment; at: { left: number; top: number } } | null>(null);

  // Leaving the mode abandons an unsent draft — the reference behaves the same way, and it is
  // the "nothing saved until a button" rule wearing its other face.
  useEffect(() => {
    if (!commenting) setDraft(null);
  }, [commenting]);

  const takeDraft = useCallback((spot: CommentDraftSpot) => {
    setOpenThread(null);
    setDraft(spot);
    // A drag leaves the browser's own text selection painted under the new box on documents
    // where text is selectable; one gesture, one visible result.
    if (typeof window !== "undefined") window.getSelection()?.removeAllRanges();
  }, []);

  /** Comments numbered in creation order, so the pin, the list row and the learner agree. */
  const ordinals = new Map<string, number>();
  comments.forEach((comment, index) => ordinals.set(comment.id, index + 1));

  return (
    <>
      {[...units.entries()].map(([unit, element]) => (
        <UnitSurface
          blockSnap={blockSnap}
          boxesDrawable={boxesDrawable}
          commenting={commenting}
          comments={comments.filter((comment) => comment.resolvedAt === null && (comment.unit ?? 1) === unit)}
          element={element}
          key={unit}
          onOpenThread={(comment, at) => {
            setDraft(null);
            setOpenThread({ at, comment });
          }}
          onTake={takeDraft}
          ordinals={ordinals}
          unit={unit}
        />
      ))}

      {draft && (
        <CommentNote
          onCancel={() => setDraft(null)}
          onKeep={async (body) => {
            if (await onKeep({ anchor: draft.anchor, body, unit: draft.unit })) setDraft(null);
          }}
          onSend={
            onSend
              ? (body) => {
                  onSend({ anchor: draft.anchor, body, unit: draft.unit });
                  setDraft(null);
                }
              : null
          }
          spot={draft.at}
        />
      )}

      {openThread && (
        <CommentThread
          comment={openThread.comment}
          onClose={() => setOpenThread(null)}
          onDelete={() => {
            onDelete(openThread.comment);
            setOpenThread(null);
          }}
          onResolve={() => {
            onResolve(openThread.comment);
            setOpenThread(null);
          }}
          ordinal={ordinals.get(openThread.comment.id) ?? 0}
          spot={openThread.at}
          unitLabel={unitLabel}
        />
      )}
    </>
  );
}

// ── One unit's overlay: capture while commenting, saved marks always ─────────

function UnitSurface({
  blockSnap,
  boxesDrawable,
  commenting,
  comments,
  element,
  onOpenThread,
  onTake,
  ordinals,
  unit,
}: {
  blockSnap: boolean;
  boxesDrawable: boolean;
  commenting: boolean;
  comments: readonly DocumentComment[];
  element: HTMLElement;
  onOpenThread: (comment: DocumentComment, at: { left: number; top: number }) => void;
  onTake: (spot: CommentDraftSpot) => void;
  ordinals: ReadonlyMap<string, number>;
  unit: number;
}) {
  const targetRef = useRef<HTMLElement | null>(element);
  targetRef.current = element;

  const boxPicked = useCallback(
    (region: RegionBox, anchor: RegionAnchor) => {
      onTake({ anchor: { box: region }, at: { left: anchor.left, top: anchor.top - 8 }, unit });
    },
    [onTake, unit],
  );

  const pointPicked = useCallback(
    (point: { x: number; y: number }, anchor: RegionAnchor) => {
      if (blockSnap) {
        // The stable address in a flowing document is WHICH BLOCK, not where in the scroll. The
        // click's own y decides which block that is.
        const blocks = element.querySelectorAll<HTMLElement>("[data-comment-block]");
        let nearest: { index: number; distance: number } | null = null;
        const clickY = element.getBoundingClientRect().top + point.y * element.getBoundingClientRect().height;
        blocks.forEach((block) => {
          const box = block.getBoundingClientRect();
          const distance = clickY < box.top ? box.top - clickY : clickY > box.bottom ? clickY - box.bottom : 0;
          const index = Number.parseInt(block.dataset.commentBlock ?? "", 10);
          if (!Number.isInteger(index)) return;
          if (!nearest || distance < nearest.distance) nearest = { distance, index };
        });
        if (!nearest) return;
        onTake({ anchor: { block: (nearest as { index: number }).index }, at: { left: anchor.left, top: anchor.top }, unit });
        return;
      }
      onTake({ anchor: { x: point.x, y: point.y }, at: { left: anchor.left, top: anchor.top }, unit });
    },
    [blockSnap, element, onTake, unit],
  );

  const { box, onPointerDown } = useRegionDrag({
    enabled: commenting,
    onPicked: boxesDrawable ? boxPicked : () => undefined,
    onPoint: pointPicked,
    target: targetRef,
  });

  return createPortal(
    <>
      {commenting && (
        // 🔴 MOUNTED ONLY IN THE MODE, never left inert — an element covering the page is exactly
        // the thing that silently kills text selection, and "present but inert" is invisible.
        <div
          className="absolute inset-0 z-20 cursor-crosshair"
          data-testid={`reader-unit-${unit}-comment-surface`}
          onPointerDown={onPointerDown}
        >
          {box && boxesDrawable && <div className="nemesis-reader-region" style={box} />}
        </div>
      )}

      {comments.map((comment) => (
        <SavedMark comment={comment} element={element} key={comment.id} onOpen={onOpenThread} ordinal={ordinals.get(comment.id) ?? 0} />
      ))}
    </>,
    element,
  );
}

/** A saved comment on the page: its box when it has one, and its numbered pin. */
function SavedMark({
  comment,
  element,
  onOpen,
  ordinal,
}: {
  comment: DocumentComment;
  element: HTMLElement;
  onOpen: (comment: DocumentComment, at: { left: number; top: number }) => void;
  ordinal: number;
}) {
  const open = (event: React.MouseEvent) => {
    event.stopPropagation();
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
    onOpen(comment, { left: box.left, top: box.bottom + 6 });
  };

  const pin = (
    <button
      aria-label={`Comment ${ordinal}`}
      className="pointer-events-auto grid size-[18px] place-items-center rounded-full bg-(--ui-action) text-[0.625rem] font-semibold text-(--ui-action-glyph) shadow-sm ring-2 ring-(--ui-bg-elevated) transition-transform hover:scale-110"
      data-testid={`reader-comment-pin-${ordinal}`}
      onClick={open}
      onPointerDown={(event) => event.stopPropagation()}
      type="button"
    >
      {ordinal}
    </button>
  );

  if (comment.anchor.box) {
    const { box } = comment.anchor;
    return (
      <div
        className="pointer-events-none absolute z-30 rounded-[6px] border-2 border-(--ui-action) bg-(--ui-action)/10"
        style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.width * 100}%`, height: `${box.height * 100}%` }}
      >
        <div className="absolute -right-2 -top-2">{pin}</div>
      </div>
    );
  }

  if (comment.anchor.block !== undefined) {
    // The pin lives inside the BLOCK's own box, so a reflow moves them together. The portal
    // target is the block element, which the view stamped `relative` for exactly this.
    // 🔴 A <span>, because the block is often a <p> and a <div> inside one is invalid HTML —
    // React flags it as a hydration hazard in the console, and it was found there, not here.
    const block = element.querySelector<HTMLElement>(`[data-comment-block="${comment.anchor.block}"]`);
    if (!block) return null;
    return createPortal(<span className="absolute -left-7 top-0 z-30 block">{pin}</span>, block);
  }

  const x = comment.anchor.x;
  const y = comment.anchor.y;
  if (x === undefined || y === undefined) return null;
  return (
    <div className="absolute z-30 -translate-x-1/2 -translate-y-1/2" style={{ left: `${x * 100}%`, top: `${y * 100}%` }}>
      {pin}
    </div>
  );
}

// ── The note box: one anchor, two destinations ───────────────────────────────

function CommentNote({
  spot,
  onKeep,
  onSend,
  onCancel,
}: {
  spot: { left: number; top: number };
  onKeep: (body: string) => void;
  onSend: ((body: string) => void) | null;
  onCancel: () => void;
}) {
  const [body, setBody] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  // Measured, then pulled back inside the window — the same clamp SelectionActions does, because
  // a comment on the right edge of the last page still needs its note somewhere clickable.
  useLayoutEffect(() => {
    const box = boxRef.current?.getBoundingClientRect();
    if (!box) return;
    const margin = 8;
    setPosition({
      left: Math.min(Math.max(margin, spot.left), window.innerWidth - box.width - margin),
      top: Math.min(Math.max(margin, spot.top), window.innerHeight - box.height - margin),
    });
  }, [spot.left, spot.top]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const ready = body.trim().length > 0;

  return (
    <div
      className="fixed z-[130] w-[334px] rounded-[10px] border border-(--ui-stroke-secondary) bg-(--ui-bg-elevated) p-3 shadow-xl"
      data-testid="reader-comment-note"
      ref={boxRef}
      style={position ? position : { left: -9999, top: -9999 }}
    >
      <textarea
        autoFocus
        className="min-h-[72px] w-full resize-none rounded-[6px] border border-(--ui-stroke-tertiary) bg-transparent px-2.5 py-2 text-[0.8125rem] leading-relaxed outline-none focus:border-(--ui-action)"
        onChange={(event) => setBody(event.target.value)}
        placeholder="Say what this spot needs…"
        value={body}
      />
      <div className="mt-2 flex items-center justify-end gap-1.5">
        <button
          className="rounded-[8px] px-2.5 py-1.5 text-[0.75rem] font-medium text-(--ui-text-tertiary) transition-colors hover:text-foreground"
          onClick={onCancel}
          type="button"
        >
          Cancel
        </button>
        <button
          className="rounded-[8px] border border-(--ui-stroke-secondary) px-2.5 py-1.5 text-[0.75rem] font-medium text-foreground transition-colors hover:bg-(--ui-bg-tertiary) disabled:opacity-45"
          data-testid="reader-comment-keep"
          disabled={!ready}
          onClick={() => onKeep(body)}
          type="button"
        >
          Add comment
        </button>
        {onSend && (
          <button
            className="rounded-[8px] bg-(--ui-action) px-2.5 py-1.5 text-[0.75rem] font-medium text-(--ui-action-glyph) transition-opacity hover:opacity-90 disabled:opacity-45"
            data-testid="reader-comment-send"
            disabled={!ready}
            onClick={() => onSend(body)}
            type="button"
          >
            Send to Nemesis
          </button>
        )}
      </div>
    </div>
  );
}

/** An existing comment, opened from its pin. */
function CommentThread({
  comment,
  ordinal,
  unitLabel,
  spot,
  onClose,
  onResolve,
  onDelete,
}: {
  comment: DocumentComment;
  ordinal: number;
  unitLabel: string;
  spot: { left: number; top: number };
  onClose: () => void;
  onResolve: () => void;
  onDelete: () => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const box = boxRef.current?.getBoundingClientRect();
    if (!box) return;
    const margin = 8;
    setPosition({
      left: Math.min(Math.max(margin, spot.left), window.innerWidth - box.width - margin),
      top: Math.min(Math.max(margin, spot.top), window.innerHeight - box.height - margin),
    });
  }, [spot.left, spot.top]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed z-[130] w-[300px] rounded-[10px] border border-(--ui-stroke-secondary) bg-(--ui-bg-elevated) p-3 shadow-xl"
      data-testid="reader-comment-thread"
      ref={boxRef}
      style={position ? position : { left: -9999, top: -9999 }}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[0.6875rem] font-medium text-(--ui-text-tertiary)">
          Comment {ordinal}
          {comment.unit !== null ? ` · ${unitLabel} ${comment.unit}` : ""}
        </p>
        <button aria-label="Close" className="grid size-5 place-items-center rounded text-(--ui-text-quaternary) hover:text-foreground" onClick={onClose} type="button">
          <Codicon name="close" size="0.7rem" />
        </button>
      </div>
      <p className="mt-1.5 whitespace-pre-wrap text-[0.8125rem] leading-relaxed text-foreground">{comment.body}</p>
      <div className="mt-2.5 flex items-center justify-end gap-1.5">
        <button
          className="rounded-[8px] px-2 py-1 text-[0.6875rem] font-medium text-(--ui-text-tertiary) transition-colors hover:text-(--ui-danger)"
          onClick={onDelete}
          type="button"
        >
          Delete
        </button>
        <button
          className={cn(
            "rounded-[8px] border border-(--ui-stroke-secondary) px-2.5 py-1 text-[0.6875rem] font-medium transition-colors hover:bg-(--ui-bg-tertiary)",
          )}
          data-testid="reader-comment-resolve"
          onClick={onResolve}
          type="button"
        >
          Resolve
        </button>
      </div>
    </div>
  );
}
