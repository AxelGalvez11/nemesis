"use client";

// Left rail: the document's contents, and its pages as pictures.
//
// The Outline tab shows whichever of two things exists. A PDF's own bookmarks
// are the document's real table of contents and win outright. Most lecture
// handouts have none, so the fallback is headings MEASURED from the text
// (pdf-blocks.ts) — and the tab says which of the two it is showing, because a
// derived contents list and an authored one are not the same claim.

import { Codicon } from "@/components/desktop-ui/codicon";
import type { OutlineEntry } from "@/lib/reader/pdf-outline";
import type { PdfDocument } from "@/lib/reader/pdfjs";
import { cn } from "@/lib/utils";

import { PdfThumbnail } from "./pdf-thumbnail";

export type SidebarTab = "outline" | "pages";

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
}

export function ReaderSidebar({
  tab, onTabChange, outline, outlineIsAuthored, document: pdf, unitCount, unit, unitLabel, onGoToUnit,
}: ReaderSidebarProps) {
  const pagesTabLabel = unitLabel === "slide" ? "Slides" : "Pages";
  // A Word file is one flowing document: it has no pages to show as pictures,
  // and every outline entry would carry a meaningless "1".
  const hasUnits = unitCount > 1;

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-(--ui-stroke-tertiary) bg-(--ui-bg-sidebar)" data-testid="reader-sidebar">
      <div className="flex shrink-0 gap-0.5 border-b border-(--ui-stroke-quaternary) p-1.5">
        {(hasUnits
          ? [
              { id: "outline" as const, label: "Outline" },
              { id: "pages" as const, label: pagesTabLabel },
            ]
          : [{ id: "outline" as const, label: "Outline" }]
        ).map((option) => (
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

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
        {tab === "outline" || !hasUnits ? (
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
