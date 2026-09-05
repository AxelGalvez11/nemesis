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
 * 🔴🔴 CHATGPT'S DESKTOP TAB, ONE FOR ONE, MEASURED LIVE OVER CDP ON 2026-09-04 (owner: *"just copy
 * the ChatGPT side panel … one for one"*). Their window runs at a 1.1 zoom, divided out here:
 *
 *   pill        `h-7 w-full max-w-39 rounded-lg px-2 py-1`: 28px tall, at most 156 wide, a 12.5px
 *               corner, 8px each side; pills 8px apart
 *   inner       `flex flex-1 items-center gap-2` at their small text step: a 16px mark, 8px,
 *               then 13px on an 18.57px line at weight 430
 *   selected    ink `text-default`, `pe-5` (20px) so the name stops short of the close
 *   unselected  ink `text-secondary` (65%), `group-hover/tab:pe-3.5`, the close at opacity 0
 *   close       20x20 at a 10px corner, 4px in from the pill's right edge and top
 *
 * 🔴 IT SCROLLS SIDEWAYS RATHER THAN SHRINKING PAST LEGIBILITY (`hide-scrollbar overflow-x-auto`
 * on theirs): past the point where the pills fit, the row scrolls instead of squeezing every
 * label into an ellipsis. No scrollbar is drawn; the tabs themselves are the affordance.
 *
 * 🔴 THE SELECTED FILL IS OURS. Their pill and their bar both computed to white in the measured
 * theme, so what separates the front tab there is the ink and the close; the owner's own
 * screenshot shows a grey pill, so the front tab keeps `--ui-bg-tertiary`, the fill every other
 * chosen chip in this app wears.
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
    // 🔴 THE STRIP FILLS THE LEFT OF THE PANEL'S ONE ROW NOW (`dock-panel.tsx`, 2026-09-04): the
    // row owns the padding and the height, so the strip is the tabs and nothing around them.
    <div
      className="scrollbar-none flex h-[28px] w-full items-center gap-[8px] overflow-x-auto"
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
              "group/tab relative flex h-[28px] max-w-[156px] shrink-0 items-center overflow-hidden rounded-[12.5px] px-[8px] py-[4px] transition-colors",
              current
                ? "bg-(--ui-bg-tertiary) text-(--ui-text-primary)"
                : "text-(--ui-text-secondary) hover:bg-(--ui-bg-tertiary)/60",
            )}
            key={item.key}
            role="tab"
            aria-selected={current}
            title={marks > 0 ? `${row.title} · ${marks} annotation${marks === 1 ? "" : "s"}` : row.title}
          >
            {/* §46.3-exempt: ChatGPT's tab label, measured live at 13px on an 18.57px line at
                weight 430 (2026-09-04), and the owner asked for their pane one for one. The scale's
                nearest steps are 12 and 14, and a tab in either reads as a different tab. */}
            <button
              className={cn(
                "relative z-10 flex min-w-0 flex-1 items-center gap-[8px] text-left text-[13px] font-[430] leading-[18.57px] transition-[padding]",
                current ? "pe-[20px]" : "group-hover/tab:pe-[14px] group-focus-within/tab:pe-[14px]",
              )}
              onClick={() => onSelect(item.key)}
              type="button"
            >
              <Codicon className="shrink-0" name={row.icon} size="16px" />
              <span className="truncate">{row.title}</span>
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
              // 🔴 ABSOLUTE, 4px IN FROM THE PILL'S RIGHT AND TOP, as theirs is: the name's own
              // `pe-5` is what makes room for it, so the label never reflows when it appears.
              className={cn(
                "absolute end-[4px] top-[4px] z-20 grid size-[20px] place-items-center rounded-[10px] transition-opacity",
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
          className="grid size-[28px] shrink-0 place-items-center rounded-[12.5px] text-(--ui-text-quaternary) transition-colors hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary)"
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
