// How the catalogue is arranged on screen, and what a course's cover looks like.
//
// PURE. No React, no I/O, no clock — so the ordering and the artwork are both testable without a
// browser, and a cover can never differ between two renders of the same course.

import type { CourseSummary } from "./catalogue";

/** The shelf headings, in the order they appear. */
export const SUBJECT_ORDER: readonly string[] = [
  "Medicine and health",
  "Natural sciences",
  "Mathematics",
  "Social sciences",
  "Business and economics",
  "Humanities",
  "Communication and media",
  "Computer science",
  "Engineering and trades",
  "Education",
  "Languages",
  "Law",
  "Student success",
];

/**
 * 🔴 UNCLASSIFIED IS A SHELF, NOT A HIDING PLACE. 39 of 186 books matched no subject rule, and
 * dropping them would silently shrink the catalogue by a fifth to keep the headings tidy. They go
 * last, under a heading that says what they are.
 */
export const UNCLASSIFIED = "Everything else";

export interface Shelf {
  readonly subject: string;
  readonly courses: readonly CourseSummary[];
}

/** Case- and punctuation-insensitive match on the title and the blurb. */
export function matchesQuery(course: CourseSummary, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = `${course.title} ${course.description ?? ""} ${course.subject ?? ""}`.toLowerCase();
  return q.split(/\s+/).every((word) => hay.includes(word));
}

/**
 * Group the catalogue into shelves.
 *
 * Courses arrive ordered by `objective_count` descending, and that order is PRESERVED inside each
 * shelf: the book with the most to teach leads its subject. Shelves themselves follow
 * `SUBJECT_ORDER` so the page does not reshuffle when one course gains a section.
 */
export function shelves(courses: readonly CourseSummary[], subject: string | null, query: string): Shelf[] {
  const visible = courses.filter((c) => matchesQuery(c, query) && (!subject || label(c) === subject));
  const bySubject = new Map<string, CourseSummary[]>();
  for (const course of visible) {
    const key = label(course);
    const list = bySubject.get(key);
    if (list) list.push(course);
    else bySubject.set(key, [course]);
  }
  const ordered: Shelf[] = [];
  for (const name of SUBJECT_ORDER) {
    const found = bySubject.get(name);
    if (found?.length) ordered.push({ subject: name, courses: found });
  }
  const rest = bySubject.get(UNCLASSIFIED);
  if (rest?.length) ordered.push({ subject: UNCLASSIFIED, courses: rest });
  return ordered;
}

export function label(course: CourseSummary): string {
  return course.subject ?? UNCLASSIFIED;
}

/** Every subject with at least one course, for the filter row. */
export function subjectsPresent(courses: readonly CourseSummary[]): string[] {
  const seen = new Set(courses.map(label));
  const ordered = SUBJECT_ORDER.filter((s) => seen.has(s));
  if (seen.has(UNCLASSIFIED)) ordered.push(UNCLASSIFIED);
  return ordered;
}

// ── cover art ────────────────────────────────────────────────────────────────────────────────
//
// 🔴 DRAWN, NOT GENERATED OR FETCHED, AND THAT IS A DELIBERATE TRADE. 186 covers (and 500+ once
// the rest of the open corpus lands) is too many to commission, generate or store, and a remote
// image is one more thing that can fail to load on a page whose whole job is to look browsable.
// A motif computed from the slug is free, instant, identical on every render and every device,
// and cannot 404. If real artwork is ever wanted, it replaces `COVER_MOTIFS` and nothing else.
//
// 🔴 ONE ACCENT, SO THE COVERS ARE GREY. The product has a single accent colour by owner ruling
// ("the character is the accent, and there is no second colour to disagree"). Covers vary by SHAPE
// and by weight, never by hue, so a wall of 186 of them still reads as one product.

export type CoverMotif = "arcs" | "cells" | "lattice" | "waves" | "bars" | "orbits" | "grid";

const COVER_MOTIFS: readonly CoverMotif[] = ["arcs", "cells", "lattice", "waves", "bars", "orbits", "grid"];

/** A stable small integer from a string. Deterministic across machines and reloads. */
export function seedOf(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

/**
 * Which motif a course wears.
 *
 * Chosen from the SLUG, so it never changes when a title is edited, a description is rewritten or
 * the catalogue is re-imported — the cover is part of how someone recognises a course on the shelf,
 * and a cover that moves is worse than no cover.
 */
export function coverFor(course: Pick<CourseSummary, "slug" | "subject">): { motif: CoverMotif; seed: number } {
  const seed = seedOf(course.slug);
  return { motif: COVER_MOTIFS[seed % COVER_MOTIFS.length]!, seed };
}
