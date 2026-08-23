import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { SPEECH_CHAR_LIMIT } from "./canvas-speech";

// ── the synthesis plan for one answer: which words, in which voice, in what order ────────────
//
// Owner, 2026-08-23, two asks in one message: *"if people choose for it to answer out loud
// automatically, then it needs to come in at the same time as the text"* and *"if a response
// requires both the xAI transcription… I mean, the xAI voice and the Azure voice, then the output
// will read with the xAI voice and also the Azure voice."*
//
// The plan is pure, so these are value tests rather than source assertions — the strongest kind
// this runner can hold.

import { OPENER_BOUND, openerSplit, replySpeechPlan, sayableProse } from "./reply-speech";
import type { ReadingVoice } from "@/lib/speech/reading-voice";

const XAI_VOICE: ReadingVoice = { id: "eve", label: "Eve", provider: "xai" };
const AZURE_VOICE: ReadingVoice = {
  id: "en-US-AvaMultilingualNeural",
  label: "Ava",
  locale: "en-US",
  provider: "azure",
};

test("🔴 a plain answer is read by the chosen voice, whole", () => {
  const plan = replySpeechPlan("Consideration is what makes a promise enforceable.", XAI_VOICE);
  assert.equal(plan.length, 1);
  assert.equal(plan[0]!.provider, "xai");
  assert.equal(plan[0]!.voiceId, "eve");
  assert.equal(plan[0]!.locale, "auto");
});

test("🔴🔴 a marked sentence is read by the language lane, in its stated variety, between the prose", () => {
  // The owner's ask, literally: one answer, both voices, in the order the model wrote them.
  const plan = replySpeechPlan(
    'In Mexico you would greet a client with [say: es-MX | Buenos días, ¿cómo está usted?] before any business.',
    XAI_VOICE,
  );
  assert.equal(plan.length, 3);
  assert.equal(plan[0]!.provider, "xai");
  assert.match(plan[0]!.text, /greet a client/);
  assert.equal(plan[1]!.provider, "azure");
  assert.equal(plan[1]!.locale, "es-MX");
  assert.match(plan[1]!.text, /Buenos días/);
  // 🔴 No voiceId on the drill line: the catalogue names that variety's speaker (§47), so the same
  // lesson sounds the same tomorrow. The learner's chosen speaker stays on the prose.
  assert.equal(plan[1]!.voiceId, undefined);
  assert.equal(plan[2]!.provider, "xai");
  assert.match(plan[2]!.text, /before any business/);
});

test("🔴 the drill line runs at natural pace while the prose runs at answer pace", () => {
  // Slowing a drill teaches a rhythm the language does not have — TARGET_LANGUAGE_SPEED's rule,
  // which must survive the trip through the plan.
  const plan = replySpeechPlan("Listen first. [say: fr-FR | Bonjour tout le monde.] Then repeat it.", XAI_VOICE);
  const drill = plan.find((utterance) => utterance.provider === "azure");
  assert.ok(drill);
  assert.equal(drill.speed, 1);
});

test("an Azure prose voice carries the locale it was catalogued under", () => {
  const plan = replySpeechPlan("Stress concentrates at the notch root.", AZURE_VOICE);
  assert.equal(plan[0]!.provider, "azure");
  assert.equal(plan[0]!.locale, "en-US");
  assert.equal(plan[0]!.voiceId, "en-US-AvaMultilingualNeural");
});

test("🔴 a drawing has no reading, and its fence never reaches a synthesiser", () => {
  const plan = replySpeechPlan("Ethanol is drawn like this.\n```smiles\nCCO\n```\nNote the hydroxyl.", XAI_VOICE);
  assert.ok(plan.every((utterance) => !utterance.text.includes("CCO")));
  assert.ok(plan.every((utterance) => !utterance.text.includes("```")));
});

