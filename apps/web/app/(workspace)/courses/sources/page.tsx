"use client";

// Sources and licences — where every course on the shelf came from.
//
// 🔴 THIS PAGE IS THE ATTRIBUTION, AND IT IS NOT OPTIONAL. The owner asked (2026-09-04) for the
// credit line off the course page, and CC BY still requires it wherever the material is used. The
// licence allows exactly this arrangement: §3(a)(2) says the conditions may be met "in any
// reasonable manner based on the medium, means, and context", and gives the example of "providing a
// URI or hyperlink to a resource that includes the required information". This is that resource.
//
// So: the course page stays clean, the shelf carries one quiet link at its foot, and every author
// is credited with their licence and a link back to their book. Deleting this page, or the link to
// it, puts the product outside the licence it relies on for all 22,452 objectives.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { listCourses, type CourseSummary } from "@/lib/courses/catalogue";

export default function CourseSourcesRoute() {
  const router = useRouter();
  const [courses, setCourses] = useState<CourseSummary[]>([]);

  useEffect(() => {
    void listCourses().then((rows) =>
      setCourses([...rows].sort((a, b) => a.title.localeCompare(b.title))),
    );
  }, []);

  return (
    <div className="flex h-full min-w-0 flex-col overflow-y-auto bg-(--ui-bg-editor) pt-(--titlebar-height)">
      <div className="mx-auto w-full max-w-[840px] px-[32px] pb-[80px]">
        <button
          className="flex h-[36px] items-center gap-[6px] pt-[12px] text-[14px] text-(--ui-text-secondary) hover:text-(--ui-text-primary)"
          onClick={() => router.push("/courses")}
          type="button"
        >
          <svg fill="none" height="16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" viewBox="0 0 16 16" width="16">
            <path d="M9.5 3.5 5 8l4.5 4.5" />
          </svg>
          Courses
        </button>

        <h1 className="m-0 mt-[12px] text-[28px] font-medium leading-[34px] tracking-[-0.01em] text-(--ui-text-primary)">
          Sources and licences
        </h1>
        <p className="m-0 mt-[12px] max-w-[620px] text-[14px] leading-[1.6] text-(--ui-text-secondary)">
          Every course is built from an openly licensed textbook. Nemesis uses each book&rsquo;s
          contents and its stated learning objectives, and none of its text, figures or exercises.
        </p>

        <div className="mt-[24px] border-t border-(--ui-stroke-tertiary)">
          {courses.map((course) => (
            <div className="border-b border-(--ui-stroke-tertiary) py-[13px]" key={course.id}>
              <div className="text-[14px] text-(--ui-text-primary)">{course.title}</div>
              <div className="mt-[3px] text-[12px] leading-[1.5] text-(--ui-text-tertiary)">
                {course.attribution}
                {" · "}
                <a className="underline" href={course.sourceUrl} rel="noreferrer noopener" target="_blank">
                  original
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
