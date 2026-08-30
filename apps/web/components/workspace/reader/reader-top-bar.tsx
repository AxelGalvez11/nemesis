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
  /** The reader's own contents rail, on the right. Omitted for file types that
   *  have nothing to list (a single image). */
  railOpen: boolean;
  onToggleRail?: () => void;
  /** Marking mode: drag a box on the page instead of selecting text. Absent for documents where a
   *  box cannot be cut out — a slide is a RECONSTRUCTION, so a crop of one would be a picture of
   *  our layout rather than of the deck. */
  commenting?: boolean;
  onToggleCommenting?: () => void;
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
    railOpen,
    onToggleRail,
    commenting = false,
    onToggleCommenting,
    actionScope,
    onAction,
    actionsDisabled,
    linkedNotes,
    onOpenNote,
    folderPath,
  } = props;

  const trail = folderTrail(folderPath);

  return (
    // One row, never two: a toolbar that reflows as the window narrows moves the
    // control you were reaching for. The title is the only thing allowed to
    // shrink, and the least-used controls hide first.
    <header className="nemesis-reader-bar flex h-11 shrink-0 items-center gap-2 overflow-hidden border-b border-(--ui-stroke-tertiary) bg-(--ui-bg-chrome) px-3">
      {onBack && (
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

      <div className="nemesis-reader-title mr-auto flex min-w-0 shrink flex-col leading-tight">
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

      {modeAvailable && (
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

      {unitCount > 1 && (
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

      {showZoom && (
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
        <button
          aria-label={commenting ? "Stop commenting" : "Comment on the document"}
          aria-pressed={commenting}
          className={cn(
            "grid size-7 shrink-0 place-items-center rounded-md hover:bg-(--ui-bg-tertiary)",
            commenting ? "bg-(--ui-action) text-(--ui-action-glyph)" : "text-(--ui-text-tertiary) hover:text-foreground",
          )}
          data-testid="reader-comment-mode"
          onClick={onToggleCommenting}
          title={commenting ? "Commenting: click a spot or drag a box. Turn off to select text again." : "Comment on the document"}
          type="button"
        >
          <Codicon name="comment" size="0.85rem" />
        </button>
      )}

      {onToggleRail && (
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
          <DropdownMenuLabel className="font-normal text-(--ui-text-tertiary)">
            Ask Nemesis about <span className="text-(--ui-text-secondary)">{actionScope}</span>
          </DropdownMenuLabel>
          {READER_ACTIONS.map((action) => (
            <DropdownMenuItem disabled={actionsDisabled} key={action.id} onSelect={() => onAction(action.id)}>
              <Codicon name={action.icon} size="0.8rem" /> {action.label}
            </DropdownMenuItem>
          ))}

          {linkedNotes.length > 0 && onOpenNote && (
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
    </header>
  );
}
