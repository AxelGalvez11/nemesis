"use client";

// WorkspaceShell — desktop app/shell/app-shell.tsx + pane-shell composition,
// web v1: chat-sidebar pane (237px) + main content + titlebar clusters +
// statusbar. No drag regions, no hover-reveal, no resize, no right rail.
// The [data-workspace] attribute scopes the entire desktop token/chrome layer.

import type * as React from "react";
import { useEffect, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import { useWorkspacePreview } from "@/components/workspace/preview-context";
import { UpgradePromptDialog } from "@/components/workspace/upgrade-prompt-dialog";
import { cn } from "@/lib/utils";

import { ChatSidebar } from "./chat-sidebar";
import { SettingsModalProvider } from "./settings-modal";
import { TitlebarControls } from "./titlebar-controls";
import { useMediaQuery } from "./use-media-query";

// SIDEBAR_COLLAPSE_BREAKPOINT_PX = 768 (desktop app/layout-constants.ts).
const NARROW_VIEWPORT_QUERY = "(max-width: 768px)";
const SHELL_VARS: React.CSSProperties = {
  ["--sidebar-width" as string]: "var(--pane-chat-sidebar-width)",
  ["--titlebar-height" as string]: "0px",
  ["--titlebar-content-inset" as string]: "0.75rem",
  // TITLEBAR_EDGE_INSET = 14px / TITLEBAR_CONTROLS_TOP = 6px — the browser tab
  // has no traffic lights, so the fallback edge inset applies.
  ["--titlebar-controls-left" as string]: "14px",
  ["--titlebar-controls-top" as string]: "6px",
  ["--titlebar-tools-right" as string]: "0.75rem",
  ["--titlebar-tools-width" as string]: "0px",
  ["--right-rail-top-inset" as string]: "0px",
};

export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const preview = useWorkspacePreview();
  const { session } = useAuth();
  const accountEmail = preview?.email ?? session?.user.email ?? "";

  const narrowViewport = useMediaQuery(NARROW_VIEWPORT_QUERY);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const sidebarVisible = sidebarOpen;

  useEffect(() => {
    if (narrowViewport) setSidebarOpen(false);
  }, [narrowViewport]);

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
      data-sidebar-visible={sidebarVisible ? "true" : "false"}
      data-workspace=""
      style={{
        ...SHELL_VARS,
        ["--pane-chat-sidebar-width" as string]: sidebarVisible ? (narrowViewport ? "min(84vw, 18rem)" : "237px") : "0px",
        height: "100dvh",
        width: "100%",
      }}
    >
      <SettingsModalProvider>
      {!sidebarVisible && <TitlebarControls onToggleSidebar={() => setSidebarOpen(true)} />}
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
            <ChatSidebar
              accountEmail={accountEmail}
              onCollapse={() => setSidebarOpen(false)}
              onNavigate={() => narrowViewport && setSidebarOpen(false)}
              sidebarOpen={sidebarVisible}
            />
          </div>
          <div className="relative min-h-0 min-w-0 overflow-hidden">{children}</div>
        </div>
      </main>
      <UpgradePromptDialog />
      </SettingsModalProvider>
    </div>
  );
}
