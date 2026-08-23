// The deep-research course builder — what happens when the library has no skeleton for a subject.
//
// Owner decision, 2026-08-23 (the third of three): *"Always deep-research. Web search, read real
// sources, build the skeleton from what it finds… a course is worth the wait."* This module is
// that path: one web search through the SAME `searchWebContext` every canvas turn uses, one
// focused model call through the SAME `postChatCompletion`, and a skeleton that comes out shaped
// exactly like a library seed — `provisional`, structurally validated, honestly provenanced.
//
// 🔴🔴 IT SYNTHESISES STRUCTURE AND NEVER COPIES ONE. The licence line that governs the whole
// registry governs here hardest, because the inputs are arbitrary web pages: facts about what a
// field contains are nobody's property; a single source's ARRANGEMENT AND WORDING are. The
// contract below orders the model to write its own arrangement in its own words across ALL the
// sources, and the consulted pages are kept on the plan as citations — provenance, not content.
// Exam outlines the search happens to surface are alignment context, same rule as everywhere.
//
// 🔴 THE OUTPUT NEVER TOUCHES THE REGISTRY. A researched skeleton becomes a plan on ONE canvas.
// Promotion into `CURRICULUM_SEEDS` is a human edit in a diff — the maturity ladder's "never
// silently" applies to entry exactly as it applies to climbing.
//
// 🔴 EVERY FAILURE IS A NAMED REFUSAL WITH A SENTENCE. The Course chip is a control; a control
// whose failure says nothing is this codebase's most-repeated defect, filed by name in
// canvas-territory.ts and curriculum-course.ts both.

import { postChatCompletion, searchWebContext } from "@/lib/workspace/chat-api";
import type { ChatRouteDecision } from "@/lib/workspace/chat-routing";
import { conceptIdentityKey } from "./concept-identity";
import { skeletonInvalid, type CurriculumSkeleton } from "./curriculum-registry";
import type { PlanSource } from "./curriculum-plan";

/** How many pages one research pass reads. A course outline needs breadth, not one lucky page. */
export const RESEARCH_PAGES = 10;

/** Topic ceilings — the same "a ceiling, never a target" rule the registry's seeds live by. */
export const MAX_RESEARCH_TOPICS = 16;
export const MIN_RESEARCH_TOPICS = 6;
const MAX_RESEARCH_CHILDREN = 8;

export type ResearchRefusal =
  /** The search returned nothing readable — offline, filtered, or a subject the web has no course shape for. */
  | "research-found-nothing"
  /** The model call failed outright (auth, budget, network). */
  | "research-model-failed"
  /** The model answered, but nothing skeleton-shaped survived validation. */
  | "research-unusable";

export type ResearchOutcome =
  | { readonly ok: true; readonly skeleton: CurriculumSkeleton; readonly sources: readonly PlanSource[] }
  | { readonly ok: false; readonly refusal: ResearchRefusal; readonly detail: string };

/** One line of product copy per refusal — shown beside the turn's reply, never logged and lost. */
export function researchRefusalLine(refusal: ResearchRefusal, subject: string): string {
  if (refusal === "research-found-nothing") {
    return (
      `Nemesis searched the web to build a course for ${subject} and couldn't find enough to build from — ` +
      "it can still teach it right here: keep asking, or attach your own material."
    );
  }
  if (refusal === "research-model-failed") {
    return `Nemesis started building a course for ${subject} but the attempt failed partway. Ask again to retry — the conversation still works.`;
  }
  return (
    `Nemesis researched ${subject} but couldn't put together an outline it would stand behind, ` +
    "so it didn't apply one. It can still teach the subject right here."
  );
}

/** The search that feeds the synthesis. One query, built for breadth of course-shaped pages. */
export function researchQuery(subject: string): string {
  return `${subject.trim()} course syllabus topics curriculum what to learn`;
}

/** Structural slug for the researched course's concept-identity domain. Field-agnostic. */
function researchSlug(subject: string): string {
  const slug = subject
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "subject";
}

