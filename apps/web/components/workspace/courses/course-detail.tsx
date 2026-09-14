"use client";

// One course: what it covers, what it will ask of you, and the door into it.
//
// 🔴 NO PUBLISHER, NO AUTHOR, NO LICENCE IN THE HEADER — owner, 2026-09-03: *"I don't want the
// OpenStax and the authors in there."* The attribution the licence requires sits at the foot of
// the side column, eleven pixels tall, behind a link. That is a PLACEMENT decision. It is not
// permission to drop it: CC BY means "by attribution", the objectives below are sentences the
// book's authors wrote, and the credit is the condition on which we may use them at all.
//
// 🔴 NO "ADD MY OWN MATERIAL" — owner, same message: *"I don't think users should be able to
// upload their own material for it because that would sort of defeat the purpose of the course."*
// A course is a fixed spine. The learner's own lectures still live in the Library and in ordinary
// chat, so nothing is lost by keeping this surface clean.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { CourseCover } from "./course-cover";
import {
  getCourse,
  listSections,
  startCourse,
  type CourseSection,
  type CourseSummary,
} from "@/lib/courses/catalogue";
import { coverFor } from "@/lib/courses/shelf";

export interface OutlineChapter {
  readonly title: string;
  readonly sections: readonly CourseSection[];
}
export interface OutlineUnit {
  readonly title: string | null;
  readonly chapters: readonly OutlineChapter[];
}

/**
 * Fold a flat, ordered section list back into the book's own shape.
 *
 * 🔴 READING ORDER IS TEACHING ORDER, so this never sorts: it walks `sections` as given and starts
 * a new group whenever the unit or chapter label changes. A book that repeats a chapter name in two
 * units therefore gets two groups, which is correct — they are different chapters.
 */
export function outlineOf(sections: readonly CourseSection[]): OutlineUnit[] {
  const units: OutlineUnit[] = [];
  let unit: { title: string | null; chapters: OutlineChapter[] } | null = null;
  let chapter: { title: string; sections: CourseSection[] } | null = null;
  for (const section of sections) {
    const unitTitle = section.unit ?? null;
    const chapterTitle = section.chapter ?? "";
    if (!unit || unit.title !== unitTitle) {
      unit = { title: unitTitle, chapters: [] };
      units.push(unit as OutlineUnit);
      chapter = null;
    }
    if (!chapter || chapter.title !== chapterTitle) {
      chapter = { title: chapterTitle, sections: [] };
      unit.chapters.push(chapter as OutlineChapter);
    }
    chapter.sections.push(section);
  }
  return units;
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      className="shrink-0 text-(--course-meta) transition-transform"
      fill="none"
      height="14"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.5"
      style={{ transform: open ? "rotate(90deg)" : "none" }}
      viewBox="0 0 16 16"
      width="14"
    >
      <path d="M6 3.5 10.5 8 6 12.5" />
    </svg>
  );
}

