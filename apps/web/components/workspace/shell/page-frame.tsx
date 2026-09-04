"use client";

// The ONE frame the three shelf pages share: Projects, Library and Apps.
//
// Owner 2026-09-04, in order: the workspace pages "looked too much like ChatGPT"; then, pointing
// at gemini.google.com/library, "maybe something similar to this"; then "make sure spacing is
// consistent across projects, library, and apps pages". Consistency is not a thing three files can
// promise each other, so the frame lives here and the three pages import it. A page that draws
// its own title row is, by construction, a page that has drifted.
//
// 🔴🔴 EVERY NUMBER BELOW WAS MEASURED, NOT CHOSEN. Read off the live, signed-in Gemini Library
// in the owner's own Chrome at a 1456px viewport on 2026-09-04, with getComputedStyle and
// getBoundingClientRect:
//
//   column         760px, centred in whatever the sidebar leaves
//   title          "Library" 24px / weight 380 / 28px line; its top edge 19px into the page
//   title row      the 40px round buttons on the right set the row's height at 40
//   section head   17px / 540 / 24px line, on a 40px row that holds a 40x40 round button at the
//                  right edge (fill rgb(242,240,240), radius 100px)
//   rhythm         title row → 24px → heading row → 16px → rows; 24px between sections
//   row            760 x 89, radius 28px, padding 20px, fill rgb(242,240,240) on a
//                  rgb(250,249,249) ground, 8px between rows on an overview and 4px on a
//                  "View all" page; hover is an rgba(0,0,0,0.08) overlay
//   row text       a 24px outlined icon at the padding; text 60px in; title 17px / 400 / 24px;
//                  the line under it 13px / 400 / 17px, 8px lower, rgb(68,71,70) — see the type
//                  note below for why ours are 16 and 14
//
// 🔴 WHERE A NEMESIS TOKEN ALREADY IS THE MEASURED RELATIONSHIP, THE TOKEN WINS. Gemini's row is
// about 3% darker than its ground; ours is `black/[0.03]` on `--ui-bg-sidebar`, the same pair the
// Library's grid tiles already used, and it inverts for the dark theme by the same rule. Weights
// 380 and 540 are Google Sans Flex's; on the system font this app uses, 400 and 500 are the
// nearest real stops. The title's 19px top becomes 16px of page padding plus the row centring the
// 28px title inside 40px, which lands the title's top on 22 — three pixels lower than the
// reference and identical on all three pages, which is the property the owner asked for.
//
// 🔴🔴 THE TYPE SIZES ARE THE PRODUCT'S FIVE, NOT GEMINI'S. §46.3 (the owner's design rule,
// guarded in `learn/canvas-shell.test.ts` over this directory): "Large fonts are not a semantic
// tool in Nemesis", one scale, five steps — meta 12, small 14, body 16, lead 18, title 24. Gemini
// sets its rows at 17 over 13; a 17 would be a sixth step nobody declared. So the title is the
// scale's own 24, a heading and a row title are the 16 body (the heading told apart by weight,
// exactly as Gemini tells its 17/540 heading from its 17/400 row), and the line under a row's
// title is the 14 small. The RELATIONSHIPS survive — a heading is a row title made medium, the
// meta line sits one step below the title — and the sizes are ones the rest of the app already
// speaks. The line under the title sits 6px below it rather than 8 so a row still closes at the
// measured 89: 20 + 24 + 6 + 18 + 20.
//
// 🔴🔴 EVERY SPACING VALUE IS IN PIXELS. `globals.css` sets `html { font-size: 112.5% }`, so one
// rem is 18px and a rem-based utility is 12.5% bigger than its name says.

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** The content column. Reference: 760px. */
export const FRAME_COLUMN_PX = 760;
/** The page's top padding, above the title row. */
export const FRAME_TOP_PX = 16;
/** The title row and every section heading row: the height of the round button they carry. */
export const FRAME_ROW_PX = 40;
/** Title row → first section, and section → section. Reference: 24px. */
export const FRAME_SECTION_GAP_PX = 24;
/** Heading row → its rows. Reference: 16px. */
export const FRAME_HEAD_GAP_PX = 16;
/** Between rows. Reference: 8px on an overview, 4px on a View-all page. */
export const FRAME_ROW_GAP_PX = 8;
export const FRAME_LIST_GAP_PX = 4;
/** A row. Reference: 89px tall, 28px radius, 20px padding. */
export const FRAME_ROW_H_PX = 89;
export const FRAME_ROW_RADIUS_PX = 28;
export const FRAME_ROW_PAD_PX = 20;

/**
 * The title's and a heading's type, as strings, for the two surfaces that carry the frame's
 * grammar without its column: the Calendar (a full-width grid under a title row) and Settings
 * (a popup with a rail). `PageTitle` and `SectionHead` use the same strings, so a title is one
 * definition wherever it is drawn.
 */
export const FRAME_TITLE_TEXT = "text-[length:var(--canvas-text-title)] leading-[28px] font-normal text-(--ui-text-primary)";
export const FRAME_HEADING_TEXT = "text-[length:var(--canvas-text-body)] leading-[24px] font-medium text-(--ui-text-primary)";