/**
 * The wire messages for the synthesis call.
 *
 * 🔴 THE OWN-WORDS CLAUSE IS THE LICENCE RULE'S TEETH AND MUST NOT BE SOFTENED. It is asserted by
 * test, verbatim, because it is the one sentence standing between "synthesised from sources" and
 * "copied a publisher's table of contents".
 */
export function researchMessages(
  subject: string,
  webContext: string,
): { role: "system" | "user"; content: string }[] {
  return [
    {
      content: [
        "You design course outlines for a learning product. You are given web research about a subject.",
        "",
        "Produce ONE course outline as JSON, and nothing else:",
        '{"title": "…", "aliases": ["…"], "topics": [{"label": "…", "aliases": ["…"],',
        '  "outcome": "…", "children": [{"label": "…", "outcome": "…"}]}]}',
        "",
        `Rules:`,
        `- ${MIN_RESEARCH_TOPICS} to ${MAX_RESEARCH_TOPICS} top-level topics, in the order the subject is genuinely learned.`,
        "- Use children only where a topic truly groups sub-topics. One level of children, never deeper.",
        "- Write your own arrangement in your own words, synthesised across ALL the sources. Do not reproduce any single source's outline, wording or ordering.",
        '- "outcome" is what competence looks like, in the learner\'s terms — one plain sentence, no jargon-first phrasing.',
        '- "aliases" are other names a student would call the thing. Course aliases are COURSE names ("orgo", "chem 101"), never bare field names.',
        "- No lessons, no questions, no schedule, no prerequisites — structure only.",
        "- Labels must be distinct from each other.",
      ].join("\n"),
      role: "system",
    },
    {
      content: `Subject: ${subject.trim()}\n\nWeb research:\n${webContext}`,
      role: "user",
    },
  ];
}

type RawTopic = {
  label?: unknown;
  aliases?: unknown;
  outcome?: unknown;
  children?: unknown;
};

function asAliases(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((alias): alias is string => typeof alias === "string" && alias.trim().length > 0)
    .map((alias) => alias.trim().toLowerCase())
    .slice(0, 6);
}

function asOutcome(value: unknown): string[] {
  return typeof value === "string" && value.trim() ? [value.trim()] : [];
}

/**
 * Read a skeleton out of whatever the model returned, or null when nothing trustworthy is there.
 *
 * 🔴 NULL IS THE SAFE ANSWER, exactly as `readClarifyQuestion` argues: a malformed course applied
 * anyway would retitle a canvas and stand in the Minimap for days. Every doubt resolves to "no
 * course", the caller shows the named refusal, and the conversation continues unharmed.
 *
 * 🔴 DUPLICATE LABELS ARE DROPPED, NOT REFUSED. The model repeating "Kinematics" twice is noise to
 * clean, not a reason to throw away eleven good topics — but the SURVIVING skeleton still has to
 * pass `skeletonInvalid`, the same read-time gate every library seed passes.
 */
