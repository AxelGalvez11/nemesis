"use client";

// DEV-ONLY PREVIEW — a single project's own page, without the auth gate.
//
// 🔴 SAME FIXTURE AS `/dev-preview/projects`, RE-EXPORTED RATHER THAN COPIED. Measuring "click
// Torts from the list, land on Torts's own page" has to mean the SAME Torts — same id, same two
// canvases — or the two previews are proving nothing about each other. See that file's own
// `FOLDERS`/`CANVASES` exports.
//
// 🔴 IT SUBSTITUTES THE ROWS, NOT THE COMPONENT — the rule every preview in this feature follows.
// `ProjectPage` renders here exactly as `/projects/<id>` renders it; only where the folders and
// canvases came from is swapped.
//
// Try `/dev-preview/projects/f-torts` — a project with two canvases, one of them a course, to
// measure the row list — or `/dev-preview/projects/f-fall` — a project with no DIRECT canvases of
// its own (everything is one level down, in Torts) — to see the honest empty list that is, rather
// than a wrong claim that its sub-project's content lives here too.

import { notFound, useParams } from "next/navigation";

import { ProjectPage } from "@/components/workspace/projects/project-page";
import { WorkspacePreviewProvider } from "@/components/workspace/preview-context";
import { WorkspaceShell } from "@/components/workspace/shell/workspace-shell";
import { CANVASES, FOLDERS } from "../page";

export default function ProjectPreviewRoute() {
  const params = useParams<{ id: string }>();
  const raw = Array.isArray(params.id) ? params.id[0] : params.id;
  if (!raw) notFound();

  return (
    <WorkspacePreviewProvider value={{ email: "preview@nemesis.dev" }}>
      <WorkspaceShell>
        <ProjectPage preview={{ canvases: CANVASES, folders: FOLDERS }} projectId={raw} userId={null} />
      </WorkspaceShell>
    </WorkspacePreviewProvider>
  );
}
