// Projects — the destination the sidebar's `projects` nav row points at.
//
// 🔴 A PROJECT IS A FOLDER, and there is no new table behind this route. `folders` (migration
// 20260810T01) already holds them, the sidebar already groups them, and the Library already
// files outputs into them. The orphaned `20260623000000_projects.sql` in this repo describes a
// different, never-shipped object; nothing here revives it.
//
// Thin on purpose, like `/library`: the route reads the session and the component owns the page.

"use client";

import { useAuth } from "@/components/AuthProvider";
import { ProjectsPage } from "@/components/workspace/projects/projects-page";

export default function ProjectsRoute() {
  const { session } = useAuth();
  return <ProjectsPage userId={session?.user.id ?? null} />;
}
