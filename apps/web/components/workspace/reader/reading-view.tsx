"use client";

// Reading mode: the document's content, re-set as an article.
//
// 🔴 It is DERIVED and it says so. The banner at the top is not decoration —
// the owner's rule is that the original stays authoritative and the
// reconstruction never quietly stands in for it. Anything that matters
// (a diagram, an exact wording, a table's alignment) is a reason to switch back
// to Source, and the banner's button does exactly that.
//
// Structure comes from `pdf-blocks.ts`, which measures font sizes and positions
// in the file. No model wrote any of this, and no page number here was guessed:
// each block carries the page it was measured on, so clicking one lands on the
// real page in Source mode.

import { Button } from "@/components/desktop-ui/button";
import { Codicon } from "@/components/desktop-ui/codicon";
import type { ReaderBlock } from "@/lib/reader/pdf-blocks";
import { findInUnit, highlightRuns } from "@/lib/reader/reader-search";
import { cn } from "@/lib/utils";

const HEADING_CLASS: Record<number, string> = {
  1: "mt-8 text-[1.375rem] font-bold tracking-tight first:mt-0",
  2: "mt-7 text-[1.125rem] font-semibold tracking-tight first:mt-0",
  3: "mt-6 text-[1rem] font-semibold first:mt-0",
  4: "mt-5 text-[0.9375rem] font-semibold text-(--ui-text-secondary) first:mt-0",
};

interface ReadingViewProps {
  blocks: readonly ReaderBlock[];
  unitLabel: string;
  /** What the student typed in the reader's search box, if anything. */
  query: string | null;
  onOpenUnit: (unit: number) => void;
  onShowSource: () => void;
}

export function ReadingView({ blocks, unitLabel, query, onOpenUnit, onShowSource }: ReadingViewProps) {
  if (blocks.length === 0) {
    return (
      <div className="mx-auto max-w-lg px-8 py-16 text-center">
        <p className="text-sm font-medium text-foreground">There is no text to lay out.</p>
        <p className="mt-1.5 text-xs leading-relaxed text-(--ui-text-secondary)">
          This document is made of pictures rather than text — a scan, or slides drawn as shapes. Source mode shows it
          exactly as it is.
        </p>
        <Button className="mt-4" onClick={onShowSource} size="sm" variant="secondary">
          Show the original
        </Button>
      </div>
    );
  }

  let lastUnit = 0;

  return (
    <div className="h-full min-h-0 overflow-auto overscroll-contain px-8 py-6" data-testid="reader-reading-scroll">
      <div className="nemesis-reading-view mx-auto">
        <div className="mb-7 flex items-start gap-2.5 rounded-lg border border-(--ui-stroke-tertiary) bg-(--ui-bg-quaternary) px-3.5 py-2.5">
          <Codicon className="mt-0.5 shrink-0 text-(--ui-text-tertiary)" name="info" size="0.85rem" />
          <p className="text-xs leading-relaxed text-(--ui-text-secondary)">
            <span className="font-medium text-foreground">Reading mode is a reconstruction.</span> Nemesis re-set this
            from the document&rsquo;s own text and measurements — pictures, exact layout and anything drawn rather than
            typed are not here.{" "}
            <button className="font-medium text-foreground underline underline-offset-2" onClick={onShowSource} type="button">
              Show the original
            </button>
          </p>
        </div>

        {blocks.map((block, index) => {
          const newUnit = block.unit !== lastUnit;
          lastUnit = block.unit;
          const content = <BlockText block={block} query={query} />;

          return (
            <div key={`${block.unit}-${index}`}>
              {newUnit && (
                <button
                  className="mt-9 mb-3 flex w-full items-center gap-2.5 text-left first:mt-0"
                  onClick={() => onOpenUnit(block.unit)}
                  title={`Show ${unitLabel} ${block.unit} in the original`}
                  type="button"
                >
                  <span className="text-[0.625rem] font-semibold uppercase tracking-[0.14em] text-(--ui-text-quaternary)">
                    {unitLabel} {block.unit}
                  </span>
                  <span className="h-px flex-1 bg-(--ui-stroke-quaternary)" />
                </button>
              )}
              {block.kind === "heading" ? (
                <h2 className={cn(HEADING_CLASS[block.level ?? 2] ?? HEADING_CLASS[2], "text-foreground")} dir={block.dir}>
                  {content}
                </h2>
              ) : block.kind === "list-item" ? (
                <div className="mt-1.5 flex gap-2.5 text-(--ui-text-secondary)" dir={block.dir}>
                  <span aria-hidden className="mt-[0.55em] size-1 shrink-0 rounded-full bg-(--ui-text-quaternary)" />
                  <p className="min-w-0 flex-1">{content}</p>
                </div>
              ) : (
                <p className="mt-3.5 text-(--ui-text-secondary)" dir={block.dir}>
                  {content}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Paints the searched phrase inside one block, wherever it occurs. Uses the
 *  same matcher as Source mode, so a phrase that is found on the page is found
 *  here too — case- and accent-insensitive, and indifferent to the line breaks
 *  the original layout happened to use. */
function BlockText({ block, query }: { block: ReaderBlock; query: string | null }) {
  if (!query) return <>{block.text}</>;
  const ranges = findInUnit(block.text, query, block.unit);
  if (ranges.length === 0) return <>{block.text}</>;
  return (
    <>
      {highlightRuns(block.text, ranges).map((run, index) =>
        run.highlighted ? <mark key={index}>{run.text}</mark> : <span key={index}>{run.text}</span>,
      )}
    </>
  );
}