export function readResearchedSkeleton(subject: string, raw: string): CurriculumSkeleton | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Tolerate a fenced answer — the model was told "JSON and nothing else", but a fence is the
  // most common way of obeying that instruction imperfectly.
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(trimmed);
  const body = fenced ? fenced[1]! : trimmed;
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
  const row = parsed as { title?: unknown; aliases?: unknown; topics?: unknown };
  const title = typeof row.title === "string" && row.title.trim() ? row.title.trim() : subject.trim();
  if (!Array.isArray(row.topics)) return null;

  const domain = `researched:${researchSlug(subject)}`;
  const seen = new Set<string>();
  const nodes: CurriculumSkeleton["nodes"][number][] = [];
  let position = 0;
  for (const rawTopic of row.topics as RawTopic[]) {
    if (nodes.filter((node) => node.parentKey === null).length >= MAX_RESEARCH_TOPICS) break;
    if (typeof rawTopic !== "object" || rawTopic === null) continue;
    const label = typeof rawTopic.label === "string" ? rawTopic.label.trim() : "";
    if (!label || seen.has(label.toLowerCase())) continue;
    seen.add(label.toLowerCase());
    position += 1;
    const parentKey = conceptIdentityKey({ domain, label });
    nodes.push({
      aliases: asAliases(rawTopic.aliases),
      conceptKey: parentKey,
      label,
      outcomes: asOutcome(rawTopic.outcome),
      parentKey: null,
      position,
    });
    if (!Array.isArray(rawTopic.children)) continue;
    let childPosition = 0;
    for (const rawChild of rawTopic.children.slice(0, MAX_RESEARCH_CHILDREN) as RawTopic[]) {
      if (typeof rawChild !== "object" || rawChild === null) continue;
      const childLabel = typeof rawChild.label === "string" ? rawChild.label.trim() : "";
      if (!childLabel || seen.has(childLabel.toLowerCase())) continue;
      seen.add(childLabel.toLowerCase());
      childPosition += 1;
      nodes.push({
        aliases: asAliases(rawChild.aliases),
        conceptKey: conceptIdentityKey({ domain, label: childLabel }),
        label: childLabel,
        outcomes: asOutcome(rawChild.outcome),
        // 🔴 GRANDCHILDREN NEVER EXIST: children of children are simply not read, so the two-level
        // rule holds by construction rather than by trusting the model.
        parentKey,
        position: childPosition,
      });
    }
  }

  if (nodes.filter((node) => node.parentKey === null).length < MIN_RESEARCH_TOPICS) return null;

  const skeleton: CurriculumSkeleton = {
    aliases: [
      ...new Set([subject.trim().toLowerCase(), ...asAliases(row.aliases)]),
    ],
    domain,
    key: conceptIdentityKey({ domain, label: `${title.toLowerCase()} curriculum` }),
    // 🔴 provisional AND nemesis-researched, NOT overridable — same honesty-by-construction as
    // the library's `course()` mint. Promotion is a human edit in a diff.
    maturity: "provisional",
    nodes,
    provenance: "nemesis-researched",
    title,
    version: 1,
  };
  return skeletonInvalid(skeleton) === null ? skeleton : null;
}

/** Same conservative decision every canvas conversation turn uses — no tools, no search flag. */
const RESEARCH_DECISION: ChatRouteDecision = { model: "deepseek-chat", route: "conversation", searchWeb: false };

/**
 * The whole pass: search → read → synthesise → validate.
 *
 * `onStep` narrates for the busy caption — emitted by steps genuinely running, never by a timer,
 * per thinking-phases.ts's standing rule.
 */
export async function researchCurriculum(
  uid: string,
  subject: string,
  hooks: { signal?: AbortSignal; onStep?: (label: string) => void } = {},
): Promise<ResearchOutcome> {
  hooks.onStep?.("Searching the web for the course");
  const found = await searchWebContext(uid, researchQuery(subject), hooks.signal, RESEARCH_PAGES, null);
  if (!found.context.trim()) {
    return { detail: "the search returned nothing readable", ok: false, refusal: "research-found-nothing" };
  }
  hooks.onStep?.(
    found.sources.length === 1 ? "Reading 1 source" : `Reading ${found.sources.length} sources`,
  );

  hooks.onStep?.("Drafting the course map");
  const reply = await postChatCompletion(uid, researchMessages(subject, found.context), {
    decision: RESEARCH_DECISION,
    signal: hooks.signal,
  });
  if (!reply.text) {
    return { detail: reply.errorText ?? "the model call failed", ok: false, refusal: "research-model-failed" };
  }

  const skeleton = readResearchedSkeleton(subject, reply.text);
  if (!skeleton) {
    return { detail: "no valid outline survived validation", ok: false, refusal: "research-unusable" };
  }
  const sources: PlanSource[] = found.sources
    .filter((source) => typeof source.url === "string" && source.url.trim().length > 0)
    .map((source) => ({ title: source.title ?? source.url, url: source.url }));
  return { ok: true, skeleton, sources };
}
