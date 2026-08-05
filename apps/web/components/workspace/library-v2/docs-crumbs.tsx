"use client";

// The breadcrumb strip above a note (owner 2026-08-05: "add the breadcrumbs
// to the notes again", reversing 2026-08-04's removal). Folders are PAGES now
// (Notion model), so each folder crumb opens that folder's own page rather
// than merely revealing it in the tree the way the pre-removal strip did.
// The root "Library" crumb is a quiet label, not a control — the sidebar has
// its own trigger and Home is a note in the tree.

import { cn } from "@/lib/utils";

interface DocsCrumbsProps {
  /** Slash-joined folder chain ABOVE the page. "" renders just "Library". */
  path: string;
  /** Open the folder page for the chain up to the clicked crumb. */
  onOpenFolder: (path: string) => void;
  className?: string;
}

export function DocsCrumbs({ path, onOpenFolder, className }: DocsCrumbsProps) {
  const segments = path.split("/").map((segment) => segment.trim()).filter(Boolean);

  return (
    <nav
      aria-label="Breadcrumb"
      className={cn(
        "flex min-w-0 items-center gap-1 overflow-hidden whitespace-nowrap text-[0.6875rem] text-(--ui-text-tertiary)",
        className,
      )}
    >
      <span className="shrink-0">Library</span>
      {segments.map((segment, index) => {
        const target = segments.slice(0, index + 1).join("/");
        return (
          <span className="flex min-w-0 items-center gap-1" key={target}>
            <span className="text-(--ui-text-quaternary)">/</span>
            <button
              className="min-w-0 truncate rounded-sm underline-offset-2 hover:text-foreground hover:underline"
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
