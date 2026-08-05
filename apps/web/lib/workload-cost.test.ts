import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  affordableAudioHours,
  affordableRatePerAudioHour,
  BATCH_USD_PER_HOUR,
  CACHE_HIT_WEIGHT,
  completionUsd,
  DIARIZATION_USD_PER_HOUR,
  HEAVY_STUDENT,
  HOUSE_MARGIN,
  KIMI_REASONS_ALWAYS,
  LIVE_MODEL_PRICES,
  MATERIAL_CHAR_LIMIT,
  meteredTokens,
  modelStudentMonth,
  MODEL_PRICES,
  netRevenueUsd,
  OTHER_COGS_USD,
  planCapInversions,
  PLANS,
  PRICE_REV,
  RECORDING_NOTE_TRANSCRIPT_CHARS,
  STREAMING_USD_PER_HOUR,
  SURVEYED_MODEL_PRICES,
  SURVEYED_USD_PER_HOUR,
  VOICE_PRICE_REV,
  type PlanCode,
  type StudentMonth,
} from "./workload-cost";

const repoFile = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");

// ── Drift guards ─────────────────────────────────────────────────────────────
// workload-cost.ts mirrors numbers that live in shipped code. A mirror that can go
// stale silently is worse than no model at all: it would keep answering confidently
// with last month's prices. These read the real files and fail on divergence.

test("live model prices match the valve's canonical price list", () => {
  const source = repoFile("supabase/functions/_shared/llm-cost.ts");
  assert.match(source, new RegExp(`PRICE_REV = "${PRICE_REV}"`), "price revision drifted");
  for (const [model, price] of Object.entries(LIVE_MODEL_PRICES)) {
    const line = new RegExp(
      `"${model}":\\s*\\{\\s*cachedInputPerM:\\s*${price.cachedInputPerM},\\s*inputPerM:\\s*${price.inputPerM},\\s*outputPerM:\\s*${price.outputPerM}`,
    );
    assert.match(source, line, `${model} price drifted from _shared/llm-cost.ts`);
  }
});

// A surveyed model has no canonical file to match, which is exactly why it must not
// sit in the table the guard above checks — it would either break the guard or force
// it to be loosened, and a loosened guard is how a stale price survives.
test("surveyed models are kept out of the live price table", () => {
  const source = repoFile("supabase/functions/_shared/llm-cost.ts");
  for (const model of Object.keys(SURVEYED_MODEL_PRICES)) {
    assert.ok(!(model in LIVE_MODEL_PRICES), `${model} is surveyed, not live`);
    assert.doesNotMatch(source, new RegExp(`"${model}"`), `${model} is now wired — move it to LIVE_MODEL_PRICES`);
    assert.ok(MODEL_PRICES[model], "but it must still be costable");
  }
});

test("batch voice rates match the function that actually pays the bill", () => {
  const source = repoFile("supabase/functions/_shared/voice-cost.ts");
  assert.match(source, new RegExp(`PRICE_REV = "${VOICE_PRICE_REV}"`), "voice price revision drifted");
  for (const [provider, rate] of Object.entries(BATCH_USD_PER_HOUR)) {
    assert.match(source, new RegExp(`${provider}:\\s*${rate},`), `${provider} rate drifted`);
  }
});

test("the streaming rate matches the web app's own table", () => {
  const source = repoFile("apps/web/lib/cost-report.ts");
  assert.match(source, new RegExp(`assemblyai_streaming:\\s*${STREAMING_USD_PER_HOUR.assemblyai_streaming},`));
});

test("the cache weight matches the meter in the valve", () => {
  const source = repoFile("supabase/functions/nemesis-llm/index.ts");
  assert.match(source, new RegExp(`CACHE_HIT_WEIGHT = ${CACHE_HIT_WEIGHT}`));
});

test("the note pass runs once per recording, over the whole transcript", () => {
  const source = repoFile("apps/web/lib/workspace/recording-note.ts");
  assert.match(source, new RegExp(`RECORDING_NOTE_TRANSCRIPT_CHARS = ${RECORDING_NOTE_TRANSCRIPT_CHARS / 1000}_000`));
});

test("the study material clip matches the generator", () => {
  const source = repoFile("apps/web/lib/workspace/study-artifact-content.ts");
  assert.match(source, new RegExp(`MATERIAL_CHAR_LIMIT = ${MATERIAL_CHAR_LIMIT / 1000}_000`));
});

// The lane the whole model turns on. If the web recorder ever moves off the batch
// route — back to streaming, or onto something new — every dollar figure here is
// wrong, and this is the test that says so.
test("the web recorder is on the batch lane, and the rolling live-notes lane is gone", () => {
  const recorder = repoFile("apps/web/components/workspace/sessions/use-recording.ts");
  assert.match(recorder, /transcription\/submit/, "web records to a file and uploads it once");
  assert.doesNotMatch(recorder, /live-audio/, "web must not be streaming");
  const note = repoFile("apps/web/lib/workspace/recording-note.ts");
  assert.doesNotMatch(note, /INSIGHT_INTERVAL_MS = |45_000/, "no pass-every-45-seconds lane on web");
});

test("the transcribe function pins the cheaper AssemblyAI tier and buys speaker labels", () => {
  const source = repoFile("supabase/functions/nemesis-transcribe/index.ts");
  // `speech_models` PLURAL: the singular spelling is deprecated and silently ignored,
  // which would buy the dearer tier while looking like a saving.
  assert.match(source, /speech_models:\s*\["universal-2"\]/);
  assert.match(source, /speaker_labels:\s*true/);
});

