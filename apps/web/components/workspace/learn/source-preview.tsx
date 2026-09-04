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

import type { AnnotationNote } from "@/lib/learn/annotation-note";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Codicon } from "@/components/desktop-ui/codicon";
import { useWorkspacePreview } from "@/components/workspace/preview-context";
import { DocumentReader } from "@/components/workspace/reader/document-reader";
import { useDeclareSidePanel } from "@/components/workspace/shell/side-panel";
import type { CanvasSource } from "@/lib/learn/canvas-model";
import { fileMark } from "@/lib/learn/kind-mark";
import { readerSourceFromLibrary } from "@/lib/reader/reader-source";
import type { ReaderSource } from "@/lib/reader/reader-source";
import { cn } from "@/lib/utils";
import { loadLibrarySource } from "@/lib/workspace/library-sources";

import { DockTabs } from "./dock-tabs";
import type { DockItem } from "./document-dock";
import { CHROME } from "./reader-chrome";
import { useDockWidth } from "./use-dock-width";

type PreviewState =
  | { readonly kind: "loading" }
  | { readonly kind: "unavailable"; readonly reason: string }
  | { readonly kind: "ready"; readonly source: ReaderSource };

export function SourcePreview({
  activeId,
  activeKey,
  items,
  onClose,
  onCloseKey,
  onCloseTab,
  onSelect,
  onSelectKey,
  onSendToChat,
  open,
  uid,
}: {
  /**
   * Which open DOCUMENT is in front, or null.
   *
   * 🔴 NULL ALSO MEANS "AN ARTIFACT IS IN FRONT", AND THAT IS HOW ONE PANEL SHOWS AT A TIME. This
   * component renders nothing without an active document, so the artifact panel taking the front
   * stands it down while every open document stays mounted behind — see `DocumentDock.activeId`.
   */
  activeId: string | null;
  /** The whole sidebar's front tab, documents and artifacts alike. For the strip. */
  activeKey: string | null;
  /** Everything open in the sidebar, for the strip. A superset of `open`. */
  items: readonly DockItem[];
  onClose: () => void;
  /** Close any tab, by dock key. The strip's per-tab ✕. */
  onCloseKey: (key: string) => void;
  onCloseTab: (id: string) => void;
  onSelect: (id: string) => void;
  /** Bring any tab to the front, by dock key. The strip's press. */
  onSelectKey: (key: string) => void;
  /**
   * Fires when the learner runs one of the reader's actions on a highlighted passage or a marked
   * area: the message it produced, and any material that exists nowhere else (the cut-out picture).
   *
   * Absent means the reader hides its action bar entirely rather than offering controls with
   * nowhere to send — see `document-reader.tsx`.
   */
  onSendToChat?: (prompt: string, files: File[], notes?: readonly AnnotationNote[], said?: string) => void;
  /** Every document the learner has open, oldest first. Empty closes the panel. */
  open: readonly CanvasSource[];
  uid: string | null;
}) {
  /**
   * One state PER OPEN DOCUMENT, not one for whichever is in front.
   *
   * 🔴🔴 THE REMOUNT WAS THE SLOWNESS (owner, 2026-09-01: *"slow (it has to load each pdf
   * continually)"*). A single state plus a reader keyed by source meant every tab switch threw the
   * previous reader away and built a new one: the file fetched again, re-parsed by pdf.js,
   * re-rendered from page one, with the scroll position, zoom and search going with it.
   *
   * 🔴 AND THE KEYING WAS RIGHT FOR THE REASON IT GAVE. One reader handed a different document
   * would carry the previous one's zoom, mode and outline into it. Keeping a reader PER document
   * answers both: each keeps its own state because each IS its own instance, and none is thrown
   * away. Bounded by however many the learner opened, which is a handful.
   */
  const [states, setStates] = useState<Readonly<Record<string, PreviewState>>>({});

  /**
   * How many documents may be rendered at once.
   *
   * 🔴🔴 THREE, AND THE NUMBER IS A TRUCE BETWEEN TWO MEASURED FACTS. Rendering only the front tab
   * meant every switch remounted the reader — fetch, re-parse, re-render from page one, scroll and
   * zoom lost (owner, 2026-09-01: *"slow (it has to load each pdf continually)"*). But rendering
   * ALL of them is what the previous design refused for a reason that is still true and still
   * measured: `slides-document-view.tsx` puts a full-size slide at ~20 MB, so six decks alive at
   * once is a seized browser.
   *
   * Three keeps the gesture people actually make — flipping between two documents, occasionally a
   * third — instant, and bounds the worst case at roughly what one deck already costs. The rest
   * remount, exactly as they did before, which is the old behaviour surviving where it was right.
   */
  const MOUNT_LIMIT = 3;
  /** Most recently looked at first. */
  const [recent, setRecent] = useState<readonly string[]>([]);
  useEffect(() => {
    if (!activeId) return;
    setRecent((current) => [activeId, ...current.filter((id) => id !== activeId)].slice(0, MOUNT_LIMIT));
  }, [activeId]);
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

  // 🔴 RESOLVES EACH DOCUMENT ONCE AND NEVER AGAIN. Keyed on the ids so re-running for a newly
  // opened tab does not re-fetch the ones already resolved — which would put the network cost back
  // that keeping them mounted exists to remove.
  // 🔴 ONLY WHAT IS MOUNTED IS FETCHED. Resolving all six would pay the download for documents
  // nothing is going to render, which is the cost this whole change exists to remove.
  const mounted = new Set(recent.slice(0, MOUNT_LIMIT));
  const openIds = open.filter((source) => mounted.has(source.id)).map((source) => source.id).join(",");
  useEffect(() => {
    let live = true;
    for (const source of open) {
      if (states[source.id] || !mounted.has(source.id)) continue;
      const id = source.id;
      const put = (next: PreviewState) => {
        if (live) setStates((current) => ({ ...current, [id]: next }));
      };
      put({ kind: "loading" });
      void (async () => {
        if (!source.librarySourceId) {
          put({
            kind: "unavailable",
            reason:
              "This source wasn't filed to your Library, so the original file isn't kept to view.",
          });
          return;
        }
        const row = await loadLibrarySource(uid, source.librarySourceId, { preview });
        if (!row) {
          put({ kind: "unavailable", reason: "The original file couldn't be reached just now." });
          return;
        }
        // 🔴 THE LIBRARY'S OWN PROJECTION, NOT A SECOND READING OF THE FILENAME.
        // `readerSourceFromLibrary` is what the Library page hands the reader; building a
        // `ReaderSource` by hand here would be a second opinion about what kind a file is, free to
        // disagree with the page next door.
        put({ kind: "ready", source: readerSourceFromLibrary(row) });
      })();
    }
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openIds, preview, uid]);

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

  /**
   * Docked beside the conversation, or filling the window.
   *
   * 🔴 THE ARTIFACT PANEL HAS HAD THIS ALL ALONG AND THE DOCUMENT PANEL HAD NOT (owner,
   * 2026-09-03: the four header controls *"should be in the sidebar always"*). Opening a lecture
   * gave you a column you could drag and nothing that would let you read it whole; opening a study
   * guide gave you both. Same sidebar, two different sets of controls, which is the inconsistency
   * that made it feel like two products.
   */
  const [full, setFull] = useState(false);
  /** Where the front reader draws its own controls. See the header below. */
  const toolbarSlot = useRef<HTMLDivElement | null>(null);

  /**
   * The original file, downloaded.
   *
   * 🔴 THROUGH `resolveUrl`, WHICH MINTS A SHORT-LIVED URL AND IS THE ONLY WAY TO THE BYTES. The
   * reader already calls it to render the document, so nothing new is fetched or stored here — and
   * a link built any other way would either be dead (storage is not public) or permanent (a signed
   * url pasted into a page outlives the session that made it).
   */
  const downloadActive = useCallback(async () => {
    const state = activeId ? states[activeId] : undefined;
    if (state?.kind !== "ready") return;
    const url = await state.source.resolveUrl();
    if (!url) return;
    const link = document.createElement("a");
    link.href = url;
    link.download = state.source.fileName;
    // 🔴 IN THE DOCUMENT, NOT DETACHED. Firefox ignores a click on an anchor that was never in the
    // tree, and the failure is silent — the button simply does nothing.
    document.body.appendChild(link);
    link.click();
    link.remove();
  }, [activeId, states]);

  const canDownload = Boolean(activeId && states[activeId]?.kind === "ready");
  const activeState = activeId ? states[activeId] : undefined;
  const activeFileName = activeState?.kind === "ready" ? activeState.source.fileName : null;

  // 🔴 THE CANVAS IS PUSHED, NOT COVERED — see side-panel.tsx. It is what makes this a sidebar
  // rather than a popup wearing a sidebar's shape. Zero while closed, so nothing is inset.
  // 🔴 FULL SCREEN PUSHES NOTHING: it covers everything, so there is no room to make for it. Same
  // rule the artifact panel follows.
  useDeclareSidePanel(active && !full ? width : 0, dragging);

  if (!active) return null;

  return createPortal(
    <div
      className={cn(
        "fixed z-50 flex flex-col bg-(--ui-bg-elevated)",
        full ? "inset-0" : "inset-y-0 right-0 border-l border-(--ui-stroke-tertiary)",
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
      style={full ? undefined : { width }}
    >
      {/* 🔴 THE GRIP IS ON THE LEFT EDGE, WHICH IS THE EDGE THAT MOVES. 6px wide with a wider
          invisible target either side of it, `col-resize`, and no paint until hover — the same
          restraint every other control on this surface follows. Only while docked: full screen has
          no edge to drag. */}
      {!full && (
      <div
        aria-label="Resize the panel"
        className="absolute inset-y-0 -left-[3px] z-10 w-[6px] cursor-col-resize bg-transparent transition-colors hover:bg-(--ui-action)/40"
        onPointerDown={onDragStart}
        role="separator"
      />
      )}

      {/* 🔴 ONE ROW WHETHER THERE IS ONE DOCUMENT OR SIX. A strip that appears only on the second
          document would move the title the learner is reading, and the single-tab case is exactly
          the header this panel already had.

          🔴🔴 THE CLOSE BUTTON IS OUTSIDE THE SCROLLING STRIP, AND THE FIRST VERSION WAS NOT — found
          on screen with two tabs on a narrowed panel: the tabs are `shrink-0` inside the scroller,
          so they pushed the one control that closes the panel off the right edge and out of reach.
          The strip scrolls inside its own box; the button is its sibling and never moves. */}
      {/* 🔴🔴 TABS GET THEIR OWN ROW, WHICH REVERSES THIS MORNING'S INSTRUCTION AND THE REVERSAL IS
          THE OWNER'S. On 2026-09-03 he asked for *"all the tabs and icons should be on the same
          row"* and for a dropdown instead of a strip, both to buy space. Later the same day he sent
          screenshots of ChatGPT's desktop pane and said *"i want it exactly like this"* — and that
          pane puts tabs alone on top with the name and controls underneath. The earlier instruction
          was about a strip that had to share a row; this is the arrangement that makes a strip work
          at all. It costs 36px, which is the trade he made knowingly. See dock-tabs.tsx. */}
      {items.length > 0 && (
        <DockTabs activeKey={activeKey} items={items} onClose={onCloseKey} onSelect={onSelectKey} />
      )}
      <div className={CHROME.header}>
        {/* The front document's name. Row one already says what is open; this must not repeat it. */}
        <span className={cn(CHROME.crumb, "min-w-0 flex-1 px-[6px]")} title={active?.title ?? ""}>{active?.title ?? ""}</span>

        {/* 🔴🔴 THE READER'S OWN CONTROLS DRAW HERE, IN THIS ROW (owner, 2026-09-03: *"all the tabs
            and icons should be on the same row"*). In dense mode the reader used to render its own
            47px bar directly under this one, carrying the comment toggle and the actions menu — a
            second row of chrome above a document that has little enough height already.

            🔴 A SLOT, NOT A HOIST, AND THE DIFFERENCE IS OWNERSHIP. Comment is a mode of the
            DOCUMENT and the actions menu is built from the reader's own state — the file's folder
            trail, its linked notes, its rotate handler. Lifting them here would move a dozen
            values up two components and leave the reader unable to say what it is doing. Lending
            it a place to draw keeps every decision where it was and costs one ref.

            🔴 ONLY THE FRONT READER IS GIVEN THE SLOT. Every open document stays mounted, so
            handing the slot to all of them would stack five sets of controls in one row. */}
        <div className="flex shrink-0 items-center gap-[4px]" ref={toolbarSlot} />

        {/* 🔴 THE SAME CONTROLS THE ARTIFACT PANEL CARRIES, IN THE SAME ORDER (owner, 2026-09-03:
            they *"should be in the sidebar always"*). One sidebar showing two kinds of thing with
            two different sets of buttons is the inconsistency that made it read as two panels even
            after it became one.

            🔴 COMMENT IS NOT HERE, AND ITS ABSENCE IS DELIBERATE RATHER THAN MISSED. A document's
            comment mode belongs to the READER — it is a mode of the thing being read, owned by
            `document-reader.tsx`, and it already has a control one row below this. Adding a second
            here would be two buttons for one state, which is a worse fault than an uneven header.
            An artifact's comment button is in ITS header because an artifact has no reader row. */}
        <button
          aria-label={`Download ${activeFileName ?? "this document"}`}
          className={cn(CHROME.button, "disabled:opacity-40")}
          disabled={!canDownload}
          onClick={() => void downloadActive()}
          title="Download"
          type="button"
        >
          {/* 🔴 `download`, NOT `desktop-download` — the latter is a MONITOR with an arrow. Same
              glyph the artifact panel uses, for the same action. */}
          <Codicon name="download" size={CHROME.icon} />
        </button>
        <button
          aria-label={full ? "Exit full screen" : "Full screen"}
          className={CHROME.button}
          onClick={() => setFull((current) => !current)}
          title={full ? "Exit full screen" : "Full screen"}
          type="button"
        >
          <Codicon name={full ? "screen-normal" : "screen-full"} size={CHROME.icon} />
        </button>
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

      <div className="relative min-h-0 flex-1 overflow-hidden">
        {/* 🔴🔴 EVERY OPEN DOCUMENT IS MOUNTED; ONLY THE FRONT ONE IS SHOWN. The previous version
            rendered the active source alone, keyed by its id — a clean remount on every tab switch,
            which is exactly the cost the owner reported as *"it has to load each pdf continually"*.
            Hiding instead of unmounting keeps pdf.js's rendered canvases, the scroll position, the
            zoom and the search alive, and each reader still owns its own state because each is
            still its own instance. The reason the key was there is preserved; the remount is not.

            🔴 `hidden` MUST NOT BE `display: none` ON A MOUNTING READER — pdf.js measures the
            container to lay pages out, and a zero-size box makes it render nothing. `invisible` +
            zero height keeps it measurable while taking no room and catching no clicks. */}
        {open.filter((source) => mounted.has(source.id)).map((source) => {
          const state = states[source.id] ?? { kind: "loading" as const };
          const front = source.id === activeId;
          return (
            <div
              aria-hidden={!front}
              className={front ? "h-full" : "pointer-events-none invisible absolute inset-0"}
              key={source.id}
            >
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
              {/* 🔴🔴 `grounded`, BECAUSE THIS PANEL CAN ONLY EVER OPEN A SOURCE THE CANVAS ALREADY
                  HOLDS. The reader's default is to attach its own extracted text to every action,
                  which is right in the Library — that chat has never read the file. Here it would
                  file the same document into the same canvas twice on every "Explain this". Only
                  genuinely new material travels: the cut-out of a marked area.

                  🔴 The action bar appears only because `onSendToChat` is passed. Without it the
                  reader hides the bar rather than offering controls with nowhere to send.

                  🔴 `dense`, because this panel is a column beside a conversation and the full bar
                  carries twelve controls (owner: *"the toolbar is too much"*). Nothing is removed;
                  the page field, zoom and Source/Reading move into the "…" already there. */}
              {state.kind === "ready" && (
                <DocumentReader
                  anchor={{ query: null, unit: lastUnit[source.id] ?? null }}
                  // 🔴 THE DURABLE ID, NOT THE CANVAS-LOCAL ONE. Comments must survive this canvas
                  // and be findable from the Library page, and "s1" means nothing outside this
                  // session — `canvas-model.ts` says so in as many words.
                  commentsDoc={
                    source.librarySourceId
                      ? { preview: preview || uid === null, ref: { id: source.librarySourceId, kind: "source" }, uid }
                      : undefined
                  }
                  dense
                  grounded
                  onSendToChat={onSendToChat}
                  onUnitChange={(unit) => rememberUnit(source.id, unit)}
                  source={state.source}
                  // 🔴 ONLY THE FRONT ONE. Every open document stays mounted, so handing the slot
                  // to all of them would stack a set of controls per document in one row.
                  toolbarSlot={front ? toolbarSlot : undefined}
                  variant="dialog"
                />
              )}
            </div>
          );
        })}
      </div>
    </div>,
    document.body,
  );
}
