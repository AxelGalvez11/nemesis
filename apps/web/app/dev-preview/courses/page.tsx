"use client";

// DEV-ONLY PREVIEW — the real Courses shelf, without the auth gate.
//
// 🔴 THE DATA IS REAL, NOT SCRIPTED. `course_catalogue` and `course_sections` are public reference
// data (migration `course_catalogue_readable_signed_out`), so this page reads the same 186 courses
// and 10,748 sections the signed-in page does. Only `learner_courses` is private, so the one thing
// missing here is the "Carrying on" row.

import { Suspense } from "react";

import { CoursesPage } from "@/components/workspace/courses/courses-page";

// 🔴 `data-workspace` IS LOAD-BEARING, NOT DECORATION. `globals.css` styles every button on the
// marketing side with `button:where(:not([data-workspace] *))` — a 999px pill with its own colours —
// and the workspace escapes it by stamping this attribute on an ancestor. Without it this preview
// draws the real component wearing landing-page buttons, which is a lie about what shipped.
export default function CoursesPreview() {
  return (
    <div className="h-screen" data-workspace>
      <Suspense fallback={null}>
        <CoursesPage userId={null} />
      </Suspense>
    </div>
  );
}
