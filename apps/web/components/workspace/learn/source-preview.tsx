"use client";

// The documents a learner opened, as a docked reader beside the canvas.
//
// 🔴🔴 IT SHOWS THE REAL DOCUMENT, WHATEVER KIND IT IS — owner, 2026-08-27: *"it still won't let me
// view the attachment I put in, it's a docx, users should be able to view slides, docs, pdf, xlsx,
// etc."*
//
// This file used to render pages ITSELF, through pdf.js, and could therefore only ever show PDFs
// and images. Everything else fell to a sentence apologising for it — which is what he was looking
// at. The product already had renderers for the rest: `DocumentReader` dispatches to
// `DocxDocumentView`, `SlidesDocumentView`, `PdfDocumentView` and `ImageDocumentView`, and has had
// a trimmed `variant="dialog"` for embedding the whole time. It was never mounted here.
//
// So this is now the PANEL and nothing else: it resolves library rows, hands the open one to the
// reader, and owns where the panel sits, how wide it is, and which document is in front.
//
// 🔴 A SIDEBAR, NOT A POPUP (owner, same day). It docks right, pushes the canvas rather than
// covering it, and its width is a drag the learner owns — see `use-dock-width.ts`.
//
// 🔴🔴 SEVERAL DOCUMENTS AT ONCE — owner, 2026-08-28: *"it'd be nice if it could have, like,
// multiple tabs so that they could have different PowerPoints or documents open at the same time."*
// ONLY THE FRONT ONE IS MOUNTED, and that is the whole design rather than an optimisation: a deck
// held in memory costs about 20 MB per full-size slide (`slides-document-view.tsx` measured it), so
// six background tabs rendering quietly is a seized browser. A tab that is not in front is a name
// and a remembered page, which costs nothing and needs no cap.
//
// 🔴 NO OUTSIDE-PRESS CLOSE: a panel owning most of the window must not vanish because somebody
// clicked the conversation next to it. Close button, plus Escape.
//
// 🔴 IT PORTALS, AND THE `data-workspace` STAMP TRAVELS WITH IT. `globals.css` carries
// `button:where(:not([data-workspace] *)) { background: var(--acid) }`, so a subtree moved to
// `document.body` leaves the workspace scope and every button in it goes acid green.

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { Codicon } from "@/components/desktop-ui/codicon";
import { useWorkspacePreview } from "@/components/workspace/preview-context";
import { DocumentReader } from "@/components/workspace/reader/document-reader";
import { useDeclareSidePanel } from "@/components/workspace/shell/side-panel";
import type { CanvasSource } from "@/lib/learn/canvas-model";
import { readerSourceFromLibrary } from "@/lib/reader/reader-source";
import type { ReaderSource } from "@/lib/reader/reader-source";
import { cn } from "@/lib/utils";
import { loadLibrarySource } from "@/lib/workspace/library-sources";

import { CHROME } from "./reader-chrome";
import { useDockWidth } from "./use-dock-width";

type PreviewState =
  | { readonly kind: "loading" }
  | { readonly kind: "unavailable"; readonly reason: string }
  | { readonly kind: "ready"; readonly source: ReaderSource };

