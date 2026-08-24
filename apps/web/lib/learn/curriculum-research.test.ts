import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { readCurriculumPlan } from "./curriculum-plan";
import { skeletonInvalid } from "./curriculum-registry";
import {
  MAX_RESEARCH_TOPICS,
  MIN_RESEARCH_TOPICS,
  readResearchedSkeleton,
  researchMessages,
  researchQuery,
  researchRefusalLine,
} from "./curriculum-research";

// 🔴🔴 WHAT THIS FILE GUARDS: the deep-research builder synthesises its OWN structure from many
// sources, never copies one, never touches the registry, and never applies anything that would
// not pass the same validation a library seed passes. Owner decision three, 2026-08-23: "always
// deep-research" when the library misses — so this path is the common one for the long tail, and
// its honesty is load-bearing.

function outline(topics: unknown[]): string {
  return JSON.stringify({ aliases: ["intro basketry"], title: "Basket Weaving", topics });
}

function topics(count: number): { label: string; outcome: string }[] {
  return Array.from({ length: count }, (_, at) => ({ label: `Topic ${at + 1}`, outcome: `do thing ${at + 1}` }));
}

// ── the synthesis contract ──────────────────────────────────────────────────────────────────────

test("🔴🔴 the own-words clause is in the contract, verbatim — it is the licence rule's teeth", () => {
  const system = researchMessages("basket weaving", "web stuff")[0]!.content;
  assert.match(
    system,
    /Write your own arrangement in your own words, synthesised across ALL the sources\. Do not reproduce any single source's outline, wording or ordering\./,
    "the one sentence between synthesis and copying has been softened",
  );
  assert.match(system, /structure only/i, "the no-lessons rule left the contract");
});

test("the user message carries the subject and the research, and the query is course-shaped", () => {
  const user = researchMessages("basket weaving", "PAGES HERE")[1]!.content;
  assert.match(user, /basket weaving/);
  assert.match(user, /PAGES HERE/);
  assert.match(researchQuery(" basket weaving "), /^basket weaving .*syllabus/);
});

// ── reading the model's answer ──────────────────────────────────────────────────────────────────

test("🔴 a well-formed answer becomes a skeleton that passes the registry's own validation", () => {
  const skeleton = readResearchedSkeleton("basket weaving", outline([
    { aliases: ["Fibres"], label: "Materials", outcome: "choose a fibre for a job" },
    { children: [{ label: "Coiling", outcome: "coil a base" }, { label: "Plaiting" }], label: "Core techniques" },
    ...topics(5),
  ]));
  assert.ok(skeleton, "a valid outline was refused");
  assert.equal(skeletonInvalid(skeleton!), null);
  assert.equal(skeleton!.title, "Basket Weaving");
  assert.equal(skeleton!.maturity, "provisional");
  assert.equal(skeleton!.provenance, "nemesis-researched");
  assert.ok(skeleton!.domain.startsWith("researched:basket-weaving"), skeleton!.domain);
  assert.ok(skeleton!.aliases.includes("basket weaving"), "the subject the learner named is not an alias");
  const children = skeleton!.nodes.filter((node) => node.parentKey !== null);
  assert.equal(children.length, 2, "grouping was lost");
});

test("🔴 a fenced answer is read — obeying 'JSON only' imperfectly is the common case", () => {
  const fenced = "```json\n" + outline(topics(7)) + "\n```";
  assert.ok(readResearchedSkeleton("basket weaving", fenced));
});

test("🔴 duplicate labels are dropped, and the survivor still validates", () => {
  const skeleton = readResearchedSkeleton("basket weaving", outline([
    { label: "Materials", outcome: "a" },
    { label: "materials", outcome: "the same thing twice" },
    ...topics(6),
  ]));
  assert.ok(skeleton);
  assert.equal(skeleton!.nodes.filter((node) => node.label.toLowerCase() === "materials").length, 1);
  assert.equal(skeletonInvalid(skeleton!), null);
});

test("🔴 grandchildren never exist — the two-level rule holds by construction", () => {
  const skeleton = readResearchedSkeleton("basket weaving", outline([
    { children: [{ children: [{ label: "Too deep" }], label: "Child" }], label: "Top" },
    ...topics(6),
  ]));
  assert.ok(skeleton);
  assert.ok(!skeleton!.nodes.some((node) => node.label === "Too deep"), "a third level was read");
});

test(`🔴 fewer than ${MIN_RESEARCH_TOPICS} topics is not a course — null, never a stub`, () => {
  assert.equal(readResearchedSkeleton("basket weaving", outline(topics(MIN_RESEARCH_TOPICS - 1))), null);
});

test(`🔴 more than ${MAX_RESEARCH_TOPICS} top-level topics is capped, not refused`, () => {
  const skeleton = readResearchedSkeleton("basket weaving", outline(topics(MAX_RESEARCH_TOPICS + 9)));
  assert.ok(skeleton);
  assert.equal(skeleton!.nodes.filter((node) => node.parentKey === null).length, MAX_RESEARCH_TOPICS);
});

