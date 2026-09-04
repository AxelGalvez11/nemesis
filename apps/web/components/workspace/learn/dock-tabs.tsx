"use client";

// The row of tabs across the top of the sidebar: one per open thing, with the front one filled.
//
// 🔴🔴 TABS AGAIN, AND THE DROPDOWN THEY REPLACE WAS NOT A MISTAKE. `dock-switcher.tsx` shipped on
// 2026-09-03 at the owner's own request: *"instead of tabs you have like a drop down menu of all
// the things you have open, with a downwards arrow ... that way we can have all the icons on the
// top row and more space for the thing."* That reasoning was sound about the tab strip AS IT THEN
// WAS: it shared ONE row with every control, so six documents meant six chips truncated to 220px
// fighting the buttons for the same 632px, and the strip scrolled so the one you wanted was often
// off screen.
//
// 🔴 THE REFERENCE SOLVES THAT BY GIVING THE TABS THEIR OWN ROW, and that is the whole of why this
// can come back. Measured in ChatGPT's desktop app on 2026-09-03 (the WEB app has a different,
// older pane — a breadcrumb, no tabs — so it is the wrong thing to measure): row one is nothing but
// tabs and a `+`; row two carries the document's name on the left and the controls on the right.
// Two rows, each with one job. Bringing the tabs back into a single shared row would walk straight
// back into the problem the dropdown was asked for.
//
// 🔴 EVERY TAB KEEPS ITS FILE-TYPE MARK. `fileMark` is the same mark the shelf and the switcher
// draw, so a spreadsheet reads as a spreadsheet in all three places; six identical page glyphs is
// the failure this shares with the menu it replaces.
//
// 🔴 IT IS DUMB, LIKE THE SWITCHER WAS. What is open, what is in front, and what closing the front
// one falls back to all belong to the surfaces that own the list. A tab strip with an opinion about
// any of that would be a second answer to a question already answered.

import { Codicon } from "@/components/desktop-ui/codicon";
import { fileMark } from "@/lib/learn/kind-mark";
import { cn } from "@/lib/utils";

import type { DockItem } from "./document-dock";

/** What an open thing is called and which glyph it wears. Shared shape with `dock-switcher`. */
function face(item: DockItem): { title: string; icon: string } {
  switch (item.kind) {
    case "document":
      return { icon: fileMark(item.source.title, item.source.kind).icon, title: item.source.title };
    case "output":
      return { icon: fileMark(item.output.title, item.output.kind).icon, title: item.output.title };
    // 🔴 THE SAME GLYPHS THE CARDS IN THE CONVERSATION WEAR: a deck is `layers` on its artifact
    // card, a check is `checklist` on its receipt, and a map is the hierarchy glyph.
    case "deck":
      return { icon: "layers", title: item.title };
    case "check":
      return { icon: "checklist", title: item.title };
    case "mindmap":
      return { icon: "type-hierarchy", title: item.title };
  }
}

/**
 * The strip.
 *
 * 🔴 IT SCROLLS SIDEWAYS RATHER THAN SHRINKING PAST LEGIBILITY. A tab has a floor
 * (`min-w-[120px]`) and a ceiling (`max-w-[220px]`); past the point where they fit, the row scrolls
 * instead of squeezing every label into an ellipsis. That is the reference's behaviour and it is
 * the honest one: a strip of eight unreadable stubs is a worse answer than a strip you push.
 *
 * 🔴 NO SCROLLBAR IS DRAWN. `scrollbar-none` keeps the row at its height whatever is in it; the
 * tabs themselves are the affordance, and a horizontal bar under them would eat the gap to row two.
 *
 * 🔴 32px, DOWN FROM 36, ON 2026-09-04 (owner: *"the sidebar headers containing the tabs and tools
 * feel too big"*). The tab itself is 26px, which is the reference's own closable-tab geometry read
 * out of their bundle (`tabs`, toolbar variant: `rounded-md px-2 py-1` at 13px over an 18px line,
 * gap 2px between tabs, a 20px-wide close hit box). This row and the 36px band under it come to
 * 68px of chrome, where the two rows used to come to 83px.
 */