test("🔴 stray wire tokens are stripped from speech even though the screen keeps them visible", () => {
  // The screen leaves a malformed token in the prose so the learner can SEE something went wrong.
  // A synthesiser reading "bracket figure two" offers no such honesty — just noise.
  const plan = replySpeechPlan("As [figure 2] shows, the beam deflects under load.", XAI_VOICE);
  assert.equal(plan.length, 1);
  assert.ok(!/figure|\[|\]/.test(plan[0]!.text));
  assert.match(plan[0]!.text, /the beam deflects/);
});

test("🔴 a refused drill line is skipped, never read by the prose voice", () => {
  // Hearing es-MX read by an English speaker is the miseducation §43 exists to prevent; the
  // sentence is still on screen with its own replay button. A malformed locale refuses upstream in
  // `replySegments`, so the failure that reaches the ROUTER is notation.
  const plan = replySpeechPlan("Try this. [say: es-MX | $\\frac{1}{2}$] And continue.", XAI_VOICE);
  assert.ok(plan.every((utterance) => utterance.provider === "xai"));
  assert.ok(plan.every((utterance) => !utterance.text.includes("frac")));
});

test("🔴🔴 the first sentence is its own request, so the first sound does not wait for the paragraph", () => {
  // The reply arrives as one JSON object — there is no token stream on this lane — so the earliest
  // possible sound is bounded by how fast the FIRST synthesis request returns, which scales with
  // the characters sent. Calibration: chunk the whole answer at SPEECH_CHAR_LIMIT and this reddens.
  const long = `The ratio decidendi is the rule the case actually decides. ${"Everything after it is obiter and binds nobody, however persuasive the judge made it sound. ".repeat(8)}`;
  const plan = replySpeechPlan(long, XAI_VOICE);
  assert.ok(plan.length >= 2, "one giant request again");
  assert.equal(plan[0]!.text, "The ratio decidendi is the rule the case actually decides.");
  assert.ok(plan[0]!.text.length <= OPENER_BOUND);
});

test("the opener is not split when the answer is one short sentence anyway", () => {
  const plan = replySpeechPlan("Yield stress marks the end of elastic behaviour.", XAI_VOICE);
  assert.equal(plan.length, 1);
});

test("openerSplit refuses a first sentence longer than the bound — one request is as good as two", () => {
  const run = `${"word ".repeat(60)}ends here. And a second sentence.`;
  assert.equal(openerSplit(run), null);
});

test("every chunk in the plan respects the request bound both providers enforce", () => {
  const long = "A sentence of reasonable length about torsion in shafts. ".repeat(40);
  const plan = replySpeechPlan(long, XAI_VOICE);
  assert.ok(plan.length > 1);
  for (const utterance of plan) assert.ok(utterance.text.length <= SPEECH_CHAR_LIMIT);
});

test("sayableProse strips markdown with the same rules a spoken question uses", () => {
  assert.equal(sayableProse("**Duress** vitiates consent [2]."), "Duress vitiates consent .");
});

test("🔴 field-agnostic: the plan contains no subject-matter word list", () => {
  const source = readFileSync(new URL("./reply-speech.ts", import.meta.url), "utf8");
  assert.ok(!/drug|dose|patient|clinical|pharma/i.test(source), "a domain keyword crept into the speech plan");
});

test("🔴 the player builds its parts from the plan, so raw wire text cannot reach a synthesiser", () => {
  // Source assertion, because the hook wraps fetch/Audio and cannot run here. Calibration: put
  // `speechChunks(passage` back in the hook and this reddens.
  const hook = readFileSync(
    new URL("../../components/workspace/learn/use-response-audio.ts", import.meta.url),
    "utf8",
  );
  assert.match(hook, /replySpeechPlan\(passage, chosen\)/, "the player no longer asks the plan");
  assert.ok(!/speechChunks\(passage/.test(hook), "the player chunks raw text again");
  assert.match(hook, /provider: part\.provider/, "the provider no longer travels with the utterance");
});