test("the diarization add-on is inside the AssemblyAI rates, not forgotten", () => {
  // The two AssemblyAI tiers differ by the MODEL ($0.15 vs $0.21); both carry the
  // same +$0.02 add-on, so switching it off saves the same on either.
  assert.equal(
    round(BATCH_USD_PER_HOUR.assemblyai_batch - BATCH_USD_PER_HOUR.assemblyai_batch_universal2, 2),
    0.06,
  );
  assert.equal(DIARIZATION_USD_PER_HOUR, 0.02);
});

// ── The plan ladder ──────────────────────────────────────────────────────────

// Until 2026-07-28 this read "KNOWN BROKEN": paying 5x more bought LESS recording
// (Max 3,600 minutes against Pro's 5,000) and Free out-searched both paid plans. Caps
// are edited one database row at a time and nothing compared them across plans, so a
// raise applied to Pro and not to Max inverted the ladder with no screen saying so.
// The ladder has been reshaped; this is now the standing alarm against the next one.
test("the plan ladder never runs backwards", () => {
  assert.deepEqual(
    planCapInversions().map((row) => `${row.meter}: ${row.dearer} ${row.dearerValue} < ${row.cheaper} ${row.cheaperValue}`),
    [],
    "a dearer plan is offering less than a cheaper one — fix plan_entitlements, not this test",
  );
});

// Max was retired 2026-08-05, so the "Max is 5x Pro" half of this rule went with
// it. "Plus is half of Pro" survives on its own merits: it is what makes Student
// legible as half a plan for half a price, and it never depended on there being
// a tier above Pro.
test("Plus is half of Pro on the meters that scale, and Pro is the ceiling", () => {
  for (const meter of ["monthlyTokens", "dailyTokens", "searchMonthly", "askDaily"] as const) {
    assert.equal(PLANS.plus[meter], PLANS.pro[meter] / 2, `plus ${meter}`);
  }
  // Nothing sits above Agent Pro. A future top tier has to be added here on
  // purpose rather than inherited from a leftover row.
  assert.deepEqual(Object.keys(PLANS).sort(), ["free", "plus", "pro"]);
  for (const plan of Object.values(PLANS)) {
    assert.ok(plan.priceUsd <= PLANS.pro.priceUsd, `${plan.code} costs more than the ceiling`);
  }
});

// Recording is the exception to the half-of-Pro rule, and deliberately so: the
// owner sets these three numbers directly.
test("recording follows the owner's three numbers, not the half-of-Pro rule", () => {
  // Owner 2026-08-05: Free 2h -> 30 minutes, Student 20h -> 30h. Free's is the
  // one allowance in the ladder with no revenue behind it at all, and 30 minutes
  // is a demonstration — one class, start to finish — not a month of lectures.
  assert.equal(PLANS.free.transcriptionMinutes, 30);
  assert.equal(PLANS.plus.transcriptionMinutes, 30 * 60);
  // Pro cut to 70 hours on 2026-07-29 (owner). 83 hours sat inside the 103.7-hour
  // break-even wall but left only $3.27 a month on the plan pushed hardest.
  assert.equal(PLANS.pro.transcriptionMinutes, 70 * 60);
  // The advertised number and the stored number are now the SAME number on every
  // plan. The old Pro row was 83 hours sold as 80, and that three-hour gap is
  // exactly the kind of slack that lets copy and the meter drift apart unnoticed.
  assert.equal(PLANS.pro.transcriptionMinutes, 4_200);
  assert.equal(PLANS.plus.transcriptionMinutes, 1_800);
  // Recording is hand-set, so it lands NEAR half of Pro without being tied to
  // it: 30 hours against 70 is 0.43x, not 0.5x. Pinned as a band so the next
  // hand-set number is still recognisably a Student-sized allowance, and so
  // nobody "corrects" it back onto the halving rule.
  const share = PLANS.plus.transcriptionMinutes / PLANS.pro.transcriptionMinutes;
  assert.ok(share > 0.35 && share < 0.55, `Student holds ${round(share, 3)} of Pro's hours`);
  // Free is a taste of the product, not a fraction of a plan: the gap to Student
  // has to be big enough that upgrading is obviously the way to keep going.
  assert.ok(PLANS.plus.transcriptionMinutes >= PLANS.free.transcriptionMinutes * 30, "free stays a demonstration");
});

// Every surface that advertises a recording allowance, and the cap it must agree
// with. The caps live in a database; the copy lives in four files across two apps;
// nothing has ever compared them. They HAVE drifted — this page once offered Plus
// "30 minutes" against a real allowance of 20 hours — and the drift is invisible
// because both sides look fine on their own. Scanning the source is crude, but it
// is the only check that fails when someone edits one side and not the other.
const RECORDING_COPY_FILES = [
  "apps/web/app/pricing/page.tsx",
  "apps/web/components/workspace/shell/billing-settings.tsx",
  "apps/web/components/workspace/onboarding/step-upgrade.tsx",
  "landing/app/pricing/page.tsx",
  // The phone paywall counts. It says "20 recording hours a month" rather than
  // "20 hours of lecture recording", which is why a search for the web wording
  // missed it on 2026-08-05 and left the phone advertising the old allowance —
  // hence the deliberately loose regex below rather than a fixed phrase.
  "apps/mobile/src/lib/purchases-logic.ts",
] as const;

