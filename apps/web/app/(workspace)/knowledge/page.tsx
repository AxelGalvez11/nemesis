// Knowledge — the map the sidebar's `knowledge` row points at.
//
// Thin on purpose: the route reads the session, the component owns the surface.

"use client";

import { useAuth } from "@/components/AuthProvider";
import { KnowledgePage } from "@/components/workspace/knowledge/knowledge-page";

export default function KnowledgeRoute() {
  const { session } = useAuth();
  return <KnowledgePage userId={session?.user.id ?? null} />;
}
