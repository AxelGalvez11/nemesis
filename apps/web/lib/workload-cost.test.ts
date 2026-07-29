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

test("Plus is half of Pro and Max is 5x Pro on the meters that scale", () => {
  for (const meter of ["monthlyTokens", "dailyTokens", "searchMonthly", "askDaily"] as const) {
    assert.equal(PLANS.max[meter], PLANS.pro[meter] * 5, `max ${meter}`);
    assert.equal(PLANS.plus[meter], PLANS.pro[meter] / 2, `plus ${meter}`);
  }
});

// Recording is the exception, and deliberately so. Owner 2026-07-28 set the three
// numbers directly — 20 / 80 / 200 hours — because a literal 5x would be 400 hours
// (about 100 hours of lecture a week) and would cost 58 points of margin.
test("recording follows the owner's three numbers, not the 5x rule", () => {
  assert.equal(PLANS.plus.transcriptionMinutes, 20 * 60);
  assert.equal(PLANS.max.transcriptionMinutes, 200 * 60);
  // Pro cut to 70 hours on 2026-07-29 (owner). 83 hours sat inside the 103.7-hour
  // break-even wall but left only $3.27 a month on the plan pushed hardest.
  assert.equal(PLANS.pro.transcriptionMinutes, 70 * 60);
  // The advertised number and the stored number are now the SAME number. The old
  // row was 83 hours sold as 80, and that three-hour gap is exactly the kind of
  // slack that lets marketing copy and the meter drift apart unnoticed.
  assert.equal(PLANS.pro.transcriptionMinutes, 4_200);
  assert.ok(PLANS.max.transcriptionMinutes < PLANS.pro.transcriptionMinutes * 5, "and 5x recording was rejected");
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

// A Max subscriber used to be stopped by their own plan while doing exactly what Pro
// subscribers are promised. That was the user-visible face of the inverted ladder.
test("every plan can record what it advertises, and Max can carry a Pro workload", () => {
  // Pro advertises 70 hours as of 2026-07-29, so 70 is what must fit. HEAVY_STUDENT
  // is still 80 — the owner's persona did not change when the plan did — which is
  // why this asserts the advertised figure rather than reusing the persona.
  assert.equal(modelStudentMonth({ ...HEAVY_STUDENT, audioHours: 70 }).withinTranscriptionCap, true);
  // And the persona itself now overflows Pro. Stated here as well as at the
  // allowance test so a future edit cannot quietly restore an 80-hour promise.
  assert.equal(modelStudentMonth(HEAVY_STUDENT).withinTranscriptionCap, false);
  assert.equal(modelStudentMonth({ ...HEAVY_STUDENT, plan: "max" }).withinTranscriptionCap, true);
  assert.equal(modelStudentMonth({ ...HEAVY_STUDENT, audioHours: 20, plan: "plus" }).withinTranscriptionCap, true);
  assert.equal(modelStudentMonth({ ...HEAVY_STUDENT, audioHours: 200, plan: "max" }).withinTranscriptionCap, true);
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

// THE UNGUARDED RISK. `speech_models` is a priority LIST whose default is
// ["universal-3-5-pro", "universal-2"] — a request field that is renamed or moved is
// accepted and ignored, not rejected. If that pin ever stops being honoured, Pro does
// not merely get thinner: it goes underwater at 80 hours, and the only signal is a
// console.warn inside an edge function that nobody reads.
test("Pro LOSES MONEY at 80 hours if the cheaper AssemblyAI tier is not honoured", () => {
  const pinned = modelStudentMonth(HEAVY_STUDENT);
  const ignored = modelStudentMonth({ ...HEAVY_STUDENT, recorder: "web-batch-pro" });
  assert.equal(pinned.profitable, true);
  assert.equal(ignored.profitable, false, "a silently ignored request field costs the whole margin and more");
  assert.ok(ignored.headroomUsd < 0, `headroom was ${ignored.headroomUsd}`);
  assert.ok(ignored.grossMarginPct < 0, `margin was ${ignored.grossMarginPct}%`);
});

// ── Would a different provider or a better model help? ──────────────────────
// Surveyed 2026-07-28 because the owner asked. Every figure here is a comparison
// against what we pay today, and none of these lanes is wired.

test("xAI Grok STT would more than double Pro's margin, and throws in the add-on", () => {
  const live = modelStudentMonth(HEAVY_STUDENT);
  const xai = modelStudentMonth({ ...HEAVY_STUDENT, recorder: "web-batch-xai" });
  assert.equal(xai.audioUsd, 8);
  assert.ok(xai.grossMarginPct > live.grossMarginPct * 2, `${live.grossMarginPct}% -> ${xai.grossMarginPct}%`);
  // And its $0.10 INCLUDES speaker diarization, which we currently pay $0.02/hr for
  // on top — so the real gap is wider than the sticker difference suggests.
  assert.ok(SURVEYED_USD_PER_HOUR.xai_grok_stt < BATCH_USD_PER_HOUR.assemblyai_batch_universal2);
});

test("the cheapest surveyed lane is also the one to test first, because testing is free", () => {
  // Modulate's $0.03 is still the seller's own number, but it comes with 400 free
  // hours and cites public benchmarks — so the claim can be settled on our own
  // lectures at zero cost. Cheapest to TEST is a different question from cheapest
  // to TRUST, and this is the rare case where one answer serves both.
  const modulate = modelStudentMonth({ ...HEAVY_STUDENT, recorder: "web-batch-modulate" });
  const xai = modelStudentMonth({ ...HEAVY_STUDENT, recorder: "web-batch-xai" });
  const live = modelStudentMonth(HEAVY_STUDENT);
  assert.ok(modulate.grossMarginPct > xai.grossMarginPct);
  assert.ok(SURVEYED_USD_PER_HOUR.modulate < SURVEYED_USD_PER_HOUR.xai_grok_stt / 3);
  // 400 free hours is five months of the heavy student's recording.
  assert.ok(400 / HEAVY_STUDENT.audioHours >= 5);
  // Either survey lane roughly triples what Pro keeps.
  assert.ok(xai.headroomUsd > live.headroomUsd * 2);
  assert.ok(modulate.headroomUsd > live.headroomUsd * 3);
});

// "The AI is cheap, so can we use a better model?" — true of the model we run, and
// it stops being true fast. The audio lane decides the answer, not the AI budget.
test("a better chat model is affordable only once the audio lane comes down", () => {
  const glmOnLiveAudio = modelStudentMonth({ ...HEAVY_STUDENT, chatModel: "glm-5.2" });
  const glmOnXai = modelStudentMonth({ ...HEAVY_STUDENT, chatModel: "glm-5.2", recorder: "web-batch-xai" });
  assert.ok(glmOnLiveAudio.grossMarginPct < 10, `GLM on today's audio is ${glmOnLiveAudio.grossMarginPct}%`);
  assert.ok(glmOnXai.grossMarginPct > 35, `GLM on cheaper audio is ${glmOnXai.grossMarginPct}%`);
});

// Kimi K3 is $3/$0.30/$15 per 1M and has NO non-thinking mode, so every reasoning
// token bills as output. Pricing it off visible completion length alone is the error
// that makes it look affordable; at 3x thinking it is not close, on any audio lane.
test("Kimi K3 loses money on Pro even with free audio, and it is the OUTPUT rate", () => {
  const noThinking = modelStudentMonth({ ...HEAVY_STUDENT, chatModel: "kimi-k3" });
  const thinking = modelStudentMonth({ ...HEAVY_STUDENT, chatModel: "kimi-k3", chatReasoningMultiple: 3 });
  assert.equal(noThinking.profitable, false, "even the flattering assumption is underwater");
  assert.ok(thinking.aiUsd > noThinking.aiUsd * 2, "reasoning tokens are most of the bill");
  // Give it free transcription and it STILL misses the house margin on Pro.
  const free = modelStudentMonth({ ...HEAVY_STUDENT, chatModel: "kimi-k3", chatReasoningMultiple: 3, recorder: "ios-parakeet" });
  assert.equal(free.meetsHouseMargin, false, `${free.grossMarginPct}% with $0 audio`);
  assert.equal(KIMI_REASONS_ALWAYS, true);
});

// Which makes the premium model a MAX feature rather than a product-wide upgrade —
// the plan with $80 of headroom can carry what the $19.99 plan cannot.
test("Max can afford the model Pro cannot, which is what makes it a Max feature", () => {
  const onMax = modelStudentMonth({ ...HEAVY_STUDENT, chatModel: "kimi-k3", chatReasoningMultiple: 3, plan: "max" });
  const onPro = modelStudentMonth({ ...HEAVY_STUDENT, chatModel: "kimi-k3", chatReasoningMultiple: 3 });
  assert.equal(onPro.profitable, false);
  assert.ok(onMax.grossMarginPct > 65, `Max carries it at ${onMax.grossMarginPct}%`);
  assert.equal(modelStudentMonth({ ...HEAVY_STUDENT, chatModel: "glm-5.2", plan: "max" }).meetsHouseMargin, true);
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

// Which is why Plus got a QUARTER of Pro's hours rather than half. Recording is both
// the expensive line and the best reason to upgrade; spending margin on 40 hours
// would have bought away the upgrade reason as well as the profit.
test("Plus at 20 hours keeps a real margin where 40 hours would not", () => {
  const at20 = modelStudentMonth({ ...HEAVY_STUDENT, audioHours: 20, chatTurnsPerDay: 20, decks: 35, plan: "plus" });
  const at40 = modelStudentMonth({ ...HEAVY_STUDENT, audioHours: 40, chatTurnsPerDay: 20, decks: 35, plan: "plus" });
  assert.ok(at20.grossMarginPct > 45, `20h on Plus is ${at20.grossMarginPct}%`);
  assert.ok(at40.grossMarginPct < 15, `40h on Plus is ${at40.grossMarginPct}%`);
  assert.equal(at20.withinTranscriptionCap, true);
  assert.equal(at40.withinTranscriptionCap, false, "and 40 hours is past what Plus allows");
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
