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
import { repliesTo, rootsOf, type CommentAnchor, type DocumentComment } from "@/lib/workspace/document-comments";
import { cn } from "@/lib/utils";

import { useRegionDrag, type RegionAnchor, type RegionBox } from "./use-region-drag";

/** A note not yet saved: where it points, and where its box should open on screen. */
export interface CommentDraftSpot {
  unit: number;
  anchor: CommentAnchor;
  /** Where the note opens. `above` is the fallback y when there is no room below — see CommentNote. */
  at: { left: number; top: number; above?: number };
  /** Opened by highlighting rather than by the mode. See the `commenting` effect. */
  fromSelection?: boolean;
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
  onAsk = null,
  request = null,
  onRequestTaken,
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
  /**
   * Ask Nemesis about this spot and have the answer land IN the thread.
   *
   * 🔴🔴 THE ANSWER STAYS IN THE DOCUMENT (owner, 2026-09-04: *"it would be useful to have
   * annotations with chat responses within the document so users dont bloat the main chat"*). This
   * is a different destination from `onSend`, not a different question: `onSend` hands the note to
   * the canvas, where the full lane can make cards and open panels; this answers in the margin,
   * beside the sentence that prompted it. Null when the host cannot ask at all (the preview
   * harness makes no network calls), and then the control is absent rather than inert.
   */
  onAsk?: ((comment: DocumentComment, question: string) => Promise<string | null>) | null;
  /**
   * A draft opened from OUTSIDE the mode — today, by highlighting text.
   *
   * 🔴 THE MODE IS FOR GESTURES THE BROWSER DOES NOT ALREADY HAVE. Clicking a spot and dragging a
   * box both need the page covered by a capture surface, which is exactly what kills text
   * selection — hence a mode. Highlighting needs none of that: the browser hands it over for free,
   * and it is the commonest way a person marks a line. So a highlight opens a draft directly, with
   * no mode to find first, and this prop is how the reader hands one in.
   */
  request?: CommentDraftSpot | null;
  /** Fired once the request has been taken, so the host can forget it. */
  onRequestTaken?: () => void;
}) {
  const [draft, setDraft] = useState<CommentDraftSpot | null>(null);
  const [openThread, setOpenThread] = useState<{ comment: DocumentComment; at: { left: number; top: number } } | null>(null);

  // Leaving the mode abandons an unsent draft — the reference behaves the same way, and it is
  // the "nothing saved until a button" rule wearing its other face.
  useEffect(() => {
    // 🔴 ONLY A DRAFT THE MODE ITSELF CREATED. A highlight opens a draft with the mode OFF, so
    // clearing on every `commenting` change would close the box the moment it appeared. Turning
    // the mode ON is still an abandon — that is a deliberate switch of gesture.
    if (!commenting) setDraft((current) => (current?.fromSelection ? current : null));
    else setDraft(null);
  }, [commenting]);

  // 🔴 KEYED ON THE REQUEST OBJECT, NOT ON ITS CONTENTS. Highlighting the same words twice must
  // reopen the box; comparing anchors would make the second highlight a no-op because nothing
  // "changed". The host passes a fresh object per gesture and clears it through `onRequestTaken`.
  useEffect(() => {
    if (!request) return;
    setOpenThread(null);
    setDraft(request);
    onRequestTaken?.();
  }, [request, onRequestTaken]);

  const takeDraft = useCallback((spot: CommentDraftSpot) => {
    setOpenThread(null);
    setDraft(spot);
    // A drag leaves the browser's own text selection painted under the new box on documents
    // where text is selectable; one gesture, one visible result.
    if (typeof window !== "undefined") window.getSelection()?.removeAllRanges();
  }, []);

  /** Comments numbered in creation order, so the pin, the list row and the learner agree. */
  const ordinals = new Map<string, number>();
  // 🔴 ROOTS ARE THE MARKS. `comments` carries the replies too since 2026-09-04; numbering or
  // pinning them would put a second mark on a spot that was asked about once.
  const roots = rootsOf(comments);
  roots.forEach((comment, index) => ordinals.set(comment.id, index + 1));

  return (
    <>
      {[...units.entries()].map(([unit, element]) => (
        <UnitSurface
          blockSnap={blockSnap}
          boxesDrawable={boxesDrawable}
          commenting={commenting}
          comments={roots.filter((comment) => comment.resolvedAt === null && (comment.unit ?? 1) === unit)}
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
          onAsk={onAsk ? (question) => onAsk(openThread.comment, question) : null}
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
          replies={repliesTo(comments, openThread.comment.id)}
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
  spot: { left: number; top: number; above?: number };
  onKeep: (body: string) => void;
  onSend: ((body: string) => void) | null;
  onCancel: () => void;
}) {
  const [body, setBody] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  // Measured, then pulled back inside the window, because a comment on the right edge of the last
  // page still needs its note somewhere clickable.
  //
  // 🔴 AND IT FLIPS ABOVE RATHER THAN COVERING WHAT IT IS ABOUT. A note opened from a HIGHLIGHT
  // passes `above`: the y to use when there is no room below. Without it the clamp slides the box
  // back up over the very line the learner just selected — which is what shipped, and what the
  // screenshot showed: three lines of the lecture hidden behind the box asking about them. A click
  // comment passes no `above` and keeps its old behaviour, since a click has nothing to obscure.
  useLayoutEffect(() => {
    const box = boxRef.current?.getBoundingClientRect();
    if (!box) return;
    const margin = 8;
    const roomBelow = window.innerHeight - spot.top - margin >= box.height;
    const top = roomBelow || spot.above === undefined
      ? Math.min(Math.max(margin, spot.top), window.innerHeight - box.height - margin)
      : Math.max(margin, spot.above - box.height);
    setPosition({
      left: Math.min(Math.max(margin, spot.left), window.innerWidth - box.width - margin),
      top,
    });
  }, [spot.above, spot.left, spot.top]);

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
  onAsk,
  replies,
}: {
  comment: DocumentComment;
  ordinal: number;
  unitLabel: string;
  spot: { left: number; top: number };
  onClose: () => void;
  onResolve: () => void;
  onDelete: () => void;
  /** Ask about this spot; the answer arrives in this thread. Null when the host cannot ask. */
  onAsk: ((question: string) => Promise<string | null>) | null;
  /** What has been said under this note already, oldest first. */
  replies: readonly DocumentComment[];
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [asking, setAsking] = useState(false);
  const [question, setQuestion] = useState("");
  const [failed, setFailed] = useState(false);
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

  const ask = useCallback(async () => {
    if (!onAsk || asking) return;
    setFailed(false);
    setAsking(true);
    // 🔴 THE FIELD EMPTIES BEFORE THE WAIT, not after it. The question is already on screen as a
    // row the moment the answer lands, and a field still holding it reads as "that did not send".
    const said = question.trim();
    setQuestion("");
    const answered = await onAsk(said);
    setAsking(false);
    if (answered === null) {
      setFailed(true);
      setQuestion(said);
    }
  }, [asking, onAsk, question]);

  return (
    <div
      className="fixed z-[130] w-[320px] rounded-[10px] border border-(--ui-stroke-secondary) bg-(--ui-bg-elevated) p-3 shadow-xl"
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

      {/* 🔴🔴 THE CONVERSATION LIVES HERE, NOT IN THE CANVAS (owner, 2026-09-04). Each turn is
          labelled by who said it, because an unlabelled block under a note reads as more of the
          note. Nemesis's own answers sit on a tinted ground for the same reason a chat bubble
          does: one glance has to separate the question from the answer. */}
      {replies.length > 0 && (
        <div className="mt-2.5 flex flex-col gap-2" data-testid="reader-comment-replies">
          {replies.map((reply) => (
            <div
              className={cn(
                "rounded-[8px] px-2 py-1.5",
                reply.author === "nemesis" ? "bg-(--ui-bg-tertiary)" : "bg-transparent",
              )}
              key={reply.id}
            >
              <p className="text-[0.625rem] font-medium uppercase tracking-[0.06em] text-(--ui-text-quaternary)">
                {reply.author === "nemesis" ? "Nemesis" : "You"}
              </p>
              <p className="mt-0.5 whitespace-pre-wrap text-[0.8125rem] leading-relaxed text-foreground">{reply.body}</p>
            </div>
          ))}
        </div>
      )}

      {asking && (
        <p className="mt-2 text-[0.6875rem] text-(--ui-text-tertiary)" data-testid="reader-comment-asking">
          Nemesis is reading that spot…
        </p>
      )}
      {failed && !asking && (
        <p className="mt-2 text-[0.6875rem] text-(--ui-danger)">That did not come back. Try again.</p>
      )}

      {/* 🔴 ONE FIELD, WHICH IS BOTH "ask this" AND "follow that up". A separate first-ask button and
          follow-up box would be two controls for one thing; the note above is the first question
          already, so an empty field asks about the note and a filled one asks what it says. */}
      {onAsk && (
        <div className="mt-2 flex items-end gap-1.5">
          <textarea
            className="max-h-24 min-h-[30px] w-full flex-1 resize-none rounded-[8px] border border-(--ui-stroke-tertiary) bg-(--ui-bg-base) px-2 py-1.5 text-[0.75rem] leading-relaxed text-foreground outline-none placeholder:text-(--ui-text-quaternary) focus:border-(--ui-stroke-secondary)"
            data-testid="reader-comment-ask-field"
            disabled={asking}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void ask();
              }
            }}
            placeholder={replies.length > 0 ? "Ask a follow-up…" : "Ask Nemesis about this spot…"}
            rows={1}
            value={question}
          />
          <button
            aria-label="Ask Nemesis about this spot"
            className="shrink-0 rounded-[8px] bg-(--ui-action) px-2.5 py-1.5 text-[0.6875rem] font-medium text-(--ui-action-glyph) transition-opacity hover:opacity-90 disabled:opacity-40"
            data-testid="reader-comment-ask"
            disabled={asking}
            onClick={() => void ask()}
            type="button"
          >
            Ask
          </button>
        </div>
      )}

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
