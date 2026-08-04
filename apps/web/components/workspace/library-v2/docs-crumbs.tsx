"use client";

// The breadcrumb strip above a note or source file. Crumbs NAVIGATE, the way
// Notion's do (owner 2026-08-04: "a folder is like a note"): a folder crumb
// opens that folder's own page — an ordinary note created on first open, see
// library-folder-note.ts — and the "Library" crumb goes to the Library home
// note. The sidebar's control is no longer here: it is the floating "Library"
// heading at the top-left of the page (library-docs-page.tsx).

import { cn } from "@/lib/utils";

interface DocsCrumbsProps {
  /** Slash-joined folder chain to render. "" renders just "Library". */
  path: string;
  /** The "Library" crumb — go to the Library home note. */
  onGoHome: () => void;
  /** A folder crumb — open that folder's page (creating it if needed). */
  onOpenFolder: (path: string) => void;
  className?: string;
}

export function DocsCrumbs({ path, onGoHome, onOpenFolder, className }: DocsCrumbsProps) {
  const segments = path.split("/").map((segment) => segment.trim()).filter(Boolean);
  const crumbClass = "min-w-0 truncate rounded-sm hover:text-foreground hover:underline underline-offset-2";

  return (
    <nav
      aria-label="Breadcrumb"
      className={cn("flex min-w-0 items-center gap-1 overflow-hidden whitespace-nowrap text-[0.6875rem] text-(--ui-text-tertiary)", className)}
    >
      <button
        className={cn(crumbClass, "shrink-0")}
        data-testid="library-home-crumb"
        onClick={onGoHome}
        title="Go to your Library home"
        type="button"
      >
        Library
      </button>
      {segments.map((segment, index) => {
        const target = segments.slice(0, index + 1).join("/");
        return (
          <span className="flex min-w-0 items-center gap-1" key={target}>
            <span className="text-(--ui-text-quaternary)">/</span>
            <button
              className={crumbClass}
              onClick={() => onOpenFolder(target)}
              title={`Open ${segment}`}
              type="button"
            >
              {segment}
            </button>
          </span>
        );
      })}
    </nav>
  );
}
