"use client";

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

import { type RefObject, useLayoutEffect, useRef, useState } from "react";

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
/**
 * 🔴 AND A CEILING, BECAUSE THE MENU OPENS DOWNWARD NOW. On the front door the popover hangs below
 * the composer (the reference's placement on that screen, measured 2026-09-01), which puts eight
 * rows into whatever is left of the window. `min()` rather than a flat `vh`: on a tall screen the
 * menu should never grow past the point where it stops reading as a menu, and on a short one it
 * must not run off the bottom edge with rows nobody can reach. `overflow-y-auto` with the x axis
 * still clipped keeps the corners and the `whitespace-nowrap` rows both intact.
 */
export const ADD_MENU =
  "z-50 w-max min-w-[15rem] max-w-[24rem] max-h-[min(60vh,26rem)] overflow-y-auto overflow-x-hidden " +
  "rounded-2xl bg-(--ui-bg-elevated) p-1.5 " +
  "shadow-[0_8px_28px_rgba(0,0,0,0.14)] ring-1 ring-(--ui-stroke-tertiary)";


/** Which side of the composer the menu hangs off. */
export type MenuSide = "above" | "below";

/** Four rows and the box's own padding — 4 x 40 + 12. Below this a menu reads as a scrap of a list
 *  rather than a menu, and that is the point at which moving it is worth covering whatever is on
 *  the other side. */
const USABLE = 172;

/**
 * Which side to open on, given the room each side has and how tall the menu wants to be.
 *
 * PURE, so the rule can be argued with in a test rather than only on a screen at one window size.
 * The window sizes that matter are the ones nobody has to hand.
 */
export function menuSide(room: { above: number; below: number }, needed: number, preferred: MenuSide): MenuSide {
  const other: MenuSide = preferred === "below" ? "above" : "below";
  // Keep the preferred side while it can show a usable amount of the menu; the rest becomes a
  // scroll. Move only when the other side is genuinely roomier AND this one is too cramped to use.
  if (room[preferred] >= Math.min(needed, USABLE)) return preferred;
  return room[other] > room[preferred] ? other : preferred;
}

/** How close the menu may come to the edge of the window before it counts as not fitting. */
const EDGE = 12;

/**
 * Place the `+` menu on the side of the composer that has room for it, and never let it run off
 * the window.
 *
 * 🔴🔴 THIS EXISTS BECAUSE A FIXED DIRECTION IS A BUG ON SOMEBODY ELSE'S SCREEN, AND I SHIPPED THAT
 * BUG BEFORE MEASURING FOR IT. The front door's menu was moved below the composer on 2026-09-01 to
 * stop it covering the heading and the character. Measured on the owner's own tall window it fit
 * with room to spare; measured at 1280x760 it ran **61px past the bottom of the viewport**, on a
 * page that does not scroll — the last row and a half simply unreachable, with nothing on screen
 * to say so. A menu is not placed correctly until it is placed correctly on a laptop.
 *
 * 🔴🔴 IT SCROLLS BEFORE IT FLIPS, AND THAT ORDER IS THE POINT. The obvious rule — "flip whenever
 * the preferred side cannot show the whole menu" — was written first and watched on a 760px window:
 * the front door's menu duly flipped up and landed back over the character, which is the complaint
 * this whole change exists to answer, returning on anyone's laptop. A capped, scrolling menu on the
 * right side of the composer is a completely ordinary control; a full-height menu on the wrong side
 * of it is the bug. So the preferred side keeps the menu while it can show a usable amount of it,
 * `maxHeight` turns the remainder into a scroll, and the flip is held back for a window with
 * genuinely nothing below.
 *
 * 🔴 THE TWO SURFACES WANT DIFFERENT DEFAULTS, so this does not compute a direction from scratch:
 * the front door has open page below it and a character above it, the session composer sits on the
 * floor of the window.
 *
 * 🔴 `useLayoutEffect`, NOT `useEffect`: the flip has to land before the browser paints, or the
 * menu is visibly drawn in the wrong place for a frame on exactly the screens that need it moved.
 * The menu must already be rendered for its height to be real, which is why this measures rather
 * than predicts.
 */
export function useMenuSide(
  open: boolean,
  preferred: MenuSide,
): { maxHeight: number | undefined; ref: RefObject<HTMLDivElement | null>; side: MenuSide } {
  const ref = useRef<HTMLDivElement | null>(null);
  const [placement, setPlacement] = useState<{ maxHeight: number | undefined; side: MenuSide }>({
    maxHeight: undefined,
    side: preferred,
  });

  useLayoutEffect(() => {
    if (!open) return;
    const element = ref.current;
    // 🔴 THE ANCHOR IS WHATEVER THE MENU IS POSITIONED AGAINST, read off the DOM rather than passed
    // in. Both composers deliberately anchor to their composer CARD (see their own notes); asking
    // for the anchor as a prop would let one of them hand over the button again and get a
    // measurement of the wrong box, which is the failure this whole change is unwinding.
    const anchor = element?.offsetParent;
    if (!element || !(anchor instanceof HTMLElement)) return;
    const card = anchor.getBoundingClientRect();
    const room = { above: card.top - EDGE, below: window.innerHeight - card.bottom - EDGE };
    const side = menuSide(room, element.getBoundingClientRect().height, preferred);
    setPlacement({ maxHeight: Math.max(0, Math.floor(room[side])), side });
  }, [open, preferred]);

  return { ...placement, ref };
}
