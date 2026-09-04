"use client";

// The reader's own controls. Every one of these exists because the browser's
// PDF toolbar is never shown — filename, course, mode, search, page counter,
// zoom, fit and the overflow menu are ours, so they look the same in every
// browser and can talk to the rest of Nemesis.
//
// The LEFT edge of the screen belongs to the Library sidebar (owner
// 2026-08-05), so the reader keeps no control there: its own contents rail is
// on the RIGHT, and everything that used to sit in a right-hand panel — the AI
// actions, the notes made from this file, where it is filed — lives in the "…"
// menu instead. One rail, one menu, and the Library tree still reachable.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { IconChevronLeft } from "@tabler/icons-react";

import { Codicon } from "@/components/desktop-ui/codicon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/desktop-ui/dropdown-menu";
import { SegmentedControl } from "@/components/desktop-ui/segmented-control";
import { READER_ACTIONS, type ReaderActionId } from "@/lib/reader/reader-actions";
import { folderTrail } from "@/lib/reader/reader-source";
import { formatZoom } from "@/lib/reader/reader-zoom";
import { cn } from "@/lib/utils";

export interface LinkedNote {
  id: string;
  title: string;
  path: string;
}

export type ReaderMode = "source" | "reading";

export interface ReaderTopBarProps {
  fileName: string;
  course: string | null;
  meta: string;
  /** One sentence naming what could not be read, or null when the whole
   *  document was. Built by the caller so this bar stays presentational. */
  coverageNote?: string | null;
  mode: ReaderMode;
  onModeChange: (mode: ReaderMode) => void;
  modeAvailable: boolean;
  query: string;
  onQueryChange: (query: string) => void;
  matchCount: number;
  currentMatch: number;
  onStepMatch: (direction: 1 | -1) => void;
  unit: number;
  unitCount: number;
  unitLabel: string;
  onUnitChange: (unit: number) => void;
  scale: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitWidth: () => void;
  fitActive: boolean;
  showZoom: boolean;
  onRotate?: () => void;
  onDownload: () => void;
  onOpenOriginal: () => void;
  onBack?: () => void;
  /**
   * The canvas pane's toolbar, cut to what a reader beside a conversation needs.
   *
   * 🔴 THE PANE IS A COLUMN AND THE FULL BAR HAS TWELVE CONTROLS. Owner, 2026-09-01: *"the current
   * viewer is too clunky (the toolbar is too much)"*, then, item by item: no search, no outline, and
   * the "…" carries *"outdated actions that arent necessary"*. Dense drops the file name (the TAB
   * is the name), the back button (the tab has a close), search, the contents rail, the page field,
   * the zoom cluster, the Source/Reading switch, and the five ask-about-this menu items.
   *
   * 🔴 WHAT SURVIVES IS THE FILE ITSELF: comment, download, open in a new tab, rotate. Those are
   * things you do TO the document and have nowhere else to live. Everything removed is either said
   * another way on this surface or is a slower version of typing into the conversation beside it.
   */
  dense?: boolean;
  /**
   * A host-provided row to draw into, instead of this bar's own `<header>`.
   *
   * 🔴 IT REPLACES THE BAR, IT DOES NOT ADD TO IT. When the docked panel lends its header row, this
   * component paints the same controls through a portal and renders no bar of its own — otherwise
   * the controls would appear twice, once in each row, which is worse than the second row it is
   * there to remove.
   */
  toolbarSlot?: React.RefObject<HTMLElement | null>;
  /** The reader's own contents rail, on the right. Omitted for file types that
   *  have nothing to list (a single image). */
  railOpen: boolean;
  onToggleRail?: () => void;
  /** Marking mode: drag a box on the page instead of selecting text. Absent for documents where a
   *  box cannot be cut out — a slide is a RECONSTRUCTION, so a crop of one would be a picture of
   *  our layout rather than of the deck. */
  commenting?: boolean;
  onToggleCommenting?: () => void;
  /**
   * The pinned comments as a list, in the pane.
   *
   * 🔴 ABSENT UNLESS THERE IS SOMETHING TO LIST. The full reader reaches its comments through the
   * contents rail's own tab; the pane has no rail toggle (the outline was cut from it, owner
   * 2026-09-01), so the reader lends it this one control instead, and only once a note exists. A
   * header that grows a button for a list with nothing in it is the furniture the pane keeps
   * shedding.
   */
  commentCount?: number;
  commentListOpen?: boolean;
  onToggleCommentList?: () => void;
  /** What an AI action would act on right now, in words. */
  actionScope: string;
  onAction: (action: ReaderActionId) => void;
  actionsDisabled: boolean;
  linkedNotes: readonly LinkedNote[];
  onOpenNote?: (path: string) => void;
  folderPath: string;
}