export function DockTabs({
  items,
  activeKey,
  onSelect,
  onClose,
  onAdd,
  badgeFor,
}: {
  items: readonly DockItem[];
  activeKey: string | null;
  onSelect: (key: string) => void;
  onClose: (key: string) => void;
  /** Open something else. Absent on a surface with nothing to add. */
  onAdd?: () => void;
  /**
   * How many annotations one tab's document carries, for the chip beside its name.
   *
   * 🔴 THE HOST COUNTS, THE STRIP DRAWS — the same "it is dumb" rule this file already states. What
   * a mark is and where the notes live differ between surfaces (the chat's are rows in a table, the
   * board's ride in its own document), and a strip with an opinion about either would be a second
   * answer to a question already answered. Zero and absent both draw nothing.
   */
  badgeFor?: (item: DockItem) => number;
}) {
  if (items.length === 0) return null;
  const active = items.find((item) => item.key === activeKey) ?? items[0];

  return (
    <div
      className="scrollbar-none flex h-[32px] w-full shrink-0 items-center gap-[2px] overflow-x-auto px-[6px]"
      data-testid="dock-tabs"
      role="tablist"
    >
      {items.map((item) => {
        const row = face(item);
        const current = item.key === active?.key;
        const marks = badgeFor?.(item) ?? 0;
        return (
          // 🔴 A `div` WEARING THE TAB, NOT A BUTTON CONTAINING ONE. The ✕ is a second action on the
          // same tab, and a button inside a button is invalid markup that browsers resolve by
          // dropping one of them — which is how a close control quietly becomes a select control.
          // The same reason `dock-switcher.tsx` gives for its menu rows.
          <div
            className={cn(
              "group/tab flex h-[26px] min-w-[120px] max-w-[220px] shrink-0 items-center gap-[6px] rounded-[8px] pl-[8px] transition-colors",
              current
                ? "bg-(--ui-bg-tertiary) text-(--ui-text-primary)"
                : "text-(--ui-text-secondary) hover:bg-(--ui-bg-tertiary)/60",
              "pr-[4px]",
            )}
            key={item.key}
            role="tab"
            aria-selected={current}
            title={marks > 0 ? `${row.title} · ${marks} annotation${marks === 1 ? "" : "s"}` : row.title}
          >
            <button
              className="flex min-w-0 flex-1 items-center gap-[6px] text-left"
              onClick={() => onSelect(item.key)}
              type="button"
            >
              <Codicon className="shrink-0" name={row.icon} size="14px" />
              <span className="truncate text-[length:var(--canvas-text-small)] leading-[20px]">{row.title}</span>
              {/* 🔴 A NUMBER, NOT THE WHOLE PHRASE. The tab has 220px at most and the file's name is
                  what the learner is looking for; "3 annotations" is in the tab's own tooltip and on
                  the card the document was opened from, where there is room to say it. */}
              {/* 🔴 `--canvas-text-meta` (12px), THE SMALLEST STEP ON THE SCALE, not a 10px of its
                  own. §46.3 is one type scale for the whole surface, and `canvas-shell.test.ts`
                  catches a size invented for one badge. */}
              {marks > 0 && (
                <span
                  className="shrink-0 rounded-full bg-(--ui-action) px-[5px] text-[length:var(--canvas-text-meta)] font-semibold leading-[16px] text-(--ui-action-glyph)"
                  data-testid="dock-tab-annotations"
                >
                  {marks}
                </span>
              )}
            </button>
            <button
              aria-label={`Close ${row.title}`}
              // 🔴 ALWAYS RENDERED, REVEALED ON HOVER — never conditionally mounted. A control that
              // appears on hover by being added to the DOM shifts the label under the pointer, so
              // the thing you were about to click moves as you reach it. Opacity costs no layout.
              className={cn(
                "grid size-[20px] shrink-0 place-items-center rounded-[5px] transition-opacity",
                "text-(--ui-text-quaternary) hover:bg-(--ui-bg-elevated) hover:text-(--ui-text-primary)",
                current ? "opacity-100" : "opacity-0 group-hover/tab:opacity-100 focus-visible:opacity-100",
              )}
              onClick={(event) => {
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
      {onAdd && (
        <button
          aria-label="Open another document"
          className="grid size-[26px] shrink-0 place-items-center rounded-[8px] text-(--ui-text-quaternary) transition-colors hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary)"
          onClick={onAdd}
          title="Open another document"
          type="button"
        >
          <Codicon name="add" size="14px" />
        </button>
      )}
    </div>
  );
}
