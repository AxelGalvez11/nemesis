"use client";

// DEV-ONLY PREVIEW — screenshot harness for the workspace shell.
//
// Renders the full shell chrome plus one surface WITHOUT the auth gate: a `WorkspacePreviewProvider`
// supplies a mock account. Follows the app/dev-preview/poster convention.
//
// 🔴 THE SEED IS GONE, AND THAT IS THE POINT OF THE CHANGE. This page used to inject about ninety
// lines of fabricated Sessions threads into `sessionsStore` so a screenshot showed a populated
// conversation. The Sessions product was deleted on 2026-08-20 and its store with it, so there is
// nothing to seed and nothing that reads a seed.
//
// 🔴 THE CANVAS PREVIEW IS THE PART WORTH KEEPING. It reads its state from the query exactly as the
// real route does, so `?c=<id>` renders the canvas surface — and with no session behind it, the
// PROCESSING state, which is where a deep link, a hard refresh and a return from sign-in all land
// first. Without this, every visual claim about the Canvas needs the owner's own signed-in browser.

import { notFound, useParams } from "next/navigation";

import { WorkspacePreviewProvider } from "@/components/workspace/preview-context";
import { PluginsPage } from "@/components/workspace/plugins/plugins-page";
import { WorkspaceShell } from "@/components/workspace/shell/workspace-shell";
import { CONNECTABLE_APPS } from "@/lib/workspace/composio-apps";

import CalendarPage from "../../../(workspace)/calendar/page";
import LearnPage from "../../../(workspace)/learn/page";
import LibraryPage from "../../../(workspace)/library/page";
import LibraryClassicPage from "../../../(workspace)/library/classic/page";
import SettingsPage from "../../../(workspace)/settings/page";
import StudyPage from "../../../(workspace)/study/page";

const APPS_PREVIEW = {
  apps: CONNECTABLE_APPS,
  configured: true,
  connected: ["googledrive", "gmail", "googlecalendar", "notion"],
} as const;

function AppsPreviewPage() {
  return <PluginsPage preview={APPS_PREVIEW} userId="preview-user" />;
}

const SURFACES = {
  apps: AppsPreviewPage,
  learn: LearnPage,
  library: LibraryPage,
  "library-classic": LibraryClassicPage,
  calendar: CalendarPage,
  // Retired, still previewable until they are deleted. See docs/canvas-one-semantic-authority.md.
  study: StudyPage,
  settings: SettingsPage,
} as const;

type SurfaceId = keyof typeof SURFACES;

export default function WorkspacePreviewPage() {
  const params = useParams<{ surface: string }>();
  const Surface = SURFACES[params.surface as SurfaceId];
  if (!Surface) notFound();

  return (
    <WorkspacePreviewProvider value={{ email: "student@preview.dev" }}>
      <WorkspaceShell>
        <Surface />
      </WorkspaceShell>
    </WorkspacePreviewProvider>
  );
}