test("advertised recording allowances match the plan caps, everywhere they are advertised", () => {
  const paidHours = new Set([PLANS.plus, PLANS.pro].map((plan) => plan.transcriptionMinutes / 60));
  let claims = 0;
  for (const path of RECORDING_COPY_FILES) {
    const source = repoFile(path);
    // Up to two words may sit between the number and the unit, so "20 hours",
    // "20 recording hours" and "20 hours of recording" all get caught.
    for (const [claim, hours] of source.matchAll(/(\d[\d,]*)\s+(?:\w+\s+){0,2}hours\b/g)) {
      claims += 1;
      assert.ok(paidHours.has(Number(hours!.replace(/,/g, ""))), `${path} advertises "${claim}", which is no plan's cap`);
    }
    for (const [claim, minutes] of source.matchAll(/(\d[\d,]*)\s+(?:\w+\s+){0,2}minutes\b/g)) {
      claims += 1;
      assert.equal(
        Number(minutes!.replace(/,/g, "")),
        PLANS.free.transcriptionMinutes,
        `${path} advertises "${claim}" — the only sub-hour allowance is Free's`,
      );
    }
  }
  // A surface that gets renamed or deleted would otherwise pass this test by
  // saying nothing at all.
  assert.ok(claims >= 10, `only ${claims} recording claims found across ${RECORDING_COPY_FILES.length} files`);
});

// A $0 plan never presents a card, so Stripe's 2.9% + 30c does not exist on it.
// Modelling one anyway made every free user look 30 cents dearer than they are —
// which matters now that Free's cost is a number the owner acts on.
test("a free plan is charged nothing, so Stripe takes nothing", () => {
  assert.equal(netRevenueUsd(0), 0);
  assert.equal(netRevenueUsd(PLANS.free.priceUsd), 0);
  assert.equal(netRevenueUsd(9.99), 9.4);
});

// What one free user costs when they use every minute they are given. Almost all
// of it is the flat platform line, which is why cutting the recording cap moves
// pennies: the reason to cut it is the upgrade path, not the bill.
test("a free student who burns the whole allowance costs about a dollar and change", () => {
  const burnedFree = modelStudentMonth({
    ...HEAVY_STUDENT, audioHours: PLANS.free.transcriptionMinutes / 60, chatTurnsPerDay: 20, decks: 35, plan: "free",
  });
  assert.equal(burnedFree.withinTranscriptionCap, true);
  assert.equal(burnedFree.netRevenueUsd, 0);
  assert.ok(burnedFree.headroomUsd > -1.5, `free costs ${burnedFree.headroomUsd}`);
  // The audio lane is now a rounding error next to the flat platform cost.
  assert.ok(burnedFree.audioUsd < OTHER_COGS_USD / 10, `free audio is ${burnedFree.audioUsd}`);
});

// The search inversion was cleared by bringing FREE down, not by raising the plans
// that pay: at ~$0.008 a unit, Pro at 600 searches would permit $4.80 of spend
// against $3.85 of headroom. Free at 60 is still ~35x what anyone spends (39
// searches across every user in 30 days).
test("free never out-searches a paid plan, and the paid caps stayed affordable", () => {
  assert.ok(PLANS.free.searchMonthly < PLANS.plus.searchMonthly);
  const proSearchWorstCaseUsd = PLANS.pro.searchMonthly * 0.008;
  assert.ok(proSearchWorstCaseUsd < modelStudentMonth(HEAVY_STUDENT).headroomUsd, `${proSearchWorstCaseUsd} of search`);
});

// A subscriber on the DEAREST plan was once stopped by their own allowance while
// doing exactly what a cheaper plan is promised. That was the user-visible face
// of the inverted ladder, and it is why every plan is checked against its own
// advertised figure rather than against the one above it.
test("every plan can record what it advertises", () => {
  // Pro advertises 70 hours as of 2026-07-29, so 70 is what must fit. HEAVY_STUDENT
  // is still 80 — the owner's persona did not change when the plan did — which is
  // why this asserts the advertised figure rather than reusing the persona.
  assert.equal(modelStudentMonth({ ...HEAVY_STUDENT, audioHours: 70 }).withinTranscriptionCap, true);
  // And the persona itself now overflows Pro. Stated here as well as at the
  // allowance test so a future edit cannot quietly restore an 80-hour promise.
  assert.equal(modelStudentMonth(HEAVY_STUDENT).withinTranscriptionCap, false);
  assert.equal(modelStudentMonth({ ...HEAVY_STUDENT, audioHours: 30, plan: "plus" }).withinTranscriptionCap, true);
  assert.equal(modelStudentMonth({ ...HEAVY_STUDENT, audioHours: 0.5, plan: "free" }).withinTranscriptionCap, true);
});

// ── The two ledgers ──────────────────────────────────────────────────────────

test("an unpriced model reports null, never zero", () => {
  assert.equal(completionUsd("gemini-3-flash", { cacheHitTokens: 0, completionTokens: 500, promptTokens: 1_000 }), null);
});

test("cached input is far cheaper than fresh input", () => {
  const fresh = completionUsd("deepseek-v4-flash", { cacheHitTokens: 0, completionTokens: 0, promptTokens: 1_000_000 });
  const cached = completionUsd("deepseek-v4-flash", {
    cacheHitTokens: 1_000_000,
    completionTokens: 0,
    promptTokens: 1_000_000,
  });
  assert.equal(fresh, 0.14);
  assert.equal(cached, 0.0028);
  assert.ok(fresh! / cached! >= 50, "the whole caching argument rests on this ratio");
});

