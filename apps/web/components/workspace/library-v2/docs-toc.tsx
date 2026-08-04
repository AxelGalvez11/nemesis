"use client";

// "On this page" — the right rail of the docs-style Library. Replaces the old
// four-tab right panel (owner 2026-08-03: "get rid of the right sidebar and
// tab view, replace with table of contents style").
//
// Entries map to the article's h1-h4 elements BY POSITION, not by DOM id:
// extractNoteOutline shares the renderer's parser, so "the Nth entry is the
// Nth heading element". Ids would break on duplicate headings and on the
// renderer's quirk of dropping styled text from its slugs; positions cannot.

import { useEffect, useMemo, useState } from "react";

import type { NoteOutlineEntry } from "@/lib/workspace/note-outline";
import { cn } from "@/lib/utils";

interface DocsTocProps {
  outline: readonly NoteOutlineEntry[];
  /** The element that renders ONLY the note body (its h1-h4 are the targets). */
  articleRef: React.RefObject<HTMLElement | null>;
  /** The scrollable middle pane, watched to highlight the current section. */
  scrollRef: React.RefObject<HTMLElement | null>;
}

const HEADING_SELECTOR = "h1,h2,h3,h4";
/** A heading is "current" once it rises above this line in the scroll pane. */
const ACTIVE_LINE_PX = 96;

export function DocsToc({ outline, articleRef, scrollRef }: DocsTocProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const minDepth = useMemo(() => Math.min(4, ...outline.map((entry) => entry.depth)), [outline]);

  useEffect(() => {
    const scroller = scrollRef.current;
    const article = articleRef.current;
    if (!scroller || !article) return;

    const update = () => {
      const headings = article.querySelectorAll<HTMLElement>(HEADING_SELECTOR);
      const line = scroller.getBoundingClientRect().top + ACTIVE_LINE_PX;
      let current = 0;
      headings.forEach((heading, index) => {
        if (heading.getBoundingClientRect().top <= line) current = index;
      });
      setActiveIndex((previous) => (previous === current ? previous : current));
    };

    update();
    scroller.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      scroller.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
    // Re-measure when the outline changes: same array identity means the same
    // rendered headings, so this is the honest dependency.
  }, [articleRef, outline, scrollRef]);

  if (outline.length < 2) return null;

  const jumpTo = (index: number) => {
    const heading = articleRef.current?.querySelectorAll<HTMLElement>(HEADING_SELECTOR)[index];
    heading?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <nav aria-label="On this page" className="w-52 shrink-0 overflow-y-auto px-4 py-6 max-lg:hidden">
      <h2 className="mb-2 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-(--ui-text-tertiary)">On this page</h2>
      <ul className="grid gap-px border-l border-(--ui-stroke-tertiary)">
        {outline.map((entry, index) => (
          <li key={`${entry.label}:${index}`}>
            <button
              className={cn(
                // Long headings WRAP — truncate chopped them mid-word (owner
                // screenshot 2026-08-04: "Third Row: Comfort and Conven").
                "-ml-px w-full break-words border-l py-1 pr-1 text-left text-xs leading-snug transition-colors",
                index === activeIndex
                  ? "border-[var(--theme-primary)] font-medium text-foreground"
                  : "border-transparent text-(--ui-text-tertiary) hover:text-foreground",
              )}
              onClick={() => jumpTo(index)}
              style={{ paddingLeft: `${(entry.depth - minDepth) * 0.75 + 0.75}rem` }}
              type="button"
            >
              {entry.label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
