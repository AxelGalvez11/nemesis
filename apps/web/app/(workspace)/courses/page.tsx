// Courses — the shelf the sidebar's `courses` row points at.
//
// Thin on purpose, like /projects and /library: the route reads the session, the component owns
// the page. `?course=<slug>` opens one course in place rather than on a second route, so Back
// returns to the shelf with its search and filter intact.

"use client";

import { Suspense } from "react";

import { useAuth } from "@/components/AuthProvider";
import { CoursesPage } from "@/components/workspace/courses/courses-page";

function CoursesRouteInner() {
  const { session } = useAuth();
  return <CoursesPage userId={session?.user.id ?? null} />;
}

// 🔴 SUSPENSE IS REQUIRED, NOT DEFENSIVE. `CoursesPage` reads `useSearchParams()` for `?course=`,
// and Next refuses to build a page that does so outside a Suspense boundary.
export default function CoursesRoute() {
  return (
    <Suspense fallback={null}>
      <CoursesRouteInner />
    </Suspense>
  );
}