test("the student's cap counts cached tokens at a tenth", () => {
  // 10,000 prompt of which 8,000 cached, plus 500 output:
  // (10,500 - 8,000) + ceil(8,000 * 0.1) = 2,500 + 800 = 3,300.
  assert.equal(meteredTokens({ cacheHitTokens: 8_000, completionTokens: 500, promptTokens: 10_000 }), 3_300);
});

test("net revenue subtracts Stripe's cut, and the flat 30 cents does not scale", () => {
  assert.equal(netRevenueUsd(19.99), 19.11);
  assert.equal(netRevenueUsd(9.99), 9.4);
  assert.equal(netRevenueUsd(99), 95.83);
  // Halving the price does not halve what lands: the 30c is a bigger bite of a
  // smaller plan. This is why "Plus = half of Pro" is not a neutral decision.
  assert.ok(netRevenueUsd(9.99) < netRevenueUsd(19.99) / 2);
});

// ── Audio is the whole story ─────────────────────────────────────────────────

test("the audio bill dwarfs every model call the student makes", () => {
  const report = modelStudentMonth(HEAVY_STUDENT);
  // $8.00 on the xAI lane, down from $13.60 on AssemblyAI. Halving the rate did
  // not change the shape of the bill — audio is still 16x everything the student's
  // chat, flashcards and tests cost put together.
  assert.ok(report.audioUsd > 7, `audio was ${report.audioUsd}`);
  assert.ok(report.aiUsd < 1.5, `AI was ${report.aiUsd}`);
  assert.ok(report.audioToAiRatio > 10, `ratio was ${report.audioToAiRatio}x`);
});

// The conclusion has to survive the softest assumption in the model. "Two hours a day
// of AI" was translated into 40 chat turns and 70 decks; if that is wrong by 3x in
// the expensive direction, audio is still the line that matters.
test("tripling every AI assumption still leaves the AI lane under $3", () => {
  const tripled = modelStudentMonth({
    ...HEAVY_STUDENT,
    chatTurnsPerDay: HEAVY_STUDENT.chatTurnsPerDay * 3,
    decks: HEAVY_STUDENT.decks * 3,
    flashcardRunsPerDeck: 3,
    testRunsPerDeck: 3,
  });
  assert.ok(tripled.aiUsd < 3, `AI was ${tripled.aiUsd}`);
  assert.ok(tripled.audioUsd > tripled.aiUsd * 4, "audio still dominates");
});

test("the premium answer lane is the one way the AI line can rival the audio line", () => {
  // GLM-5.2 is 10x Flash on input and ~16x on output, and Pro can reach it.
  const flash = modelStudentMonth(HEAVY_STUDENT);
  const glm = modelStudentMonth({ ...HEAVY_STUDENT, chatModel: "glm-5.2" });
  assert.ok(glm.aiUsd > flash.aiUsd * 5, `only ${round(glm.aiUsd / flash.aiUsd, 1)}x`);
  assert.equal(PLANS.pro.premiumAnswerLane, true, "and Pro can reach it");
  assert.equal(PLANS.plus.premiumAnswerLane, false);
  // $0.49 -> $2.71 of AI. On the old AssemblyAI lane that took Pro's headroom from
  // $3.85 to $1.63 — more than half of what the plan kept. On today's cheaper audio
  // it costs $9.45 -> $7.23, about a quarter. Still the only model line that gets
  // anywhere near the audio line, and still the one AI-side cost worth metering
  // rather than giving away — but the cheaper transcript is what made it affordable.
  assert.ok(glm.aiUsd > 2.5, `GLM AI lane was ${glm.aiUsd}`);
  assert.ok(glm.headroomUsd < flash.headroomUsd * 0.8, "living on High still costs a real slice of what the plan keeps");
  const onOldAudio = modelStudentMonth({ ...HEAVY_STUDENT, chatModel: "glm-5.2", recorder: "web-batch" });
  assert.ok(onOldAudio.headroomUsd < flash.headroomUsd / 2, "which is what it used to cost");
});

// Pinned to `web-batch` on purpose: the speaker-label add-on is an ASSEMBLYAI line
// item. xAI, the live lane, includes diarization in its $0.10 and has no such lever
// to pull, so running this against the default would price a switch that does not
// exist on the provider we actually use.
test("switching off speaker labels is a real but small lever, on the AssemblyAI lane", () => {
  const saving = HEAVY_STUDENT.audioHours * DIARIZATION_USD_PER_HOUR;
  const report = modelStudentMonth({ ...HEAVY_STUDENT, recorder: "web-batch" });
  assert.equal(round(saving, 2), 1.6);
  assert.ok(saving < report.audioUsd * 0.15, "a tenth of the audio line, not a fix for it");
});

test("the cheaper AssemblyAI tier is worth more than the add-on, and Groq more than both", () => {
  const universal2 = modelStudentMonth({ ...HEAVY_STUDENT, recorder: "web-batch" }).audioUsd;
  const pro = modelStudentMonth({ ...HEAVY_STUDENT, recorder: "web-batch-pro" }).audioUsd;
  const groq = modelStudentMonth({ ...HEAVY_STUDENT, recorder: "web-batch-groq" }).audioUsd;
  assert.equal(universal2, 13.6);
  assert.equal(pro, 18.4);
  assert.equal(groq, 3.2);
  // If the pinned model is ever ignored, the month costs $4.80 more and nothing warns
  // us except a console line in nemesis-transcribe.
  assert.equal(round(pro - universal2, 2), 4.8);
});

