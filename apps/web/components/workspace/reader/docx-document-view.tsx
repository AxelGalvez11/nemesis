"use client";

// A Word document, laid out like a documentation page rather than like Word.
//
// No simulated A4 sheet, no page margins, no ruler: those are artefacts of
// printing, and this is being read on a screen. What IS kept is everything that
// carries meaning — heading levels, list nesting and numbering, table columns,
// images where the author put them, and the boundaries between sections.
//
// The measure is constrained (the owner's rule for text documents): long lines
// are harder to read than short ones, and a document has no fixed width of its
// own once it leaves paper.

import { useCallback, useEffect, useMemo, useState } from "react";

import { docxBlocks, docxBlockText, type DocxBlock, type DocxRun } from "@/lib/reader/docx-blocks";
import { officeImageUrl, openOfficeArchive } from "@/lib/reader/office-zip";
import { findInUnit, highlightRuns } from "@/lib/reader/reader-search";
import { resolveRelationships } from "@/lib/reader/pptx-slides";
import { cn } from "@/lib/utils";

export interface DocxReadyPayload {
  blocks: DocxBlock[];
  text: string;
}

const HEADING_CLASS: Record<number, string> = {
  1: "mt-10 text-[1.5rem] font-bold tracking-tight first:mt-0",
  2: "mt-8 text-[1.25rem] font-semibold tracking-tight first:mt-0",
  3: "mt-7 text-[1.0625rem] font-semibold first:mt-0",
  4: "mt-6 text-[0.9375rem] font-semibold first:mt-0",
  5: "mt-5 text-[0.875rem] font-semibold text-(--ui-text-secondary) first:mt-0",
  6: "mt-5 text-[0.8125rem] font-semibold uppercase tracking-wide text-(--ui-text-tertiary) first:mt-0",
};