/** The row's fill and hover, as one pair, so every surface on the frame answers the pointer alike. */
export const FRAME_FILL = "bg-black/[0.03] hover:bg-black/[0.08] dark:bg-white/[0.06] dark:hover:bg-white/[0.12]";
/** A round button's fill and hover: a shade firmer than a row, so it reads as a control on one. */
export const FRAME_BUTTON_FILL = "bg-black/[0.04] hover:bg-black/[0.08] dark:bg-white/[0.07] dark:hover:bg-white/[0.12]";

/** The scroller and the centred column. Every shelf page's outermost element. */
export function PageFrame({ children }: { children: ReactNode }) {
  return (
    // The gutter is on the scroller, not on the column, so the 760 is a real 760.
    <div className="scrollbar-dt h-full min-h-0 overflow-x-hidden overflow-y-auto overscroll-contain bg-(--ui-bg-sidebar) px-[16px]">
      <main className="mx-auto w-full pb-[96px]" style={{ maxWidth: FRAME_COLUMN_PX, paddingTop: FRAME_TOP_PX }}>
        {children}
      </main>
    </div>
  );
}

/**
 * The title row: the page's name on the left, round buttons on the right.
 *
 * `before` is for a back arrow on a View-all page; it sits ahead of the title on the same row.
 */
export function PageTitle({ before, children, controls }: { before?: ReactNode; children: ReactNode; controls?: ReactNode }) {
  return (
    <header className="flex items-center gap-[8px]" style={{ height: FRAME_ROW_PX }}>
      {before}
      <h1 className={cn("min-w-0 flex-1 truncate", FRAME_TITLE_TEXT)}>{children}</h1>
      {controls && <div className="flex shrink-0 items-center gap-[8px]">{controls}</div>}
    </header>
  );
}

/** A section heading row, with its round buttons at the right edge. */
export function SectionHead({ children, controls }: { children: ReactNode; controls?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-[8px]" style={{ height: FRAME_ROW_PX }}>
      <h2 className={cn("min-w-0 truncate", FRAME_HEADING_TEXT)}>{children}</h2>
      {controls && <div className="flex shrink-0 items-center gap-[8px]">{controls}</div>}
    </div>
  );
}

/** A section: heading row, 16px, then whatever it holds. Sections are 24px apart. */
export function Section({ children, controls, first, title }: { children: ReactNode; controls?: ReactNode; first?: boolean; title: ReactNode }) {
  return (
    <section style={{ marginTop: FRAME_SECTION_GAP_PX }} data-first={first ? "true" : undefined}>
      <SectionHead controls={controls}>{title}</SectionHead>
      <div style={{ marginTop: FRAME_HEAD_GAP_PX }}>{children}</div>
    </section>
  );
}

/** The 40px round button every row of controls is made of. */
export function RoundButton({
  children,
  className,
  disabled,
  label,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      aria-label={label}
      className={cn(
        "flex size-[40px] shrink-0 items-center justify-center rounded-full text-(--ui-text-primary) transition-colors disabled:opacity-40",
        FRAME_BUTTON_FILL,
        className,
      )}
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}

/**
 * A 40px text pill: the round button's grammar with a word in it. "Today" on the Calendar, a view
 * menu, a tab on a project's page. `active` gives it the fill at rest; otherwise it is quiet until
 * hovered, so a row of them reads as one control with one live segment.
 */
export function Pill({
  active,
  children,
  className,
  label,
  onClick,
  pressed,
}: {
  active?: boolean;
  children: ReactNode;
  className?: string;
  label?: string;
  onClick?: () => void;
  pressed?: boolean;
}) {
  return (
    <button
      aria-label={label}
      aria-pressed={pressed}
      className={cn(
        "flex h-[40px] shrink-0 items-center gap-[6px] rounded-full px-[16px] text-[length:var(--canvas-text-small)] leading-[20px] font-medium transition-colors",
        active
          ? cn("text-(--ui-text-primary)", FRAME_BUTTON_FILL)
          : "text-(--ui-text-secondary) hover:bg-black/[0.04] hover:text-(--ui-text-primary) dark:hover:bg-white/[0.07]",
        className,
      )}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

/**
 * The look of one soft row, for whatever element draws it (a button, a link, a plain div that
 * holds a button and a menu). Everything about the box lives here; the callers add only the
 * element and its handler.
 */
export const SOFT_ROW =
  "relative flex w-full items-start gap-[16px] rounded-[28px] p-[20px] text-left transition-colors " + FRAME_FILL;

/** The row's two lines. */
export function RowText({ meta, title }: { meta?: ReactNode; title: ReactNode }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="block truncate text-[length:var(--canvas-text-body)] leading-[24px] font-normal text-(--ui-text-primary)">{title}</span>
      {meta !== undefined && meta !== null && (
        <span className="mt-[6px] block truncate text-[length:var(--canvas-text-small)] leading-[18px] text-(--ui-text-secondary)">{meta}</span>
      )}
    </span>
  );
}

/** The row's leading 24px glyph slot. */
export function RowIcon({ children }: { children: ReactNode }) {
  return <span className="flex size-[24px] shrink-0 items-center justify-center text-(--ui-text-primary)">{children}</span>;
}
