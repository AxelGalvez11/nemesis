"use client";

// The shelf of open courses, and one learner's place in them.
//
// WHAT A COURSE IS HERE. A contents list (unit / chapter / section, in reading order) plus each
// section's stated learning objectives. No body text, no figures, no exercises: Nemesis teaches
// from the outline and assesses against the objectives. `course_catalogue` / `course_sections`
// (migration `course_catalogue_and_sections`) hold 186 books, 10,748 sections and 22,452
// objectives, every one of them harvested from a CC BY or CC BY-SA edition with the licence
// checked per book rather than per publisher.
//
// 🔴 ATTRIBUTION IS THE PERMISSION, NOT A CREDIT LINE. `attribution` and `licence` are NOT NULL in
// the schema and are read on every path here, because the right to use an outline at all is
// conditional on carrying them. The owner asked (2026-09-03) for the publisher and author off the
// card face and off the course header — that is a PLACEMENT decision and it is honoured in
// `course-detail.tsx`, which puts the line at the foot of the side column. It is not a decision to
// stop carrying it. Anything that drops these fields breaks the licence, not the design.
//
// 🔴 THE CATALOGUE IS SHARED AND CONTAINS NOTHING ABOUT ANYBODY. Only `learner_courses` is
// per-user, and its RLS is the same `auth.uid() = user_id` shape every other personal table uses.

import { supabase } from "@/lib/supabase";

export interface CourseSummary {
  readonly id: string;
  readonly source: string;
  readonly slug: string;
  readonly title: string;
  readonly description: string | null;
  readonly subject: string | null;
  readonly sectionCount: number;
  readonly objectiveCount: number;
  readonly licence: string;
  readonly attribution: string;
  readonly sourceUrl: string;
}

export interface CourseSection {
  readonly ordinal: number;
  readonly number: string | null;
  readonly title: string;
  readonly unit: string | null;
  readonly chapter: string | null;
  readonly objectives: readonly string[];
}

export interface StartedCourse {
  readonly courseId: string;
  readonly position: number;
  readonly lastActiveAt: string;
}

const SUMMARY_COLUMNS =
  "id,source,slug,title,description,subject,section_count,objective_count,licence,attribution,source_url";

/**
 * 🔴 A ROW WITH NO OBJECTIVES IS NOT A COURSE AND MUST NOT REACH THE SHELF. 50 of the 236 books
 * harvested carry a contents list and nothing to assess against, which is a fact about the book
 * rather than a defect. Shipping them would put cards on the shelf that look identical to the real
 * ones and then teach nothing — the shape of promise this product cannot afford to make. The
 * import already drops them; this filter is the second lock, because a future import might not.
 */
function toSummary(row: Record<string, unknown>): CourseSummary {
  return {
    id: String(row.id),
    source: String(row.source),
    slug: String(row.slug),
    title: String(row.title),
    description: (row.description as string) ?? null,
    subject: (row.subject as string) ?? null,
    sectionCount: Number(row.section_count ?? 0),
    objectiveCount: Number(row.objective_count ?? 0),
    licence: String(row.licence ?? ""),
    attribution: String(row.attribution ?? ""),
    sourceUrl: String(row.source_url ?? ""),
  };
}

export async function listCourses(): Promise<CourseSummary[]> {
  const { data, error } = await supabase
    .from("course_catalogue")
    .select(SUMMARY_COLUMNS)
    .gt("objective_count", 0)
    .order("objective_count", { ascending: false });
  if (error) {
    console.warn("[courses] catalogue read failed", error.message);
    return [];
  }
  return (data ?? []).map(toSummary);
}

export async function getCourse(slug: string): Promise<CourseSummary | null> {
  const { data, error } = await supabase
    .from("course_catalogue")
    .select(SUMMARY_COLUMNS)
    .eq("slug", slug)
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return toSummary(data as Record<string, unknown>);
}

export async function listSections(courseId: string): Promise<CourseSection[]> {
  const { data, error } = await supabase
    .from("course_sections")
    .select("ordinal,number,title,unit,chapter,objectives")
    .eq("course_id", courseId)
    .order("ordinal", { ascending: true });
  if (error) {
    console.warn("[courses] sections read failed", error.message);
    return [];
  }
  return (data ?? []).map((r) => ({
    ordinal: Number(r.ordinal),
    number: (r.number as string) ?? null,
    title: String(r.title ?? ""),
    unit: (r.unit as string) ?? null,
    chapter: (r.chapter as string) ?? null,
    objectives: Array.isArray(r.objectives) ? (r.objectives as string[]) : [],
  }));
}

export async function listStarted(userId: string | null): Promise<StartedCourse[]> {
  if (!userId) return [];
  const { data, error } = await supabase
    .from("learner_courses")
    .select("course_id,position,last_active_at")
    .order("last_active_at", { ascending: false });
  if (error) return [];
  return (data ?? []).map((r) => ({
    courseId: String(r.course_id),
    position: Number(r.position ?? 0),
    lastActiveAt: String(r.last_active_at),
  }));
}

/**
 * Begin a course, or return to one already begun.
 *
 * 🔴 IDEMPOTENT BY (user, course), WHICH IS WHY PRESSING START TWICE IS SAFE. The unique index is
 * on that pair, so a second press resumes rather than restarting — and specifically does NOT reset
 * `position`, because "Start" on a course you are four units into means continue.
 */
export async function startCourse(userId: string | null, courseId: string): Promise<boolean> {
  if (!userId) return false;
  const { error } = await supabase
    .from("learner_courses")
    .upsert(
      { user_id: userId, course_id: courseId, last_active_at: new Date().toISOString() },
      { onConflict: "user_id,course_id", ignoreDuplicates: false },
    );
  if (error) {
    console.warn("[courses] start failed", error.message);
    return false;
  }
  return true;
}
