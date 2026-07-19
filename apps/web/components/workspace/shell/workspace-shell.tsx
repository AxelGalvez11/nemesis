"use client";

// WorkspaceShell — desktop app/shell/app-shell.tsx + pane-shell composition,
// web v1: chat-sidebar pane (237px) + main content + titlebar clusters +
// statusbar. No drag regions, no hover-reveal, no resize, no right rail.
// The [data-workspace] attribute scopes the entire desktop token/chrome layer.

import type * as React from "react";
import { useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import { useWorkspacePreview } from "@/components/workspace/preview-context";
import { cn } from "@/lib/utils";

import { ChatSidebar } from "./chat-sidebar";
import { SettingsModalProvider } from "./settings-modal";
import { StatusbarControls } from "./statusbar";
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
  const sidebarVisible = sidebarOpen && !narrowViewport;

  return (
    <div
      className="scrollbar-dt flex h-screen min-h-0 w-full flex-col overflow-hidden bg-background"
      data-workspace=""
      style={{
        ...SHELL_VARS,
        ["--pane-chat-sidebar-width" as string]: sidebarVisible ? "237px" : "0px",
      }}
    >
      <SettingsModalProvider>
      {!sidebarVisible && <TitlebarControls onToggleSidebar={() => setSidebarOpen(true)} />}
      <main className="relative z-3 flex min-h-0 w-full flex-1 flex-col overflow-hidden transition-none">
        <div
          className="relative grid h-full min-h-0"
          data-pane-shell=""
          style={{ gridTemplateColumns: "var(--pane-chat-sidebar-width) minmax(0,1fr)" }}
        >
          <div
            className={cn("relative min-h-0 min-w-0 overflow-hidden")}
            data-pane-id="chat-sidebar"
            data-pane-open={sidebarVisible ? "true" : "false"}
            data-pane-side="left"
          >
            <ChatSidebar accountEmail={accountEmail} onCollapse={() => setSidebarOpen(false)} sidebarOpen={sidebarVisible} />
          </div>
          <div className="relative min-h-0 min-w-0 overflow-hidden">{children}</div>
        </div>
        <StatusbarControls />
      </main>
      </SettingsModalProvider>
    </div>
  );
}
