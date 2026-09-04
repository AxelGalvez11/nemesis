"use client";

// The document's contents rail — its outline, and its pages as pictures.
//
// On the RIGHT (owner 2026-08-05: the left edge is reserved for the Library
// sidebar, so a document opens without losing the tree it was filed in).
//
// The Outline tab shows whichever of two things exists. A PDF's own bookmarks
// are the document's real table of contents and win outright. Most lecture
// handouts have none, so the fallback is headings MEASURED from the text
// (pdf-blocks.ts) — and the tab says which of the two it is showing, because a
// derived contents list and an authored one are not the same claim.

import { Codicon } from "@/components/desktop-ui/codicon";
import type { OutlineEntry } from "@/lib/reader/pdf-outline";
import { describeCommentSpot, type DocumentComment } from "@/lib/workspace/document-comments";
import type { PdfDocument } from "@/lib/reader/pdfjs";
import { cn } from "@/lib/utils";

import { PdfThumbnail } from "./pdf-thumbnail";

export type SidebarTab = "outline" | "pages" | "comments";

interface ReaderSidebarProps {
  tab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  outline: readonly OutlineEntry[];
  /** True when the outline came from the file's own bookmarks. */
  outlineIsAuthored: boolean;
  document: PdfDocument | null;
  unitCount: number;
  unit: number;
  unitLabel: string;
  onGoToUnit: (unit: number) => void;
  /** Absent = this surface has no annotate layer, and no Comments tab is drawn at all. */
  comments?: readonly DocumentComment[];
  onResolveComment?: (comment: DocumentComment) => void;
  onDeleteComment?: (comment: DocumentComment) => void;
  /**
   * Draw the comments and nothing else: no Outline tab, no Pages tab, no strip to switch them.
   *
   * 🔴 THE PANE'S RAIL, NOT THE STANDALONE READER'S. Owner, 2026-09-01: *"also remove the slides,
   * notes, outline options"* from the column beside a conversation. The outline never came back
   * there, and this must not be the door it sneaks in through. What the pane DOES need is the list
   * of what the learner pinned on the document: until 2026-09-04 a note kept with "Add comment" was
   * a pin on a page and nothing else, findable only by scrolling for it.
   */
  commentsOnly?: boolean;
}