export function SourcePreview({
  activeId,
  onClose,
  onCloseTab,
  onSelect,
  onSendToChat,
  open,
  uid,
}: {
  /** Which open document is in front. Null closes the panel. */
  activeId: string | null;
  onClose: () => void;
  onCloseTab: (id: string) => void;
  onSelect: (id: string) => void;
  /**
   * Fires when the learner runs one of the reader's actions on a highlighted passage or a marked
   * area: the message it produced, and any material that exists nowhere else (the cut-out picture).
   *
   * Absent means the reader hides its action bar entirely rather than offering controls with
   * nowhere to send — see `document-reader.tsx`.
   */
  onSendToChat?: (prompt: string, files: File[]) => void;
  /** Every document the learner has open, oldest first. Empty closes the panel. */
  open: readonly CanvasSource[];
  uid: string | null;
}) {
  const [state, setState] = useState<PreviewState>({ kind: "loading" });
  const { dragging, onDragStart, width } = useDockWidth();
  // 🔴 THE HARNESS MAKES NO NETWORK CALLS — `preview-context.tsx` says so in as many words, and this
  // panel was quietly breaking it: the dev preview signs a mock session, so `uid` is set, so the row
  // lookup went to the database, found nothing under a fixture id, and the one place this panel's
  // design is reviewed showed "the original file couldn't be reached" instead of a document.
  const preview = useWorkspacePreview() !== null;
  /**
   * The page each open document was last on.
   *
   * 🔴 IT IS WHAT MAKES A TAB A TAB. Only the front document is mounted, so coming back to one is a
   * fresh open; without this, a learner who marked something on page 40, checked another file and
   * came back would land on page 1 with no idea why. Kept here rather than in the reader because
   * the reader is the thing being unmounted.
   */
  const [lastUnit, setLastUnit] = useState<Readonly<Record<string, number>>>(
    {},
  );

  const active = open.find((source) => source.id === activeId) ?? null;

  useEffect(() => {
    if (!active) return;
    let live = true;
    setState({ kind: "loading" });
    void (async () => {
      if (!active.librarySourceId) {
        setState({
          kind: "unavailable",
          reason:
            "This source wasn't filed to your Library, so the original file isn't kept to view.",
        });
        return;
      }
      const row = await loadLibrarySource(uid, active.librarySourceId, {
        preview,
      });
      if (!live) return;
      if (!row) {
        setState({
          kind: "unavailable",
          reason: "The original file couldn't be reached just now.",
        });
        return;
      }
      // 🔴 THE LIBRARY'S OWN PROJECTION, NOT A SECOND READING OF THE FILENAME. `readerSourceFromLibrary`
      // is what the Library page hands the reader; building a `ReaderSource` by hand here would be a
      // second opinion about what kind a file is, free to disagree with the page next door.
      setState({ kind: "ready", source: readerSourceFromLibrary(row) });
    })();
    return () => {
      live = false;
    };
  }, [active, preview, uid]);

  // Escape closes, same as every transient surface on the canvas.
  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [active, onClose]);

  const rememberUnit = useCallback(
    (id: string, unit: number) =>
      setLastUnit((current) =>
        current[id] === unit ? current : { ...current, [id]: unit },
      ),
    [],
  );

  // 🔴 THE CANVAS IS PUSHED, NOT COVERED — see side-panel.tsx. It is what makes this a sidebar
  // rather than a popup wearing a sidebar's shape. Zero while closed, so nothing is inset.
  useDeclareSidePanel(active ? width : 0, dragging);

  if (!active) return null;

  return createPortal(
    <div
      className={cn(
        "fixed inset-y-0 right-0 z-50 flex flex-col border-l border-(--ui-stroke-tertiary) bg-(--ui-bg-elevated)",
        // 🔴 THE OPENING SLIDE — owner, 2026-08-27: *"make sure to add smooth animation to the
        // sidebar when sources are open."* `.reader-dock-in` slides it in from the right edge when
        // the element is created, on the shared `--pane-slide` clock, and never again.
        // 🔴🔴 UNCONDITIONAL, AND IT USED TO BE `!dragging &&` — WHICH REPLAYED THE ENTRANCE ON
        // EVERY RESIZE. Owner, 2026-09-01: *"there also seems to be flickering."* Removing a class
        // and putting it back is how you restart a CSS animation, so releasing the drag handle made
        // the panel jump to `translateX(4%)` at opacity 0 and slide in again. Watched live on
        // /dev-preview/exports: the class went true → false on pointerdown → true on pointerup.
        // The gate was guarding against nothing: this keyframe moves `transform` and `opacity`, not
        // width, and it has finished long before anybody can reach the handle.
        "reader-dock-in",
      )}
      data-workspace
      role="dialog"
      style={{ width }}
    >
      {/* 🔴 THE GRIP IS ON THE LEFT EDGE, WHICH IS THE EDGE THAT MOVES. 6px wide with a wider
          invisible target either side of it, `col-resize`, and no paint until hover — the same
          restraint every other control on this surface follows. */}
      <div
        aria-label="Resize the panel"
        className="absolute inset-y-0 -left-[3px] z-10 w-[6px] cursor-col-resize bg-transparent transition-colors hover:bg-(--ui-action)/40"
        onPointerDown={onDragStart}
        role="separator"
      />

      {/* 🔴 ONE ROW WHETHER THERE IS ONE DOCUMENT OR SIX. A strip that appears only on the second
          document would move the title the learner is reading, and the single-tab case is exactly
          the header this panel already had.

          🔴🔴 THE CLOSE BUTTON IS OUTSIDE THE SCROLLING STRIP, AND THE FIRST VERSION WAS NOT — found
          on screen with two tabs on a narrowed panel: the tabs are `shrink-0` inside the scroller,
          so they pushed the one control that closes the panel off the right edge and out of reach.
          The strip scrolls inside its own box; the button is its sibling and never moves. */}
      <div className={CHROME.header}>
        <div
          className="flex min-w-0 flex-1 items-center gap-[2px] overflow-x-auto"
          role="tablist"
        >
          {open.map((source) => {
            const current = source.id === activeId;
            return (
              <div
                className={cn(
                  "flex min-w-0 max-w-[220px] shrink-0 items-center gap-[6px] rounded-[8px] pl-[8px] pr-[4px] transition-colors",
                  current
                    ? "bg-(--ui-bg-tertiary)"
                    : "hover:bg-(--ui-bg-tertiary)/60",
                )}
                key={source.id}
              >
                <button
                  aria-selected={current}
                  className="flex min-w-0 items-center gap-[6px] py-[7px]"
                  onClick={() => onSelect(source.id)}
                  role="tab"
                  title={source.title}
                  type="button"
                >
                  <Codicon
                    className="shrink-0 text-(--ui-text-tertiary)"
                    name="file"
                    size="14px"
                  />
                  <span
                    className={cn(
                      CHROME.crumb,
                      current ? undefined : "text-(--ui-text-tertiary)",
                    )}
                  >
                    {source.title}
                  </span>
                </button>
                <button
                  aria-label={`Close ${source.title}`}
                  className="grid size-[20px] shrink-0 place-items-center rounded-[5px] text-(--ui-text-quaternary) transition-colors hover:bg-(--ui-bg-elevated) hover:text-(--ui-text-primary)"
                  onClick={() => onCloseTab(source.id)}
                  type="button"
                >
                  <Codicon name="close" size="12px" />
                </button>
              </div>
            );
          })}
        </div>

        <button
          aria-label="Close preview"
          className={cn(
            CHROME.button,
            "text-(--ui-text-quaternary) hover:text-(--ui-text-primary)",
          )}
          onClick={onClose}
          title="Close preview"
          type="button"
        >
          <Codicon name="close" size={CHROME.icon} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {state.kind === "loading" && (
          <p className="py-8 text-center text-[length:var(--canvas-text-meta)] text-(--ui-text-quaternary)">
            Opening the document…
          </p>
        )}
        {state.kind === "unavailable" && (
          <p className="py-8 text-center text-[length:var(--canvas-text-small)] text-(--ui-text-tertiary)">
            {state.reason}
          </p>
        )}
        {/* 🔴🔴 `grounded`, BECAUSE THIS PANEL CAN ONLY EVER OPEN A SOURCE THE CANVAS ALREADY HOLDS.
            The reader's default is to attach its own extracted text to every action, which is right
            in the Library — that chat has never read the file. Here it would file the same document
            into the same canvas twice on every "Explain this". Only genuinely new material travels:
            the cut-out of a marked area. See `DocumentReader`'s prop.

            🔴 The action bar appears only because `onSendToChat` is passed. Without it the reader
            hides the bar rather than offering controls with nowhere to send.

            🔴 KEYED BY THE SOURCE, so switching tabs is a clean remount rather than one reader
            being handed a different document with the previous one's zoom, mode and outline still
            in its state. The remembered page comes back in as an anchor, which is the same door a
            citation link uses. */}
        {state.kind === "ready" && (
          <DocumentReader
            anchor={{ query: null, unit: lastUnit[active.id] ?? null }}
            // 🔴 THE DURABLE ID, NOT THE CANVAS-LOCAL ONE. Comments must survive this canvas and be
            // findable from the Library page, and "s1" means nothing outside this session —
            // `canvas-model.ts` says so in as many words.
            commentsDoc={
              active.librarySourceId
                ? { preview: preview || uid === null, ref: { id: active.librarySourceId, kind: "source" }, uid }
                : undefined
            }
            grounded
            key={active.id}
            onSendToChat={onSendToChat}
            onUnitChange={(unit) => rememberUnit(active.id, unit)}
            source={state.source}
            variant="dialog"
          />
        )}
      </div>
    </div>,
    document.body,
  );
}
