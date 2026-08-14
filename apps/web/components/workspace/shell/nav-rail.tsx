"use client";

// The collapsed sidebar, as an icon rail.
//
// 🔴 COLLAPSED USED TO MEAN GONE, AND THAT WAS THE DEFECT (owner 2026-08-14: "i want the sidebar to
// be like this, not fully hidden ... but it should not appear in canvas mode"). The shell set
// `--pane-chat-sidebar-width` to `0px` when the rail was closed and floated a single toggle over
// the surface's top-left corner. Reaching Library from the front door was therefore two presses
// with a layout shift in between, and the product's four destinations were invisible until you
// went looking. A rail keeps them one press away and costs 52px.
//
// 🔴 IT DRAWS `SIDEBAR_NAV`, THE SAME ARRAY THE EXPANDED SIDEBAR DRAWS. Copying the four rows here
// would have been shorter and would eventually have let the rail and the sidebar disagree about
// where the product can go — each looking correct on its own. See lib/workspace/sidebar-nav.ts.
//
// 🔴 AND IT IS NOT RENDERED INSIDE A CANVAS. That is not decided here: `shellNavigation` returns
// `railVisible: false` under `focusMode`, which a canvas claims through `immersive-surface.tsx`.
// Putting the check in this component would have made it a second opinion about §38.1, and two
// places deciding whether a canvas is full-bleed is how they come to differ.

import { usePathname, useRouter } from "next/navigation";

import { PanelLeft } from "lucide-react";

import { Codicon } from "@/components/desktop-ui/codicon";
import { useSettingsModal } from "@/components/workspace/shell/settings-modal";
import { navigationRootFor, navItemActive, SIDEBAR_NAV } from "@/lib/workspace/sidebar-nav";
import { cn } from "@/lib/utils";

/**
 * Width of the rail. Published as a constant because the shell sizes the grid column with it and a
 * second literal there would drift. Written in px: every rem in apps/web is 1.125× its number, so
 * a rem here would silently be 12.5% wider than it reads.
 *
 * 🔴 CALIBRATED AGAINST THE REFERENCE, NOT COPIED FROM IT. Measured on chatgpt.com at 1440×783:
 * rail 52px, rows 36×36 at 10px radius, 20px icons, 36px vertical rhythm, transparent with no
 * border. The owner's instruction is explicit that this is an input, not a target — "I don't want
 * Nemesis to copy ChatGPT pixel-for-pixel. I want the same design principles: restrained sizing,
 * good spacing, strong hierarchy, minimal chrome, clear active states." So the geometry is taken
 * and the colours are ours: rows use the workspace's own control tokens, not sampled greys.
 */
export const NAV_RAIL_WIDTH_PX = 52;

/** Row size and rhythm, from the same calibration. A row is its own hit target: 36px square. */
const ROW_PX = 36;

interface NavRailProps {
  accountEmail: string;
  /** Expand to the full sidebar. */
  onExpand: () => void;
}

export function NavRail({ accountEmail, onExpand }: NavRailProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { openSettings } = useSettingsModal();
  const navigationRoot = navigationRootFor(pathname);

  return (
    <nav
      aria-label="Workspace"
      // 🔴 NO BORDER AND NO FILL — "minimal chrome". The reference rail paints neither, and a rule
      // down the left edge of a 52px column is a line drawn around almost nothing. The rail reads
      // as part of the page; the OPEN sidebar is the state that earns a surface of its own.
      className="flex h-full flex-col items-center py-2"
      data-nav-rail=""
      style={{ width: `${NAV_RAIL_WIDTH_PX}px` }}
    >
      {/* Expand sits where the brand does in the open sidebar, so the two states share a corner and
          the control does not appear to move when it opens. Same panel-left glyph as the sidebar's
          own collapse button (UX brief §27.1): one icon means "the sidebar", and the direction is
          carried by which state you are in, not by drawing a different arrow.
          🔴 SEPARATED FROM THE DESTINATIONS BELOW IT. Measured 52px to the next row against 36px
          between the rest: it acts on the rail itself, the others leave it, and spacing is what
          says so — §46.3 rules out making it bigger to mean the same thing. */}
      <RailButton label="Expand sidebar" onClick={onExpand}>
        <PanelLeft size={20} strokeWidth={2} />
      </RailButton>

      <div className="mt-4 flex min-h-0 flex-1 flex-col items-center">
        {SIDEBAR_NAV.map((item) => {
          const destination = item.route ? `${navigationRoot}${item.route}` : null;
          const active = navItemActive(pathname, destination);
          return (
            <RailButton
              active={active}
              key={item.id}
              // 🔴 THE LABEL IS THE ONLY NAME THIS ROW HAS. With no text beside the glyph, the
              // aria-label is what a screen reader announces AND what the shell's hover-title
              // effect turns into a tooltip, so a learner who cannot read the icon still can.
              label={item.label}
              onClick={() => destination && router.push(destination)}
            >
              <Codicon name={item.codicon} size="20px" />
            </RailButton>
          );
        })}
      </div>

      {/* Account, pinned to the bottom — the same position it holds in the open sidebar's footer. */}
      <RailButton
        label={accountEmail ? `Account: ${accountEmail}` : "Sign in"}
        onClick={() => openSettings()}
      >
        <span className="flex size-6 items-center justify-center rounded-full bg-(--theme-primary) text-[length:var(--canvas-text-meta)] font-semibold uppercase leading-none text-white">
          {initialOf(accountEmail)}
        </span>
      </RailButton>
    </nav>
  );
}

/**
 * One row of the rail.
 *
 * 🔴 EVERY ROW IS THE SAME 36px SQUARE, including the expand control and the account. A rail whose
 * rows differ in size has no rhythm, and the eye reads the odd one out as more important than it
 * is — which §46.3 forbids doing with size. Hierarchy here comes from POSITION (the expand control
 * sits above the gap, the account below the fill) and from the active state, never from bulk.
 *
 * 🔴 NOT `<Button variant="ghost">`. The shared button applies its own height and padding scale,
 * so five rows drawn with it came out at three different widths. A rail row is a fixed square by
 * definition, so it declares its own box rather than fighting a scale built for text buttons.
 */
function RailButton({
  active,
  children,
  label,
  onClick,
}: {
  active?: boolean;
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-current={active ? "page" : undefined}
      aria-label={label}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-[10px] text-(--ui-text-secondary)",
        "transition-colors duration-100 ease-out hover:bg-(--ui-control-hover-background) hover:text-(--ui-text-primary)",
        // 🔴 THE ACTIVE STATE IS A FILL, NOT A TINT ON THE GLYPH. "Clear active states" was named
        // explicitly; a colour-only change on a 20px monochrome icon is close to invisible, and it
        // competes with hover, which is also a colour change.
        active && "bg-(--ui-control-active-background) text-(--ui-text-primary)",
      )}
      onClick={onClick}
      style={{ height: `${ROW_PX}px`, width: `${ROW_PX}px` }}
      type="button"
    >
      {children}
    </button>
  );
}

/** One letter for the avatar. Falls back to a dot rather than an empty circle, so a signed-out
 *  rail still reads as a control instead of a rendering failure. */
function initialOf(accountEmail: string): string {
  const first = accountEmail.trim().charAt(0);
  return first ? first.toUpperCase() : "·";
}
