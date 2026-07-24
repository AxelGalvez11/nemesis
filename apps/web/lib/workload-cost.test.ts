import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  CACHE_HIT_WEIGHT,
  completionUsd,
  HEAVY_STUDENT,
  LIVE_NOTES_INTERVAL_MS,
  LIVE_NOTES_TRANSCRIPT_CHARS,
  MATERIAL_CHAR_LIMIT,
  meteredTokens,
  modelStudentMonth,
  MODEL_PRICES,
  netRevenueUsd,
  PRICE_REV,
  PRO_MONTHLY_TOKEN_CAP,
  VOICE_USD_PER_HOUR,
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

test("voice prices match cost-report's canonical table", () => {
  const source = repoFile("apps/web/lib/cost-report.ts");
  for (const [provider, rate] of Object.entries(VOICE_USD_PER_HOUR)) {
    assert.match(source, new RegExp(`${provider}:\\s*${rate},`), `${provider} rate drifted`);
  }
});

test("the cache weight matches the meter in the valve", () => {
  const source = repoFile("supabase/functions/nemesis-llm/index.ts");
  assert.match(source, new RegExp(`CACHE_HIT_WEIGHT = ${CACHE_HIT_WEIGHT}`));
});

test("the live-notes cadence and window match the shipped recorder", () => {
  const mobile = repoFile("apps/mobile/src/lib/live-notes.ts");
  assert.match(mobile, new RegExp(`LIVE_NOTES_INTERVAL_MS = ${LIVE_NOTES_INTERVAL_MS / 1000}_000`));
  assert.match(mobile, new RegExp(`LIVE_NOTES_TRANSCRIPT_CHARS = ${LIVE_NOTES_TRANSCRIPT_CHARS / 1000}_000`));
  // The web recorder must stay on the same cadence or the two surfaces bill differently.
  const web = repoFile("apps/web/components/workspace/sessions/use-live-audio.ts");
  assert.match(web, new RegExp(`INSIGHT_INTERVAL_MS = ${LIVE_NOTES_INTERVAL_MS / 1000}_000`));
});