function Objectives({ items }: { items: readonly string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="my-[4px] rounded-[10px] bg-(--ui-bg-quaternary) px-[14px] py-[12px]">
      {/* 🔴 NO "By the end of this section you will be able to" — owner, 2026-09-04. The list is
          self-evidently a list of things you will be able to do; the sentence was a header saying
          what the next four lines already say. */}
      <div className="flex flex-col gap-[6px]">
        {items.map((objective) => (
          <div className="flex gap-[8px] text-[13px] leading-[1.45] text-(--ui-text-primary)" key={objective}>
            <span className="text-(--course-meta)">—</span>
            <span>{objective}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CourseDetail({
  slug,
  userId,
  onBack,
  onStarted,
}: {
  slug: string;
  userId: string | null;
  onBack: () => void;
  onStarted: () => void;
}) {
  const router = useRouter();
  const [course, setCourse] = useState<CourseSummary | null>(null);
  const [sections, setSections] = useState<CourseSection[]>([]);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [starting, setStarting] = useState(false);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let live = true;
    void (async () => {
      const found = await getCourse(slug);
      if (!live) return;
      if (!found) {
        setMissing(true);
        return;
      }
      setCourse(found);
      const rows = await listSections(found.id);
      if (!live) return;
      setSections(rows);
      // The first unit and its first chapter open, so the page shows real objectives without a
      // click. Everything below stays folded: a 28-chapter book unfolded is not a contents page.
      const first = rows.find((s) => s.objectives.length > 0) ?? rows[0];
      if (first) {
        setOpen(new Set([`unit:${first.unit ?? ""}|0`, `${first.unit ?? ""}|${first.chapter ?? ""}`]));
      }
    })();
    return () => {
      live = false;
    };
  }, [slug]);

  const units = useMemo(() => outlineOf(sections), [sections]);

  const toggle = useCallback((key: string) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const begin = useCallback(async () => {
    if (!course) return;
    setStarting(true);
    const ok = await startCourse(userId, course.id);
    setStarting(false);
    if (!ok) return;
    onStarted();
    // 🔴 A COURSE STAYS IN THE COURSES SECTION. Owner, 2026-09-04: *"courses, I think they should
    // be able to remain in the courses section. They shouldn't really open up a chat."* This line
    // used to push to `/learn?course=…`, which meant starting a course left Courses and turned
    // into an ordinary canvas — the exact thing he ruled out. It opens the reader now.
    router.push(`/courses?course=${encodeURIComponent(course.slug)}&read=1`);
  }, [course, onStarted, router, userId]);

  if (missing) {
    return (
      <div className="flex h-full items-center justify-center bg-(--ui-bg-editor) text-[14px] text-(--course-quiet)">
        That course is not on the shelf.
      </div>
    );
  }

  return (
    <div className="flex h-full min-w-0 flex-col overflow-y-auto bg-(--ui-bg-editor) pt-(--titlebar-height)">
      <div className="mx-auto flex w-full gap-[36px] px-[32px] pb-[80px]" style={{ maxWidth: "1080px" }}>

        {/* left: the course */}
        <div className="min-w-0 grow">
          <button
            className="flex h-[36px] items-center gap-[6px] text-[14px] text-(--course-quiet) hover:text-(--ui-text-primary)"
            onClick={onBack}
            type="button"
          >
            <svg fill="none" height="16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" viewBox="0 0 16 16" width="16">
              <path d="M9.5 3.5 5 8l4.5 4.5" />
            </svg>
            Courses
          </button>

          {course ? (
            <>
              <div className="mt-[8px] overflow-hidden rounded-[12px]">
                <CourseCover {...coverFor(course)} height={150} slug={course.slug} />
              </div>

              <h1 className="m-0 mt-[20px] text-[28px] font-medium leading-[1.2] tracking-[-0.01em] text-(--ui-text-primary)">
                {course.title}
              </h1>

              {course.description ? (
                <p className="m-0 mt-[14px] max-w-[640px] text-[15px] leading-[1.6] text-(--course-quiet)">
                  {course.description}.
                </p>
              ) : null}

              <div className="mt-[22px]">
                <h2 className="m-0 text-[15px] font-semibold text-(--ui-text-primary)">Contents</h2>
              </div>

              {/* 🔴 UNITS COLLAPSE TOO — owner, 2026-09-04. A 169-section book is 7 units and 28
                  chapters; with only the chapters folding, the page still opened as a 28-row wall.
                  Folding at the top level is what makes a long course scannable. */}
              <div className="mt-[10px] border-t border-(--ui-stroke-tertiary)">
                {units.map((unit, ui) => {
                  const unitKey = `unit:${unit.title ?? ""}|${ui}`;
                  const unitOpen = unit.title === null || open.has(unitKey);
                  return (
                    <div key={`${unit.title ?? "u"}-${ui}`}>
                      {unit.title ? (
                        <button
                          className="flex w-full items-center gap-[10px] border-b border-(--ui-stroke-tertiary) py-[14px] text-left"
                          onClick={() => toggle(unitKey)}
                          type="button"
                        >
                          <Chevron open={unitOpen} />
                          <span className="text-[17px] font-semibold text-(--ui-text-primary)">{unit.title}</span>
                          <span className="ml-auto text-[12px] font-normal text-(--course-meta) tabular-nums">
                            {unit.chapters.length} chapters
                          </span>
                        </button>
                      ) : null}
                      {unitOpen
                        ? unit.chapters.map((chapter, ci) => {
                            const key = `${unit.title ?? ""}|${chapter.title}`;
                            const isOpen = open.has(key);
                            return (
                              <div className="border-b border-(--ui-stroke-tertiary)" key={`${key}-${ci}`}>
                                <button
                                  className="flex w-full items-center gap-[10px] py-[13px] pl-[24px] text-left"
                                  onClick={() => toggle(key)}
                                  type="button"
                                >
                                  <Chevron open={isOpen} />
                                  <span className="text-[15px] font-medium text-(--ui-text-primary)">
                                    {chapter.title || "Sections"}
                                  </span>
                                </button>
                                {isOpen ? (
                                  <div className="ml-[48px] flex flex-col pb-[12px]">
                                    {chapter.sections.map((section) => (
                                      <div key={section.ordinal}>
                                        <div className="flex min-h-[28px] items-center text-[14px] text-(--ui-text-primary)">
                                          {section.number ? `${section.number} ` : ""}
                                          {section.title}
                                        </div>
                                        <Objectives items={section.objectives} />
                                      </div>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                            );
                          })
                        : null}
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="pt-[40px] text-[14px] text-(--course-quiet)">Opening…</div>
          )}
        </div>

        {/* right: the door, and the credit at its foot */}
        {course ? (
          <div className="flex w-[310px] shrink-0 flex-col pt-[44px]">
            <div className="rounded-[12px] border border-(--ui-stroke-tertiary) bg-(--ui-bg-elevated) p-[18px]">
              <button
                className="flex h-[42px] w-full items-center justify-center rounded-[10px] bg-(--ui-action) text-[15px] font-medium text-(--ui-action-glyph) disabled:opacity-60"
                disabled={starting || !userId}
                onClick={() => void begin()}
                type="button"
              >
                {starting ? "Starting…" : "Start this course"}
              </button>

              <div className="mt-[18px] flex flex-col gap-[11px] border-t border-(--ui-stroke-tertiary) pt-[16px]">
                <div className="flex justify-between text-[13px]">
                  <span className="text-(--course-quiet)">Sections</span>
                  <span className="tabular-nums text-(--ui-text-primary)">{course.sectionCount}</span>
                </div>
                <div className="flex justify-between text-[13px]">
                  <span className="text-(--course-quiet)">Things to be able to do</span>
                  <span className="tabular-nums text-(--ui-text-primary)">{course.objectiveCount}</span>
                </div>
              </div>
            </div>

            {/* 🔴 "BASED ON AN OPEN TEXTBOOK" IS THE ATTRIBUTION, IN THE OWNER'S OWN WORDING.
                2026-09-04: *"we dont have to credit, we dont have their content at all, maybe just
                add something like 'based on the x'."* The premise is not quite right — the
                objectives on this page are sentences the book's authors wrote, verbatim, and those
                are the licensed part — but the wording he proposed is a better answer than the
                credit line it replaces: it names no publisher and no author, reads as product copy
                rather than a footnote, and still points at the resource carrying the full credit.
                That pointer is what makes it lawful. CC BY §3(a)(2) permits satisfying the
                conditions "by providing a URI or hyperlink to a resource that includes the required
                information", and `/courses/sources` is that resource. The words may change freely.
                The LINK may not disappear. */}
            <div className="mt-[16px] px-[2px] text-[11px] leading-[1.5] text-(--course-meta)">
              Based on an open textbook.{" "}
              <button className="underline" onClick={() => router.push("/courses/sources")} type="button">
                Source and licence
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
