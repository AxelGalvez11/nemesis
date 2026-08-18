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

import {
  DEFAULT_VENDOR_PARSE_DAILY_CAP,
  PRICE_REV,
  UNIT_PRICE_USD,
  providerOfParserVersion,
  unitCostUsd,
  vendorParseDailyCap,
} from "./ai-spend";

test("a page of paid parsing costs what the rate card says", () => {
  // Mistral OCR 4, $4 per 1,000 pages. A 24-page handout is 9.6 cents.
  assert.equal(unitCostUsd("mistral_ocr", 24).usd, 0.096);
  assert.equal(unitCostUsd("mistral_ocr", 24).priced, true);
  // LlamaParse cost_effective, 3 credits a page at $1.25 per 1,000 credits.
  assert.equal(unitCostUsd("llamaparse", 57, "llamaparse/cost_effective@latest").usd, 0.213_75);
});

test("🔴 the price the parser was written against and the price the ledger charges are the same", () => {
  // The defect this pins: `llamaparse-ocr.ts` documented cost_effective as "3 credits/page
  // (~$0.00375)" while the ledger charged $0.001, and nothing connected the two numbers. A parser
  // whose own comment disagrees with the bill is a parser nobody can cost.
  const parser = readFileSync(new URL("../notebooks/llamaparse-ocr.ts", import.meta.url), "utf8");
  const tier = /LLAMA_DEFAULT_TIER = "([a-z_]+)"/.exec(parser)?.[1] ?? "";
  assert.ok(tier.length > 0, "the default tier must still be readable from the parser");
  const perPage = unitCostUsd("llamaparse", 1, `llamaparse/${tier}@latest`);
  assert.equal(perPage.basis, "exact", "the tier we actually send must be priced exactly");
  assert.equal(perPage.usd, 0.00375);
});

test("🔴 a tier we recorded is priced EXACTLY; one we did not is priced at a CEILING", () => {
  const known = unitCostUsd("llamaparse", 10, "llamaparse/premium@2026-06");
  assert.equal(known.basis, "exact");
  assert.equal(known.usd, 0.75, "60 credits a page is not the default tier's 3");

  const unknown = unitCostUsd("llamaparse", 10, "llamaparse/some_new_tier@latest");
  assert.equal(unknown.basis, "ceiling");
  assert.equal(unknown.priced, true, "an unrecognised tier is still billed, not free");
});

test("🔴🔴 the Mistral alias prices at the DEAREST generation, never the cheapest", () => {
  // Every real production row is `mistral/mistral-ocr-latest`, because the vendor echoes the alias
  // back instead of resolving it. Guessing the cheap end would under-report the bill fourfold, and
  // a bill that reads low is a bill that gets believed.
  const alias = unitCostUsd("mistral_ocr", 100, "mistral/mistral-ocr-latest");
  assert.equal(alias.basis, "ceiling", "an alias is an estimate and must say so");
  assert.equal(alias.usd, 0.4, "$4 per 1,000 pages, the current generation");

  // A concrete version, if the vendor ever starts returning one, is priced for what it is.
  const pinned = unitCostUsd("mistral_ocr", 100, "mistral/mistral-ocr-2503");
  assert.equal(pinned.basis, "exact");
  assert.equal(pinned.usd, 0.1);
  assert.ok(alias.usd! > pinned.usd!, "the ceiling must never sit below a generation we know of");
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
  assert.match(PRICE_REV, /^\d{4}-\d{2}-\d{2}[a-z]?$/);
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
