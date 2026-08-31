import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  capabilityBrief,
  CAPABILITY_COPY,
  clearsOnSubmit,
  COMPOSER_CAPABILITIES,
} from "@/lib/learn/composer-capability";
import { readTurnDecision, stateBlock, turnRouterMessages, type TurnContext } from "@/lib/learn/turn-router";

// 🔴🔴 WHAT THIS FILE GUARDS: Course is a ONE-SHOT DECLARATION, not a mode, and the declaration
// rides the SAME submission pipeline as the words. §38 was narrowed for exactly this shape (owner,
// 2026-08-23): "One-shot composer capabilities may explicitly declare user intent or attach
// resources to the next submission… These capabilities clear after submission and must not become
// persistent teaching modes." Every assertion below pins one clause of that ruling to the code.

/** Comments stripped, because a guard that matches its own warning proves nothing. */
function code(source: string): string {
  return source.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

const COMPOSER = code(readFileSync(new URL("./canvas-composer.tsx", import.meta.url), "utf8"));
const CANVAS = code(readFileSync(new URL("./learning-canvas.tsx", import.meta.url), "utf8"));
const SESSION = code(readFileSync(new URL("./use-canvas-session.ts", import.meta.url), "utf8"));
const ROUTER = code(readFileSync(new URL("../../../lib/learn/turn-router.ts", import.meta.url), "utf8"));

// ── the one-shot invariant ──────────────────────────────────────────────────────────────────────

test("🔴🔴 every capability clears on submit — a survivor would be a mode", () => {
  for (const capability of COMPOSER_CAPABILITIES) {
    assert.equal(clearsOnSubmit(capability), true, `"${capability}" survives its own submission`);
  }
});

test("🔴🔴 the composer clears the capability in submit itself, not in a callback someone can lose", () => {
  const submit = COMPOSER.slice(COMPOSER.indexOf("const submit = ()"));
  const body = submit.slice(0, submit.indexOf("\n  };"));
  assert.match(body, /if \(capability\) onCapability\?\.\(null\);/, "submit no longer clears the staged capability");
  // And the clear comes AFTER the handlers, so the handlers still receive it.
  const handlerAt = body.indexOf("onStart(value, capability)");
  const clearAt = body.indexOf("if (capability) onCapability?.(null)");
  assert.ok(handlerAt !== -1 && clearAt > handlerAt, "the capability is cleared before the submission handlers see it");
});

// ── the same-pipeline invariant ─────────────────────────────────────────────────────────────────

test("🔴🔴 the declaration rides the SAME calls as the text — no second execution path", () => {
  // Owner: "The button shouldn't become a separate execution path; it should add structured intent
  // to the same submission pipeline everything else already uses."
  assert.match(COMPOSER, /onStart\(value, capability\)/, "the start path dropped the capability");
  assert.match(COMPOSER, /onAsk\(value, capability\)/, "the ask path dropped the capability");
  // learning-canvas: beginOrAnswer forwards it into the SAME converse call the words take. This is
  // the argument-drop fix: `(asked: string)` alone silently discarded anything the composer staged,
  // on the one canvas the Course capability exists for — a fresh one.
  assert.match(CANVAS, /void converse\(trimmed, null, withCapability\)/, "beginOrAnswer drops the capability again");
  assert.match(CANVAS, /await converse\(text, only, withCapability\)/, "submit drops the capability");
  // session: it becomes a FACT in the packet, not a branch.
  assert.match(SESSION, /capability === "course"\);/, "the session no longer passes the declaration into the packet");
});

test("🔴 an empty send cannot carry a capability, because it would have to be dropped", () => {
  assert.match(
    COMPOSER,
    /intent\.kind === "start" && attachedCount > 0 && !capability/,
    "an empty send with a staged capability is submittable again — beginOrAnswer would silently drop it",
  );
});

test("🔴 nothing scans the learner's words for course intent — the model reads the sentence", () => {
  for (const source of [COMPOSER, CANVAS, SESSION]) {
    assert.ok(
      !/course/i.test(source) || !/(?:text|value|trimmed|said|asked)\.(?:includes|match|startsWith|toLowerCase)\([^)]*course/i.test(source),
      "a course-intent scanner is reading the learner's words ahead of the model",
    );
  }
});