export function ReaderTopBar(props: ReaderTopBarProps) {
  const {
    fileName,
    course,
    meta,
    coverageNote = null,
    mode,
    onModeChange,
    modeAvailable,
    query,
    onQueryChange,
    matchCount,
    currentMatch,
    onStepMatch,
    unit,
    unitCount,
    unitLabel,
    onUnitChange,
    scale,
    onZoomIn,
    onZoomOut,
    onFitWidth,
    fitActive,
    showZoom,
    onRotate,
    onDownload,
    onOpenOriginal,
    onBack,
    dense = false,
    railOpen,
    onToggleRail,
    commenting = false,
    onToggleCommenting,
    commentCount = 0,
    commentListOpen = false,
    onToggleCommentList,
    actionScope,
    onAction,
    actionsDisabled,
    linkedNotes,
    onOpenNote,
    folderPath,
    toolbarSlot,
  } = props;

  const trail = folderTrail(folderPath);

  /**
   * 🔴 THE SLOT IS A REF, SO THE FIRST RENDER HAS NOTHING TO PORTAL INTO. `ref.current` is null
   * until the host's own element is committed, and reading it during render would silently draw
   * nothing on the pass that matters. One state flip after mount is what makes the target
   * available, and it is why this is not simply `createPortal(bar, slot.current)`.
   */
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => setSlot(toolbarSlot?.current ?? null), [toolbarSlot]);

  const bar = (
    <>
      {onBack && !dense && (
        <button
          aria-label="Back to Library"
          className="grid size-7 shrink-0 place-items-center rounded-md text-(--ui-text-tertiary) hover:bg-(--ui-bg-tertiary) hover:text-foreground"
          onClick={onBack}
          title="Back to Library"
          type="button"
        >
          <IconChevronLeft size={16} />
        </button>
      )}

      <div className={cn("nemesis-reader-title mr-auto flex min-w-0 shrink flex-col leading-tight", dense && "sr-only")}>
        <h1 className="truncate text-[0.8125rem] font-semibold text-foreground" title={fileName}>
          {fileName}
        </h1>
        <p className="truncate text-[0.6875rem] text-(--ui-text-tertiary)">{course ? `${course} · ${meta}` : meta}</p>
        {coverageNote && (
          // Not truncated and not muted into the metadata line: this is the one
          // fact on this bar that changes what the document can be trusted for.
          <p
            className="text-[0.6875rem] text-(--ui-text-secondary)"
            data-testid="reader-coverage-note"
            role="status"
          >
            {coverageNote}
          </p>
        )}
      </div>

      {modeAvailable && !dense && (
        <SegmentedControl
          className="shrink-0"
          onChange={onModeChange}
          options={[
            { id: "source", label: "Source" },
            { id: "reading", label: "Reading" },
          ]}
          value={mode}
        />
      )}

      {/* 🔴 NO SEARCH IN THE PANE (owner, 2026-09-01: *"remove the search magnifying glass icon"*).
          It was collapsed to a magnifier first; he asked for it gone. A reader beside a
          conversation is scanned, not searched — the conversation is where you ask. It stays in
          full on the standalone reader, where a 47-page lecture is the whole screen. */}
      {!dense && (
      <div className="flex shrink-0 items-center gap-1 rounded-lg border border-(--ui-stroke-tertiary) bg-(--ui-bg-elevated) px-2 py-1">
        <Codicon className="text-(--ui-text-quaternary)" name="search" size="0.75rem" />
        <input
          aria-label={`Search this ${unitLabel === "image" ? "image" : "document"}`}
          className="nemesis-reader-search w-24 bg-transparent text-[0.75rem] text-foreground outline-none placeholder:text-(--ui-text-quaternary) focus:w-40"
          data-testid="reader-search-input"
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            onStepMatch(event.shiftKey ? -1 : 1);
          }}
          placeholder="Search"
          type="search"
          value={query}
        />
        {query.trim().length > 0 && (
          <>
            <span className="tabular-nums text-[0.6875rem] text-(--ui-text-tertiary)" data-testid="reader-match-count">
              {matchCount === 0 ? "0" : `${currentMatch + 1}/${matchCount}`}
            </span>
            <button
              aria-label="Previous match"
              className="grid size-5 place-items-center rounded text-(--ui-text-tertiary) hover:bg-(--ui-bg-tertiary) hover:text-foreground disabled:opacity-40"
              disabled={matchCount === 0}
              onClick={() => onStepMatch(-1)}
              type="button"
            >
              <Codicon name="chevron-up" size="0.75rem" />
            </button>
            <button
              aria-label="Next match"
              className="grid size-5 place-items-center rounded text-(--ui-text-tertiary) hover:bg-(--ui-bg-tertiary) hover:text-foreground disabled:opacity-40"
              disabled={matchCount === 0}
              onClick={() => onStepMatch(1)}
              type="button"
            >
              <Codicon name="chevron-down" size="0.75rem" />
            </button>
          </>
        )}
      </div>
      )}

      {unitCount > 1 && !dense && (
        <div className="nemesis-reader-counter flex shrink-0 items-center gap-1 text-[0.75rem] text-(--ui-text-tertiary)">
          <input
            aria-label={`${unitLabel} number`}
            className="w-9 rounded border border-(--ui-stroke-tertiary) bg-(--ui-bg-elevated) px-1 py-0.5 text-center tabular-nums text-foreground outline-none focus:border-(--ui-stroke-secondary)"
            data-testid="reader-unit-input"
            inputMode="numeric"
            onChange={(event) => {
              const next = Number.parseInt(event.target.value, 10);
              if (Number.isInteger(next) && next >= 1 && next <= unitCount) onUnitChange(next);
            }}
            value={unit}
          />
          <span className="tabular-nums" data-testid="reader-unit-count">
            / {unitCount}
          </span>
        </div>
      )}

      {showZoom && !dense && (
        <div className="nemesis-reader-zoom flex shrink-0 items-center gap-0.5">
          <button
            aria-label="Zoom out"
            className="grid size-7 place-items-center rounded-md text-(--ui-text-tertiary) hover:bg-(--ui-bg-tertiary) hover:text-foreground"
            onClick={onZoomOut}
            type="button"
          >
            <Codicon name="zoom-out" size="0.85rem" />
          </button>
          <span className="min-w-11 text-center tabular-nums text-[0.75rem] text-(--ui-text-secondary)" data-testid="reader-zoom">
            {formatZoom(scale)}
          </span>
          <button
            aria-label="Zoom in"
            className="grid size-7 place-items-center rounded-md text-(--ui-text-tertiary) hover:bg-(--ui-bg-tertiary) hover:text-foreground"
            onClick={onZoomIn}
            type="button"
          >
            <Codicon name="zoom-in" size="0.85rem" />
          </button>
          <button
            aria-label="Fit to width"
            aria-pressed={fitActive}
            className={cn(
              "grid size-7 place-items-center rounded-md hover:bg-(--ui-bg-tertiary)",
              fitActive ? "bg-(--ui-bg-tertiary) text-foreground" : "text-(--ui-text-tertiary) hover:text-foreground",
            )}
            onClick={onFitWidth}
            title="Fit to width"
            type="button"
          >
            <Codicon name="screen-normal" size="0.85rem" />
          </button>
        </div>
      )}

      {onToggleCommenting && (
        // 🔴 A MODE, NOT A MODIFIER KEY. The document's drag already means text selection; a comment
        // needs the same drag. One drag cannot mean two things, so the learner chooses which the
        // page is doing — the same argument the old mark-an-area toggle made, absorbed here.
        // 🔴🔴 IT GROWS INTO ITS OWN LABEL, AND THAT IS READ OFF THE REFERENCE RATHER THAN INVENTED.
        // Owner, 2026-09-03: *"i want a match 1 to 1, not an estimate."* ChatGPT's desktop app is
        // Electron, so its component source is on disk; `annotation-mode-button-*.js` inside
        // `app.asar` says exactly this. Off, the control is icon-only and square. On, it widens and
        // a label slides out of zero width beside the icon. Both halves animate on their own
        // property list, and both stand still under `prefers-reduced-motion`.
        //
        // 🔴 THE LABEL IS THE STATE, WHICH IS WHY THIS IS NOT DECORATION. A square button that only
        // changes colour says "something is on" and leaves the learner to work out what; the word
        // "Annotating" says which mode the document's drag is in, at the moment it stops meaning
        // text selection. That is the one thing the old toggle could not tell anyone.
        <button
          aria-label={commenting ? "Stop annotating" : "Annotate the document"}
          aria-pressed={commenting}
          className={cn(
            // 🔴 EXPLICIT PIXELS, MEASURED 2026-09-04. This bar PORTALS its controls into the pane's
            // header, so they sit beside CHROME.button, which is 28px. `h-7` is 1.75rem and this
            // app sets `html { font-size: 112.5% }`, so it rendered 31.5px — a row of controls in
            // two sizes, and the taller one setting the band's height at 39.5px instead of 36.
            // The same trap `artifact-chrome.test.ts` was written for, one component over.
            "ease-basic flex h-[28px] shrink-0 items-center overflow-hidden rounded-md",
            "transition-[max-width,padding,background-color,color] duration-300 motion-reduce:transition-none",
            // 🔴 A TINT, NOT A FILL, AND IT IS THEIRS. Read out of the reference's own bundle on
            // 2026-09-04: the on state is `color-mix(in srgb, surface 90%, blue 10%)` with the
            // accent kept for the TEXT, going to 15% on hover. A solid accent block is the loudest
            // thing in a header whose whole job is to stay quiet, and the owner's word for what he
            // wants here was "minimalist". The mode still reads as on at a glance: the pill has
            // grown a word, which is a bigger change than any colour.
            commenting
              ? "max-w-40 justify-start px-[7px] text-(--ui-action) [background-color:color-mix(in_srgb,var(--ui-bg-elevated)_90%,var(--ui-action)_10%)] hover:[background-color:color-mix(in_srgb,var(--ui-bg-elevated)_85%,var(--ui-action)_15%)]"
              : "max-w-[28px] min-w-[28px] justify-center px-0 text-(--ui-text-tertiary) hover:bg-(--ui-bg-tertiary) hover:text-foreground",
          )}
          data-testid="reader-comment-mode"
          onClick={onToggleCommenting}
          title={commenting ? "Annotating: click a spot or drag a box. Turn off to select text again." : "Annotate the document"}
          type="button"
        >
          <Codicon className="shrink-0" name="comment" size="18px" />
          {/* 🔴 ALWAYS IN THE DOM, WIDTH-ANIMATED TO NOTHING — never conditionally rendered. A label
              that mounts on activation cannot animate out of zero width, so the button would jump
              to its full size in one frame, which is the artefact the reference's own transition
              list exists to avoid. */}
          <span
            className={cn(
              "ease-basic min-w-0 overflow-hidden whitespace-nowrap text-[length:var(--canvas-text-meta)] leading-[20px]",
              "transition-[max-width,opacity,margin-inline-start] duration-300 motion-reduce:transition-none",
              commenting ? "ms-[5px] max-w-32 opacity-100" : "ms-0 max-w-0 opacity-0",
            )}
          >
            Annotating
          </span>
        </button>
      )}

      {onToggleCommentList && (
        // 🔴 THE LIST OF WHAT IS PINNED, DRAWN ONLY WHILE SOMETHING IS. The count is OPEN comments,
        // the same number the rail's own tab carries: it answers "is anything still pinned here?",
        // and a resolved note is history rather than a number to wear in the chrome.
        <button
          aria-label={commentListOpen ? "Hide the comments" : "Show the comments pinned on this document"}
          aria-pressed={commentListOpen}
          className={cn(
            "flex h-[28px] shrink-0 items-center gap-[4px] rounded-md px-[6px] text-[length:var(--canvas-text-meta)] leading-[20px] tabular-nums",
            commentListOpen ? "bg-(--ui-bg-tertiary) text-foreground" : "text-(--ui-text-tertiary) hover:bg-(--ui-bg-tertiary) hover:text-foreground",
          )}
          data-testid="reader-comment-list-toggle"
          onClick={onToggleCommentList}
          title={commentListOpen ? "Hide the comments" : "Show the comments pinned on this document"}
          type="button"
        >
          <Codicon className="shrink-0" name="comment-discussion" size="18px" />
          {commentCount}
        </button>
      )}

      {onToggleRail && !dense && (
        <button
          aria-label={railOpen ? "Hide contents" : "Show contents"}
          aria-pressed={railOpen}
          className={cn(
            "grid size-7 shrink-0 place-items-center rounded-md hover:bg-(--ui-bg-tertiary)",
            railOpen ? "text-foreground" : "text-(--ui-text-tertiary)",
          )}
          onClick={onToggleRail}
          title={railOpen ? "Hide contents" : "Show contents"}
          type="button"
        >
          <Codicon name="layout-sidebar-right" size="0.9rem" />
        </button>
      )}

      {/* 🔴 NO "…" IN THE SIDEBAR (owner, 2026-09-03: *"remove the three dots icon from the sidebar
          because that's redundant and it's not needed"*) — the second time he has cut this menu,
          after 2026-08-26's *"contains outdated actions that arent necessary"*, which is what moved
          the AI actions onto a highlight in the first place.
          🔴 THE GATE IS `toolbarSlot`, WHICH MEANS "I AM DRAWING INSIDE SOMEONE ELSE'S HEADER", not
          `dense`. The full Library reader keeps the menu: there the file's folder trail, its linked
          notes and "open in a new tab" have nowhere else to live. In the panel they do — Download
          and Full screen are buttons in that header now, which is what made this redundant.
          What genuinely goes with it there: rotate, on an image. Named rather than left to be
          discovered as missing. */}
      {!toolbarSlot && (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            aria-label="Actions and details"
            className="grid size-7 shrink-0 place-items-center rounded-md text-(--ui-text-tertiary) hover:bg-(--ui-bg-tertiary) hover:text-foreground"
            title="Actions and details"
            type="button"
          >
            <Codicon name="ellipsis" size="0.9rem" />
          </button>
        </DropdownMenuTrigger>
        {/* Everything that used to be a right-hand panel. A menu rather than a
            rail because the left edge is the Library's and the right edge is
            the document's contents — and because these are things you DO once,
            not things you read alongside the page. */}
        <DropdownMenuContent align="end" className="max-h-[70vh] w-72 overflow-y-auto">
          {/* 🔴 THE FIVE ASK-ABOUT-THIS ACTIONS ARE GONE FROM THE PANE. Same set cut from the
              highlight bar in #1015, named again here (owner, 2026-09-01: *"the three dots icon
              contains outdated actions that arent necessary"*). Highlighting leaves a comment now,
              and the conversation is one column to the left — a menu that fires a canned prompt is
              a slower way to type what you were going to type anyway. The standalone reader keeps
              them, because there the chat is not on screen. */}
          {!dense && (
            <>
              <DropdownMenuLabel className="font-normal text-(--ui-text-tertiary)">
                Ask Nemesis about <span className="text-(--ui-text-secondary)">{actionScope}</span>
              </DropdownMenuLabel>
              {READER_ACTIONS.map((action) => (
                <DropdownMenuItem disabled={actionsDisabled} key={action.id} onSelect={() => onAction(action.id)}>
                  <Codicon name={action.icon} size="0.8rem" /> {action.label}
                </DropdownMenuItem>
              ))}
            </>
          )}

          {!dense && linkedNotes.length > 0 && onOpenNote && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="font-normal text-(--ui-text-tertiary)">Notes from this file</DropdownMenuLabel>
              {linkedNotes.map((note) => (
                <DropdownMenuItem key={note.id} onSelect={() => onOpenNote(note.path)}>
                  <Codicon name="note" size="0.8rem" /> <span className="truncate">{note.title}</span>
                </DropdownMenuItem>
              ))}
            </>
          )}

          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onDownload}>
            <Codicon name="cloud-download" size="0.8rem" /> Download the original
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onOpenOriginal}>
            <Codicon name="link-external" size="0.8rem" /> Open in a new tab
          </DropdownMenuItem>
          {onRotate && (
            <DropdownMenuItem onSelect={onRotate}>
              <Codicon name="debug-restart" size="0.8rem" /> Rotate
            </DropdownMenuItem>
          )}

          <DropdownMenuSeparator />
          <DropdownMenuLabel className="font-normal text-(--ui-text-tertiary)">
            {trail.length > 0 ? trail.join(" › ") : "Filed at the Library root"}
            <span className="mt-0.5 block text-(--ui-text-quaternary)">{meta}</span>
          </DropdownMenuLabel>
        </DropdownMenuContent>
      </DropdownMenu>
      )}
    </>
  );

  // 🔴 NO `<header>` WHEN THE HOST LENT ITS OWN ROW. The bar's chrome — the 47px band, the bottom
  // border, the `--ui-bg-chrome` fill — is what makes it a second row; inside the panel's header
  // the controls need none of it.
  if (toolbarSlot) return slot ? createPortal(bar, slot) : null;

  return (
    // One row, never two: a toolbar that reflows as the window narrows moves the
    // control you were reaching for. The title is the only thing allowed to
    // shrink, and the least-used controls hide first.
    <header className="nemesis-reader-bar flex h-11 shrink-0 items-center gap-2 overflow-hidden border-b border-(--ui-stroke-tertiary) bg-(--ui-bg-chrome) px-3">
      {bar}
    </header>
  );
}
