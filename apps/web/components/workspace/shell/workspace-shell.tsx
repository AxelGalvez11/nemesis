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
import { SidePanelProvider, useSidePanelOpen } from "./side-panel";

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
      {/* 🔴 OUTSIDE `WorkspaceChrome`, because the chrome is what READS the claim. A provider
          mounted inside the component that consumes it is a context nobody can see, and the
          symptom is silent: the sidebar simply never collapses and nothing errors. */}
      <SidePanelProvider>
        <WorkspaceChrome>{children}</WorkspaceChrome>
      </SidePanelProvider>
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
  // 🔴 THE SAME CLAIM, A DIFFERENT EFFECT since 2026-08-31: a canvas COLLAPSES the sidebar to the
  // rail rather than taking navigation away. See shell-navigation.ts for the owner's reversal of
  // §38.1 and ChatGPT's measured tiny bar, which is never absent.
  const canvasRunning = useImmersiveClaimed();
  /**
   * 🔴🔴 A CANVAS COLLAPSES THE SIDEBAR; IT DOES NOT LOCK IT SHUT. Owner, 2026-09-01: *"the left
   * sidebar does not open in chat sessions please fix."* `sidebarVisible` read `sidebarOpen &&
   * … && !canvasRunning`, so inside a conversation the rail's "Expand sidebar" button called
   * `setSidebarOpen(true)` — quietly rewriting the learner's stored preference — and NOTHING
   * happened on screen. A control that changes state and paints nothing is worse than a missing
   * one: it teaches you the app is broken.
   *
   * 🔴 THE COLLAPSE IS A DEFAULT NOW, AND THIS IS THE EXPLICIT PRESS THAT BEATS IT. `canvasRunning`
   * still folds the sidebar to the rail on arrival (owner 2026-08-31, the §38.1 reversal) — it just
   * stops outranking a learner who then asks for it back.
   *
   * 🔴 TRANSIENT, LIKE THE CLAIM IT OVERRIDES. It is cleared on leaving the canvas, so the next
   * conversation opens quiet again; the standing rule is unchanged and only this visit is.
   */
  const [reopenedOverCanvas, setReopenedOverCanvas] = useState(false);
  useEffect(() => {
    if (!canvasRunning) setReopenedOverCanvas(false);
  }, [canvasRunning]);
  const openSidebar = () => {
    setSidebarOpen(true);
    setReopenedOverCanvas(true);
  };
  const collapseSidebar = () => {
    setSidebarOpen(false);
    setReopenedOverCanvas(false);
  };
  // A document docked on the right collapses the sidebar to the rail while it is open. Transient:
  // the learner's stored preference is neither read nor written — see side-panel.tsx.
  const sidePanelOpen = useSidePanelOpen();
  const { focusMode, navToggleShowing, railVisible, sidebarVisible } = shellNavigation({
    canvasRunning: canvasRunning && !reopenedOverCanvas,
    libraryFullScreen,
    narrowViewport,
    pathname,
    sidebarOpen,
    sidePanelOpen,
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

  /**
   * 🔴🔴 THE NAV COLUMN'S WIDTH, PUBLISHED WHERE A PORTAL CAN READ IT. Owner, 2026-09-01, of
   * ChatGPT's library: *"you keep the left sidebar and it just leaves the sidebar open and it'll
   * just have the document viewer in there."* Measured in his own Chrome the same day: their
   * viewer spans x=260 to the right edge — the main column exactly — while the 260px sidebar is
   * untouched.
   *
   * Our readers are `position: fixed` and portalled to `document.body`, and they have to be: the
   * canvas animates, and `fixed` resolves against a transformed ancestor rather than the viewport
   * (output-preview.tsx carries that scar). But `SHELL_VARS` live on `[data-workspace]`, which a
   * body-level portal is OUTSIDE of, so `var(--pane-chat-sidebar-width)` reads as nothing there.
   *
   * 🔴 SET ON `documentElement`, NOT COPIED AS A NUMBER. The value is the token expression itself,
   * so the width still comes from `--nav-sidebar-width` / `--nav-rail-width` in `globals.css` and
   * a reader inherits every change to them. Copying pixels here would be the second source of
   * truth this file already deleted once.
   *
   * 🔴 ZERO ON A NARROW VIEWPORT, where the sidebar is an OVERLAY rather than a column: there is
   * no gutter to leave, and leaving one would strand a phone's reader 84vw to the right.
   */
  useEffect(() => {
    const column = narrowViewport
      ? "0px"
      : sidebarVisible
        ? "var(--nav-sidebar-width)"
        : railVisible
          ? "var(--nav-rail-width)"
          : "0px";
    document.documentElement.style.setProperty("--nav-column", column);
    return () => {
      document.documentElement.style.removeProperty("--nav-column");
    };
  }, [narrowViewport, railVisible, sidebarVisible]);

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
      {navToggleShowing && <TitlebarControls onToggleSidebar={openSidebar} />}
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
            <button aria-label="Close sidebar" className="absolute inset-0 z-50 bg-black/35 backdrop-blur-[1px]" onClick={collapseSidebar} type="button" />
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
            {/* 🔴🔴 BOTH STATES ARE MOUNTED AND THEY CROSS-FADE — THE SWAP WAS THE ABRUPTNESS.
                Owner, 2026-09-01: *"the sidebar should close and open smoothly like in chatgpt."*
                The column already slid (`data-pane-shell-animate`, #2026-08-21); what did not was
                the CONTENT. `railVisible ? <NavRail/> : <ChatSidebar/>` swapped at frame 0, so a
                learner watched the 260px sidebar disappear instantly and then spent 240ms
                watching an empty gap close beside a 52px rail. The slide was smooth and the thing
                that slid was nothing.

                🔴 MEASURED ON THE REFERENCE, 2026-09-01, in the owner's signed-in Chrome.
                `#stage-slideover-sidebar` is `overflow-hidden` and holds BOTH children at once:
                a `nav#stage-sidebar-tiny-bar` at `absolute inset-0` and the learner's own
                260px panel in normal flow. Neither ever unmounts; they trade `opacity` over
                150ms while the container's width travels. The panel keeps its full width and is
                CLIPPED, which is why their labels never re-wrap mid-slide.

                🔴 THE RAIL DOES NOT FADE, IT CUTS — and the direction of the cut is the trick.
                The reference eases the rail's opacity with `steps(1, start)` in the collapsed
                state and `steps(1, end)` in the expanded one, which means: closing, the rail
                appears at t=0; opening, it holds until t=150ms and then vanishes. Either way the
                leftmost 52px is painted the whole time, so the one part of the column that never
                moves also never flickers. A plain fade there shows the panel's own left edge
                through the rail and reads as two things dissolving into each other.

                🔴 `inert` ON THE ONE THAT IS NOT THERE. Mounted-but-invisible controls are still
                in the tab order, and a keyboard learner would fall into an unpainted sidebar with
                nothing on screen to say where focus went. */}
            {(railVisible || sidebarVisible) && (
              <>
                <div
                  className={cn(
                    "h-full w-(--sidebar-width)",
                    animateNav && "motion-safe:transition-opacity motion-safe:duration-150 motion-safe:ease-linear",
                    sidebarVisible ? "opacity-100" : "pointer-events-none opacity-0",
                  )}
                  inert={!sidebarVisible}
                >
                  <ChatSidebar
                    accountEmail={accountEmail}
                    onCollapse={collapseSidebar}
                    onNavigate={() => narrowViewport && setSidebarOpen(false)}
                  />
                </div>
                {/* Above the panel, not beside it: a positioned element paints over a static one,
                    which is what lets the rail cover the panel's own left edge while it fades. */}
                <div
                  className={cn(
                    "absolute inset-y-0 left-0 w-(--nav-rail-width)",
                    animateNav && "motion-safe:transition-opacity motion-safe:duration-150",
                    railVisible
                      ? "opacity-100 motion-safe:ease-[steps(1,start)]"
                      : "pointer-events-none opacity-0 motion-safe:ease-[steps(1,end)]",
                  )}
                  inert={!railVisible}
                >
                  <NavRail accountEmail={accountEmail} onExpand={openSidebar} />
                </div>
              </>
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
