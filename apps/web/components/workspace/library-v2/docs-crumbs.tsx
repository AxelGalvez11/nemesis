"use client";

// The breadcrumb strip above a note, folder or source page. Every crumb is a
// LINK, the way docs sites work: "Library" goes home, each folder name opens
// that folder's own page (its notes + its Sources area). The current page
// itself is never in the strip — its name is the h1 right below.

import { cn } from "@/lib/utils";

interface DocsCrumbsProps {
  /** Slash-joined folder chain to render. "" renders just "Library". */
  path: string;
  onOpenHome: () => void;
  onOpenFolder: (path: string) => void;
  className?: string;
}

export function DocsCrumbs({ path, onOpenHome, onOpenFolder, className }: DocsCrumbsProps) {
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
            <button className={crumbClass} onClick={() => onOpenFolder(target)} type="button">
              {segment}
            </button>
          </span>
        );
      })}
    </nav>
  );
}