export function DocxDocumentView({
  bytes,
  query,
  onReady,
  onError,
  registerElement,
}: {
  bytes: ArrayBuffer;
  query: string | null;
  onReady: (payload: DocxReadyPayload) => void;
  onError: (message: string) => void;
  /** The reader's comment layer pins to the article (the document's one unit). */
  registerElement?: (unit: number, element: HTMLElement | null) => void;
}) {
  const [blocks, setBlocks] = useState<DocxBlock[] | null>(null);
  const [images, setImages] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    let urls: string[] = [];
    try {
      const archive = openOfficeArchive(bytes);
      const documentXml = archive.text("word/document.xml");
      if (!documentXml) throw new Error("This doesn't look like a Word (.docx) file.");
      const parsed = docxBlocks(documentXml, archive.text("word/numbering.xml"));

      // Pictures are referenced by relationship id; the mapping to a real zip
      // entry lives in the document's own .rels, the same as in a deck.
      const relationships = resolveRelationships(archive.text("word/_rels/document.xml.rels"), "word/document.xml");
      const resolved = new Map<string, string>();
      for (const block of parsed) {
        if (block.kind !== "image") continue;
        const url = officeImageUrl(archive, relationships.get(block.relId) ?? null);
        if (url) {
          resolved.set(block.relId, url);
          urls.push(url);
        }
      }

      setBlocks(parsed);
      setImages(resolved);
      onReady({ blocks: parsed, text: parsed.map(docxBlockText).filter(Boolean).join("\n") });
    } catch (error) {
      onError(error instanceof Error ? error.message : "This document could not be opened.");
    }
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
      urls = [];
    };
  }, [bytes, onError, onReady]);

  // Consecutive list items of the same kind and depth render as one list, so a
  // numbered list actually counts 1, 2, 3 instead of restarting at every item.
  const grouped = useMemo(() => groupBlocks(blocks ?? []), [blocks]);

  // 🔴 A STABLE REF CALLBACK, NOT AN INLINE ARROW — found as a CRASH, not a review note. An inline
  // `ref={(el) => register(1, el)}` is a new function every render, so React detaches (null) and
  // reattaches (element) each time; the host's registry write causes a render, which re-creates
  // the arrow, which detaches again — "Maximum update depth exceeded" on every Word file.
  const registerArticle = useCallback((element: HTMLElement | null) => registerElement?.(1, element), [registerElement]);

  if (blocks === null) return <div className="grid h-full place-items-center text-xs text-(--ui-text-tertiary)">Opening…</div>;

  return (
    <div className="h-full min-h-0 overflow-auto overscroll-contain px-8 py-8" data-testid="reader-docx-scroll">
      {/* 🔴 EVERY GROUP WRAPPER BELOW CARRIES data-comment-block AND `relative`. A flowing
          document reflows with the panel width, so a pixel anchor is a lie by the first resize —
          the stable thing to hold on to is WHICH BLOCK, and the pin renders inside that block's
          own box. The index is the grouped index, which only changes if the document does. */}
      <article className="nemesis-reading-view relative mx-auto text-(--ui-text-secondary)" ref={registerArticle}>
        {grouped.map((group, index) => {
          if (group.kind === "list") {
            const List = group.ordered ? "ol" : "ul";
            return (
              <List
                className={cn("relative mt-3 flex flex-col gap-1", group.ordered ? "list-decimal" : "list-disc")}
                data-comment-block={index}
                key={index}
                style={{ paddingInlineStart: `${1.25 + group.level * 1.1}rem` }}
              >
                {group.items.map((item, itemIndex) => (
                  <li className="pl-1" key={itemIndex}>
                    <Runs query={query} runs={item.runs} />
                  </li>
                ))}
              </List>
            );
          }

          const block = group.block;
          switch (block.kind) {
            case "heading":
              return (
                <h2 className={cn(HEADING_CLASS[block.level] ?? HEADING_CLASS[3], "relative text-foreground")} data-comment-block={index} key={index}>
                  <Runs query={query} runs={block.runs} />
                </h2>
              );
            case "paragraph":
              return block.quote ? (
                <blockquote className="relative mt-4 border-l-2 border-(--ui-stroke-secondary) pl-4 italic" data-comment-block={index} key={index}>
                  <Runs query={query} runs={block.runs} />
                </blockquote>
              ) : (
                <p className="relative mt-4" data-comment-block={index} key={index}>
                  <Runs query={query} runs={block.runs} />
                </p>
              );
            case "table":
              return (
                <div className="relative mt-5 overflow-x-auto rounded-lg border border-(--ui-stroke-tertiary)" data-comment-block={index} key={index}>
                  <table className="w-full border-collapse text-[0.8125rem]">
                    <tbody>
                      {block.rows.map((row, rowIndex) => (
                        <tr className="border-b border-(--ui-stroke-quaternary) last:border-0" key={rowIndex}>
                          {row.map((cell, cellIndex) => {
                            const Cell = cell.header ? "th" : "td";
                            return (
                              <Cell
                                className={cn(
                                  "border-r border-(--ui-stroke-quaternary) px-3 py-2 align-top last:border-0",
                                  cell.header ? "bg-(--ui-bg-quaternary) text-left font-semibold text-foreground" : "",
                                )}
                                colSpan={cell.colSpan > 1 ? cell.colSpan : undefined}
                                key={cellIndex}
                              >
                                <Runs query={query} runs={cell.runs} />
                              </Cell>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            case "image": {
              const url = images.get(block.relId);
              return url ? (
                // eslint-disable-next-line @next/next/no-img-element -- an in-memory object URL for bytes already in the browser
                <img
                  alt={block.alt || "A picture from this document"}
                  className="mt-5 max-w-full rounded-lg border border-(--ui-stroke-tertiary)"
                  key={index}
                  src={url}
                />
              ) : (
                <p
                  className="mt-5 rounded-lg border border-dashed border-(--ui-stroke-tertiary) px-4 py-3 text-[0.75rem] text-(--ui-text-tertiary)"
                  key={index}
                >
                  {block.alt ? `A picture here: ${block.alt}.` : "A picture sits here."} It is in a format the browser
                  cannot draw, so it is not shown.
                </p>
              );
            }
            case "section-break":
              return <hr className="my-8 border-0 border-t border-(--ui-stroke-tertiary)" key={index} />;
          }
        })}
      </article>
    </div>
  );
}

type BlockGroup =
  | { kind: "list"; ordered: boolean; level: number; items: { runs: DocxRun[] }[] }
  | { kind: "block"; block: DocxBlock };

function groupBlocks(blocks: readonly DocxBlock[]): BlockGroup[] {
  const groups: BlockGroup[] = [];
  for (const block of blocks) {
    if (block.kind !== "list-item") {
      groups.push({ kind: "block", block });
      continue;
    }
    const last = groups.at(-1);
    if (last?.kind === "list" && last.ordered === block.ordered && last.level === block.level) {
      last.items.push({ runs: block.runs });
      continue;
    }
    groups.push({ kind: "list", ordered: block.ordered, level: block.level, items: [{ runs: block.runs }] });
  }
  return groups;
}

/** Formatted runs, with the searched phrase painted wherever it falls. */
function Runs({ runs, query }: { runs: readonly DocxRun[]; query: string | null }) {
  return (
    <>
      {runs.map((run, index) => {
        const className = cn(
          run.bold && "font-semibold text-foreground",
          run.italic && "italic",
          run.underline && "underline underline-offset-2",
        );
        const ranges = query ? findInUnit(run.text, query, 1) : [];
        const content =
          ranges.length === 0
            ? run.text
            : highlightRuns(run.text, ranges).map((piece, pieceIndex) =>
                piece.highlighted ? <mark key={pieceIndex}>{piece.text}</mark> : <span key={pieceIndex}>{piece.text}</span>,
              );
        return className ? (
          <span className={className} key={index}>
            {content}
          </span>
        ) : (
          <span key={index}>{content}</span>
        );
      })}
    </>
  );
}
