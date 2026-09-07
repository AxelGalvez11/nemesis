// A project's own page: /projects/<id>
//
// 🔴 A PROJECT IS STILL A FOLDER — see projects-model.ts's own header. `<id>` is a `folders.id`;
// there is no second identifier space to keep in step with it.
//
// 🔴 RETIRED 2026-09-07 with /projects itself — see that file's header for the owner's words and
// for why the page is wrapped rather than removed.
//
// Thin on purpose, like /projects itself: the route reads the session and the id, the component
// owns the page.

"use client";

import { useParams } from "next/navigation";

import { RetiredSurfaceGuard } from "@/components/workspace/retired-surface-guard";

import { useAuth } from "@/components/AuthProvider";
import { ProjectPage } from "@/components/workspace/projects/project-page";

export default function ProjectRoute() {
  const { session } = useAuth();
  const params = useParams<{ id: string }>();
  const raw = Array.isArray(params.id) ? params.id[0] : params.id;
  return (
    <RetiredSurfaceGuard allowDeepLinks={false}>
      <ProjectPage projectId={raw ?? ""} userId={session?.user.id ?? null} />
    </RetiredSurfaceGuard>
  );
}
