"use client";

// The sidebar's one row of tabs.
//
// 🔴🔴 ONE STRIP OVER BOTH KINDS, WHICH IS WHY IT IS ITS OWN COMPONENT (owner, 2026-09-03: *"i dont
// want this, documents, lectures, and everything should open in one sidebar"*). The document panel
// drew a strip of documents; the artifact panel drew a breadcrumb of one title. Open a study guide
// while a lecture was open and you got both, stacked, each certain it was the only thing on that
// edge of the screen.
//
// Both panels render THIS now, from the same `DockItem[]`, so the strip reads the same whichever
// body is behind it and pressing any tab brings that thing to the front.
//
// 🔴 IT IS DUMB ON PURPOSE. Every decision — what is open, what is in front, what closing the front
// tab falls back to — belongs to `document-dock.tsx`. A strip that owned any of it would be a
// second opinion about what the sidebar is showing, which is the defect this replaces.

import { Codicon } from "@/components/desktop-ui/codicon";
import { fileMark } from "@/lib/learn/kind-mark";
import { cn } from "@/lib/utils";

import type { DockItem } from "./document-dock";
import { CHROME } from "./reader-chrome";

/** What a tab is called and which glyph it wears. */
function tabFace(item: DockItem): { title: string; icon: string } {
  if (item.kind === "document") {
    // 🔴 THE SAME MARK THE SHELF DRAWS. A strip of six documents was six identical page glyphs, and
    // this is the surface where telling a deck from a spreadsheet at a glance matters most — the
    // names truncate at 220px. See lib/learn/kind-mark.ts.
    return { icon: fileMark(item.source.title, item.source.kind).icon, title: item.source.title };
  }
  return { icon: fileMark(item.output.title, item.output.kind).icon, title: item.output.title };
}

export function DockTabs({
  items,
  activeKey,
  onSelect,
  onClose,
}: {
  items: readonly DockItem[];
  activeKey: string | null;
  onSelect: (key: string) => void;
  onClose: (key: string) => void;
}) {
  return (
    // 🔴 THE STRIP SCROLLS INSIDE ITS OWN BOX. Its siblings in the header — the actions and the
    // close — are outside it and never move: tabs are `shrink-0`, so a strip that contained them
    // pushed the one control that closes the panel off the right edge and out of reach. Found on
    // screen with two tabs on a narrowed panel.
    <div className="flex min-w-0 flex-1 items-center gap-[2px] overflow-x-auto" role="tablist">
      {items.map((item) => {
        const current = item.key === activeKey;
        const face = tabFace(item);
        return (
          <div
            className={cn(
              "flex min-w-0 max-w-[220px] shrink-0 items-center gap-[6px] rounded-[8px] pl-[8px] pr-[4px] transition-colors",
              current ? "bg-(--ui-bg-tertiary)" : "hover:bg-(--ui-bg-tertiary)/60",
            )}
            key={item.key}
          >
            <button
              aria-selected={current}
              className="flex min-w-0 items-center gap-[6px] py-[7px]"
              onClick={() => onSelect(item.key)}
              role="tab"
              title={face.title}
              type="button"
            >
              <Codicon className="shrink-0" name={face.icon} size="14px" />
              <span className={cn(CHROME.crumb, current ? undefined : "text-(--ui-text-tertiary)")}>{face.title}</span>
            </button>
            <button
              aria-label={`Close ${face.title}`}
              className="grid size-[20px] shrink-0 place-items-center rounded-[5px] text-(--ui-text-quaternary) transition-colors hover:bg-(--ui-bg-elevated) hover:text-(--ui-text-primary)"
              onClick={() => onClose(item.key)}
              type="button"
            >
              <Codicon name="close" size="12px" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
