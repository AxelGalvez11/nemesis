"use client";

// WorkspaceShell — desktop app/shell/app-shell.tsx + pane-shell composition,
// web v1: chat-sidebar pane (237px) + main content + titlebar clusters +
// statusbar. No drag regions, no hover-reveal, no resize, no right rail.
// The [data-workspace] attribute scopes the entire desktop token/chrome layer.

import { usePathname, useRouter } from "next/navigation";
import type * as React from "react";
import { useEffect, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import { useTheme } from "@/components/theme-provider";
import { useWorkspacePreview } from "@/components/workspace/preview-context";
import { UpgradePromptDialog } from "@/components/workspace/upgrade-prompt-dialog";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

import { ChatSidebar } from "./chat-sidebar";
import { ImmersiveSurfaceProvider, useImmersiveClaimed } from "./immersive-surface";
import { NavRail } from "./nav-rail";
import { ProcessingIndicator } from "./processing-indicator";
import { SettingsModalProvider } from "./settings-modal";
import { TitlebarControls } from "./titlebar-controls";
import { useMediaQuery } from "./use-media-query";
import { shellNavigation } from "@/lib/workspace/shell-navigation";
import { NAV_ICON_PX } from "@/lib/workspace/sidebar-nav";

import { useResponsiveSidebar } from "./use-responsive-sidebar";

// SIDEBAR_COLLAPSE_BREAKPOINT_PX = 768 (desktop app/layout-constants.ts).
const NARROW_VIEWPORT_QUERY = "(max-width: 768px)";
// 🔴 WHICH ROUTES HIDE THE RAIL NOW LIVES IN lib/workspace/shell-navigation.ts, WITH A TEST.
//
// `/learn` used to be immersive, and immersive means the rail is suppressed AND no reopen control
// is offered — the surface is expected to carry its own way out. The Canvas's way out is a Back
// arrow to the previous canvas, which is not navigation. Measured at 1280x800 on the canvas route,
// from a browser profile with nothing stored:
//
//   data-shell-focus   "true"     the rail is suppressed, not merely collapsed
//   toggle element     ABSENT     `button[aria-label="Toggle sidebar"]` did not exist
//
// 🔴 THE TOGGLE'S ABSENCE IS THE PROOF, not a link count. Counting `a[href]` also returns zero
// AFTER the fix, because the rail's destinations are buttons that call the router rather than
// anchors — so that number cannot tell the two states apart and must not be cited as if it could.
// What changes is whether any control exists that reaches navigation at all.
//
// No Library, no Calendar, no Stats, from the front door or from any active session — which made
// the four destinations shipped in #549 invisible exactly where they mattered.
//
// §L asks for the opposite of suppression: "collapsed by default", "a small toggle stays
// available", "must not reduce the usable learning surface unless the learner explicitly opens
// it". Collapsed-with-a-toggle is all three; immersive is only the third. So the Canvas gets its
// quiet from the collapsed DEFAULT below, not from having navigation taken away.
/** Width the floating nav toggle occupies, for surfaces that also paint in the top-left corner. */
const NAV_TOGGLE_INSET_PX = 30;
const SHELL_VARS: React.CSSProperties = {
  // 🔴 THE ICON SIZE CROSSES FROM TS INTO CSS HERE, and only here. `NAV_ICON_PX` sizes the glyphs
  // the rail renders through props; the open sidebar needs the same number as a CSS length, to opt
  // its icons out of the Button base's `[&_svg:not([class*='size-'])]:size-4` override. Publishing
  // it rather than restating it in `globals.css` is what keeps the two states from drifting again.
  ["--nav-icon-size" as string]: `${NAV_ICON_PX}px`,
  ["--titlebar-height" as string]: "0px",
  ["--titlebar-content-inset" as string]: "0.75rem",
  // TITLEBAR_EDGE_INSET = 14px / TITLEBAR_CONTROLS_TOP = 6px — the browser tab
  // has no traffic lights, so the fallback edge inset applies.
  ["--titlebar-controls-left" as string]: "14px",
  // 🔴 14px, NOT 6px — the toggle now sits BESIDE things. While it only ever appeared on surfaces
  // with an empty top-left corner, its exact height did not matter. On the Canvas it stands next to
  // the Back arrow, and at 6px the two were 7.5px out of vertical alignment: measured centres 20.5
  // and 28. With the component's own `translate-y-0.5` this lands it on 28.5, which reads as one
  // row. Nothing else consumes this variable — TitlebarControls is its only reader.
  ["--titlebar-controls-top" as string]: "14px",
  ["--titlebar-tools-right" as string]: "0.75rem",
  ["--titlebar-tools-width" as string]: "0px",
  ["--right-rail-top-inset" as string]: "0px",
};

/**
 * 🔴 THE PROVIDER HAS TO SIT ABOVE THE THING THAT READS IT, so the shell proper is one component
 * down. A surface inside `children` claims the viewport (§38.1) and `WorkspaceChrome` reads the
 * claim — both need the same context, and a provider cannot read its own value.
 */
export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  return (
    <ImmersiveSurfaceProvider>
      <WorkspaceChrome>{children}</WorkspaceChrome>
    </ImmersiveSurfaceProvider>
  );
}

