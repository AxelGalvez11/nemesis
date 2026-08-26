// A project's own page: /projects/<id>
//
// 🔴 A PROJECT IS STILL A FOLDER — see projects-model.ts's own header. `<id>` is a `folders.id`;
// there is no second identifier space to keep in step with it.
//
// Thin on purpose, like /projects itself: the route reads the session and the id, the component
// owns the page.

"use client";

import { useParams } from "next/navigation";

import { useAuth } from "@/components/AuthProvider";
import { ProjectPage } from "@/components/workspace/projects/project-page";

export default function ProjectRoute() {
  const { session } = useAuth();
  const params = useParams<{ id: string }>();
  const raw = Array.isArray(params.id) ? params.id[0] : params.id;
  return <ProjectPage projectId={raw ?? ""} userId={session?.user.id ?? null} />;
}
