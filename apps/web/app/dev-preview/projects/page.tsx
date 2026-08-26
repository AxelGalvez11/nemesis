"use client";

// DEV-ONLY PREVIEW — the Projects page, without the auth gate.
//
// 🔴 IT EXISTS SO THE 1:1 CLAIM CAN BE MEASURED RATHER THAN ASSERTED. The owner accepted this
// page on "pixel, sizing, spacing and colouring 1 to 1", and the real route is behind a Supabase
// session, so nothing headless can reach it. `measure.mjs` runs the same
// getComputedStyle/getBoundingClientRect probes against this URL that were run against the live
// ChatGPT, and prints a numeric diff.
//
// 🔴 IT SUBSTITUTES THE ROWS, NOT THE COMPONENT — `/dev-preview/library`'s rule, and the only
// thing that makes the measurement mean anything. `ProjectsPage` renders here exactly as the
// real route renders it; only where the folders come from is swapped.
//
// The shelf is deliberately SPREAD ACROSS FIELDS. A preview is what gets screenshotted, demoed
// and remembered, so a preview full of one discipline quietly teaches the wrong audience.

import { ProjectsPage } from "@/components/workspace/projects/projects-page";
import { WorkspacePreviewProvider } from "@/components/workspace/preview-context";
import { WorkspaceShell } from "@/components/workspace/shell/workspace-shell";
import type { CanvasSummary, Folder } from "@/lib/learn/canvas-store";

// 🔴 EXPORTED SO `[id]/page.tsx` CAN SHARE THEM. The project PAGE preview needs the identical
// rows the LIST preview uses — "Torts" has to be the same project with the same two canvases in
// both places, or a measurement taken by clicking from one into the other would be measuring two
// different fixtures wearing one name.
export const FOLDERS: Folder[] = [
  { createdAt: "2026-07-28T09:00:00.000Z", id: "f-fall", name: "Fall 2026", parentId: null },
  { createdAt: "2026-08-02T09:00:00.000Z", id: "f-torts", name: "Torts", parentId: "f-fall" },
  { createdAt: "2026-06-11T09:00:00.000Z", id: "f-thermo", name: "Thermodynamics", parentId: null },
  { createdAt: "2026-05-02T09:00:00.000Z", id: "f-rome", name: "The Roman Republic", parentId: null },
  { createdAt: "2026-03-19T09:00:00.000Z", id: "f-phcy", name: "PHCY 2105", parentId: null },
  { createdAt: "2025-11-14T09:00:00.000Z", id: "f-empty", name: "Second year, unfiled", parentId: null },
];

export const CANVASES: CanvasSummary[] = [
  { folderId: "f-torts", id: "c1", state: "learn", title: "Negligence: duty of care", updatedAt: "2026-08-25T11:00:00.000Z" },
  {
    courseTitle: "Torts, from first principles",
    folderId: "f-torts",
    id: "c2",
    pinnedAt: "2026-08-20T09:00:00.000Z",
    state: "learn",
    title: "Contract formation, offer and acceptance",
    updatedAt: "2026-08-21T09:30:00.000Z",
  },
  { folderId: "f-thermo", id: "c3", state: "learn", title: "The second law and entropy", updatedAt: "2026-08-18T16:00:00.000Z" },
  { folderId: "f-thermo", id: "c4", state: "learn", title: "How a four-stroke diesel engine works", updatedAt: "2026-08-04T08:00:00.000Z" },
  { folderId: "f-rome", id: "c5", state: "learn", title: "The Gracchi and the land question", updatedAt: "2026-07-30T13:00:00.000Z" },
  { folderId: "f-phcy", id: "c6", state: "learn", title: "Renal physiology, the nephron", updatedAt: "2026-06-02T10:00:00.000Z" },
];

export default function ProjectsPreviewRoute() {
  return (
    <WorkspacePreviewProvider value={{ email: "preview@nemesis.dev" }}>
      <WorkspaceShell>
        <ProjectsPage preview={{ canvases: CANVASES, folders: FOLDERS }} userId={null} />
      </WorkspaceShell>
    </WorkspacePreviewProvider>
  );
}