function WorkspaceChrome({ children }: { children: React.ReactNode }) {
  const preview = useWorkspacePreview();
  const { session } = useAuth();
  const router = useRouter();
  const accountEmail = preview?.email ?? session?.user.email ?? "";

  // Two-step verification guard: a session that skipped the sign-in code (the
  // account has a verified factor but this session never passed it) is sent
  // back to /sign-in, which shows the code form. Fail-open on errors.
  useEffect(() => {
    if (preview || !session) return;
    let alive = true;
    void supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      .then(({ data }) => {
        if (alive && data?.nextLevel === "aal2" && data.currentLevel !== "aal2") router.replace("/sign-in");
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [preview, session, router]);

  const narrowViewport = useMediaQuery(NARROW_VIEWPORT_QUERY);
  const pathname = usePathname();
  // Narrow viewports are exempt: there both rails are overlays (never side by
  // side, so nothing to declutter), and the surface collapses its own sidebar,
  // which would leave no visible exit once the nav rail is suppressed too.
  // Settings → General can opt out entirely ("Keep Nemesis sidebar").
  const { libraryFullScreen } = useTheme();

  // 🔴 STARTS COLLAPSED (§L). Navigation is "lightweight and secondary"; the first impression of
  // the front door is meant to be the composer, not a rail. A stored preference still wins, so a
  // learner who opens it keeps it open — the default decides the FIRST visit only.
  const { open: sidebarOpen, setOpen: setSidebarOpen } = useResponsiveSidebar(
    narrowViewport,
    "nemesis.web.nav-rail",
    false,
  );

  // 🔴 THE DECISION IS A VALUE, NOT A CONDITION HERE — see lib/workspace/shell-navigation.ts. As
  // JSX conditions, "the rail is hidden" and "the learner has no way to reach it" were the same
  // expression, so the second could not be asserted and went unnoticed on `/learn`.
  // 🔴 §38.1 — INSIDE A CANVAS THERE IS NO RAIL AT ALL, not a collapsed one with a toggle. The
  // claim comes from `CanvasSurface`, which is also what guarantees the `×` that replaces it; see
  // immersive-surface.tsx for why this is a declaration rather than a route or a query read.
  const immersiveClaimed = useImmersiveClaimed();
  const { focusMode, navToggleShowing, railVisible, sidebarVisible } = shellNavigation({
    immersiveClaimed,
    libraryFullScreen,
    narrowViewport,
    pathname,
    sidebarOpen,
  });

  // 🔴🔴 THE TRANSITION IS OFF UNTIL AFTER THE FIRST PAINT, AND THAT IS NOT BELT AND BRACES.
  // `useResponsiveSidebar` seeds its state from a default and reads the learner's stored preference
  // in an EFFECT, so a learner who keeps the sidebar open renders collapsed for one frame and then
  // corrects. Transition that unconditionally and every page load starts with the rail sliding open
  // — a load-time animation nobody asked for, announcing an internal restore step. Same for
  // `useMediaQuery`, which reports the wide default before it has consulted the viewport.
  //
  // 🔴 TWO FRAMES, NOT ONE. A single `requestAnimationFrame` fires BEFORE the browser has painted
  // the restored width, so the transition would still be live for it. The second callback runs after
  // that paint, which is the first moment a width change is genuinely something the learner did.
  const [animateNav, setAnimateNav] = useState(false);
  useEffect(() => {
    let inner = 0;
    const outer = requestAnimationFrame(() => { inner = requestAnimationFrame(() => setAnimateNav(true)); });
    return () => { cancelAnimationFrame(outer); cancelAnimationFrame(inner); };
  }, []);

  useEffect(() => {
    const addHoverDescriptions = (root: ParentNode) => {
      root.querySelectorAll<HTMLElement>("button[aria-label], a[aria-label], [role='button'][aria-label]").forEach((control) => {
        if (control.title || control.textContent?.trim()) return;
        const label = control.getAttribute("aria-label");
        if (label) control.title = label;
      });
    };
    addHoverDescriptions(document);
    const observer = new MutationObserver((entries) => {
      for (const entry of entries) {
        for (const node of entry.addedNodes) if (node instanceof HTMLElement) addHoverDescriptions(node);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return (
    <div
      className="scrollbar-dt flex h-screen min-h-0 w-full flex-col overflow-hidden bg-background"
      data-shell-focus={focusMode ? "true" : undefined}
      data-sidebar-visible={sidebarVisible ? "true" : "false"}
      data-workspace=""
      style={{
        ...SHELL_VARS,
        // 🔴🔴 THE SIDEBAR'S OWN WIDTH IS ITS DESTINATION, NOT THE COLUMN IT SITS IN. This read
        // `var(--pane-chat-sidebar-width)` — the same value as the grid column — which was fine
        // while the column snapped between two numbers and is the whole problem once it slides.
        // `Sidebar` is `w-(--sidebar-width)`, so a following width would have made every label
        // re-wrap and every row re-measure on each frame of a 260px→52px slide: a reflow storm
        // rather than a movement, and visibly so at the point where the labels are 30px wide.
        //
        // Fixed at its natural width, the pane is simply CLIPPED by the column it is in (that
        // wrapper is `overflow-hidden`), so the content stands still and the edge travels — which
        // is what a sidebar opening looks like.
        ["--sidebar-width" as string]: narrowViewport ? "min(84vw, 18rem)" : "var(--nav-sidebar-width)",
        // 🔴 COLLAPSED IS THE RAIL'S WIDTH, NOT `0px`. The column keeps real width and draws an
        // icon rail; only a canvas (focus mode) and a phone still go to zero. See nav-rail.tsx.
        // 🔴 THE WIDTH IS A TOKEN NOW, NOT A LITERAL. `256px` here was the value that actually
        // rendered, while `desktop-ui.css` separately declared `--sidebar-width: 14.8125rem`
        // (266.6px at this root font) — a second, dead source of truth that anyone reading the
        // stylesheet would have believed. One token, read from `--nav-sidebar-width`.
        ["--pane-chat-sidebar-width" as string]: sidebarVisible
          ? narrowViewport
            ? "min(84vw, 18rem)"
            : "var(--nav-sidebar-width)"
          : railVisible
            ? "var(--nav-rail-width)"
            : "0px",
        // 🔴 SPACE THE FLOATING TOGGLE CLAIMS, PUBLISHED SO SURFACES CAN AVOID IT. `TitlebarControls`
        // is `fixed` at the viewport's top-left; the Canvas header is `absolute` at its own top-left.
        // With the rail collapsed the two occupy the same corner and the toggle prints straight over
        // the Back arrow. A surface that paints up there pads by this instead of hardcoding a number
        // that would be wrong the moment the toggle is not showing.
        ["--nav-toggle-inset" as string]: navToggleShowing ? `${NAV_TOGGLE_INSET_PX}px` : "0px",
        height: "100dvh",
        width: "100%",
      }}
    >
      <SettingsModalProvider>
      {navToggleShowing && <TitlebarControls onToggleSidebar={() => setSidebarOpen(true)} />}
      <main className="relative z-3 flex min-h-0 w-full flex-1 flex-col overflow-hidden transition-none">
        <div
          className="relative grid h-full min-h-0"
          // 🔴 THE MOVEMENT IS ONE `grid-template-columns` TRANSITION, DECLARED IN `globals.css`.
          // Owner, 2026-08-21: *"add a collapse microanimation to the sidebar so it smoothly
          // collapses instead of abrupt collapse."* Animating the TRACK rather than the pane is
          // what keeps the surface beside it honest: the content column is `minmax(0,1fr)`, so it
          // grows by exactly what the rail gives up, on the same frames. A pane that slid over the
          // surface instead would leave the surface jumping at the end.
          //
          // 🔴 ON A NARROW VIEWPORT THERE IS NOTHING TO ANIMATE. The sidebar is an overlay there,
          // over a single full-width column, so this track never changes and the attribute would
          // only be a promise nothing keeps.
          data-pane-shell=""
          data-pane-shell-animate={animateNav && !narrowViewport ? "true" : undefined}
          style={{ gridTemplateColumns: narrowViewport ? "minmax(0,1fr)" : "var(--pane-chat-sidebar-width) minmax(0,1fr)" }}
        >
          {narrowViewport && sidebarVisible && (
            <button aria-label="Close sidebar" className="absolute inset-0 z-50 bg-black/35 backdrop-blur-[1px]" onClick={() => setSidebarOpen(false)} type="button" />
          )}
          <div
            className={cn(
              "relative min-h-0 min-w-0 overflow-hidden",
              narrowViewport && "absolute inset-y-0 left-0 z-60 shadow-2xl",
            )}
            data-pane-id="chat-sidebar"
            data-pane-open={sidebarVisible ? "true" : "false"}
            data-pane-side="left"
          >
            {/* 🔴 THE RAIL REPLACES THE SIDEBAR IN THE SAME COLUMN, rather than floating beside
                it. `ChatSidebar` stays mounted-but-inert when closed (it fades via opacity and
                keeps its own DOM), so rendering both would stack two elements in one grid cell.
                One or the other. */}
            {railVisible ? (
              <NavRail accountEmail={accountEmail} onExpand={() => setSidebarOpen(true)} />
            ) : (
              <ChatSidebar
                accountEmail={accountEmail}
                onCollapse={() => setSidebarOpen(false)}
                onNavigate={() => narrowViewport && setSidebarOpen(false)}
                sidebarOpen={sidebarVisible}
              />
            )}
          </div>
          <div className="relative min-h-0 min-w-0 overflow-hidden">{children}</div>
        </div>
      </main>
      <UpgradePromptDialog />
      {/* Mounted at the SHELL, not on a surface. A recording keeps processing
          after you leave the chat, so the thing that says so has to outlive
          every route change — and a failure that happened while the student was
          on another page has nowhere else to reach them. */}
      <ProcessingIndicator />
      </SettingsModalProvider>
    </div>
  );
}
