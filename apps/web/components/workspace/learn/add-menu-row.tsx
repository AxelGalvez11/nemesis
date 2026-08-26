// One row of the composer's `+` menu, on both composers.
//
// 🔴 THE LABEL AND THE DETAIL SHARE A LINE, which is the reference's composition and not merely a
// tidier one. Stacked, the detail is a second line of small grey text under every row, so a
// four-row menu is eight lines and the eye has to descend through the explanations to compare the
// offers. Inline, the labels form one column you read straight down and the details sit beside
// them for whoever needs them. Owner ask, 2026-08-25, with screenshots.
//
// 🔴 IT IS A COMPONENT BECAUSE THE TWO MENUS DRIFTED ONCE ALREADY. The front door and the session
// composer each wrote their own rows, and #831 fixed the front door quietly offering fewer
// capabilities than the canvas did. Two hand-written copies of one row is the same setup with the
// styling instead of the list. One row, both menus.
//
// PRESENTATION ONLY. It renders what it is handed and runs what it is given.

import { Codicon } from "@/components/desktop-ui/codicon";
import { cn } from "@/lib/utils";

export interface AddMenuRowProps {
  /** A codicon name. */
  icon: string;
  /** What the learner gets, in their words. Never what the system does — §38's copy rule. */
  label: string;
  /** The quiet half-sentence beside it. Optional: a row whose label is already complete should
   *  not be given filler to justify a second column. */
  detail?: string;
  /**
   * A CSS custom property name for the icon's colour (owner ask, 2026-08-25).
   *
   * 🔴 OPTIONAL, AND THE DEFAULT IS THE OLD GREY. `Upload material` and `Record a lecture` are not
   * capabilities and produce no file, so there is no kind for a colour to mean — tinting them
   * anyway would make the colour decorative, and once it is decorative it stops telling you
   * anything about the rows that earned it.
   */
  tint?: string;
  onClick: () => void;
}

export function AddMenuRow({ detail, icon, label, onClick, tint }: AddMenuRowProps) {
  return (
    <button
      // 🔴 `whitespace-nowrap`, WITH THE MENU SIZED TO ITS CONTENT. Two phrases on one line wrap
      // badly in a fixed-width box — "Get a detailed" / "report" reads as two offers — so the row
      // refuses to wrap and the menu that holds it grows instead. See `ADD_MENU`.
      className="flex w-full items-center gap-2.5 whitespace-nowrap rounded-xl px-3 py-2 text-left text-[length:var(--canvas-text-small)] text-(--ui-text-primary) transition-colors hover:bg-(--ui-bg-tertiary)"
      onClick={onClick}
      role="menuitem"
      type="button"
    >
      {/* 🔴 THE COLOUR IS AN INLINE `color`, NOT A TAILWIND ARBITRARY CLASS. `text-(--var)` needs
          the token name at build time, and Tailwind cannot see one that arrives as a prop — the
          class would simply not be generated, and the icon would render in the inherited colour
          with nothing to show that anything was wrong. */}
      <Codicon
        className={cn("shrink-0", !tint && "text-(--ui-text-tertiary)")}
        name={icon}
        size="16px"
        style={tint ? { color: `var(${tint})` } : undefined}
      />
      <span>{label}</span>
      {detail && <span className="text-(--ui-text-quaternary)">{detail}</span>}
    </button>
  );
}

/**
 * The menu box both `+` menus open.
 *
 * 🔴 `w-max`, NOT A FIXED WIDTH. The rows are two phrases wide and their length is decided by the
 * copy, so a hard `w-[220px]` either truncates the longest detail or leaves a gutter beside the
 * shortest. Sizing to content puts the same air after every row. `min-w` keeps a two-row menu from
 * collapsing to something that reads as a tooltip; `max-w` is the backstop against copy nobody has
 * written yet turning the menu into a banner.
 */
export const ADD_MENU =
  "z-50 w-max min-w-[15rem] max-w-[24rem] overflow-hidden rounded-2xl bg-(--ui-bg-elevated) p-1.5 " +
  "shadow-[0_8px_28px_rgba(0,0,0,0.14)] ring-1 ring-(--ui-stroke-tertiary)";