test("the study material clip matches the generator", () => {
  const source = repoFile("apps/web/lib/workspace/study-artifact-content.ts");
  assert.match(source, new RegExp(`MATERIAL_CHAR_LIMIT = ${MATERIAL_CHAR_LIMIT / 1000}_000`));
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

test("the two ledgers move independently — money can be fine while the cap is not", () => {
  const uncached = { cacheHitTokens: 0, completionTokens: 500, promptTokens: 10_000 };
  const cached = { cacheHitTokens: 9_000, completionTokens: 500, promptTokens: 10_000 };
  assert.ok(completionUsd("deepseek-v4-flash", cached)! < completionUsd("deepseek-v4-flash", uncached)!);
  assert.ok(meteredTokens(cached) < meteredTokens(uncached));
});

test("net revenue subtracts Stripe's cut", () => {
  assert.equal(netRevenueUsd(19.99), 19.11);
});

// ── The recorder lane is the whole answer ────────────────────────────────────

test("the same month costs several times more on the web live lane than on the phone", () => {
  const live = modelStudentMonth({ ...HEAVY_STUDENT, recorder: "web-live" });
  const phone = modelStudentMonth({ ...HEAVY_STUDENT, recorder: "ios-ondevice" });
  const lineOf = (report: ReturnType<typeof modelStudentMonth>) =>
    report.lines.find((line) => line.name.startsWith("Transcription"))!.usd!;
  assert.equal(lineOf(live), 12);
  assert.equal(lineOf(phone), 3.2);
  assert.ok(lineOf(live) / lineOf(phone) > 3, "naming the lane is not optional");
});

// The reason HEAVY_STUDENT defaults to the expensive lane: the web recorder has no
// other one. The cheap batch route exists and is proven, but only the phone calls it.
// If someone wires it into the web app, this test fails and the default should change.
test("the web app has no batch transcription lane wired — only the phone uses the cheap route", () => {
  const webRecorder = repoFile("apps/web/components/workspace/sessions/record-workspace.tsx");
  assert.match(webRecorder, /live-audio/, "the web recorder drives the streaming lane");
  assert.doesNotMatch(webRecorder, /transcription\/submit/, "web gained a batch lane — revisit the default recorder");
  const phone = repoFile("apps/mobile/src/api/chat.ts");
  assert.match(phone, /transcription\/submit/, "the cheap route is real and in production on the phone");
});

test("moving web recording to the existing batch route would save most of its audio bill", () => {
  const streaming = modelStudentMonth({ ...HEAVY_STUDENT, recorder: "web-live" });
  const batch = modelStudentMonth({ ...HEAVY_STUDENT, recorder: "web-upload" });
  assert.ok(batch.headroomUsd - streaming.headroomUsd > 8, "worth more than $8/student/month");
});

test("80 hours of streaming web audio alone eats most of a month's revenue", () => {
  const report = modelStudentMonth({ ...HEAVY_STUDENT, recorder: "web-live" });
  const transcription = report.lines.find((line) => line.name.startsWith("Transcription"))!.usd!;
  assert.ok(transcription > report.netRevenueUsd * 0.6, `transcription was ${transcription}`);
});

// ── The cap, and the lever that moves it ─────────────────────────────────────

// The cap was raised to 25M on 2026-07-24 so 5,000 minutes of lecture would be
// usable. It bought exactly enough and no more: the heavy month lands at ~96% of
// the allowance, so any growth in the notes pipeline puts students back at the
// wall. The headroom is the number to watch here, not the pass/fail.
test("the heavy month now fits under the raised cap — with almost nothing spare", () => {
  const report = modelStudentMonth(HEAVY_STUDENT);
  assert.equal(report.tokenCap, PRO_MONTHLY_TOKEN_CAP);
  assert.ok(report.capRatio <= 1, `should fit, got ${report.capRatio}x`);
  assert.ok(report.capRatio > 0.9, `headroom should still be thin, got ${report.capRatio}x`);
});

test("the same month would have blown the old 12M cap twice over", () => {
  assert.ok(modelStudentMonth(HEAVY_STUDENT).meteredTokens > 20_000_000, "raising the cap was not optional");
});

test("live notes are the line that overruns the cap, not chat or decks", () => {
  const report = modelStudentMonth(HEAVY_STUDENT);
  const notes = report.lines.find((line) => line.name === "Live lecture notes")!;
  const everythingElse = report.meteredTokens - notes.metered;
  assert.ok(notes.metered > everythingElse * 2, "the notes lane should dominate by a wide margin");
});

test("slowing the notes cadence cuts tokens and money proportionally", () => {
  const at45 = modelStudentMonth(HEAVY_STUDENT);
  const at120 = modelStudentMonth({ ...HEAVY_STUDENT, notesIntervalMs: 120_000 });
  assert.ok(at120.meteredTokens < at45.meteredTokens / 2);
  assert.ok(at120.totalUsd < at45.totalUsd);
});

test("prefix caching on the notes lane costs the student nothing and cuts both ledgers", () => {
  const tail = modelStudentMonth(HEAVY_STUDENT);
  const prefix = modelStudentMonth({ ...HEAVY_STUDENT, notesCacheHitRate: 0.9 });
  const notesOf = (report: ReturnType<typeof modelStudentMonth>) =>
    report.lines.find((line) => line.name === "Live lecture notes")!;
  // Same number of calls, same bullets for the student — only the prompt shape changes.
  assert.equal(notesOf(prefix).calls, notesOf(tail).calls);
  assert.ok(notesOf(prefix).usd! < notesOf(tail).usd! / 3, "90% cached should cut the notes bill by 3x or more");
  assert.ok(notesOf(prefix).metered < notesOf(tail).metered / 3, "and the cap charge falls with it");
  // The month-wide ratio improves by less, because chat and deck generation are
  // unaffected — a reminder that fixing the worst line does not divide the total.
  assert.ok(prefix.capRatio < tail.capRatio / 2);
});

// The 50x input discount does NOT become a 50x saving, and assuming it does is how a
// plan gets built on a number that never arrives. Output tokens are never cached, so
// they are a hard floor under the notes bill: caching all the input still leaves them.
test("caching cannot beat the output floor, so the saving is ~3x and not ~50x", () => {
  const promptTokens = 2_958;
  const completionTokens = 360;
  const fresh = completionUsd("deepseek-v4-flash", { cacheHitTokens: 0, completionTokens, promptTokens })!;
  const fullyCached = completionUsd("deepseek-v4-flash", {
    cacheHitTokens: promptTokens,
    completionTokens,
    promptTokens,
  })!;
  assert.ok(fresh / fullyCached < 5, `perfect caching only buys ${(fresh / fullyCached).toFixed(1)}x here`);
  const outputOnly = completionUsd("deepseek-v4-flash", { cacheHitTokens: 0, completionTokens, promptTokens: 0 })!;
  assert.ok(outputOnly / fullyCached > 0.9, "output is nearly the whole bill once input is cached");
});

test("cadence and caching together bring the heavy month back inside the cap", () => {
  const fixed = modelStudentMonth({ ...HEAVY_STUDENT, notesCacheHitRate: 0.9, notesIntervalMs: 120_000 });
  assert.ok(fixed.capRatio <= 1, `still over the cap at ${fixed.capRatio}x`);
});

// ── Honesty about what is not built and not priced ───────────────────────────

test("slide vision is reported as unpriced, never as free", () => {
  const report = modelStudentMonth(HEAVY_STUDENT);
  assert.ok(report.unpriced.includes("Slide image reading (vision)"));
  const vision = report.lines.find((line) => line.name === "Slide image reading (vision)")!;
  assert.equal(vision.usd, null);
  assert.equal(vision.basis, "forecast");
});

test("dropping an unbuilt line changes no dollar total, because it was never counted", () => {
  const withVision = modelStudentMonth(HEAVY_STUDENT);
  const without = modelStudentMonth({ ...HEAVY_STUDENT, visionImagesPerDeck: 0 });
  assert.equal(withVision.totalUsd, without.totalUsd);
  assert.equal(without.unpriced.length, 0);
});

test("every line declares whether it was measured or forecast", () => {
  for (const line of modelStudentMonth(HEAVY_STUDENT).lines) {
    assert.ok(line.basis === "measured" || line.basis === "forecast", line.name);
    assert.ok(line.note.length > 0, `${line.name} needs a note explaining its number`);
  }
});

// ── The verdict ──────────────────────────────────────────────────────────────

test("the heavy month clears break-even but misses the 80% house margin", () => {
  const report = modelStudentMonth(HEAVY_STUDENT);
  assert.equal(report.profitable, true);
  assert.equal(report.meetsHouseMargin, false);
});

// meetsHouseMargin is a target, not break-even. Two months can both report false and
// be nothing alike — always quote headroom alongside it.
test("the house-margin boolean hides a large difference in actual headroom", () => {
  const worst = modelStudentMonth(HEAVY_STUDENT);
  const better = modelStudentMonth({
    ...HEAVY_STUDENT,
    notesCacheHitRate: 0.9,
    notesIntervalMs: 120_000,
    recorder: "ios-ondevice",
  });
  assert.equal(worst.meetsHouseMargin, better.meetsHouseMargin);
  assert.ok(better.headroomUsd > worst.headroomUsd * 5, "same verdict, wildly different month");
  assert.ok(better.headroomUsd > 13);
});

// The whole reason PR #273 (on-device Parakeet) is an economics change and not just a
// latency one: at 80 hours it is the only lane that leaves room for the house rule.
test("only the on-device lane gets the heavy month to the 80% house margin", () => {
  const tuned = { ...HEAVY_STUDENT, notesCacheHitRate: 0.9, notesIntervalMs: 120_000 };
  assert.equal(modelStudentMonth({ ...tuned, recorder: "web-live" }).meetsHouseMargin, false);
  assert.equal(modelStudentMonth({ ...tuned, recorder: "ios-ondevice" }).meetsHouseMargin, false);
  assert.equal(modelStudentMonth({ ...tuned, recorder: "ios-parakeet" }).meetsHouseMargin, true);
});

test("the notes fixes alone are not enough on any metered lane", () => {
  // Fixing the tokens without fixing the audio lane still misses the house rule —
  // both changes are required, neither is sufficient.
  const notesFixedOnly = modelStudentMonth({ ...HEAVY_STUDENT, notesCacheHitRate: 0.9, notesIntervalMs: 120_000 });
  assert.equal(notesFixedOnly.meetsHouseMargin, false);
  // And fixing only the lane leaves the token spend untouched — it is the RAISED
  // CAP absorbing that, not the pipeline having got any cheaper.
  const laneFixedOnly = modelStudentMonth({ ...HEAVY_STUDENT, recorder: "ios-parakeet" });
  assert.equal(laneFixedOnly.meetsHouseMargin, false);
  assert.equal(laneFixedOnly.meteredTokens, modelStudentMonth(HEAVY_STUDENT).meteredTokens);
  assert.ok(laneFixedOnly.capRatio > 0.9, "still pressed against the ceiling");
});

test("a light student comfortably meets the house margin", () => {
  const light: StudentMonth = {
    ...HEAVY_STUDENT,
    audioHours: 10,
    chatTurnsPerDay: 5,
    dailyNotes: false,
    decks: 20,
    recorder: "ios-ondevice",
    visionImagesPerDeck: 0,
  };
  const report = modelStudentMonth(light);
  assert.equal(report.meetsHouseMargin, true);
  assert.ok(report.capRatio < 1);
});

test("the transcription cap now covers the month it was raised for", () => {
  const report = modelStudentMonth(HEAVY_STUDENT);
  assert.equal(report.transcriptionMinutes, 4_800);
  assert.equal(report.transcriptionCap, 5_000);
  assert.ok(report.transcriptionMinutes <= report.transcriptionCap, "4,800 needed against a 5,000 allowance");
});