// THE UNGUARDED RISK. `speech_models` is a priority LIST whose default is
// ["universal-3-5-pro", "universal-2"] — a request field that is renamed or moved is
// accepted and ignored, not rejected. If that pin ever stops being honoured, Pro does
// not merely get thinner: it goes underwater at 80 hours, and the only signal is a
// console.warn inside an edge function that nobody reads.
test("Pro LOSES MONEY at 80 hours if the cheaper AssemblyAI tier is not honoured", () => {
  const pinned = modelStudentMonth({ ...HEAVY_STUDENT, recorder: "web-batch" });
  const ignored = modelStudentMonth({ ...HEAVY_STUDENT, recorder: "web-batch-pro" });
  assert.equal(pinned.profitable, true);
  assert.equal(ignored.profitable, false, "a silently ignored request field costs the whole margin and more");
  assert.ok(ignored.headroomUsd < 0, `headroom was ${ignored.headroomUsd}`);
  assert.ok(ignored.grossMarginPct < 0, `margin was ${ignored.grossMarginPct}%`);
});

// ── What the provider switch bought, and what is still on the table ─────────
// Surveyed 2026-07-28 because the owner asked. xAI stopped being hypothetical on
// 2026-07-30 and is now the default lane; Modulate is still unwired.

test("moving to xAI more than doubled Pro's margin, and threw in the add-on", () => {
  const previous = modelStudentMonth({ ...HEAVY_STUDENT, recorder: "web-batch" });
  const live = modelStudentMonth(HEAVY_STUDENT);
  assert.equal(live.audioUsd, 8);
  assert.ok(live.grossMarginPct > previous.grossMarginPct * 2, `${previous.grossMarginPct}% -> ${live.grossMarginPct}%`);
  // And its $0.10 INCLUDES speaker diarization, which the AssemblyAI lane pays
  // $0.02/hr for on top — so the real gap is wider than the sticker difference.
  assert.ok(SURVEYED_USD_PER_HOUR.xai_grok_stt < BATCH_USD_PER_HOUR.assemblyai_batch_universal2);
});

test("the cheapest surveyed lane is also the one to test first, because testing is free", () => {
  // Modulate's $0.03 is still the seller's own number, but it comes with 400 free
  // hours and cites public benchmarks — so the claim can be settled on our own
  // lectures at zero cost. Cheapest to TEST is a different question from cheapest
  // to TRUST, and this is the rare case where one answer serves both.
  const modulate = modelStudentMonth({ ...HEAVY_STUDENT, recorder: "web-batch-modulate" });
  const live = modelStudentMonth(HEAVY_STUDENT);
  const previous = modelStudentMonth({ ...HEAVY_STUDENT, recorder: "web-batch" });
  assert.ok(modulate.grossMarginPct > live.grossMarginPct);
  assert.ok(SURVEYED_USD_PER_HOUR.modulate < SURVEYED_USD_PER_HOUR.xai_grok_stt / 3);
  // 400 free hours is five months of the heavy student's recording.
  assert.ok(400 / HEAVY_STUDENT.audioHours >= 5);
  // Against where this started: the switch already took, and Modulate is more again.
  assert.ok(live.headroomUsd > previous.headroomUsd * 2);
  assert.ok(modulate.headroomUsd > previous.headroomUsd * 3);
});

// "The AI is cheap, so can we use a better model?" — true of the model we run, and
// it stops being true fast. The audio lane decides the answer, not the AI budget.
test("a better chat model became affordable when the audio lane came down", () => {
  const glmOnAssembly = modelStudentMonth({ ...HEAVY_STUDENT, chatModel: "glm-5.2", recorder: "web-batch" });
  const glmOnLiveAudio = modelStudentMonth({ ...HEAVY_STUDENT, chatModel: "glm-5.2" });
  assert.ok(glmOnAssembly.grossMarginPct < 10, `GLM on the old audio lane is ${glmOnAssembly.grossMarginPct}%`);
  assert.ok(glmOnLiveAudio.grossMarginPct > 35, `GLM on today's audio is ${glmOnLiveAudio.grossMarginPct}%`);
});

// Kimi K3 is $3/$0.30/$15 per 1M and has NO non-thinking mode, so every reasoning
// token bills as output. Pricing it off visible completion length alone is the error
// that makes it look affordable; at 3x thinking it is not close, on any audio lane.
test("Kimi K3 loses money on Pro once it thinks, and it is the OUTPUT rate", () => {
  const noThinking = modelStudentMonth({ ...HEAVY_STUDENT, chatModel: "kimi-k3" });
  const thinking = modelStudentMonth({ ...HEAVY_STUDENT, chatModel: "kimi-k3", chatReasoningMultiple: 3 });
  // The cheaper audio lane bought Kimi its one survivable case: on the flattering
  // no-reasoning assumption it now clears break-even at 17.4%, where on AssemblyAI
  // it was underwater. That assumption is fiction — K3 has no non-thinking mode —
  // which is exactly why the honest 3x figure below is the one that decides this.
  assert.equal(noThinking.profitable, true, "the flattering assumption now survives, on cheaper audio");
  assert.equal(
    modelStudentMonth({ ...HEAVY_STUDENT, chatModel: "kimi-k3", recorder: "web-batch" }).profitable,
    false,
    "it did not survive on the old audio lane",
  );
  assert.equal(thinking.profitable, false, "and the real, always-reasoning case is underwater regardless");
  assert.ok(thinking.aiUsd > noThinking.aiUsd * 2, "reasoning tokens are most of the bill");
  // Give it free transcription and it STILL misses the house margin on Pro.
  const free = modelStudentMonth({ ...HEAVY_STUDENT, chatModel: "kimi-k3", chatReasoningMultiple: 3, recorder: "ios-parakeet" });
  assert.equal(free.meetsHouseMargin, false, `${free.grossMarginPct}% with $0 audio`);
  assert.equal(KIMI_REASONS_ALWAYS, true);
});

