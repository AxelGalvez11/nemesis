"use client";

// Courses — the shelf of open courses Nemesis can teach from.
//
// 🔴 A COURSE IS THE THIRD KIND OF THING, alongside a chat and a canvas (owner, 2026-09-04). What
// makes it a third kind is not how it looks — it looks like the rest of the app on purpose — but
// that it ARRIVES KNOWING WHAT IT IS FOR: an ordered outline where every section states what the
// learner should be able to do. A chat has no target. A canvas built from uploads has material but
// no stated targets, so Nemesis has to infer what matters. A course has 169 sections and 606 named
// capabilities before anybody says a word.
//
// 🔴 NO SUBTITLE UNDER THE TITLE — owner, 2026-09-03: *"remove the subtitle, I just want the title
// like Courses or Knowledge."* The page explains itself by what is on it.
//
// 🔴 NO PUBLISHER AND NO AUTHOR ON THE CARD FACE — same ruling. The attribution the licence
// requires is carried on the course's own page, at the foot of the side column, and it is NOT
// optional: see `lib/courses/catalogue.ts`. Placement was the owner's call; presence is the
// licence's.
//
// 🔴 PIXELS, NEVER REM. `globals.css` sets `html { font-size: 112.5% }`, so one rem is 18px here
// and every rem-based Tailwind class lands 12.5% larger than its name reads.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { CourseCover } from "./course-cover";
import { CourseDetail } from "./course-detail";
import {
  listCourses,
  listStarted,
  type CourseSummary,
  type StartedCourse,
} from "@/lib/courses/catalogue";
import { coverFor, shelves, subjectsPresent } from "@/lib/courses/shelf";

/** The content column, the same 768px frame every other surface centres in. */
const COLUMN_PX = 1080;
/** Title, filter pills and the search field all sit on one 36px control height. */
const CONTROL_H_PX = 36;

function SearchField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div
      className="flex items-center gap-[8px] rounded-[8px] border border-(--ui-stroke-primary) bg-(--ui-bg-elevated) px-[12px]"
      style={{ height: `${CONTROL_H_PX}px`, width: "260px" }}
    >
      <svg fill="none" height="16" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" viewBox="0 0 16 16" width="16" className="shrink-0 text-(--ui-text-tertiary)">
        <circle cx="7.2" cy="7.2" r="4.2" />
        <path d="m10.4 10.4 2.6 2.6" />
      </svg>
      <input
        className="w-full bg-transparent text-[14px] text-(--ui-text-primary) outline-none placeholder:text-(--ui-text-tertiary)"
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search courses"
        value={value}
      />
    </div>
  );
}

function CourseCard({ course, onOpen }: { course: CourseSummary; onOpen: () => void }) {
  const { motif, seed } = coverFor(course);
  return (
    <button
      className="flex flex-col overflow-hidden rounded-[12px] border border-(--ui-stroke-tertiary) bg-(--ui-bg-elevated) text-left transition-colors hover:border-(--ui-stroke-secondary)"
      onClick={onOpen}
      type="button"
    >
      <CourseCover motif={motif} seed={seed} />
      <div className="flex grow flex-col gap-[7px] p-[16px]">
        <div className="text-[15px] font-medium leading-[1.3] text-(--ui-text-primary)">{course.title}</div>
        {course.description ? (
          <div className="line-clamp-2 text-[13px] leading-[1.45] text-(--ui-text-secondary)">{course.description}</div>
        ) : null}
        <div className="mt-auto pt-[6px] text-[12px] text-(--ui-text-tertiary) tabular-nums">
          {course.sectionCount} sections · {course.objectiveCount} objectives
        </div>
      </div>
    </button>
  );
}

