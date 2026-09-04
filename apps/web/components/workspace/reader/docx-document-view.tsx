"use client";

// A Word document, drawn as its pages.
//
// 🔴🔴 THE PAGES ARE THE AUTHOR'S NOW, AND THE REFLOW BELOW IS THE FALLBACK. Owner, 2026-09-04:
// *"make sure any documents can be viewed too"*, the day after the deck started drawing as itself.
// What this view used to be is still here, one branch down: OUR layout of the file's paragraphs,
// headings, lists, tables and pictures on a sheet, which he had already called *"it doesn't really
// render like a docx, it just looks weird"* (2026-09-03). Right headings, right lists, none of the
// author's page. `docx-render.ts` lays the file out from its own XML instead: page size and
// margins, the author's fonts, sizes and colours, tables with their borders, pictures where they
// were put, headers, footers, footnotes. When that renderer cannot open a file, the reflow is what
// the learner sees, exactly as before; a document is never taken away because a picture of it
// could not be made.
//
// 🔴 THE PARSE STILL RUNS, AND IT IS STILL WHAT THE READER KNOWS. `docxBlocks` feeds the outline,
// the search text and the material a question is answered from. The pages change what is seen,
// not what is understood.
//
// 🔴🔴 THE PAGES ARE DOM NODES THE RENDERER BUILT, NOT REACT ELEMENTS, and that is why one `<div>`
// below is a leaf React never writes into: the effect appends the scrubbed nodes and clears them
// on the way out. Letting React reconcile a subtree it did not create is how you get a page that
// disappears on the next render.
//
// 🔴 FIT-WIDTH IS CSS `zoom`, NOT `transform`. A transform scales the paint and leaves the layout
// box at full size, so the scroll area would still be 816px wide inside a 595px card. `zoom`
// scales the box too, which is what "fits the card" means. Same arithmetic `reader-zoom.ts` does
// for a slide.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { docxBlocks, docxBlockText, type DocxBlock, type DocxRun } from "@/lib/reader/docx-blocks";
import { releaseDocxRender, renderDocxPages, type RenderedDocx } from "@/lib/reader/docx-render";
import { officeImageUrl, openOfficeArchive } from "@/lib/reader/office-zip";
import { findInUnit, highlightRuns } from "@/lib/reader/reader-search";
import { resolveScale, type ZoomMode } from "@/lib/reader/reader-zoom";
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

/** Room either side of a page inside the scroll column, at 1:1. */
const GUTTER = 24;