// This USED to be the argument for a top tier: the $99 plan had the headroom to
// carry a reasoning model that $19.99 could not. Max was retired on 2026-08-05,
// so the conclusion changed rather than disappeared — with Agent Pro as the
// ceiling there is no plan in the ladder that can fund an always-reasoning
// model at the owner's heavy workload. Keeping the measurement is the point: it
// is the number that says "not at this price", and it must fail loudly if
// someone routes the premium lane product-wide.
test("no plan in the ladder can fund an always-reasoning model at the heavy workload", () => {
  for (const plan of ["free", "plus", "pro"] as const) {
    const heavy = modelStudentMonth({ ...HEAVY_STUDENT, chatModel: "kimi-k3", chatReasoningMultiple: 3, plan });
    assert.equal(heavy.profitable, false, `${plan} at ${heavy.grossMarginPct}%`);
  }
  // GLM on Pro is the affordable premium lane, and only just — it is why High
  // effort is metered rather than unlimited.
  const glmOnPro = modelStudentMonth({ ...HEAVY_STUDENT, chatModel: "glm-5.2" });
  assert.equal(glmOnPro.profitable, true);
  assert.equal(glmOnPro.meetsHouseMargin, false, `GLM on Pro is ${glmOnPro.grossMarginPct}%, not a free upgrade`);
});

// The silence gate is the largest UNMEASURED lever in the product. No recording has
// ever been transcribed in production, and the wall clock is not stored, so the
// honest output is a band, not a number.
test("the silence saving is a band, and the model refuses to assume one", () => {
  assert.equal(HEAVY_STUDENT.silenceShare, 0, "no saving is claimed by default");
  const band = [0.1, 0.2, 0.3].map((share) => modelStudentMonth({ ...HEAVY_STUDENT, silenceShare: share }));
  assert.deepEqual(band.map((report) => report.audioUsd), [7.2, 6.4, 5.6]);
  // Even 30% trimmed does not get Pro to the house margin on its own.
  assert.equal(band[2]!.meetsHouseMargin, false);
});

test("trimming silence stretches the student's allowance too, because web bills the file", () => {
  const trimmed = modelStudentMonth({ ...HEAVY_STUDENT, silenceShare: 0.2 });
  assert.equal(trimmed.recordedMinutes, 4_800);
  assert.equal(trimmed.billedMinutes, 3_840);
});

// ── The verdict, plan by plan ────────────────────────────────────────────────

// Halving the audio rate roughly doubled what Pro keeps — $3.85 -> $9.45 a month,
// 20.2% -> 49.5%. It still does not reach the 80% house rule, and no realistic
// transcription price would: at 80 hours the rule funds $0.04/hr. The switch moved
// Pro from "technically above water" to "a real margin", not to the house standard.
test("Pro at 80 hours keeps a real margin now, but still not the house margin", () => {
  const report = modelStudentMonth(HEAVY_STUDENT);
  const previous = modelStudentMonth({ ...HEAVY_STUDENT, recorder: "web-batch" });
  assert.equal(report.profitable, true);
  assert.equal(report.meetsHouseMargin, false);
  assert.ok(report.headroomUsd > 8 && report.headroomUsd < 11, `headroom was ${report.headroomUsd}`);
  assert.ok(report.grossMarginPct > 45 && report.grossMarginPct < 55, `margin was ${report.grossMarginPct}%`);
  assert.ok(report.headroomUsd > previous.headroomUsd * 2, "the provider switch is what bought this");
});

test("80 hours at $19.99 and the 80% house rule cannot both be true", () => {
  const hours = affordableAudioHours(HEAVY_STUDENT, HOUSE_MARGIN * 100);
  // 23.6 hours on the xAI lane, up from ~13 on AssemblyAI. Cheaper audio moved the
  // wall; it did not remove it, and 80 is still nearly 4x what the rule funds.
  assert.ok(hours < 30, `the house rule funds only ${hours} hours at this price`);
  assert.ok(hours < HEAVY_STUDENT.audioHours / 3, "the promise is still multiples of what the rule pays for");
  // Break-even, by contrast, is comfortably past 80 — the plan is not losing money.
  assert.ok(affordableAudioHours(HEAVY_STUDENT, 0) > 80);
});

test("the durable output is a rate, because provider prices move", () => {
  const breakEven = affordableRatePerAudioHour(HEAVY_STUDENT, 0);
  const houseRule = affordableRatePerAudioHour(HEAVY_STUDENT, HOUSE_MARGIN * 100);
  // The live lane is $0.10/hr as of 2026-07-30. Both walls are stated as RATES so
  // this test survives the next provider move without being rewritten.
  assert.ok(breakEven > SURVEYED_USD_PER_HOUR.xai_grok_stt, "the live lane is under break-even");
  assert.ok(houseRule < 0.04, "and above what the house rule would fund");
  // Not even Groq clears the house rule at 80 hours.
  assert.ok(BATCH_USD_PER_HOUR.groq_whisper_turbo > houseRule);
});

