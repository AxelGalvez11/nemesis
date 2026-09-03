"use client";

// What the sidebar is showing, and how you get to the other things open in it.
//
// 🔴🔴 A DROPDOWN, NOT A ROW OF TABS (owner, 2026-09-03): *"instead of tabs you have like a drop
// down menu of all the things you have open, with a downwards arrow ... that way we can have all
// the icons on the top row and more space for the thing."*
//
// The tab strip that came before it was the right idea and the wrong shape. Six open documents
// meant six chips competing for the same row as the controls, each truncated to 220px, and the
// strip scrolled — so the thing you were looking for was often not on screen. One button naming
// the front document costs one slot however many are open, which is what leaves room for the
// controls beside it and for the document below.
//
// 🔴 IT IS DUMB ON PURPOSE. Every decision — what is open, what is in front, what closing the front
// one falls back to — belongs to `document-dock.tsx`. A switcher that owned any of it would be a
// second opinion about what the sidebar is showing.

import { ChevronDown } from "lucide-react";

import { Codicon } from "@/components/desktop-ui/codicon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/desktop-ui/dropdown-menu";
import { fileMark } from "@/lib/learn/kind-mark";
import { cn } from "@/lib/utils";

import type { DockItem } from "./document-dock";
import { CHROME } from "./reader-chrome";

/** What an open thing is called and which glyph it wears. */
function face(item: DockItem): { title: string; icon: string } {
  // 🔴 THE SAME MARK THE SHELF DRAWS. A menu of six documents was six identical page glyphs, and
  // this is the surface where telling a deck from a spreadsheet at a glance matters most. An
  // artifact wears its kind for the same reason. See lib/learn/kind-mark.ts.
  switch (item.kind) {
    case "document":
      return { icon: fileMark(item.source.title, item.source.kind).icon, title: item.source.title };
    case "output":
      return { icon: fileMark(item.output.title, item.output.kind).icon, title: item.output.title };
    case "deck":
      return { icon: "layers", title: item.title };
    case "check":
      return { icon: "checklist", title: item.title };
    case "mindmap":
      return { icon: "type-hierarchy", title: item.title };
  }
}

export function DockSwitcher({
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
  const active = items.find((item) => item.key === activeKey) ?? items[0];
  if (!active) return null;
  const front = face(active);

  // 🔴 ONE OPEN THING GETS A LABEL, NOT A MENU WITH ONE ROW IN IT. A chevron that opens a list of
  // the single thing you are already looking at is a control that does nothing, and the sidebar is
  // in this state most of the time.
  if (items.length === 1) {
    return (
      <div className="flex min-w-0 flex-1 items-center gap-[6px] px-[6px]" title={front.title}>
        <Codicon className="shrink-0" name={front.icon} size="14px" />
        <span className={CHROME.crumb}>{front.title}</span>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-1 items-center">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            aria-label={`Open in the sidebar: ${front.title}. Switch to another`}
            className={cn(
              "flex min-w-0 max-w-full items-center gap-[6px] rounded-[8px] py-[7px] pl-[6px] pr-[8px] transition-colors",
              "hover:bg-(--ui-bg-tertiary)",
            )}
            title={front.title}
            type="button"
          >
            <Codicon className="shrink-0" name={front.icon} size="14px" />
            <span className={CHROME.crumb}>{front.title}</span>
            {/* The affordance the owner asked for by name: a downwards arrow, so the label reads as
                a control rather than as a title that happens to be there. */}
            <ChevronDown className="shrink-0 text-(--ui-text-quaternary)" size={14} strokeWidth={2} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-[60vh] w-72 overflow-y-auto">
          {items.map((item) => {
            const row = face(item);
            const current = item.key === active.key;
            return (
              // 🔴 A ROW IS A `div`, NOT A MENU ITEM WRAPPING A BUTTON. Its ✕ is a second action on
              // the same row, and a button inside a `DropdownMenuItem` gets the item's `onSelect`
              // as well as its own — so closing a document would also switch to it, which is the
              // opposite of what pressing ✕ means.
              <div
                className={cn(
                  "flex items-center gap-[6px] rounded-[6px] px-[6px] transition-colors",
                  current ? "bg-(--ui-bg-tertiary)" : "hover:bg-(--ui-bg-tertiary)/60",
                )}
                key={item.key}
              >
                <button
                  aria-current={current}
                  className="flex min-w-0 flex-1 items-center gap-[8px] py-[7px] text-left"
                  onClick={() => onSelect(item.key)}
                  type="button"
                >
                  <Codicon className="shrink-0" name={row.icon} size="14px" />
                  <span className={cn(CHROME.crumb, current ? undefined : "text-(--ui-text-secondary)")}>
                    {row.title}
                  </span>
                </button>
                <button
                  aria-label={`Close ${row.title}`}
                  className="grid size-[20px] shrink-0 place-items-center rounded-[5px] text-(--ui-text-quaternary) transition-colors hover:bg-(--ui-bg-elevated) hover:text-(--ui-text-primary)"
                  onClick={(event) => {
                    // Closing must not also dismiss the menu on the way to switching: the learner is
                    // tidying up and usually has another to close.
                    event.preventDefault();
                    event.stopPropagation();
                    onClose(item.key);
                  }}
                  type="button"
                >
                  <Codicon name="close" size="12px" />
                </button>
              </div>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
