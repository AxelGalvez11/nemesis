// The textbook-shelf course builder: a published book's own chapter order, offered as the course.
//
// Owner direction, 2026-08-30: *"courses that are made, DeepSeek can pull from already made course
// scaffolds, or if it's supposed to be something that's not within our corpus, then DeepSeek
// should ask for clarification on what kind of course the user wants."* This module is the first
// half of that sentence. The second half already ships: `turn-router.ts` asks its one clarifying
// question BEFORE any build when the request could be several different courses, so by the time
// this runs the subject is as clear as it is going to get.
//
// 🔴 THE MIDDLE RUNG OF A THREE-RUNG LADDER, and the caller in `use-canvas-session.ts` holds the
// order: a library seed a human authored, then a published book's scaffold, then the deep-research
// synthesiser. A real book's order beats a synthesised one when we hold the book, because it was
// put in that order by somebody who taught the subject; research remains the long tail's answer.
//
// 🔴🔴 THIS PATH COPIES AN ARRANGEMENT, AND MAY, WHICH IS THE OPPOSITE OF THE RESEARCH PATH'S RULE.
// `curriculum-research.ts` forbids reproducing any single source's outline because its inputs are
// arbitrary web pages whose arrangement is somebody's property. A scaffold is different in exactly
// one way that matters: the book granted reuse and adaptation in writing (CC BY family, gated at
// harvest by catalogue AND the book's own metadata, and again by a database constraint), and the
// grant's price is attribution. So the chapter order is used AS IS, the book is named on the plan
// as its source, and `course-map.tsx` renders that credit wherever the map appears. Copying
// without the licence is theft; paying the attribution and NOT using the better structure would
// just be a worse product with the same legal position.
//
// 🔴 THE MODEL DECIDES FIT, CODE DECIDES EVERYTHING ELSE. Which book matches "intro to microbes"
// is a judgement about meaning, so it goes to the model as a closed multiple-choice question with
// "none" always on the ballot. What the model may NOT do is write the outline: a picked scaffold
// is converted to a skeleton by code, field by field, and validated by the same `skeletonInvalid`
// gate every library seed passes. A model answer that names no listed book reads as "none".
//
// 🔴 EVERY FAILURE FALLS THROUGH, SILENTLY AND ON PURPOSE. A refusal here is not a dead end the
// learner sees; the caller simply moves to the research rung, whose own refusals still speak. The
// named reasons exist for tests and telemetry, not for product copy.

import { postChatCompletion } from "@/lib/workspace/chat-api";
import type { ChatRouteDecision } from "@/lib/workspace/chat-routing";
import type { CourseScaffold, ScaffoldPart } from "@/app/api/v1/courses/route";
import { conceptIdentityKey } from "./concept-identity";
import { skeletonInvalid, type CurriculumSkeleton } from "./curriculum-registry";
import type { PlanSource } from "./curriculum-plan";

/** How many shelf candidates the model is shown. A ballot, not a catalogue. */
export const MAX_SCAFFOLD_CANDIDATES = 12;

/** Nodes kept from one book. Parts plus chapters land well under this; it exists so a malformed
 *  row cannot become a thousand-node plan. */
const MAX_SCAFFOLD_NODES = 120;

export type ScaffoldRefusal =
  /** The shelf lists nothing whose title brushes the subject. The common, honest answer. */
  | "no-scaffold-for-subject"
  /** Candidates existed and the model declined them all, or its answer was unreadable. */
  | "no-scaffold-fits"
  /** The pick could not be fetched or did not survive conversion and validation. */
  | "scaffold-unusable";

export type ScaffoldOutcome =
  | {
      readonly ok: true;
      readonly skeleton: CurriculumSkeleton;
      /** Exactly one source: the book. `course-map.tsx` renders a single source as the credit. */
      readonly sources: readonly PlanSource[];
    }
  | { readonly ok: false; readonly refusal: ScaffoldRefusal; readonly detail: string };

/** One shelf row as the ballot shows it. */
export interface ScaffoldCandidate {
  readonly bookTitle: string;
  readonly bookUrl: string;
  readonly chapterCount: number;
}

/**
 * The ballot. A closed question: numbers or the word none, nothing else parsed.
 *
 * 🔴 "none" IS THE INSTRUCTED DEFAULT, STATED TWICE, because the failure that matters is a
 * plausible-but-wrong book: a course built from "Microbiology for Allied Health" when the learner
 * asked for general microbiology retitles their canvas and stands in the map for days. Falling
 * through to research merely costs a minute of web reading.
 */