export function DocxDocumentView({
  bytes,
  query,
  onReady,
  onError,
  onScaleChange,
  registerElement,
  zoom,
}: {
  bytes: ArrayBuffer;
  query: string | null;
  onReady: (payload: DocxReadyPayload) => void;
  onError: (message: string) => void;
  /** What the pages are drawn at right now, for the reader's zoom control. */
  onScaleChange?: (scale: number) => void;
  /** The reader's comment layer pins to the article (the document's one unit). */
  registerElement?: (unit: number, element: HTMLElement | null) => void;
  /** Fit-width by default; a fixed scale after the learner presses − or +. */
  zoom?: ZoomMode;
}) {
  const [blocks, setBlocks] = useState<DocxBlock[] | null>(null);
  const [images, setImages] = useState<Map<string, string>>(new Map());
  /**
   * The drawn pages: null while drawing, "failed" when this file cannot be drawn.
   *
   * 🔴 "failed" IS A STATE, NOT AN ERROR. It selects the reflow below and nothing else changes;
   * `onError` is for a file that is not a Word file at all, which the parse above decides.
   */
  const [rendered, setRendered] = useState<RenderedDocx | "failed" | null>(null);
  const [container, setContainer] = useState({ width: 0, height: 0 });
  // 🔴 A CALLBACK ref, not useRef, for the reason `slides-document-view.tsx` gives: the scroll
  // column mounts after the first paint, and an observer attached in a mount effect sees null.
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null);
  const pagesHost = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let live = true;
    let drawn: RenderedDocx | null = null;
    setRendered(null);
    void renderDocxPages(bytes).then((result) => {
      if (!live) {
        releaseDocxRender(result);
        return;
      }
      drawn = result;
      setRendered(result ?? "failed");
    });
    return () => {
      live = false;
      releaseDocxRender(drawn);
    };
  }, [bytes]);

  useEffect(() => {
    const element = scrollElement;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box) setContainer({ width: Math.max(0, box.width), height: Math.max(0, box.height) });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [scrollElement]);

  const pages = rendered && rendered !== "failed" ? rendered : null;
  const scale = useMemo(
    () =>
      pages
        ? Math.min(
            resolveScale(zoom ?? { kind: "fit-width" }, {
              pageWidth: pages.pageWidth,
              pageHeight: pages.pageHeight,
              containerWidth: Math.max(0, container.width - GUTTER * 2),
              containerHeight: container.height,
            }),
            2,
          )
        : 1,
    [container.height, container.width, pages, zoom],
  );
  useEffect(() => onScaleChange?.(scale), [onScaleChange, scale]);

  /**
   * The drawn pages go into their host, and out again.
   *
   * 🔴 EVERY TOP-LEVEL BLOCK OF EVERY PAGE IS STAMPED `data-comment-block`, in document order, so a
   * comment pins to a paragraph exactly as it did on the reflow, and `relative` so the pin's
   * portal lands inside the block's own box (comment-layer.tsx). A page reflows with the zoom;
   * "which block" does not.
   */
  useEffect(() => {
    const host = pagesHost.current;
    if (!host || !pages) return;
    host.replaceChildren(...pages.styles, ...pages.pages);
    let index = 0;
    for (const page of pages.pages) {
      for (const block of page.querySelectorAll<HTMLElement>("article > p, article > table, article > ol, article > ul, article > div")) {
        block.dataset.commentBlock = String(index);
        index += 1;
        if (!block.style.position) block.style.position = "relative";
      }
    }
    return () => {
      host.replaceChildren();
    };
  }, [pages]);

  /**
   * The searched phrase, painted onto the drawn pages.
   *
   * 🔴 IN PLACE, BY TEXT NODE. The pages are not React's, so the reflow's `<Runs>` cannot paint
   * them; a walk over the text nodes wraps every match in a `<mark>` and the previous walk's marks
   * are unwrapped first, so a changed query never doubles up.
   */
  useEffect(() => {
    const host = pagesHost.current;
    if (!host || !pages) return;
    for (const mark of [...host.querySelectorAll("mark[data-reader-match]")]) {
      const parent = mark.parentNode;
      if (!parent) continue;
      parent.replaceChild(document.createTextNode(mark.textContent ?? ""), mark);
      parent.normalize();
    }
    const needle = query?.trim().toLowerCase();
    if (!needle) return;
    const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
    const hits: Text[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if ((node.textContent ?? "").toLowerCase().includes(needle)) hits.push(node as Text);
    }
    for (const text of hits) {
      const value = text.textContent ?? "";
      const fragment = document.createDocumentFragment();
      let from = 0;
      let at = value.toLowerCase().indexOf(needle);
      while (at !== -1) {
        fragment.append(value.slice(from, at));
        const mark = document.createElement("mark");
        mark.dataset.readerMatch = "true";
        mark.textContent = value.slice(at, at + needle.length);
        fragment.append(mark);
        from = at + needle.length;
        at = value.toLowerCase().indexOf(needle, from);
      }
      fragment.append(value.slice(from));
      text.replaceWith(fragment);
    }
  }, [pages, query]);

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

  // 🔴 THE PAGES' HOST IS REGISTERED AS THE DOCUMENT'S ONE UNIT when the pages are up, and the
  // reflow's article when they are not, so the comment layer and the selection anchor follow
  // whichever is on screen.
  const registerPages = useCallback(
    (element: HTMLDivElement | null) => {
      pagesHost.current = element;
      registerElement?.(1, element);
    },
    [registerElement],
  );

  if (blocks === null || rendered === null) {
    return <div className="grid h-full place-items-center text-xs text-(--ui-text-tertiary)">Opening…</div>;
  }

  return (
    <div className="nemesis-reader-room h-full min-h-0 overflow-auto overscroll-contain px-6 py-6" data-testid="reader-docx-scroll" ref={setScrollElement}>
      {pages ? (
        /* 🔴 `data-page` AND `data-selectable-text` for the same reasons the reflow's article
           carries them: selection is re-enabled inside `[data-workspace]` by the first, and anchored
           by the second. The host is a leaf: React never writes inside it (see the head note). */
        <div
          className="nemesis-docx-pages mx-auto w-fit"
          data-page={1}
          data-selectable-text="true"
          ref={registerPages}
          style={{ zoom: scale }}
        />
      ) : (
        <ReflowedDocument blocks={blocks} images={images} query={query} registerElement={registerElement} />
      )}
    </div>
  );
}

/**
 * The document laid out like a documentation page rather than like Word: the view this file WAS,
 * kept whole as the fallback for a file the page renderer cannot open.
 *
 * No simulated sheet, no page margins, no ruler; heading levels, list nesting and numbering, table
 * columns, pictures where the author put them. The measure is constrained (the owner's rule for
 * text documents): long lines are harder to read than short ones.
 */
function ReflowedDocument({
  blocks,
  images,
  query,
  registerElement,
}: {
  blocks: readonly DocxBlock[];
  images: ReadonlyMap<string, string>;
  query: string | null;
  registerElement?: (unit: number, element: HTMLElement | null) => void;
}) {
  // Consecutive list items of the same kind and depth render as one list, so a
  // numbered list actually counts 1, 2, 3 instead of restarting at every item.
  const grouped = useMemo(() => groupBlocks(blocks), [blocks]);

  // 🔴 A STABLE REF CALLBACK, NOT AN INLINE ARROW — found as a CRASH, not a review note. An inline
  // `ref={(el) => register(1, el)}` is a new function every render, so React detaches (null) and
  // reattaches (element) each time; the host's registry write causes a render, which re-creates
  // the arrow, which detaches again — "Maximum update depth exceeded" on every Word file.
  const registerArticle = useCallback((element: HTMLElement | null) => registerElement?.(1, element), [registerElement]);

  return (
    <>
      {/* 🔴 EVERY GROUP WRAPPER BELOW CARRIES data-comment-block AND `relative`. A flowing
          document reflows with the panel width, so a pixel anchor is a lie by the first resize —
          the stable thing to hold on to is WHICH BLOCK, and the pin renders inside that block's
          own box. The index is the grouped index, which only changes if the document does. */}
      {/* 🔴 THE SAME TWO STAMPS `text-document-view.tsx` EXPLAINS AT LENGTH, for the same reason:
          `data-selectable-text` is what re-enables selection inside `[data-workspace]` (a Word file
          could not be highlighted at all without it), and `data-page` is what the selection then
          anchors against. Clicking in annotate mode still snaps to `data-comment-block`, which is
          the reflow-proof anchor and is unchanged. */}
      <article
        className="nemesis-reader-page relative mx-auto"
        data-page={1}
        data-selectable-text="true"
        ref={registerArticle}
      >
        <div className="nemesis-reading-view">
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
        </div>
      </article>
    </>
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
