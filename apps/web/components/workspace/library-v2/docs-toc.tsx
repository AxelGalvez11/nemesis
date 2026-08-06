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

import { Codicon } from "@/components/desktop-ui/codicon";
import type { NoteOutlineEntry } from "@/lib/workspace/note-outline";
import { usePersistentFlag } from "@/lib/workspace/use-persistent-flag";
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
  const [collapsed, setCollapsed] = usePersistentFlag("nemesis.web.docs-toc-collapsed", false);
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

  // Collapsed, the rail keeps only its toggle, so a long note gets the width
  // back without losing the way to bring the contents list back (owner
  // 2026-08-05). The choice is remembered per browser, like the sidebar's own
  // auto-hide, because a reading-width preference that resets every reload is
  // not really a preference.
  if (collapsed) {
    return (
      <nav aria-label="On this page" className="shrink-0 px-2 py-6 max-lg:hidden">
        <button
          aria-expanded={false}
          className="grid size-7 place-items-center rounded-md text-(--ui-text-tertiary) hover:bg-(--ui-bg-tertiary) hover:text-foreground"
          data-testid="docs-toc-toggle"
          onClick={() => setCollapsed(false)}
          title="Show On this page"
          type="button"
        >
          <Codicon name="list-unordered" size="0.85rem" />
        </button>
      </nav>
    );
  }

  return (
    <nav aria-label="On this page" className="w-52 shrink-0 overflow-y-auto px-4 py-6 max-lg:hidden">
      <div className="mb-2 flex items-center justify-between gap-1">
        <h2 className="text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-(--ui-text-tertiary)">On this page</h2>
        <button
          aria-expanded
          className="grid size-6 shrink-0 place-items-center rounded-md text-(--ui-text-quaternary) hover:bg-(--ui-bg-tertiary) hover:text-foreground"
          data-testid="docs-toc-toggle"
          onClick={() => setCollapsed(true)}
          title="Hide On this page"
          type="button"
        >
          <Codicon name="chevron-right" size="0.8rem" />
        </button>
      </div>
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