export function scaffoldPickMessages(
  subject: string,
  candidates: readonly ScaffoldCandidate[],
): { role: "system" | "user"; content: string }[] {
  const ballot = candidates
    .map((row, at) => `${at + 1}. ${row.bookTitle} (${row.chapterCount} chapters)`)
    .join("\n");
  return [
    {
      content: [
        "A learner asked a learning product for a course. The product holds the chapter outlines",
        "of openly licensed published textbooks, and you decide whether one of them IS the course",
        "the learner asked for.",
        "",
        "Pick a book only when its whole shape fits: it covers the subject the learner named, at",
        "the level they named, as its main matter. A book about one branch of the subject, a book",
        "that only touches it, or a book aimed at a clearly different audience is not a fit.",
        "If no listed book fits, or you are unsure, answer none. When several fit, answer the best",
        "single one.",
        "",
        "Reply with ONLY the number of the chosen book, or the word none. No other words.",
      ].join("\n"),
      role: "system",
    },
    {
      content: `The learner asked for a course on: ${subject.trim()}\n\nBooks on the shelf:\n${ballot}`,
      role: "user",
    },
  ];
}

/**
 * Read the model's ballot answer: a 1-based index into the candidate list, or null for none.
 *
 * 🔴 NULL IS THE SAFE ANSWER AND EVERYTHING DOUBTFUL RESOLVES TO IT — the same rule
 * `readResearchedSkeleton` states. The parse is deliberately illiterate: the first integer token
 * in range wins, "none" or anything else loses, and prose around a number does not rescue an
 * answer that ignored the contract's only formatting rule.
 */
export function readScaffoldPick(raw: string, count: number): number | null {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed || trimmed.startsWith("none")) return null;
  const token = /^(\d{1,3})\b/.exec(trimmed);
  if (!token) return null;
  const picked = Number(token[1]);
  return Number.isInteger(picked) && picked >= 1 && picked <= count ? picked : null;
}

/** Part names Pressbooks stamps on books that are not really divided into parts. A book whose
 *  only parts are these is flat, and its chapters stand at the top of the plan. */
const GENERIC_PARTS = new Set(["main body", "contents", "chapters", "body"]);

function scaffoldSlug(subject: string): string {
  const slug = subject
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "book";
}

/**
 * A fetched scaffold as a skeleton the registry's own validation will accept.
 *
 * 🔴 TWO LEVELS BY CONSTRUCTION: parts become parents and chapters their children, exactly the
 * depth `skeletonInvalid` enforces. A book with one part, or only the generic parts Pressbooks
 * invents, is flat and its chapters stand at the top.
 *
 * 🔴 DUPLICATE CHAPTER TITLES ARE REAL ("Introduction" opens half the parts of half the shelf)
 * and identity keys hash the label, so a duplicate is re-keyed under its part's name. The LABEL
 * the learner reads stays the author's own; only the identity behind it is qualified. A title
 * still colliding after that is dropped, noise rather than a reason to refuse the book.
 *
 * 🔴 `provisional`, NOT `reviewed`, though a publisher reviewed the book. The maturity ladder's
 * words are about OUR review, and promotion is a human edit in a diff. What records that this
 * came from a published book is `provenance: "textbook-scaffold"` and the source on the plan.
 */
export function skeletonFromScaffold(subject: string, scaffold: CourseScaffold): CurriculumSkeleton | null {
  const parts = (scaffold.parts ?? []).filter(
    (part): part is ScaffoldPart => Array.isArray(part?.chapters) && part.chapters.length > 0,
  );
  if (parts.length === 0) return null;

  const domain = `scaffold:${scaffoldSlug(scaffold.bookTitle)}`;
  const flat = parts.length === 1 || parts.every((part) => GENERIC_PARTS.has(part.part.trim().toLowerCase()));

  const seen = new Set<string>();
  const nodes: CurriculumSkeleton["nodes"][number][] = [];
  let position = 0;

  const push = (label: string, parentKey: string | null, keyLabel: string, at: number): string | null => {
    const key = conceptIdentityKey({ domain, label: keyLabel });
    if (seen.has(key)) return null;
    seen.add(key);
    nodes.push({ aliases: [], conceptKey: key, label, outcomes: [], parentKey, position: at });
    return key;
  };

  for (const part of parts) {
    if (nodes.length >= MAX_SCAFFOLD_NODES) break;
    let parentKey: string | null = null;
    if (!flat) {
      const partLabel = part.part.trim();
      if (!partLabel) continue;
      position += 1;
      parentKey = push(partLabel, null, partLabel, position);
      if (!parentKey) continue;
    }
    let childPosition = 0;
    for (const chapter of part.chapters) {
      if (nodes.length >= MAX_SCAFFOLD_NODES) break;
      const label = chapter.title.trim();
      if (!label) continue;
      const at = flat ? (position += 1) : (childPosition += 1);
      // Duplicate labels are re-keyed under the part, and a collision after that is dropped.
      push(label, parentKey, label, at) ?? push(label, parentKey, `${part.part}: ${label}`, at);
    }
  }

  if (nodes.length < 3) return null;

  const skeleton: CurriculumSkeleton = {
    aliases: [...new Set([subject.trim().toLowerCase(), scaffold.bookTitle.trim().toLowerCase()])].filter(Boolean),
    domain,
    key: conceptIdentityKey({ domain, label: `${scaffold.bookTitle.toLowerCase()} curriculum` }),
    maturity: "provisional",
    nodes,
    provenance: "textbook-scaffold",
    title: scaffold.bookTitle,
    version: 1,
  };
  return skeletonInvalid(skeleton) === null ? skeleton : null;
}