test("only a zero-cost lane reaches the house margin at 80 hours", () => {
  assert.equal(modelStudentMonth(HEAVY_STUDENT).meetsHouseMargin, false, "not even the live xAI lane");
  assert.equal(modelStudentMonth({ ...HEAVY_STUDENT, recorder: "web-batch" }).meetsHouseMargin, false);
  assert.equal(modelStudentMonth({ ...HEAVY_STUDENT, recorder: "web-batch-groq" }).meetsHouseMargin, false);
  assert.equal(modelStudentMonth({ ...HEAVY_STUDENT, recorder: "web-batch-modulate" }).meetsHouseMargin, false);
  assert.equal(modelStudentMonth({ ...HEAVY_STUDENT, recorder: "ios-parakeet" }).meetsHouseMargin, true);
});

// "Plus should offer half of what Pro offers" is a pricing instruction with a cost
// consequence the instruction does not mention: half the hours cost half as much, but
// the $1.17 platform cost and Stripe's 30 cents do not halve with them.
test("half of Pro's workload on half of Pro's price is a WORSE margin, not the same one", () => {
  const pro = modelStudentMonth(HEAVY_STUDENT);
  const halfOfPro = modelStudentMonth({
    ...HEAVY_STUDENT,
    audioHours: HEAVY_STUDENT.audioHours / 2,
    chatTurnsPerDay: HEAVY_STUDENT.chatTurnsPerDay / 2,
    decks: HEAVY_STUDENT.decks / 2,
    plan: "plus",
  });
  assert.ok(halfOfPro.grossMarginPct < pro.grossMarginPct, `${halfOfPro.grossMarginPct}% vs ${pro.grossMarginPct}%`);
  // Cheaper audio lifted both, and the GAP is the point: half the workload on half
  // the price keeps well under half of what Pro keeps, because the fixed costs did
  // not halve with it.
  assert.ok(halfOfPro.headroomUsd < pro.headroomUsd / 2, `headroom was ${halfOfPro.headroomUsd} vs ${pro.headroomUsd}`);
  assert.equal(halfOfPro.profitable, true);
});

// Plus got a QUARTER of Pro's hours rather than half. On the AssemblyAI lane the
// binding reason was margin — 40 hours took Plus under 15%. THE CHEAPER LANE
// REMOVED THAT REASON: 40 hours on Plus now clears 40%, so this is no longer a
// pricing constraint that decides itself.
//
// The remaining reasons are product ones, and they still hold: recording is the
// best reason to upgrade, and giving Plus half of Pro's headline number spends the
// upgrade reason to buy nothing. Worth revisiting deliberately rather than assuming
// the old answer — the number that used to force it does not force it any more.
test("Student at its new 30 hours still clears half margin, and the wall is well past it", () => {
  const plusAt = (audioHours: number, recorder = HEAVY_STUDENT.recorder) =>
    modelStudentMonth({ ...HEAVY_STUDENT, audioHours, chatTurnsPerDay: 20, decks: 35, plan: "plus", recorder });
  const at20 = plusAt(20);
  const at30 = plusAt(30);
  const at40 = plusAt(40);
  assert.ok(at20.grossMarginPct > 60, `20h on Student was ${at20.grossMarginPct}%`);
  // The whole cost of the owner's 2026-08-05 raise: ten more hours for ~11 points.
  assert.ok(at30.grossMarginPct > 50, `30h on Student is ${at30.grossMarginPct}%`);
  assert.ok(at20.grossMarginPct - at30.grossMarginPct < 12, "and the raise costs about a tenth of the margin");
  assert.ok(at40.grossMarginPct > 35, `40h on Student would still be ${at40.grossMarginPct}%`);
  assert.ok(plusAt(40, "web-batch").grossMarginPct < 15, "and was under 15% on the lane xAI replaced");
  // The CAP, not the margin, is what stops a Student at 30 hours — the plan turns
  // a profit well past its own allowance, which is the safe side to be wrong on.
  assert.equal(at30.withinTranscriptionCap, true);
  assert.equal(at40.withinTranscriptionCap, false, "40 hours is past what Student allows");
  const breakEven = affordableAudioHours(
    { ...HEAVY_STUDENT, audioHours: 30, chatTurnsPerDay: 20, decks: 35, plan: "plus" },
    0,
  );
  assert.ok(breakEven > 60, `break-even is ${breakEven}h, more than double the allowance`);
});

// What a promised hour is actually covered by, on the plan that now sets the
// ceiling. This replaces the old "5x recording gives away a third of Max's
// margin" test: the plan that argument was about is retired, but the underlying
// discipline is not — an advertised hour has to be worth visibly more than the
// hour costs, or the headline number is the thing that sinks the plan.
test("Agent Pro's promised hours are covered several times over by its price", () => {
  const revenuePerHour = netRevenueUsd(PLANS.pro.priceUsd) / (PLANS.pro.transcriptionMinutes / 60);
  const cover = revenuePerHour / SURVEYED_USD_PER_HOUR.xai_grok_stt;
  assert.ok(cover > 2, `${round(revenuePerHour, 3)}/hr is only ${round(cover, 2)}x the live rate`);
  // And it was barely above water on the lane xAI replaced — which is the whole
  // reason 70 hours at $19.99 is fundable at all.
  assert.ok(
    revenuePerHour / BATCH_USD_PER_HOUR.assemblyai_batch_universal2 < 2,
    "the old lane left almost no cover per promised hour",
  );
  // Agent Pro is the more generous offer per dollar, and that is the correct
  // direction: the dearer plan should buy more hours per dollar, not fewer, or
  // upgrading is a worse deal per unit of the thing you upgrade for.
  const plusPerHour = netRevenueUsd(PLANS.plus.priceUsd) / (PLANS.plus.transcriptionMinutes / 60);
  assert.ok(plusPerHour > SURVEYED_USD_PER_HOUR.xai_grok_stt * 2, `Student covers ${round(plusPerHour, 3)}/hr`);
  assert.ok(revenuePerHour < plusPerHour, "Pro must promise more hours per dollar than Student");
});

