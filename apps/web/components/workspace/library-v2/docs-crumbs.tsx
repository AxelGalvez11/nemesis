"use client";

// The breadcrumb strip above a note (owner 2026-08-05: "add the breadcrumbs
// to the notes again", reversing 2026-08-04's removal). Folders are PAGES now
// (Notion model), so each folder crumb opens that folder's own page rather
// than merely revealing it in the tree the way the pre-removal strip did.
//
// 🔴 EVERY LEVEL IS NAVIGABLE, INCLUDING "Library" (owner 2026-08-06:
// "Breadcrumb behavior should feel standard and predictable"). It used to be a
// quiet label, on the reasoning that the sidebar had its own trigger — but a
// breadcrumb root that does nothing is the first thing anybody tries, and a
// control that looks like the rest of the trail and silently ignores the click
// teaches people not to trust the trail at all.
//
// The CURRENT PAGE is the last crumb and is deliberately NOT a control:
// `aria-current="page"` is what a breadcrumb is supposed to say, and a button
// that re-opens the page you are already reading is a no-op dressed as an
// affordance. "Every level should be clickable" means every level ABOVE here.
//
// The trail itself is built by lib/workspace/library-crumbs.ts; this file only
// draws it.

import { cn } from "@/lib/utils";
import { libraryCrumbs } from "@/lib/workspace/library-crumbs";

interface DocsCrumbsProps {
  /** Slash-joined folder chain ABOVE the page. "" renders just "Library". */
  path: string;
  /** Open the folder page for the chain up to the clicked crumb. */
  onOpenFolder: (path: string) => void;
  /** Back to the Library root — the same place the sidebar's Library goes. */
  onOpenRoot: () => void;
  /** The page being read, shown as the final, non-interactive crumb. */
  currentTitle?: string | null;
  className?: string;
}

/** Shared by every crumb so the root, the folders and the current page sit on
 *  one baseline. */
const CRUMB = "truncate rounded-sm";
const CRUMB_LINK = "underline-offset-2 hover:text-foreground hover:underline";

export function DocsCrumbs({ path, onOpenFolder, onOpenRoot, currentTitle, className }: DocsCrumbsProps) {
  const crumbs = libraryCrumbs(path, currentTitle ?? "");

  return (
    <nav
      aria-label="Breadcrumb"
      className={cn(
        "flex min-w-0 items-center gap-1 overflow-hidden whitespace-nowrap text-[0.6875rem] text-(--ui-text-tertiary)",
        className,
      )}
    >
      {crumbs.map((crumb, index) => {
        const separator = index === 0 ? null : <span className="shrink-0 text-(--ui-text-quaternary)">/</span>;
        if (crumb.kind === "root") {
          return (
            <button className={cn(CRUMB, CRUMB_LINK, "shrink-0")} key="root" onClick={onOpenRoot} title="Open the Library" type="button">
              Library
            </button>
          );
        }
        if (crumb.kind === "folded") {
          // The folded middle stays a plain label: the folders it stands for are
          // still reachable one level at a time, and a "…" that opens something
          // arbitrary is worse than one that opens nothing.
          return (
            <span className="flex shrink-0 items-center gap-1" key="folded" title={crumb.hidden.join(" / ")}>
              {separator}
              <span>…</span>
            </span>
          );
        }
        if (crumb.kind === "folder") {
          return (
            // The NAVIGABLE crumbs do not shrink. When the row is tight it is
            // the page title that gives way, because it is the one crumb
            // already spelled out in 2rem type immediately underneath —
            // shrinking the ancestors instead would truncate the only things
            // here that can be clicked.
            <span className="flex shrink-0 items-center gap-1" key={crumb.target}>
              {separator}
              <button
                className={cn(CRUMB, CRUMB_LINK, "max-w-[12rem]")}
                onClick={() => onOpenFolder(crumb.target)}
                title={`Open ${crumb.label}`}
                type="button"
              >
                {crumb.label}
              </button>
            </span>
          );
        }
        return (
          <span className="flex min-w-0 items-center gap-1" key="current">
            {separator}
            <span aria-current="page" className={cn(CRUMB, "min-w-0 text-(--ui-text-secondary)")}>{crumb.label}</span>
          </span>
        );
      })}
    </nav>
  );
}
