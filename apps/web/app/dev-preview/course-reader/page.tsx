"use client";

// DEV-ONLY PREVIEW — the course reader, without the auth gate.
//
// 🔴 THE DATA IS REAL. `course_catalogue` and `course_sections` are public reference data
// (migration `course_catalogue_readable_signed_out`), so the outline drawn here is the book's own
// contents and objectives, not a fixture.
//
// 🔴 `data-workspace` IS LOAD-BEARING. `globals.css` styles every button outside the workspace with
// `button:where(:not([data-workspace] *))` — a 999px pill in landing-page colours. Without this
// stamp the preview draws the real component wearing the wrong clothes.
//
// The place-in-the-book lives in the URL on the real route; here it is local state, because a
// preview has no router to keep honest.

import { useState } from "react";

import { CourseReader } from "@/components/workspace/courses/course-reader";
import { type CourseView } from "@/lib/courses/reading";

export default function CourseReaderPreview() {
  // `?at=<ordinal>&course=<slug>` so a specific section can be opened without clicking through
  // twenty-eight chapters of rail. Dev-only page; the real route reads these from the router.
  const params = typeof window === "undefined" ? null : new URLSearchParams(window.location.search);
  const [at, setAt] = useState<number | null>(params?.get("at") ? Number(params.get("at")) : null);
  const [view, setView] = useState<CourseView>("lesson");
  return (
    <div className="h-screen" data-workspace>
      <CourseReader
        at={at}
        onLeave={() => {}}
        onMove={(ordinal, next) => {
          setAt(ordinal);
          setView(next);
        }}
        slug={params?.get("course") ?? "anatomy-and-physiology"}
        userId={null}
        view={view}
      />
    </div>
  );
}
