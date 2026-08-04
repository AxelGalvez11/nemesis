"use client";

// The breadcrumb strip above a note or source file. Folders are NEVER pages
// (owner 2026-08-03: "the entirety should be notes only" — same as Obsidian's
// help site, where a folder only expands in the sidebar). So clicking a
// folder crumb REVEALS that folder in the left tree — it opens and scrolls to
// it, without leaving what you're reading. "Library" opens the home page.

import { cn } from "@/lib/utils";

interface DocsCrumbsProps {
  /** Slash-joined folder chain to render. "" renders just "Library". */
  path: string;
  onOpenHome: () => void;
  /** Expand + scroll the left tree to this folder (Obsidian folder behavior). */
  onRevealFolder: (path: string) => void;
  className?: string;
}

export function DocsCrumbs({ path, onOpenHome, onRevealFolder, className }: DocsCrumbsProps) {
  const segments = path.split("/").map((segment) => segment.trim()).filter(Boolean);
  const crumbClass = "min-w-0 truncate rounded-sm hover:text-foreground hover:underline underline-offset-2";

  return (
    <nav
      aria-label="Breadcrumb"
      className={cn("flex min-w-0 items-center gap-1 overflow-hidden whitespace-nowrap text-[0.6875rem] text-(--ui-text-tertiary)", className)}
    >
      <button className={cn(crumbClass, "shrink-0")} onClick={onOpenHome} type="button">
        Library
      </button>
      {segments.map((segment, index) => {
        const target = segments.slice(0, index + 1).join("/");
        return (
          <span className="flex min-w-0 items-center gap-1" key={target}>
            <span className="text-(--ui-text-quaternary)">/</span>
            <button
              className={crumbClass}
              onClick={() => onRevealFolder(target)}
              title={`Show ${segment} in the sidebar`}
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
