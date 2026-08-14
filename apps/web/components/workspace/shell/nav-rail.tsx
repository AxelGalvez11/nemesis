"use client";

// The collapsed sidebar, as an icon rail.
//
// 🔴 COLLAPSED USED TO MEAN GONE, AND THAT WAS THE DEFECT (owner 2026-08-14: "i want the sidebar to
// be like this, not fully hidden ... but it should not appear in canvas mode"). The shell set
// `--pane-chat-sidebar-width` to `0px` when the rail was closed and floated a single toggle over
// the surface's top-left corner. Reaching Library from the front door was therefore two presses
// with a layout shift in between, and the product's four destinations were invisible until you
// went looking. A rail keeps them one press away and costs 56px.
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

import { Button } from "@/components/desktop-ui/button";
import { Codicon } from "@/components/desktop-ui/codicon";
import { useSettingsModal } from "@/components/workspace/shell/settings-modal";
import { navigationRootFor, navItemActive, SIDEBAR_NAV } from "@/lib/workspace/sidebar-nav";
import { cn } from "@/lib/utils";

/** Width of the rail. Published as a constant because the shell sizes the grid column with it and
 *  a second literal there would drift. Written in px: every rem in apps/web is 1.125× its number. */
export const NAV_RAIL_WIDTH_PX = 56;

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
      className="flex h-full flex-col items-center border-r border-(--sidebar-edge-border) bg-(--ui-sidebar-surface-background) py-2"
      data-nav-rail=""
      style={{ width: `${NAV_RAIL_WIDTH_PX}px` }}
    >
      {/* Expand sits where the brand does in the open sidebar, so the two states share a corner and
          the control does not appear to move when it opens. Same panel-left glyph as the sidebar's
          own collapse button (UX brief §27.1): one icon means "the sidebar", and the direction is
          carried by which state you are in, not by drawing a different arrow. */}
      <Button aria-label="Expand sidebar" className="mb-1 shrink-0" onClick={onExpand} size="icon" variant="ghost">
        <PanelLeft size={18} strokeWidth={2} />
      </Button>

      <div className="flex min-h-0 flex-1 flex-col items-center gap-0.5">
        {SIDEBAR_NAV.map((item) => {
          const destination = item.route ? `${navigationRoot}${item.route}` : null;
          const active = navItemActive(pathname, destination);
          return (
            <Button
              aria-current={active ? "page" : undefined}
              // 🔴 THE LABEL IS THE ONLY NAME THIS ROW HAS. With no text beside the glyph, the
              // aria-label is what a screen reader announces AND what the shell's hover-title
              // effect turns into a tooltip, so a learner who cannot read the icon still can.
              aria-label={item.label}
              className={cn("shrink-0", active && "bg-(--ui-control-active-background) text-foreground")}
              key={item.id}
              onClick={() => destination && router.push(destination)}
              size="icon"
              variant="ghost"
            >
              <Codicon name={item.codicon} size="1.05rem" />
            </Button>
          );
        })}
      </div>

      {/* Account, pinned to the bottom — the same position it holds in the open sidebar's footer. */}
      <Button
        aria-label={accountEmail ? `Account: ${accountEmail}` : "Sign in"}
        className="mt-auto shrink-0 rounded-full"
        onClick={() => openSettings()}
        size="icon"
        variant="ghost"
      >
        <span className="flex size-6 items-center justify-center rounded-full bg-(--theme-primary) text-[0.625rem] font-semibold uppercase text-white">
          {initialOf(accountEmail)}
        </span>
      </Button>
    </nav>
  );
}

/** One letter for the avatar. Falls back to a dot rather than an empty circle, so a signed-out
 *  rail still reads as a control instead of a rendering failure. */
function initialOf(accountEmail: string): string {
  const first = accountEmail.trim().charAt(0);
  return first ? first.toUpperCase() : "·";
}