test("🔴 prose, broken JSON, arrays and empties all read as ABSENT", () => {
  for (const bad of ["", "Here is a course outline: 1. Basics", "{not json", "[1,2]", JSON.stringify({ title: "x" })]) {
    assert.equal(readResearchedSkeleton("basket weaving", bad), null, `accepted: ${bad.slice(0, 30)}`);
  }
});

// ── citations on the plan ───────────────────────────────────────────────────────────────────────

test("🔴 a researched plan's sources survive the storage round trip, and rot loses citations, never the course", () => {
  const skeleton = readResearchedSkeleton("basket weaving", outline(topics(7)))!;
  const plan = {
    appliedAt: "2026-08-23T00:00:00.000Z",
    curriculumKey: skeleton.key,
    curriculumVersion: 1,
    maturity: skeleton.maturity,
    nodes: skeleton.nodes.map((node) => ({
      aliases: node.aliases, conceptKey: node.conceptKey, label: node.label,
      parentKey: node.parentKey, position: node.position,
    })),
    sources: [{ title: "A page", url: "https://example.com/a" }],
    title: skeleton.title,
  };
  const read = readCurriculumPlan(JSON.parse(JSON.stringify(plan)));
  assert.ok(read);
  assert.deepEqual(read!.sources, plan.sources);
  const rotted = readCurriculumPlan({ ...plan, sources: [{ url: 42 }, "nonsense"] });
  assert.ok(rotted, "rotted citations sank the whole plan");
  assert.equal(rotted!.sources, undefined);
});

// ── refusals are sentences ──────────────────────────────────────────────────────────────────────

test("🔴 every refusal names the subject and leaves a path forward", () => {
  for (const refusal of ["research-found-nothing", "research-model-failed", "research-unusable"] as const) {
    const line = researchRefusalLine(refusal, "basket weaving");
    assert.match(line, /basket weaving/);
    assert.ok(line.length > 40, "a refusal too short to help");
  }
});

// ── source-shape guards ─────────────────────────────────────────────────────────────────────────

function code(source: string): string {
  return source.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

const RESEARCH = code(readFileSync(new URL("./curriculum-research.ts", import.meta.url), "utf8"));
const COURSE = code(readFileSync(new URL("./curriculum-course.ts", import.meta.url), "utf8"));
const SESSION = code(readFileSync(new URL("../../components/workspace/learn/use-canvas-session.ts", import.meta.url), "utf8"));

test("🔴🔴 the researched skeleton NEVER enters the registry — no import can even reach the seeds", () => {
  for (const source of [RESEARCH, COURSE]) {
    assert.ok(!source.includes("CURRICULUM_SEEDS"), "the research path can see the registry's seed array");
    assert.ok(!/maturity:\s*"(?:reviewed|canonical)"/.test(source), "something mints above provisional");
  }
});

test("🔴🔴 the session gates the course on the chip, and the clarify resume keeps the chip", () => {
  // Owner ruling, 2026-08-23: a course builds ONLY behind the Course chip — "teach me" over a fat
  // PDF must never start this file's research pass. The gate is code, not prompt (`courseGate`),
  // and the one flow CERTAIN to want a course — press Course, get asked "how deep?", answer —
  // must still carry the chip through the parked turn, or the gate kills the legitimate build.
  const converse = SESSION.slice(SESSION.indexOf("const converse = useCallback"));
  const body = converse.slice(0, converse.indexOf("\n    [begin, command"));
  assert.match(
    body,
    /courseGate\(result\.decision, capability === "course"\)/,
    "the decision is read ungated — a model reading 'teach me' as a course order reaches research again",
  );
  const resume = SESSION.slice(SESSION.indexOf("const answerClarification"));
  const resumeBody = resume.slice(0, resume.indexOf("\n    [clarifying, converse]"));
  assert.match(
    resumeBody,
    /pending\.capability/,
    "the resumed turn dropped the chip — chip → clarify → answer could never build a course",
  );
});

test("🔴🔴 the session researches ONLY on the library-miss refusal, and the failure is shown", () => {
  const converse = SESSION.slice(SESSION.indexOf("const converse = useCallback"));
  const body = converse.slice(0, converse.indexOf("\n    [begin, command"));
  assert.match(body, /applied\.refusal === "no-curriculum-for-subject"/, "research no longer gated on the miss");
  assert.match(body, /researchCurriculum\(/, "nothing researches");
  assert.match(body, /researchRefusalLine\(/, "a failed research says nothing to the learner");
  assert.match(body, /applyResearchedPlan\(/, "a successful research applies nothing");
  // The captions come from steps genuinely running — the hook, not a timer.
  assert.match(body, /onStep: \(label\) => setBusy\(\{ blockIds: \[\], kind: "command", label \}\)/);
  // And research still cannot reroute the turn.
  assert.ok(!/researchCurriculum[^\n]*begin\(/.test(body), "research routes the turn — that is a bypass");
});

test("🔴 the research pass rides the SAME rails as every turn — no second search or model client", () => {
  assert.match(RESEARCH, /searchWebContext\(/, "research grew its own search");
  assert.match(RESEARCH, /postChatCompletion\(/, "research grew its own model client");
  assert.ok(!/fetch\(/.test(RESEARCH), "research calls fetch directly — a second pipeline");
});
