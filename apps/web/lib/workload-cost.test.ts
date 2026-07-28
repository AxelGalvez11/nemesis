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
  VOICE_PRICE_REV,
  type PlanCode,
  type StudentMonth,
} from "./workload-cost";

const repoFile = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");

// ── Drift guards ─────────────────────────────────────────────────────────────
// workload-cost.ts mirrors numbers that live in shipped code. A mirror that can go
// stale silently is worse than no model at all: it would keep answering confidently
// with last month's prices. These read the real files and fail on divergence.

test("model prices match the valve's canonical price list", () => {
  const source = repoFile("supabase/functions/_shared/llm-cost.ts");
  assert.match(source, new RegExp(`PRICE_REV = "${PRICE_REV}"`), "price revision drifted");
  for (const [model, price] of Object.entries(MODEL_PRICES)) {
    const line = new RegExp(
      `"${model}":\\s*\\{\\s*cachedInputPerM:\\s*${price.cachedInputPerM},\\s*inputPerM:\\s*${price.inputPerM},\\s*outputPerM:\\s*${price.outputPerM}`,
    );
    assert.match(source, line, `${model} price drifted from _shared/llm-cost.ts`);
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

// THE FINDING, 2026-07-28: paying 5x more buys LESS recording. Caps are edited one
// database row at a time and nothing compares them across plans, so a raise applied
// to Pro on 2026-07-24 and not to Max inverted the ladder with no screen saying so.
// This test is written to FAIL once that is fixed — it is a standing alarm, not a
// description. When the caps are corrected, replace it with the assertion below it.
test("KNOWN BROKEN: the plan ladder is inverted — paying more buys less", () => {
  const inversions = planCapInversions();
  assert.deepEqual(
    inversions.map((row) => `${row.meter}: ${row.dearer} ${row.dearerValue} < ${row.cheaper} ${row.cheaperValue}`),
    [
      // The headline: Max ($99) allows 60 hours of recording a month, Pro ($19.99)
      // allows 83. A student who records heavily is better off on the cheaper plan.
      "recording minutes: max 3600 < pro 5000",
      // And FREE outsearches both paid student plans.
      "monthly searches: plus 100 < free 300",
      "monthly searches: pro 150 < free 300",
    ],
    "FIXED? Correct this list — or delete the test if there are no inversions left",
  );
});

test("a corrected ladder reports no inversions", () => {
  const fixed = {
    ...PLANS,
    max: { ...PLANS.max, monthlyTokens: 125_000_000, searchMonthly: 1_500, transcriptionMinutes: 25_000 },
    plus: { ...PLANS.plus, searchMonthly: 300 },
    pro: { ...PLANS.pro, searchMonthly: 600 },
  };
  assert.deepEqual(planCapInversions(fixed), []);
});

test("Max costs 5x Pro but does not currently offer 5x of anything", () => {
  assert.equal(round(PLANS.max.priceUsd / PLANS.pro.priceUsd, 1), 5);
  for (const meter of ["monthlyTokens", "transcriptionMinutes", "searchMonthly", "askDaily"] as const) {
    assert.ok(PLANS.max[meter] < PLANS.pro[meter] * 5, `${meter} is already 5x — update this test`);
  }
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
  assert.ok(report.audioUsd > 13, `audio was ${report.audioUsd}`);
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
  // $0.49 -> $2.71 of AI, which halves Pro's headroom. It is the only model line
  // that gets anywhere near the audio line, and therefore the one AI-side cost
  // worth metering separately rather than giving away.
  assert.ok(glm.aiUsd > 2.5, `GLM AI lane was ${glm.aiUsd}`);
  assert.ok(glm.headroomUsd < flash.headroomUsd / 2, "a Pro student living on High halves what the plan keeps");
});

test("switching off speaker labels is a real but small lever", () => {
  const saving = HEAVY_STUDENT.audioHours * DIARIZATION_USD_PER_HOUR;
  const report = modelStudentMonth(HEAVY_STUDENT);
  assert.equal(round(saving, 2), 1.6);
  assert.ok(saving < report.audioUsd * 0.15, "a tenth of the audio line, not a fix for it");
});

test("the cheaper AssemblyAI tier is worth more than the add-on, and Groq more than both", () => {
  const universal2 = modelStudentMonth(HEAVY_STUDENT).audioUsd;
  const pro = modelStudentMonth({ ...HEAVY_STUDENT, recorder: "web-batch-pro" }).audioUsd;
  const groq = modelStudentMonth({ ...HEAVY_STUDENT, recorder: "web-batch-groq" }).audioUsd;
  assert.equal(universal2, 13.6);
  assert.equal(pro, 18.4);
  assert.equal(groq, 3.2);
  // If the pinned model is ever ignored, the month costs $4.80 more and nothing warns
  // us except a console line in nemesis-transcribe.
  assert.equal(round(pro - universal2, 2), 4.8);
});

// The silence gate is the largest UNMEASURED lever in the product. No recording has
// ever been transcribed in production, and the wall clock is not stored, so the
// honest output is a band, not a number.
test("the silence saving is a band, and the model refuses to assume one", () => {
  assert.equal(HEAVY_STUDENT.silenceShare, 0, "no saving is claimed by default");
  const band = [0.1, 0.2, 0.3].map((share) => modelStudentMonth({ ...HEAVY_STUDENT, silenceShare: share }));
  assert.deepEqual(band.map((report) => report.audioUsd), [12.24, 10.88, 9.52]);
  // Even 30% trimmed does not get Pro to the house margin on its own.
  assert.equal(band[2]!.meetsHouseMargin, false);
});

test("trimming silence stretches the student's allowance too, because web bills the file", () => {
  const trimmed = modelStudentMonth({ ...HEAVY_STUDENT, silenceShare: 0.2 });
  assert.equal(trimmed.recordedMinutes, 4_800);
  assert.equal(trimmed.billedMinutes, 3_840);
});

// ── The verdict, plan by plan ────────────────────────────────────────────────

test("Pro at 80 hours is profitable but nowhere near the house margin", () => {
  const report = modelStudentMonth(HEAVY_STUDENT);
  assert.equal(report.profitable, true);
  assert.equal(report.meetsHouseMargin, false);
  assert.ok(report.headroomUsd > 2 && report.headroomUsd < 5, `headroom was ${report.headroomUsd}`);
  assert.ok(report.grossMarginPct > 12 && report.grossMarginPct < 25, `margin was ${report.grossMarginPct}%`);
});

test("80 hours at $19.99 and the 80% house rule cannot both be true", () => {
  const hours = affordableAudioHours(HEAVY_STUDENT, HOUSE_MARGIN * 100);
  assert.ok(hours < 20, `the house rule funds only ${hours} hours at this price`);
  // Break-even, by contrast, is comfortably past 80 — the plan is not losing money.
  assert.ok(affordableAudioHours(HEAVY_STUDENT, 0) > 80);
});

test("the durable output is a rate, because provider prices move", () => {
  const breakEven = affordableRatePerAudioHour(HEAVY_STUDENT, 0);
  const houseRule = affordableRatePerAudioHour(HEAVY_STUDENT, HOUSE_MARGIN * 100);
  assert.ok(breakEven > 0.17, "the live lane is under break-even");
  assert.ok(houseRule < 0.04, "and above what the house rule would fund");
  // Not even Groq clears the house rule at 80 hours.
  assert.ok(BATCH_USD_PER_HOUR.groq_whisper_turbo > houseRule);
});

test("only a zero-cost lane reaches the house margin at 80 hours", () => {
  assert.equal(modelStudentMonth({ ...HEAVY_STUDENT, recorder: "web-batch" }).meetsHouseMargin, false);
  assert.equal(modelStudentMonth({ ...HEAVY_STUDENT, recorder: "web-batch-groq" }).meetsHouseMargin, false);
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
  assert.ok(halfOfPro.headroomUsd < 2, `headroom was ${halfOfPro.headroomUsd}`);
  assert.equal(halfOfPro.profitable, true);
});

test("40 hours does not fit Plus's own recording allowance anyway", () => {
  const halfOfPro = modelStudentMonth({ ...HEAVY_STUDENT, audioHours: 40, plan: "plus" });
  assert.equal(halfOfPro.transcriptionCap, 600, "Plus allows 10 hours a month, not 40");
  assert.equal(halfOfPro.withinTranscriptionCap, false);
});

// 5x on the recording meter is the one place "5x everything" breaks down. Not because
// it loses money — it doesn't — but because it converts the best-margin plan in the
// ladder into the worst, in exchange for hours nobody can spend: 400 hours a month is
// ~100 hours of lecture a week.
test("5x recording turns Max from the best-margin plan into a thin one", () => {
  const fiveX = 5 * 80;
  const atEighty = modelStudentMonth({ ...HEAVY_STUDENT, plan: "max" });
  const maxed = modelStudentMonth({ ...HEAVY_STUDENT, audioHours: fiveX, plan: "max" });
  assert.ok(atEighty.grossMarginPct > 80, `80h on Max is ${atEighty.grossMarginPct}%`);
  assert.ok(maxed.grossMarginPct < 30, `400h on Max is ${maxed.grossMarginPct}%`);
  assert.equal(maxed.profitable, true, "still above water — the objection is margin, not loss");
  // Revenue per promised hour drops to within pennies of what the hour costs.
  const revenuePerHour = netRevenueUsd(PLANS.max.priceUsd) / fiveX;
  assert.ok(revenuePerHour < BATCH_USD_PER_HOUR.assemblyai_batch_universal2 * 1.5, `${round(revenuePerHour, 3)}/hr`);
});

// The number that decides how much recording each plan can actually promise.
test("what each plan can fund at the house margin, and where break-even sits", () => {
  const hoursAt = (plan: PlanCode, margin: number) =>
    affordableAudioHours({ ...HEAVY_STUDENT, plan }, margin);
  // At the 80% rule, on the live $0.17/hr lane:
  assert.ok(hoursAt("plus", 80) < 5, `Plus funds ${hoursAt("plus", 80)}h`);
  assert.ok(hoursAt("pro", 80) < 15, `Pro funds ${hoursAt("pro", 80)}h`);
  // Max is the only plan whose price already funds the 80-hour promise outright.
  assert.ok(hoursAt("max", 80) > 100, `Max funds ${hoursAt("max", 80)}h`);
  // Break-even is a different, much later wall — no plan is losing money at 80h.
  assert.ok(hoursAt("pro", 0) > 100);
});

test("Max at a realistic heavy workload is extremely profitable — the room is real", () => {
  // Same student, same 80 hours, paying $99 instead of $19.99.
  const onMax = modelStudentMonth({ ...HEAVY_STUDENT, plan: "max" });
  assert.ok(onMax.headroomUsd > 78, `headroom was ${onMax.headroomUsd}`);
  assert.equal(onMax.meetsHouseMargin, true);
  // Which is the point: Max's problem is not its cost, it is that it offers nothing.
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
  assert.equal(report.transcriptionCap, 5_000);
  assert.ok(report.withinTranscriptionCap, "4,800 against a 5,000 allowance — 96% of it");
  assert.ok(report.recordedMinutes / report.transcriptionCap > 0.9);
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
  for (const plan of ["free", "plus", "pro", "max"] as PlanCode[]) {
    const report = modelStudentMonth({ ...HEAVY_STUDENT, audioHours: 4, plan });
    assert.equal(report.plan, plan);
    assert.ok(Number.isFinite(report.totalUsd));
  }
});

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}