export function CoursesPage({ userId }: { userId: string | null }) {
  const router = useRouter();
  const params = useSearchParams();
  const openSlug = params.get("course");

  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [started, setStarted] = useState<StartedCourse[]>([]);
  const [query, setQuery] = useState("");
  const [subject, setSubject] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshStarted = useCallback(() => {
    void listStarted(userId).then(setStarted);
  }, [userId]);

  useEffect(() => {
    let live = true;
    void listCourses().then((rows) => {
      if (!live) return;
      setCourses(rows);
      setLoading(false);
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(refreshStarted, [refreshStarted]);

  const subjects = useMemo(() => subjectsPresent(courses), [courses]);
  const groups = useMemo(() => shelves(courses, subject, query), [courses, subject, query]);
  const byId = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses]);
  const carryingOn = useMemo(
    () => started.map((s) => ({ started: s, course: byId.get(s.courseId) })).filter((x) => x.course),
    [started, byId],
  );

  const open = useCallback(
    (slug: string) => router.push(`/courses?course=${encodeURIComponent(slug)}`),
    [router],
  );

  if (openSlug) {
    return (
      <CourseDetail
        onBack={() => router.push("/courses")}
        onStarted={refreshStarted}
        slug={openSlug}
        userId={userId}
      />
    );
  }

  return (
    <div className="flex h-full min-w-0 flex-col overflow-y-auto bg-(--ui-bg-editor) pt-(--titlebar-height)">
      <div className="mx-auto w-full px-[32px] pb-[80px]" style={{ maxWidth: `${COLUMN_PX}px` }}>

        {/* 🔴 TITLE ALONE. No subtitle, by owner ruling. */}
        <div className="flex items-center justify-between pt-[20px]">
          <h1 className="m-0 text-[28px] font-medium leading-[34px] tracking-[-0.01em] text-(--ui-text-primary)">
            Courses
          </h1>
          <SearchField onChange={setQuery} value={query} />
        </div>

        <div className="mt-[18px] flex flex-wrap gap-[6px]">
          <button
            className={`flex items-center rounded-full px-[12px] text-[13px] ${subject === null ? "bg-(--ui-action) text-(--ui-action-glyph)" : "border border-(--ui-stroke-primary) text-(--ui-text-secondary)"}`}
            onClick={() => setSubject(null)}
            style={{ height: "30px" }}
            type="button"
          >
            All
          </button>
          {subjects.map((name) => (
            <button
              className={`flex items-center rounded-full px-[12px] text-[13px] ${subject === name ? "bg-(--ui-action) text-(--ui-action-glyph)" : "border border-(--ui-stroke-primary) text-(--ui-text-secondary)"}`}
              key={name}
              onClick={() => setSubject(name)}
              style={{ height: "30px" }}
              type="button"
            >
              {name}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="pt-[40px] text-[14px] text-(--ui-text-tertiary)">Reading the shelf…</div>
        ) : null}

        {!loading && carryingOn.length > 0 ? (
          <section className="pt-[28px]">
            <h2 className="m-0 mb-[12px] text-[15px] font-semibold text-(--ui-text-primary)">Carrying on</h2>
            <div className="grid grid-cols-3 gap-[16px]">
              {carryingOn.map(({ started: s, course }) => (
                <button
                  className="flex flex-col gap-[9px] rounded-[12px] border border-(--ui-stroke-tertiary) bg-(--ui-bg-elevated) p-[16px] text-left hover:border-(--ui-stroke-secondary)"
                  key={s.courseId}
                  onClick={() => open(course!.slug)}
                  type="button"
                >
                  <div className="text-[15px] font-medium text-(--ui-text-primary)">{course!.title}</div>
                  <div className="text-[13px] text-(--ui-text-secondary) tabular-nums">
                    Section {s.position + 1} of {course!.sectionCount}
                  </div>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {!loading && groups.length === 0 ? (
          <div className="pt-[40px] text-[14px] text-(--ui-text-tertiary)">
            Nothing on the shelf matches that.
          </div>
        ) : null}

        {groups.map((shelf) => (
          <section className="pt-[28px]" key={shelf.subject}>
            <div className="mb-[12px] flex items-baseline gap-[10px]">
              <h2 className="m-0 text-[15px] font-semibold text-(--ui-text-primary)">{shelf.subject}</h2>
              <span className="text-[13px] text-(--ui-text-tertiary) tabular-nums">{shelf.courses.length}</span>
            </div>
            <div className="grid grid-cols-3 gap-[16px]">
              {shelf.courses.map((course) => (
                <CourseCard course={course} key={course.id} onOpen={() => open(course.slug)} />
              ))}
            </div>
          </section>
        ))}

        {/* 🔴 THE ONE LINK THAT KEEPS ALL 186 COURSES LICENSED. The credit came off the course page
            by owner ruling; CC BY §3(a)(2) permits meeting the condition with a link to a resource
            carrying it, and this is that link. It is deliberately the quietest thing on the page,
            and it is not decoration — removing it uses every author's work without the permission
            the whole catalogue depends on. */}
        {!loading && groups.length > 0 ? (
          <div className="pt-[36px] text-[12px] text-(--ui-text-tertiary)">
            <button className="underline" onClick={() => router.push("/courses/sources")} type="button">
              Sources and licences
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