/** The plan's source line: the attribution the harvest kept, or the bare title, pointing home. */
export function scaffoldSource(scaffold: CourseScaffold): PlanSource {
  return { title: scaffold.attribution.trim() || scaffold.bookTitle, url: scaffold.bookUrl };
}

interface ScaffoldDeps {
  /** Injected for tests. The real one crosses `/api/v1/courses` with the session's own token. */
  readonly listScaffolds?: (subject: string) => Promise<CourseScaffold[]>;
  readonly fetchScaffold?: (bookUrl: string) => Promise<CourseScaffold | null>;
}

/** Same conservative decision every canvas conversation turn uses: no tools, no search flag. */
const PICK_DECISION: ChatRouteDecision = { model: "deepseek-chat", route: "conversation", searchWeb: false };

/**
 * The whole rung: shortlist by title, let the model judge fit, convert, validate.
 *
 * `onStep` narrates for the busy caption — emitted by steps genuinely running, never by a timer,
 * per thinking-phases.ts's standing rule.
 */
export async function scaffoldCurriculum(
  uid: string,
  subject: string,
  hooks: { signal?: AbortSignal; onStep?: (label: string) => void } = {},
  deps: ScaffoldDeps = {},
): Promise<ScaffoldOutcome> {
  hooks.onStep?.("Checking the textbook shelf");
  const list = deps.listScaffolds ?? defaultList;
  let candidates: CourseScaffold[];
  try {
    candidates = await list(subject);
  } catch {
    candidates = [];
  }
  if (candidates.length === 0) {
    return { detail: "no shelf title brushes this subject", ok: false, refusal: "no-scaffold-for-subject" };
  }

  const shortlist = candidates.slice(0, MAX_SCAFFOLD_CANDIDATES);
  const reply = await postChatCompletion(
    uid,
    scaffoldPickMessages(
      subject,
      shortlist.map((row) => ({ bookTitle: row.bookTitle, bookUrl: row.bookUrl, chapterCount: row.chapterCount })),
    ),
    { decision: PICK_DECISION, signal: hooks.signal },
  );
  const picked = reply.text ? readScaffoldPick(reply.text, shortlist.length) : null;
  if (picked === null) {
    return { detail: "the model kept none of the shelf's candidates", ok: false, refusal: "no-scaffold-fits" };
  }

  const chosen = shortlist[picked - 1]!;
  hooks.onStep?.(`Laying the course out from ${chosen.bookTitle}`);
  const fetchOne = deps.fetchScaffold ?? defaultFetch;
  let full: CourseScaffold | null;
  try {
    full = await fetchOne(chosen.bookUrl);
  } catch {
    full = null;
  }
  const skeleton = full ? skeletonFromScaffold(subject, full) : null;
  if (!full || !skeleton) {
    return { detail: `the scaffold for ${chosen.bookTitle} did not survive conversion`, ok: false, refusal: "scaffold-unusable" };
  }
  return { ok: true, skeleton, sources: [scaffoldSource(full)] };
}

async function authedGet(path: string): Promise<unknown | null> {
  const { supabase } = await import("@/lib/supabase");
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return null;
  const res = await fetch(path, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  return res.json();
}

async function defaultList(subject: string): Promise<CourseScaffold[]> {
  const json = (await authedGet(
    `/api/v1/courses?q=${encodeURIComponent(subject.trim())}&limit=${MAX_SCAFFOLD_CANDIDATES}`,
  )) as { courses?: CourseScaffold[] } | null;
  return Array.isArray(json?.courses) ? json.courses : [];
}

async function defaultFetch(bookUrl: string): Promise<CourseScaffold | null> {
  const json = (await authedGet(`/api/v1/courses?book=${encodeURIComponent(bookUrl)}`)) as
    | { courses?: CourseScaffold[] }
    | null;
  return json?.courses?.[0] ?? null;
}
