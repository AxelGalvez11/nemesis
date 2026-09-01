"use client";

// DEV-ONLY PREVIEW — the WHOLE calendar workspace, ungated and driveable.
//
// 🔴 WHY THIS EXISTS ALONGSIDE `/dev-preview/calendar-week`. That route mounts the grid with
// no-op handlers so its geometry can be measured against Google; nothing on it can be clicked.
// This one mounts `CalendarWorkspace` itself, which already has a preview mode: with a
// `WorkspacePreviewProvider` above it, every load and save goes to localStorage instead of
// Supabase (`loadCalendarEvents({ preview })` and friends). So creating, editing, dragging and
// deleting an event all work here, end to end, with no account and no network.
//
// That is the only way to check the interaction the owner asked about — "I can click on an event
// to create it, and all the edits I can do for an event are there too" — without signing in.

import { CalendarWorkspace } from "@/components/workspace/calendar/calendar-workspace";
import { WorkspacePreviewProvider } from "@/components/workspace/preview-context";
import { WorkspaceShell } from "@/components/workspace/shell/workspace-shell";

export default function CalendarAppPreview() {
  return (
    <WorkspacePreviewProvider value={{ email: "student@preview.dev" }}>
      <WorkspaceShell>
        <CalendarWorkspace />
      </WorkspaceShell>
    </WorkspacePreviewProvider>
  );
}
