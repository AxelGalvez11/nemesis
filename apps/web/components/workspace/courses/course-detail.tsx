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

function Objectives({ items }: { items: readonly string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="my-[4px] rounded-[10px] bg-(--ui-bg-quaternary) px-[14px] py-[12px]">
      <div className="mb-[8px] text-[12px] text-(--ui-text-tertiary)">By the end of this section you will be able to</div>
      <div className="flex flex-col gap-[6px]">
        {items.map((objective) => (
          <div className="flex gap-[8px] text-[13px] leading-[1.45] text-(--ui-text-primary)" key={objective}>
            <span className="text-(--ui-text-tertiary)">—</span>
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
      // The first chapter opens, so the page shows real objectives without a click.
      const first = rows.find((s) => s.objectives.length > 0) ?? rows[0];
      if (first) setOpen(new Set([`${first.unit ?? ""}|${first.chapter ?? ""}`]));
    })();
    return () => {
      live = false;
    };
  }, [slug]);

  const units = useMemo(() => outlineOf(sections), [sections]);

  const begin = useCallback(async () => {
    if (!course) return;
    setStarting(true);
    const ok = await startCourse(userId, course.id);
    setStarting(false);
    if (!ok) return;
    onStarted();
    // 🔴 A COURSE OPENS A CANVAS, IT DOES NOT BECOME ONE. `/learn` is the conversation surface;
    // the course id rides the URL so the session knows there is a plan behind the questions.
    router.push(`/learn?course=${encodeURIComponent(course.slug)}`);
  }, [course, onStarted, router, userId]);

  if (missing) {
    return (
      <div className="flex h-full items-center justify-center bg-(--ui-bg-editor) text-[14px] text-(--ui-text-tertiary)">
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
            className="flex h-[36px] items-center gap-[6px] text-[14px] text-(--ui-text-secondary) hover:text-(--ui-text-primary)"
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
                <CourseCover {...coverFor(course)} height={150} />
              </div>

              <h1 className="m-0 mt-[20px] text-[28px] font-medium leading-[1.2] tracking-[-0.01em] text-(--ui-text-primary)">
                {course.title}
              </h1>

              {course.description ? (
                <p className="m-0 mt-[14px] max-w-[640px] text-[15px] leading-[1.6] text-(--ui-text-secondary)">
                  {course.description}.
                </p>
              ) : null}

              <div className="mt-[22px] flex items-baseline gap-[10px]">
                <h2 className="m-0 text-[15px] font-semibold text-(--ui-text-primary)">Contents</h2>
                <span className="text-[13px] text-(--ui-text-tertiary) tabular-nums">
                  {units.length} units · {sections.length} sections
                </span>
              </div>

              <div className="mt-[10px] border-t border-(--ui-stroke-tertiary)">
                {units.map((unit, ui) => (
                  <div key={`${unit.title ?? "u"}-${ui}`}>
                    {unit.title ? (
                      <div className="flex items-center gap-[10px] border-b border-(--ui-stroke-tertiary) py-[12px] text-[14px] font-medium text-(--ui-text-primary)">
                        {unit.title}
                        <span className="ml-auto text-[12px] font-normal text-(--ui-text-tertiary) tabular-nums">
                          {unit.chapters.length} chapters
                        </span>
                      </div>
                    ) : null}
                    {unit.chapters.map((chapter, ci) => {
                      const key = `${unit.title ?? ""}|${chapter.title}`;
                      const isOpen = open.has(key);
                      return (
                        <div className="border-b border-(--ui-stroke-tertiary)" key={`${key}-${ci}`}>
                          <button
                            className="flex w-full items-center gap-[10px] py-[12px] pl-[24px] text-left"
                            onClick={() =>
                              setOpen((prev) => {
                                const next = new Set(prev);
                                if (next.has(key)) next.delete(key);
                                else next.add(key);
                                return next;
                              })
                            }
                            type="button"
                          >
                            <svg
                              className="shrink-0 text-(--ui-text-tertiary) transition-transform"
                              fill="none"
                              height="14"
                              stroke="currentColor"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="1.5"
                              style={{ transform: isOpen ? "rotate(90deg)" : "none" }}
                              viewBox="0 0 16 16"
                              width="14"
                            >
                              <path d="M6 3.5 10.5 8 6 12.5" />
                            </svg>
                            <span className="text-[14px] text-(--ui-text-primary)">{chapter.title || "Sections"}</span>
                          </button>
                          {isOpen ? (
                            <div className="ml-[48px] flex flex-col pb-[12px]">
                              {chapter.sections.map((section) => (
                                <div key={section.ordinal}>
                                  <div className="flex min-h-[26px] items-center text-[13px] text-(--ui-text-primary)">
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
                    })}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="pt-[40px] text-[14px] text-(--ui-text-tertiary)">Opening…</div>
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
                  <span className="text-(--ui-text-secondary)">Sections</span>
                  <span className="tabular-nums text-(--ui-text-primary)">{course.sectionCount}</span>
                </div>
                <div className="flex justify-between text-[13px]">
                  <span className="text-(--ui-text-secondary)">Things to be able to do</span>
                  <span className="tabular-nums text-(--ui-text-primary)">{course.objectiveCount}</span>
                </div>
              </div>
            </div>

            <div className="mt-[16px] px-[2px] text-[11px] leading-[1.5] text-(--ui-text-tertiary)">
              Nemesis teaches from this outline and checks you against its objectives. It does not
              reproduce the book.{" "}
              <a className="underline" href={course.sourceUrl} rel="noreferrer noopener" target="_blank">
                {course.attribution}
              </a>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