// The number that decides how much recording each plan can actually promise.
test("what each plan can fund at the house margin, and where break-even sits", () => {
  const hoursAt = (plan: PlanCode, margin: number) =>
    affordableAudioHours({ ...HEAVY_STUDENT, plan }, margin);
  // At the 80% rule, on the live $0.10/hr xAI lane (was $0.17 until 2026-07-30):
  assert.ok(hoursAt("plus", 80) < 6, `Plus funds ${hoursAt("plus", 80)}h`);
  assert.ok(hoursAt("pro", 80) < 30, `Pro funds ${hoursAt("pro", 80)}h`);
  // Still short of every plan's headline promise, on the cheapest wired provider.
  assert.ok(hoursAt("pro", 80) < HEAVY_STUDENT.audioHours / 3);
  // No plan in the ladder funds its own headline at the 80% house rule. That is
  // a known, deliberate gap: the rule was written before the product had an
  // audio lane, and Max — the one plan whose price DID clear it — was retired on
  // 2026-08-05. Break-even is the wall that actually matters, and it sits far
  // out: no plan loses money at the owner's 80-hour persona.
  assert.ok(hoursAt("pro", 0) > 100, `Pro breaks even at ${hoursAt("pro", 0)}h`);
  assert.ok(hoursAt("plus", 0) > 60, `Student breaks even at ${hoursAt("plus", 0)}h`);
});

test("the token cap is several times larger than the workload that has to fit in it", () => {
  const report = modelStudentMonth(HEAVY_STUDENT);
  assert.ok(report.capRatio < 0.4, `heavy month uses ${report.capRatio}x of the Pro cap`);
  // So raising token caps costs nothing real — they are not what binds.
  assert.ok(report.meteredTokens < PLANS.pro.monthlyTokens / 2);
});

test("the recording allowance, not the token cap, is what a heavy Pro month runs into", () => {
  const report = modelStudentMonth(HEAVY_STUDENT);
  assert.equal(report.recordedMinutes, 4_800);
  assert.equal(report.transcriptionCap, 4_200);
  // THE CUT TO 70 HOURS HAS A USER-VISIBLE CONSEQUENCE, AND IT BELONGS IN A TEST
  // RATHER THAN A COMMENT: the owner's own heavy student — 80 hours a month, the
  // persona every margin figure in this file is computed against — no longer fits
  // inside Pro. They run out at 70 and the last ten hours are refused.
  //
  // That is a deliberate trade, not an oversight: 80 hours on Pro was worth $3.27
  // a month. But it means "80 hours" must not reappear in any plan copy, and the
  // upgrade path for a genuinely heavy recorder is now Max.
  assert.ok(!report.withinTranscriptionCap, "4,800 recorded against a 4,200 allowance");
  assert.ok(report.recordedMinutes > report.transcriptionCap);
});

// ── Honesty about what is not built and not priced ───────────────────────────

test("slide vision is reported as unpriced, never as free", () => {
  const report = modelStudentMonth(HEAVY_STUDENT);
  assert.ok(report.unpriced.includes("Slide image reading (vision)"));
  assert.equal(report.lines.find((line) => line.name.startsWith("Slide image"))!.usd, null);
});

test("every line declares whether it was measured or forecast", () => {
  for (const line of modelStudentMonth(HEAVY_STUDENT).lines) {
    assert.ok(line.basis === "measured" || line.basis === "forecast", line.name);
    assert.ok(line.note.length > 0, `${line.name} needs a note explaining its number`);
  }
});

// The flat costs are what make a $9.99 plan hard, not the AI. $1.17 of platform cost
// is 12.4% of what Plus nets, and Stripe's 30 cents is another 3% — so a Plus
// subscriber has spent a sixth of the house-margin budget before touching a feature.
test("even a LIGHT student misses the house margin on Plus, and the AI is not why", () => {
  const light: StudentMonth = {
    ...HEAVY_STUDENT,
    audioHours: 8,
    chatTurnsPerDay: 10,
    dailyNotes: false,
    decks: 20,
    plan: "plus",
    visionImagesPerDeck: 0,
  };
  const report = modelStudentMonth(light);
  assert.equal(report.meetsHouseMargin, false, "72%, not 80%");
  assert.ok(report.grossMarginPct > 70, `but comfortably profitable at ${report.grossMarginPct}%`);
  assert.ok(report.aiUsd < 0.1, `the whole AI lane is ${report.aiUsd}`);
  assert.ok(OTHER_COGS_USD > netRevenueUsd(PLANS.plus.priceUsd) * 0.12, "flat cost alone eats an eighth of Plus");
  assert.ok(report.capRatio < 1);
});

test("every plan in the ladder can be modelled", () => {
  // Driven off PLANS rather than a hand-written list, so retiring or adding a
  // tier can never leave this loop testing a plan that no longer exists.
  for (const plan of Object.keys(PLANS) as PlanCode[]) {
    const report = modelStudentMonth({ ...HEAVY_STUDENT, audioHours: 4, plan });
    assert.equal(report.plan, plan);
    assert.ok(Number.isFinite(report.totalUsd));
  }
});

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}
