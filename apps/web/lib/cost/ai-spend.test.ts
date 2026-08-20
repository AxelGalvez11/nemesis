/**
 * The cost ledger, and the two ways a cost system lies.
 *
 * 🔴 THE FIRST IS REPORTING AN UNKNOWN PROVIDER AS FREE. A price list that returns 0 for a name it
 * does not know makes every new provider invisible until somebody reads an invoice — which is
 * exactly the failure `llm-cost.ts` guards against with `priced: false`, and this file inherits it.
 * 🔴 THE SECOND IS EDITING A PRICE IN PLACE. A re-price that rewrote history would make last
 * month's cost depend on this month's rate card, so `PRICE_REV` is stamped on every row.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { usdFor } from "@/lib/provider-costs";

import {
  DEFAULT_VENDOR_PARSE_DAILY_CAP,
  PRICE_REV,
  UNIT_PRICE_USD,
  providerOfParserVersion,
  unitCostUsd,
  vendorParseDailyCap,
} from "./ai-spend";

test("a page of paid parsing costs what the rate card says", () => {
  // Mistral: $1 per 1,000 pages. A 24-page drug chart is 2.4 cents.
  assert.equal(unitCostUsd("mistral_ocr", 24).usd, 0.024);
  assert.equal(unitCostUsd("mistral_ocr", 24).priced, true);
  // 🔴 LLAMAPARSE IS 0.00375, NOT 0.001, AND THIS LINE USED TO ASSERT 0.001.
  // It read the balanced tier off the price list; `LLAMA_DEFAULT_TIER` sends
  // `cost_effective`, which is 3 credits a page. A 57-page deck is 21 cents, not
  // 5.7 -- this lane was understated by 3.75x everywhere it was quoted.
  assert.equal(unitCostUsd("llamaparse", 57).usd, 0.21375);
});

test("🔴 an unknown provider reports as UNPRICED, never as free", () => {
  const result = unitCostUsd("some_new_vendor", 1_000);
  assert.equal(result.usd, null);
  assert.equal(result.priced, false);
});

test("negative and nonsense unit counts cost nothing rather than throwing", () => {
  assert.equal(unitCostUsd("mistral_ocr", -5).usd, 0);
  assert.equal(unitCostUsd("mistral_ocr", Number.NaN).usd, 0);
});

test("vision is priced small enough that the rounding has to be fine", () => {
  // A lecture's eleven figures is a fraction of a cent. Rounding at six decimals would quantise
  // the common case into noise, which is why `llm-cost.ts` uses nine and so does this.
  const eleven = unitCostUsd("gemini_vision", 11).usd ?? 0;
  assert.ok(eleven > 0, "eleven images must not round to zero");
  assert.ok(eleven < 0.001);
});

test("🔴 who read a document is read off the provenance column, not guessed", () => {
  assert.equal(providerOfParserVersion("mistral/mistral-ocr-latest"), "mistral_ocr");
  assert.equal(providerOfParserVersion("llamaparse/balanced@2026-01"), "llamaparse");
  // Our own reader is stamped `extract-YYYY-MM-DD` and nobody was billed for it.
  assert.equal(providerOfParserVersion("extract-2026-08-13"), null);
  assert.equal(providerOfParserVersion(undefined), null);
});

test("🔴 the price revision is stamped, so a re-price cannot rewrite history", () => {
  assert.match(PRICE_REV, /^\d{4}-\d{2}-\d{2}$/);
  const source = readFileSync(new URL("./ai-spend.ts", import.meta.url), "utf8");
  assert.match(source, /price_rev: PRICE_REV/, "every row must carry the revision it was priced at");
});

test("🔴 a spend row never consumes the learner's own allowance", () => {
  // `usage_events` serves two ledgers: the learner's meter and our bill. These rows are the second,
  // and a non-zero `cost_credits` would silently spend somebody's entitlement on work they never
  // asked for — a shadow evaluation most obviously.
  const source = readFileSync(new URL("./ai-spend.ts", import.meta.url), "utf8");
  assert.match(source, /cost_credits: 0/);
});

test("the paid parsers have a daily ceiling, and it is switchable", () => {
  assert.equal(vendorParseDailyCap({ VENDOR_PARSE_DAILY_CAP: "5" }), 5);
  assert.equal(vendorParseDailyCap({ VENDOR_PARSE_DAILY_CAP: "0" }), 0, "zero must mean no paid parsing at all");
  assert.equal(vendorParseDailyCap({}), DEFAULT_VENDOR_PARSE_DAILY_CAP);
  assert.equal(vendorParseDailyCap({ VENDOR_PARSE_DAILY_CAP: "nonsense" }), DEFAULT_VENDOR_PARSE_DAILY_CAP);
  // Far above a real day of study, far below what a retry loop could cost.
  assert.ok(DEFAULT_VENDOR_PARSE_DAILY_CAP >= 10 && DEFAULT_VENDOR_PARSE_DAILY_CAP <= 200);
});

test("🔴 past the cap a document is read locally, never refused", () => {
  // The fail-safe direction is the whole point: a cap that made a learner's lecture unreadable
  // would be worse than the bill it prevented.
  const parser = readFileSync(new URL("../notebooks/parse-document.ts", import.meta.url), "utf8");
  assert.match(parser, /vendorAllowed/, "the parser must know about the bound");
  assert.match(
    parser,
    /options\.vendorAllowed === false/,
    "and it must gate only the vendor call, leaving the local lanes to run",
  );

  const migration = readFileSync(
    new URL("../../../../supabase/migrations/20260818T40_vendor_parse_budget.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /and documents < p_daily_cap/, "the cap belongs in the UPDATE's own predicate");
  assert.match(migration, /if p_daily_cap <= 0 then\s*return false/);
});

test("every priced provider has a price and every price has a provider", () => {
  for (const [provider, price] of Object.entries(UNIT_PRICE_USD)) {
    assert.ok(price > 0, `${provider} must have a positive price`);
    assert.equal(unitCostUsd(provider, 1).priced, true);
  }
});

// ── One price list, and only one ─────────────────────────────────────────────
//
// 🔴 THE FAILURE THIS EXISTS FOR ALREADY HAPPENED. This module and
// `lib/provider-costs.ts` each held a full price list, and they disagreed by 77x
// on Gemini vision and 3.75x on LlamaParse. Nothing failed, because each file
// tested itself against its own number. These assert the registry is the source.

test("every priced provider resolves to the registry, not to a local constant", () => {
  assert.equal(UNIT_PRICE_USD.gemini_vision, usdFor("gemini", "gemini-3.5-flash vision", "per_image", 1));
  assert.equal(UNIT_PRICE_USD.llamaparse, usdFor("llamaparse", "cost_effective", "per_page", 1));
  assert.equal(UNIT_PRICE_USD.mistral_ocr, usdFor("mistral", "mistral-ocr", "per_page", 1));
});

test("the two rates that were wrong are pinned to their grounded values", () => {
  // Gemini bills an image as ~258 input tokens, not as an image.
  assert.equal(UNIT_PRICE_USD.gemini_vision, 0.0000258);
  // `cost_effective` -- the tier LLAMA_DEFAULT_TIER actually sends -- is 3 credits/page.
  assert.equal(UNIT_PRICE_USD.llamaparse, 0.00375);
  assert.equal(UNIT_PRICE_USD.mistral_ocr, 0.001);
});

test("a page of vision is worth millionths of a dollar, and does not round to zero", () => {
  // The bug this guards: rounding a real cost to $0.00 makes a provider look free.
  const one = unitCostUsd("gemini_vision", 1);
  assert.equal(one.priced, true);
  assert.ok(one.usd !== null && one.usd > 0, "one image must cost more than nothing");
  // 200 pages of a lecture through vision is still under a cent.
  const lecture = unitCostUsd("gemini_vision", 200);
  assert.ok(lecture.usd !== null && lecture.usd < 0.01);
});
