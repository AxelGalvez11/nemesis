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
    // 🔴 THE STRIP AND THE `+` ARE SIBLINGS, because theirs is: in the desktop app's row the `+`
    // stands still between the last tab and the tools while the tabs scroll under the fade. Inside
    // the scroller it would slide out of reach the moment a fourth document opened.
    <div className="flex h-[32px] w-full min-w-0 items-center gap-[8px]">
      <div
        className="scrollbar-none horizontal-scroll-fade-mask flex h-full min-w-0 flex-1 items-center overflow-x-auto"
        data-testid="dock-tabs"
        role="tablist"
      >
      {items.map((item, index) => {
        const row = face(item);
        const current = item.key === active?.key;
        const marks = badgeFor?.(item) ?? 0;
        // 🔴 NO SEPARATOR ON THE ACTIVE TAB, THE ONE BEFORE IT, OR THE LAST ONE. Theirs is the same
        // rule (`t < l.length - 1 && !isActive && !nextIsActive`): a rule beside a filled pill reads
        // as part of the pill, and one after the last tab is a rule to nowhere.
        const separated = index < items.length - 1 && !current && items[index + 1]?.key !== active?.key;
        return (
          // 🔴 A `div` WEARING THE TAB, NOT A BUTTON CONTAINING ONE. The ✕ is a second action on the
          // same tab, and a button inside a button is invalid markup that browsers resolve by
          // dropping one of them — which is how a close control quietly becomes a select control.
          // The same reason `dock-switcher.tsx` gives for its menu rows.
          //
          // 🔴🔴 THEIR OWN TAB, READ OUT OF THE DESKTOP BUNDLE 2026-09-06 (owner: *"i need the tabs
          // to actually match the image i sent you one for one"*). Their shell is
          // `group/tab relative flex h-8 shrink-0 items-center rounded-lg py-1 px-2 ps-2.5` with
          // `pe-1.75` when it can be closed and `pe-1` when it cannot; `--spacing: .25rem` and
          // `--radius-lg` = 12.5px, so: 32 tall, 10 in at the start, 7 at the end, 4 top and bottom.
          <div
            className={cn(
              "group/tab relative flex h-[32px] max-w-[156px] shrink-0 items-center rounded-[12.5px] py-[4px] pe-[7px] ps-[10px]",
              current ? "text-(--ui-text-primary)" : "text-(--ui-text-secondary)",
            )}
            key={item.key}
            role="tab"
            aria-selected={current}
            title={marks > 0 ? `${row.title} · ${marks} annotation${marks === 1 ? "" : "s"}` : row.title}
          >
            {/* 🔴🔴 THE FILL IS ITS OWN LAYER, WHICH IS WHY AN INACTIVE TAB HAS NO EDGE AT ALL. Theirs:
                `pointer-events-none absolute inset-x-px inset-y-0 z-0 rounded-md` carrying
                `border-hairline` always, and then the state: active gets a raised fill, a real border
                and `shadow-tab-elevated` (0 0 8px rgba(0,0,0,.05)); inactive gets a TRANSPARENT border
                and only a ghost fill on hover. Painting the fill on the tab itself instead is what
                made every tab look like a pill. `--radius-md` = 10px against the shell's 12.5. */}
            <span
              aria-hidden
              className={cn(
                "pointer-events-none absolute inset-x-px inset-y-0 z-0 rounded-[10px] border-[0.5px] transition-colors",
                current
                  ? "border-(--ui-stroke-secondary) bg-(--ui-bg-elevated) shadow-[0_0_8px_rgba(0,0,0,0.05)]"
                  : "border-transparent group-hover/tab:bg-(--ui-bg-tertiary)/60",
              )}
            />
            {/* §46.3-exempt: their tab label wears their small step, which their own app-shell theme
                block sets to 12px (it measured 13 live at the window's 1.1 zoom). The owner asked for
                their pane one for one.
                🔴 THE CLASS NAME IS NOT WRITTEN OUT ANYWHERE IN THIS COMMENT. Tailwind scans .tsx
                prose and emits what it finds, and `canvas-shell.test.ts` reads it as a second type
                scale arriving on the canvas. It caught this line the first time it was written. */}
            <button
              className={cn(
                "no-drag relative z-10 flex min-w-0 flex-1 items-center gap-[8px] text-left text-[12px] font-[430] leading-[16px] transition-[padding]",
                current ? "pe-[20px]" : "group-hover/tab:pe-[20px] group-focus-within/tab:pe-[20px]",
              )}
              onClick={() => onSelect(item.key)}
              type="button"
            >
              <Codicon className="shrink-0" name={row.icon} size="16px" />
              {/* 🔴🔴 THE NAME FADES OUT, IT DOES NOT ELLIPSIS. Theirs is `.text-fade-truncate`:
                  `text-overflow: clip` plus a mask that takes the last 16px to transparent. It is the
                  visible difference in the owner's screenshot, where "Enola" and "Lilly In" are cut
                  mid-word with no dots. `dock-tab-fade` in globals.css carries the rule. */}
              <span className="dock-tab-fade block min-w-0 flex-1 whitespace-nowrap text-start">{row.title}</span>
              {/* 🔴 A NUMBER, NOT THE WHOLE PHRASE. The tab has 156px at most and the file's name is
                  what the learner is looking for; "3 annotations" is in the tab's own tooltip and on
                  the card the document was opened from, where there is room to say it. */}
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
                "absolute end-[6px] top-[6px] z-20 grid size-[20px] place-items-center rounded-[10px] transition-opacity",
                "text-(--ui-text-quaternary) hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary)",
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
            {/* Their `trailingDecoration`, exactly: `h-3 w-px shrink-0 end-0 absolute bg-border`,
                fading rather than mounting so the row never reflows. */}
            <span
              aria-hidden
              className={cn(
                "pointer-events-none absolute end-0 z-10 h-[12px] w-px shrink-0 bg-(--ui-stroke-secondary) transition-opacity duration-150",
                separated ? "opacity-100" : "opacity-0",
              )}
              data-testid="dock-tab-separator"
            />
          </div>
        );
      })}
      </div>
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
