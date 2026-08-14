"use client";

// WorkspaceShell — desktop app/shell/app-shell.tsx + pane-shell composition,
// web v1: chat-sidebar pane (237px) + main content + titlebar clusters +
// statusbar. No drag regions, no hover-reveal, no resize, no right rail.
// The [data-workspace] attribute scopes the entire desktop token/chrome layer.

import { usePathname, useRouter } from "next/navigation";
import type * as React from "react";
import { useEffect } from "react";

import { useAuth } from "@/components/AuthProvider";
import { useTheme } from "@/components/theme-provider";
import { useWorkspacePreview } from "@/components/workspace/preview-context";
import { OutputViewerDialog } from "@/components/workspace/sessions/output-viewer-dialog";
import { UpgradePromptDialog } from "@/components/workspace/upgrade-prompt-dialog";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

import { ChatSidebar } from "./chat-sidebar";
import { ImmersiveSurfaceProvider, useImmersiveClaimed } from "./immersive-surface";
import { NAV_RAIL_WIDTH_PX, NavRail } from "./nav-rail";
import { ProcessingIndicator } from "./processing-indicator";
import { SettingsModalProvider } from "./settings-modal";
import { TitlebarControls } from "./titlebar-controls";
import { useMediaQuery } from "./use-media-query";
import { shellNavigation } from "@/lib/workspace/shell-navigation";

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
  ["--sidebar-width" as string]: "var(--pane-chat-sidebar-width)",
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
        // 🔴 COLLAPSED IS `NAV_RAIL_WIDTH_PX`, NOT `0px`. The column keeps real width and draws an
        // icon rail; only a canvas (focus mode) and a phone still go to zero. See nav-rail.tsx.
        ["--pane-chat-sidebar-width" as string]: sidebarVisible
          ? narrowViewport
            ? "min(84vw, 18rem)"
            : "256px"
          : railVisible
            ? `${NAV_RAIL_WIDTH_PX}px`
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
          data-pane-shell=""
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
      <OutputViewerDialog />
      {/* Mounted at the SHELL, not on a surface. A recording keeps processing
          after you leave the chat, so the thing that says so has to outlive
          every route change — and a failure that happened while the student was
          on another page has nowhere else to reach them. */}
      <ProcessingIndicator />
      </SettingsModalProvider>
    </div>
  );
}
