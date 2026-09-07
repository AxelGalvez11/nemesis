// Projects — the destination the sidebar's `projects` nav row points at.
//
// 🔴 A PROJECT IS A FOLDER, and there is no new table behind this route. `folders` (migration
// 20260810T01) already holds them, the sidebar already groups them, and the Library already
// files outputs into them. The orphaned `20260623000000_projects.sql` in this repo describes a
// different, never-shipped object; nothing here revives it.
//
// 🔴🔴 RETIRED 2026-09-07. Owner: *"since the canvas is going to be like the main feature thing, I
// would like there to be pretty much no more projects … each canvas is supposed to grow, you know,
// it's like supposed to be a long term thing, not just a throwaway canvas like a chat"*. The row is
// out of the sidebar, the filing controls are out of the chat rows, and a bare visit here lands on
// the canvas. NOTHING WAS MIGRATED OR DELETED: `folders` still holds every project, every chat
// still carries its `folderId`, and `ProjectsPage` below still renders correctly — which is why it
// is wrapped rather than removed, and why putting this back is deleting one wrapper.
//
// Thin on purpose, like `/library`: the route reads the session and the component owns the page.

"use client";

import { useAuth } from "@/components/AuthProvider";
import { ProjectsPage } from "@/components/workspace/projects/projects-page";
import { RetiredSurfaceGuard } from "@/components/workspace/retired-surface-guard";

export default function ProjectsRoute() {
  const { session } = useAuth();
  return (
    <RetiredSurfaceGuard allowDeepLinks={false}>
      <ProjectsPage userId={session?.user.id ?? null} />
    </RetiredSurfaceGuard>
  );
}