// ── the + menu ──────────────────────────────────────────────────────────────────────────────────

test("🔴🔴 the + shortcut runs the offer list's own single item, never a hard-coded action", () => {
  // `onRecord ? menu : filePicker.click()` assumed the one remaining offer is always upload; a
  // capability added under any flag made that false silently, with the real offer unreachable.
  assert.match(COMPOSER, /addOffers\.length > 1 \? setAddOpen\(\(open\) => !open\) : addOffers\[0\]\?\.run\(\)/);
  assert.match(COMPOSER, /addOffers\.map\(\(offer\)/, "the menu no longer renders from the same list the shortcut runs");
});

test("the Course offer is selection only — it starts nothing and calls no model", () => {
  const offers = COMPOSER.slice(COMPOSER.indexOf("const addOffers"));
  const body = offers.slice(0, offers.indexOf("\n  }, ["));
  assert.match(body, /run: \(\) => onCapability\?\.\(offered\)/, "selecting a capability does more than stage it");
});

// ── copy ────────────────────────────────────────────────────────────────────────────────────────

test("the menu row reads Course / Build a learning path, as specified", () => {
  assert.equal(CAPABILITY_COPY.course.label, "Course");
  assert.equal(CAPABILITY_COPY.course.detail, "Build a learning path");
});

test("the chip pairs with the owner's placeholder", () => {
  // 🔴 THE SENTENCE MOVED TO THE COPY RECORD, AND THE ASSERTION HAD TO MOVE WITH IT. It used to be
  // written into the composer as `capability === "course" ? "What do you want to learn?" : …`,
  // which is a branch that answers correctly for Course and wrongly for every other capability —
  // Deep research staged its chip above a box still reading "Ask Nemesis…". The question now lives
  // on `CAPABILITY_COPY`, where the Record type demands one per capability, and both composers read
  // it. The pairing is unchanged; only the place it is stated is.
  assert.equal(CAPABILITY_COPY.course.prompt, "What do you want to learn?");
  assert.match(COMPOSER, /CAPABILITY_COPY\[capability\]\.prompt/, "the composer no longer asks the capability's own question");
});

// ── the router side ─────────────────────────────────────────────────────────────────────────────

const CONTEXT: TurnContext = {
  canvasTitle: "",
  clarified: [],
  courseRequested: true,
  demonstrated: 0,
  history: [],
  lessonInProgress: false,
  materialContext: "",
  memory: "",
  projectInstructions: "",
  objectives: 0,
  passages: 0,
  searchesLeft: 0,
  sources: 0,
  pinnedComments: "",
  stagedPassage: "",
  toolCatalogue: "",
  toolContext: "",
  toolRoundsLeft: 0,
  today: "Saturday, 23 August 2026",
  webContext: "",
};

test("🔴 the declaration reaches the model as a fact in the packet", () => {
  const block = stateBlock(CONTEXT);
  assert.match(block, /attached Course to this message/);
  assert.ok(!stateBlock({ ...CONTEXT, courseRequested: false }).includes("Course"), "the fact leaks onto ordinary turns");
});

test("🔴 the fact carries no internal identifiers — the learner's vocabulary only", () => {
  // Scoped to the LINE this feature added, not the whole block — "The study document is empty" is
  // pre-existing learner-facing copy and "study" in it is ordinary English, not the action name.
  const line = stateBlock(CONTEXT)
    .split("\n")
    .find((entry) => entry.includes("Course"));
  assert.ok(line, "the course line is missing from the packet");
  for (const internal of ["curriculumFor", "courseRequested", "capability", "composer", '"study"']) {
    assert.ok(!line!.includes(internal), `"${internal}" leaked into the prompt`);
  }
});

test("🔴 the contract teaches curriculumFor, in the same breath as the WHICH-SUBJECT refusal", () => {
  const packet = turnRouterMessages({ context: CONTEXT, utterance: "hi" });
  const contract = packet[packet.length - 1]!.content as string;
  assert.match(contract, /"curriculumFor"/);
  assert.match(contract, /category with no member chosen is a question back, not a plan/);
});

test("🔴🔴 curriculumFor is read, and it cannot force an action", () => {
  const wire = (decision: Record<string, unknown>, answer: string) =>
    "```json\n" + JSON.stringify(decision) + "\n```\n" + answer;
  // Riding a study turn — the ordinary case.
  const study = readTurnDecision(wire({ curriculumFor: "general chemistry", then: "study", topic: "general chemistry" }, "alright."));
  assert.equal(study?.curriculumFor, "general chemistry");
  assert.equal(study?.then, "study");
  // A model inventing a fourth action gets the reply fallback — and KEEPS the course request,
  // which the canvas may still honour. The action whitelist and the request are separate facts.
  const forced = readTurnDecision(wire({ curriculumFor: "anatomy", then: "course" }, "planning it."));
  assert.equal(forced?.then, "reply", "an unrecognised action no longer falls back to reply");
  assert.equal(forced?.curriculumFor, "anatomy");
  // Absent means null, on every fallback shape too.
  const plain = readTurnDecision(wire({ then: "reply", topic: null }, "hey."));
  assert.equal(plain?.curriculumFor, null);
});

test("🔴🔴 the action whitelist is still three values — curriculumFor is not a fourth door", () => {
  // `asAction` is the reason a field on the decision cannot force a study turn: it whitelists
  // exactly reply | study | rewrite and everything else falls back to reply. If a "course" action
  // ever appears in it, the capability has become a bypass wearing a hint's clothes.
  const asAction = ROUTER.slice(ROUTER.indexOf("function asAction"));
  const body = asAction.slice(0, asAction.indexOf("\n}"));
  for (const action of ['"reply"', '"study"', '"rewrite"']) {
    assert.ok(body.includes(action), `asAction lost ${action}`);
  }
  assert.ok(!body.includes('"course"'), "asAction admits a course action — that is the bypass");
});

test("the brief names no operation, difficulty, strategy or surface", () => {
  const brief = capabilityBrief("course");
  for (const forbidden of ["retrieve", "recall", "difficulty", "strategy", "quiz", "flashcard", "minimap"]) {
    assert.ok(!brief.toLowerCase().includes(forbidden), `the brief instructs the engine: "${forbidden}"`);
  }
});

// ── the session side ────────────────────────────────────────────────────────────────────────────

test("🔴🔴 the plan is applied BESIDE the turn, and cannot force study", () => {
  const converse = SESSION.slice(SESSION.indexOf("const converse = useCallback"));
  // 🔴 ANCHOR UPDATED 2026-08-24 with the removal of the rigid lane: `begin` left this dependency
  // list when a named topic stopped being allowed to start a laid-out lesson.
  assert.notEqual(converse.indexOf("\n    [command, requireUid, settledAttachments]"), -1, "converse's dep anchor moved");
  const body = converse.slice(0, converse.indexOf("\n    [command, requireUid, settledAttachments]"));
  assert.match(body, /if \(decision\.curriculumFor\) \{/, "the course request is no longer honoured");
  assert.match(body, /applyCurriculumPlan\(/, "nothing applies the plan");
  // The refusal is SHOWN — a Course press that failed silently would be a dead control.
  assert.match(body, /courseRefusalLine\(/, "a failed application says nothing to the learner");
  // And the apply cannot reroute the turn: the document path is still entered on `decision.then`
  // alone, and nothing else may reach it.
  assert.match(body, /decision\.then === "study" && !isPreContent\(/);
  assert.ok(!/curriculumFor[^\n]*begin\(/.test(body), "the course request routes the turn now — that is a bypass");
  // 🔴 AND THE COURSE CHIP CANNOT SMUGGLE THE RIGID LANE BACK IN. `begin` is absent from the whole
  // conversational body now, so no field on the decision — `curriculumFor` included — can start one.
  assert.ok(!/begin\(/.test(body), "something in the turn body starts the laid-out lesson again");
});

test("🔴 the session loads a stored course on open, so a refresh keeps it", () => {
  assert.match(SESSION, /loadCurriculumPlan\(uid, canvasId\)/, "acceptance item 10 broke: a refresh loses the course");
});