export function ReaderSidebar({
  tab, onTabChange, outline, outlineIsAuthored, document: pdf, unitCount, unit, unitLabel, onGoToUnit,
  comments, onResolveComment, onDeleteComment, commentsOnly = false,
}: ReaderSidebarProps) {
  const openComments = comments?.filter((comment) => comment.resolvedAt === null) ?? [];
  const commentsLabel = openComments.length > 0 ? `Comments · ${openComments.length}` : "Comments";
  /** What the body draws. In the pane that is the comments, whatever tab the host last held. */
  const showing: SidebarTab = commentsOnly ? "comments" : tab;
  const pagesTabLabel = unitLabel === "slide" ? "Slides" : unitLabel === "sheet" ? "Sheets" : "Pages";
  // A Word file is one flowing document: it has no pages to show as pictures,
  // and every outline entry would carry a meaningless "1".
  const hasUnits = unitCount > 1;

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-l border-(--ui-stroke-tertiary) bg-(--ui-bg-sidebar)" data-testid="reader-sidebar">
      {commentsOnly ? (
        // One label where the strip would be, so the rail still says what it is.
        <p className="shrink-0 border-b border-(--ui-stroke-quaternary) px-3 py-2 text-[0.6875rem] font-medium text-foreground" data-testid="reader-comments-heading">
          {commentsLabel}
        </p>
      ) : (
      <div className="flex shrink-0 gap-0.5 border-b border-(--ui-stroke-quaternary) p-1.5">
        {[
          { id: "outline" as const, label: "Outline" },
          ...(hasUnits ? [{ id: "pages" as const, label: pagesTabLabel }] : []),
          // The count is OPEN comments: the tab answers "is anything still pinned here?",
          // and resolved rows are history, not a number to carry in the chrome.
          ...(comments ? [{ id: "comments" as const, label: commentsLabel }] : []),
        ].map((option) => (
          <button
            aria-pressed={tab === option.id}
            className={cn(
              "flex-1 rounded-md px-2 py-1 text-[0.6875rem] font-medium transition-colors",
              tab === option.id ? "bg-(--ui-bg-tertiary) text-foreground" : "text-(--ui-text-tertiary) hover:text-foreground",
            )}
            key={option.id}
            onClick={() => onTabChange(option.id)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
        {showing === "comments" && comments ? (
          comments.length === 0 ? (
            <p className="px-2 py-6 text-center text-[0.6875rem] leading-relaxed text-(--ui-text-tertiary)">
              Nothing pinned yet. Turn on comment mode in the toolbar, then click a spot or drag a box.
            </p>
          ) : (
            <ul className="flex flex-col gap-1" data-testid="reader-comment-list">
              {comments.map((comment, index) => {
                const spot = describeCommentSpot(comment, unitLabel);
                const resolved = comment.resolvedAt !== null;
                return (
                  <li
                    className={cn(
                      "group/comment rounded-lg border border-(--ui-stroke-quaternary) px-2 py-1.5",
                      resolved && "opacity-55",
                    )}
                    key={comment.id}
                  >
                    <button
                      className="flex w-full items-start gap-1.5 text-left"
                      onClick={() => comment.unit !== null && onGoToUnit(comment.unit)}
                      type="button"
                    >
                      <span className="mt-px grid size-[15px] shrink-0 place-items-center rounded-full bg-(--ui-action) text-[0.5625rem] font-semibold text-(--ui-action-glyph)">
                        {index + 1}
                      </span>
                      <span className="min-w-0">
                        {spot && <span className="block text-[0.625rem] text-(--ui-text-quaternary)">{spot}</span>}
                        <span className={cn("block text-[0.75rem] leading-snug text-(--ui-text-secondary)", resolved && "line-through")}>
                          {comment.body}
                        </span>
                      </span>
                    </button>
                    <div className="mt-1 flex justify-end gap-1 opacity-0 transition-opacity group-hover/comment:opacity-100">
                      <button
                        className="rounded px-1.5 py-0.5 text-[0.625rem] text-(--ui-text-tertiary) hover:bg-(--ui-bg-tertiary) hover:text-foreground"
                        onClick={() => onResolveComment?.(comment)}
                        type="button"
                      >
                        {resolved ? "Reopen" : "Resolve"}
                      </button>
                      <button
                        className="rounded px-1.5 py-0.5 text-[0.625rem] text-(--ui-text-tertiary) hover:bg-(--ui-bg-tertiary) hover:text-(--ui-danger)"
                        onClick={() => onDeleteComment?.(comment)}
                        type="button"
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )
        ) : showing === "outline" || !hasUnits ? (
          outline.length === 0 ? (
            <p className="px-2 py-6 text-center text-[0.6875rem] leading-relaxed text-(--ui-text-tertiary)">
              This document has no headings Nemesis could find.
            </p>
          ) : (
            <>
              {!outlineIsAuthored && (
                <p className="mb-1.5 flex items-start gap-1.5 px-1.5 text-[0.625rem] leading-relaxed text-(--ui-text-quaternary)">
                  <Codicon className="mt-px shrink-0" name="info" size="0.65rem" />
                  Built from the document&rsquo;s headings — it has no contents list of its own.
                </p>
              )}
              <ul>
                {outline.map((entry) => (
                  <li key={entry.id}>
                    <button
                      className={cn(
                        "flex w-full items-baseline gap-1.5 rounded-md px-2 py-1 text-left text-[0.75rem] leading-snug hover:bg-(--ui-bg-tertiary)",
                        entry.unit === unit ? "text-foreground" : "text-(--ui-text-secondary)",
                        entry.depth === 0 ? "font-medium" : "",
                      )}
                      disabled={entry.unit === undefined}
                      onClick={() => entry.unit !== undefined && onGoToUnit(entry.unit)}
                      style={{ paddingLeft: `${0.5 + entry.depth * 0.7}rem` }}
                      title={entry.title}
                      type="button"
                    >
                      <span className="min-w-0 flex-1 truncate">{entry.title}</span>
                      {hasUnits && entry.unit !== undefined && (
                        <span className="shrink-0 tabular-nums text-[0.625rem] text-(--ui-text-quaternary)">{entry.unit}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )
        ) : pdf === null ? (
          <p className="px-2 py-6 text-center text-[0.6875rem] text-(--ui-text-tertiary)">No pages to show.</p>
        ) : (
          <div className="flex flex-col items-center gap-2.5 py-1">
            {Array.from({ length: unitCount }, (_unused, index) => index + 1).map((pageNumber) => (
              <PdfThumbnail
                active={pageNumber === unit}
                document={pdf}
                key={pageNumber}
                onSelect={onGoToUnit}
                pageNumber={pageNumber}
              />
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
