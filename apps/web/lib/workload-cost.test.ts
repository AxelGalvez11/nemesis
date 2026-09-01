import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  APP_STORE_SMALL_BUSINESS_RATE,
  APP_STORE_STANDARD_RATE,
  CACHE_HIT_WEIGHT,
  CAP_EXHAUSTION,
  completionUsd,
  freeCeilingUsd,
  HEAVY_STUDENT,
  HOUSE_MARGIN,
  ingestionUsd,
  LIGHT_STUDENT,
  LIVE_MODEL_PRICES,
  marginFor,
  MATERIAL_CHAR_LIMIT,
  MEASUREMENT_STATE,
  meteredTokens,
  modelStudentMonth,
  NEMESIS_ANNUAL_MONTHLY_EQUIVALENT_USD,
  NEMESIS_ANNUAL_USD,
  NEMESIS_MONTHLY_USD,
  netAnnualRevenuePerMonthUsd,
  netAppleRevenueUsd,
  netRevenueUsd,
  NORMAL_STUDENT,
  OTHER_COGS_USD,
  planCapInversions,
  PLANS,
  POWER_STUDENT,
  PRICE_REV,
  RATES,
  RECORDING_NOTE_TRANSCRIPT_CHARS,
  RETIRED_RATES,
  SCENARIOS,
  syntheticProviders,
  unmeteredLanguageBurn,
  type Channel,
} from "./workload-cost";

const repoFile = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");

/**
 * The same file with its comments removed.
 *
 * 🔴 A COPY GUARD THAT READS COMMENTS MATCHES ITSELF. The first run of the
 * lecture-transcription check below failed on step-upgrade.tsx because that
 * file's own header explains that lecture transcription was removed — the guard
 * found the words it was looking for in the sentence saying they are gone. What
 * a customer reads is the code, not the commentary.
 */
const customerText = (path: string) => repoFile(path)
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/(^|[^:])\/\/.*$/gm, "$1 ");

/** The body of one SQL function, so a check about that function cannot be
 *  satisfied (or broken) by something else in the same migration. */
function sqlFunctionBody(source: string, name: string): string {
  const start = source.indexOf(`FUNCTION public.${name}`);
  if (start < 0) throw new Error(`${name} not found`);
  const end = source.indexOf("$$;", start);
  if (end < 0) throw new Error(`${name} has no terminator`);
  return source.slice(start, end);
}
const round = (value: number, places: number) => Math.round(value * 10 ** places) / 10 ** places;

// ── One registry ─────────────────────────────────────────────────────────────

test("🔴 every provider rate comes from ONE table", () => {
  // The failure this replaces: workload-cost.ts, chat-economics.ts, cost-report.ts
  // and _shared/voice-cost.ts each held their own rates and two of them still
  // priced a provider the product had stopped using.
  const source = repoFile("apps/web/lib/workload-cost.ts");
  assert.match(source, /from "\.\/provider-costs"/, "the model must read the registry");
  // No rate literal may be redeclared here. A number followed by a per-unit name
  // is what a rate looks like; the registry is the only place they may live.
  assert.doesNotMatch(source, /USD_PER_HOUR\s*=\s*\{/, "no second audio rate table");
  assert.doesNotMatch(source, /SEARCH_UNIT_COST_USD\s*=/, "no second search rate");

  const economics = repoFile("apps/web/lib/workspace/chat-economics.ts");
  assert.match(economics, /from "@\/lib\/provider-costs"/, "chat-economics must read the registry too");
});

test("live model prices still match the valve's canonical price list", () => {
  const source = repoFile("supabase/functions/_shared/llm-cost.ts");
  assert.match(source, new RegExp(`PRICE_REV = "${PRICE_REV}"`), "price revision drifted");
  for (const [model, price] of Object.entries(LIVE_MODEL_PRICES)) {
    const line = new RegExp(
      `"${model}":\\s*\\{\\s*cachedInputPerM:\\s*${price.cachedInputPerM},\\s*inputPerM:\\s*${price.inputPerM},\\s*outputPerM:\\s*${price.outputPerM}`,
    );
    assert.match(source, line, `${model} price drifted from _shared/llm-cost.ts`);
  }
});

test("every mirrored rate names a file that actually exists and still says so", () => {
  for (const rate of RATES.filter((candidate) => candidate.basis === "mirrored")) {
    const source = repoFile(rate.source);
    // The bare number has to appear in the file it claims to mirror. Crude, and
    // the only check that fails when one side is edited and the other is not.
    assert.match(
      source,
      new RegExp(String(rate.usd).replace(".", "\\.")),
      `${rate.provider}/${rate.service} claims to mirror ${rate.source}, which no longer contains ${rate.usd}`,
    );
  }
});

test("the cache weight matches the meter in the valve", () => {
  const source = repoFile("supabase/functions/nemesis-llm/index.ts");
  assert.match(source, new RegExp(`CACHE_HIT_WEIGHT = ${CACHE_HIT_WEIGHT}`));
});

test("🔴🔴🔴 the meter is AWAITED, because a margin you cannot see is a margin you do not have", () => {
  // Production, 2026-08-31: `usage_events` and `usage_counters` had recorded nothing
  // since 2026-08-20 while the same function returned 200 on chat completions the whole
  // time, and `device_keys.last_used_at` had stopped on 2026-08-27. Reads worked; every
  // write nobody awaited was cut when the isolate was torn down after the response.
  //
  // 🔴 IT IS NOT AN ANALYTICS BUG. The same call increments the daily and monthly caps,
  // so for eleven days the wall behind this plan was not counting — the ceiling in this
  // file's own `CAP_EXHAUSTION` scenario was theoretical.
  //
  // Calibration: wrap either `recordUsage` call in `keepAlive(...)` again and this
  // reddens alone.
  const source = repoFile("supabase/functions/nemesis-llm/index.ts");
  assert.ok(!/keepAlive\(recordUsage/.test(source), "the student meter is fire-and-forget again");
  assert.equal((source.match(/await recordUsage\(/g) ?? []).length, 2, "both the streamed and the plain path must await the meter");
  assert.match(source, /async flush\(\)/, "the streamed meter runs in a flush the stream does not wait for");
  assert.ok(!/void maybeWarnCap/.test(source), "a cap warning fires on one tick only, so a dropped one is gone");
  assert.ok(!/void admin\.from\('device_keys'\)/.test(source), "last_used_at is fire-and-forget again");
});

test("the note pass runs once per recording, over the whole transcript", () => {
  const source = repoFile("packages/shared/src/recording-note.ts");
  assert.match(source, new RegExp(`RECORDING_NOTE_TRANSCRIPT_CHARS = ${RECORDING_NOTE_TRANSCRIPT_CHARS / 1000}_000`));
});

test("🔴 the study material clip cannot drift, because there is only one of it", () => {
  const source = repoFile("apps/web/lib/workspace/study-artifact-content.ts");
  assert.match(source, /import \{ MATERIAL_CHAR_LIMIT \} from "@\/lib\/workload-cost"/,
    "the generator must import the cap, not redeclare it");
  assert.doesNotMatch(source, /const MATERIAL_CHAR_LIMIT\s*=/,
    "a second definition is exactly what this test exists to prevent");
  assert.equal(typeof MATERIAL_CHAR_LIMIT, "number");
});

// ── Brave, not Tavily ────────────────────────────────────────────────────────

test("web search is priced as Brave, and no retired search provider is in the model", () => {
  const brave = RATES.find((rate) => rate.provider === "brave");
  assert.ok(brave, "Brave must be in the registry");
  assert.equal(brave.usd, 0.005);
  const registry = repoFile("apps/web/lib/provider-costs.ts");
  for (const retired of ["tavily", "linkup", "serper"]) {
    assert.doesNotMatch(registry.toLowerCase(), new RegExp(`provider: "${retired}"`), `${retired} must not be a Nemesis provider`);
  }
});

test("🔴🔴🔴 the search valve CALLS Brave and nothing else — the cost model is not the wiring", () => {
  // Owner, 2026-09-01: *"make sure tavily is not plugged into nemesis, only brave for
  // websearch please."*
  //
  // 🔴🔴 THE TEST ABOVE PASSED THE WHOLE TIME TAVILY WAS BILLING, AND THAT IS WHY THIS
  // ONE EXISTS. `provider-costs.ts` has carried tavily/linkup as RETIRED since long
  // before anything stopped calling them — a price list is a description, and the code
  // that opens a socket is the fact. `nemesis-search` was still reading TAVILY_API_KEY
  // and posting to api.tavily.com on every search Brave declined. A guard that reads the
  // registry can only ever tell you what someone wrote down.
  // 🔴 COMMENTS STRIPPED. The valve's own header now NAMES the two keys, to tell whoever
  // reads it next to delete them from the function's secrets. A guard that cannot tell a
  // warning about a provider from a call to one would redden on its own tombstone.
  const valve = repoFile("supabase/functions/nemesis-search/index.ts")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  for (const gone of ["tavily.com", "TAVILY_API_KEY", "LINKUP_API_KEY", "linkup.so", "FIRECRAWL_API_KEY", "api.firecrawl.dev"]) {
    assert.ok(!valve.includes(gone), `the search valve reaches ${gone} again`);
  }
  // The search route asks exactly one provider. Firecrawl keeps its scrape role — reading
  // one named URL is a different job — so it is pinned to that and away from search.
  assert.match(valve, /const brave = await braveSearch\(body\)/, "Brave is no longer the search provider");
  assert.ok(!/await (tavily|linkup|firecrawl)Search\(/i.test(valve), "a second search provider is wired in again");
  // 🔴 THE CONFIG CHECK BELONGS TO SEARCH ALONE. It was one pooled "is ANY provider key set"
  // question, which a server holding the wrong half of its configuration passed before failing
  // the working half. Reading a page needs no key at all now, so a missing BRAVE_API_KEY must
  // not refuse a scrape.
  assert.match(
    valve,
    /if \(route === '\/v2\/search' && !BRAVE_KEY\) \{/,
    "the search key check is no longer scoped to search — a missing Brave key now breaks page reading too",
  );
  // 🔴 AND A PRICE FOR A PROVIDER NOTHING CAN CALL IS AN INVITATION TO RE-WIRE IT.
  assert.match(valve, /const UNIT_USD: Record<string, number> = \{ brave: 0\.005, direct: 0 \}/, "the valve prices a provider it cannot call");
});

test("🔴🔴 removing Firecrawl removed the PROVIDER, not the job — a link is still readable", () => {
  // Owner, 2026-09-01: *"also remove firecrawl too, i only want brave (its cheap)."* Firecrawl was
  // the SCRAPE provider — 153 of its 156 recorded calls — and Brave's llm/context cannot fetch a
  // URL you name. Deleting it without a replacement would have deleted "paste a link and Nemesis
  // reads it", which nobody asked for.
  const valve = repoFile("supabase/functions/nemesis-search/index.ts");
  assert.match(valve, /const page = await readPage\(String\(body\.url \?\? ''\)\)/, "the scrape route stopped reading the page");
  // 🔴 THE WIRE SHAPE IS A CONTRACT WITH OUR OWN APPS, and outlives the vendor it came from:
  // apps/web/app/api/notebooks/extract/url/route.ts reads exactly these two fields.
  assert.match(valve, /markdown: page\.text/, "the notebook reader's field is gone");
  assert.match(valve, /metadata: \{ sourceURL: page\.url, title: page\.title \}/, "the source's title is gone");
});

test("🔴🔴🔴 fetching a user's URL from our own network is guarded against SSRF", () => {
  // The cost of doing the fetching ourselves. While Firecrawl did it, a hostile URL left THEIR
  // network; now it leaves ours, from inside the platform, where 169.254.169.254 hands out the
  // machine's credentials. The behaviour is pinned in Deno beside the code (read-page.test.ts);
  // this pins that the guard is WIRED — a perfect `safeTarget` nothing calls is worth nothing.
  const reader = repoFile("supabase/functions/nemesis-search/read-page.ts");
  assert.match(reader, /export function safeTarget/, "the SSRF guard is gone");
  assert.match(reader, /redirect: 'manual'/, "redirects are followed automatically again — a 302 to a private address then goes unchecked");
  assert.match(reader, /const next = safeTarget\(new URL\(location, target\.url\)\.toString\(\)\)/, "redirect hops are no longer re-checked");
  assert.match(reader, /if \('reason' in target\)/, "readPage stopped checking its target at all");
});

test("🔴 a query Brave will not take is TRIMMED, never dropped", () => {
  // The cost of having no fallback: Brave refuses >400 chars or >50 words, and that used
  // to be Tavily's cue. With one provider the only outcomes are a shortened search or
  // none, so the valve must trim. `braveFit`'s own behaviour is pinned in Deno beside it
  // (brave.test.ts); this pins that the valve actually calls it, which no Deno test can.
  const valve = repoFile("supabase/functions/nemesis-search/index.ts");
  assert.match(valve, /const query = braveFit\(asked\)/, "the valve stopped trimming over-long queries");
  assert.ok(!/if \(!braveCanAnswer\(query\)\) \{\s*return null/.test(valve), "an over-long query is silently dropped again");
});

test("the retired audio providers are costable but are NOT in the forward model", () => {
  // AssemblyAI streaming tokens are still minted by live-audio/token, so a
  // historical usage row must still be priceable. It must not be able to end up
  // inside a Nemesis margin.
  assert.ok(RETIRED_RATES.some((rate) => rate.service === "assemblyai_streaming"));
  assert.ok(RETIRED_RATES.some((rate) => rate.service === "groq_whisper_turbo"));
  for (const rate of RATES) {
    assert.doesNotMatch(rate.service, /assembly|groq/i, `${rate.service} is retired and must not be canonical`);
  }
});

// ── No lecture transcription anywhere ────────────────────────────────────────

/** Every surface that could advertise an allowance, plus the phone paywall. */
const CUSTOMER_COPY_FILES = [
  "apps/web/app/pricing/page.tsx",
  "apps/web/components/workspace/shell/billing-settings.tsx",
  "apps/web/components/workspace/onboarding/step-upgrade.tsx",
  "landing/app/pricing/page.tsx",
  "landing/components/PricingPlans.tsx",
  // The phone paywall counts. It said "20 recording hours a month" rather than
  // "20 hours of lecture recording", which is why a search for the web wording
  // missed it once and left the phone advertising the old allowance -- hence the
  // deliberately loose patterns below rather than a fixed phrase.
  "apps/mobile/src/lib/purchases-logic.ts",
] as const;

test("🔴 no customer-facing surface advertises lecture recording hours any more", () => {
  // THE INVERSION OF THE OLD GUARD. This test used to assert that every advertised
  // recording allowance MATCHED a plan cap. Nemesis no longer sells lecture or
  // meeting transcription, so the correct assertion is that no such claim exists.
  //
  // `hours?` and `minutes?` are SINGULAR-TOLERANT on purpose: the previous version
  // required the plural, so "1 hour of lecture recording" would have matched
  // neither branch and shipped completely unchecked.
  for (const path of CUSTOMER_COPY_FILES) {
    const source = customerText(path);
    for (const [claim] of source.matchAll(/(\d[\d,]*)\s+(?:\w+\s+){0,3}(?:hours?|minutes?)\s+of\s+(?:lecture|meeting|recording)/gi)) {
      assert.fail(`${path} still advertises "${claim}"`);
    }
    for (const [claim] of source.matchAll(/(?:lecture|meeting)\s+(?:recording|transcription)/gi)) {
      assert.fail(`${path} still names "${claim}"`);
    }
  }
});

test("🔴 the plan shape has no transcription meter to cost", () => {
  // A `transcriptionMinutes` field is how the retired product gets priced back
  // into a margin without anyone deciding to.
  for (const plan of Object.values(PLANS)) {
    assert.ok(!("transcriptionMinutes" in plan), `${plan.code} still carries a transcription meter`);
  }
  const source = repoFile("apps/web/lib/workload-cost.ts");
  assert.doesNotMatch(source, /transcriptionMinutes:/, "no plan may declare lecture minutes");
});

// ── Conversational voice ─────────────────────────────────────────────────────

test("conversational voice is metered separately, and generously enough to be real", () => {
  assert.equal(PLANS.nemesis.voiceSeconds, 18_000, "5 hours");
  assert.equal(PLANS.free.voiceSeconds, 900, "15 minutes");
  // The migration and the shared module have to agree with this table.
  const migration = repoFile("supabase/migrations/20260818120000_one_paid_plan_nemesis.sql");
  assert.match(migration, /'nemesis',\s*'voice_seconds_month_limit',\s*'18000'/);
  assert.match(migration, /'free',\s*'voice_seconds_month_limit',\s*'900'/);
  const shared = repoFile("packages/shared/src/plan.ts");
  assert.match(shared, /NEMESIS_VOICE_SECONDS_MONTH = 18_000/);
  assert.match(shared, /FREE_VOICE_SECONDS_MONTH = 900/);
});

test("the voice meter is actually enforced, not merely declared", () => {
  // 🔴 A LIMIT WITH NO RESERVATION PATH IS NOT A LIMIT. This is the failure shape
  // the product has hit before: an entitlement row nothing reads.
  const migration = repoFile("supabase/migrations/20260818120000_one_paid_plan_nemesis.sql");
  assert.match(migration, /FUNCTION public\.consume_voice_seconds/, "the RPC must exist");
  const speak = repoFile("supabase/functions/nemesis-speak/index.ts");
  assert.match(speak, /consume_voice_seconds/, "the paying lane must call it");
  // BEFORE the provider call: metering after the money is spent measures nothing.
  //
  // 🔴 CALIBRATED TWICE, AND WRONG BOTH FIRST TIMES.
  //   1. It compared two indexOf results directly, so DELETING the meter made
  //      the first one -1 and the ordering check passed.
  //   2. With an existence check added it STILL passed, because
  //      `chargeVoiceSeconds(userId` matches the function DEFINITION, which sits
  //      above the provider call whether or not anything ever calls it.
  // It now looks for the awaited CALL. Removing the call fails this test.
  const meteredAt = speak.indexOf("await chargeVoiceSeconds(");
  const providerAt = speak.indexOf("https://api.x.ai/v1/tts");
  assert.ok(meteredAt >= 0, "the paying lane must actually call the meter");
  assert.ok(providerAt >= 0, "and must actually call the provider");
  assert.ok(meteredAt < providerAt, "the meter must run before the provider call");
});

test("the voice counter is a calendar month, like every other monthly counter", () => {
  // 🔴 SCOPED TO THE FUNCTION BODY. The first version searched the whole
  // migration for `current_period_end` near "voice", which matched
  // `resolve_user_plan` further up the same file — a guard that fails on an
  // unrelated line is a guard nobody can act on.
  const migration = repoFile("supabase/migrations/20260818120000_one_paid_plan_nemesis.sql");
  const body = sqlFunctionBody(migration, "consume_voice_seconds");
  assert.match(body, /date_trunc\('month', current_date\)/, "the window is the calendar month");
  assert.doesNotMatch(body, /current_period_end/, "a counter window may never follow a billing cycle");
  // An annual subscriber gets a month's allowance a month, not twelve up front.
  assert.doesNotMatch(body, /interval '1 year'|\* 12/, "no annual multiplier anywhere near a counter");
});

// ── The two plans ────────────────────────────────────────────────────────────

test("there are two plans and Free never out-runs Nemesis", () => {
  assert.deepEqual(Object.keys(PLANS).sort(), ["free", "nemesis"]);
  assert.deepEqual(
    planCapInversions().map((row) => `${row.meter}: ${row.dearer} ${row.dearerValue} < ${row.cheaper} ${row.cheaperValue}`),
    [],
    "Free is offering more than Nemesis on some meter — fix plan_entitlements, not this test",
  );
});

test("Free is the real product, not a crippled one", () => {
  // 🔴 THE OWNER'S RULE: make Free SHORTER, not stupid. Free must get the same
  // reasoning and the same Canvas; what it gets less of is the month.
  const source = repoFile("apps/web/lib/workload-cost.ts");
  assert.doesNotMatch(source, /premiumAnswerLane/, "there is no worse answer lane for free users");
  assert.ok(PLANS.free.monthlyTokens > 0 && PLANS.free.voiceSeconds > 0);
});

test("paid keeps roughly 25M weighted tokens and a generous search allowance", () => {
  assert.equal(PLANS.nemesis.monthlyTokens, 25_000_000);
  assert.equal(PLANS.nemesis.searchMonthly, 150);
  const migration = repoFile("supabase/migrations/20260818120000_one_paid_plan_nemesis.sql");
  assert.match(migration, /'nemesis_llm_monthly_tokens',\s*'25000000'/);
  assert.match(migration, /'nemesis_search_monthly_units',\s*'150'/);
});

// ── Prices ───────────────────────────────────────────────────────────────────

test("the prices are $19.99 and $199.99", () => {
  assert.equal(NEMESIS_MONTHLY_USD, 19.99);
  assert.equal(NEMESIS_ANNUAL_USD, 199.99);
  const shared = repoFile("packages/shared/src/plan.ts");
  assert.match(shared, /NEMESIS_MONTHLY_CENTS = 1_999/);
  assert.match(shared, /NEMESIS_ANNUAL_CENTS = 19_999/);
});

test("a free plan is charged nothing, so the processor takes nothing", () => {
  assert.equal(netRevenueUsd(0), 0);
  assert.equal(netRevenueUsd(PLANS.free.priceUsd), 0);
});

test("🔴 annual pays the flat processing fee ONCE a year, not twelve times", () => {
  // Modelling annual as twelve monthly charges erases the one structural
  // advantage it has. $0.30 once a year is 2.5 cents a month.
  const monthlyNet = netRevenueUsd(NEMESIS_MONTHLY_USD);
  const annualNetPerMonth = netAnnualRevenuePerMonthUsd();
  assert.equal(monthlyNet, round(19.99 - (19.99 * 0.029 + 0.3), 2));
  assert.equal(round(NEMESIS_ANNUAL_MONTHLY_EQUIVALENT_USD, 2), 16.67);
  // Twelve months of monthly nets more cash; annual nets less per month but is
  // collected up front. Both facts have to survive.
  assert.ok(monthlyNet * 12 > netRevenueUsd(NEMESIS_ANNUAL_USD));
  assert.ok(annualNetPerMonth < monthlyNet);
  // The flat fee per month is 12x smaller on annual.
  assert.ok(round(0.3 / 12, 3) === 0.025);
});

test("the App Store cut is stated, at both rates", () => {
  assert.equal(APP_STORE_SMALL_BUSINESS_RATE, 0.15);
  assert.equal(APP_STORE_STANDARD_RATE, 0.3);
  assert.equal(netAppleRevenueUsd(19.99, 0.15), 16.99);
  assert.equal(netAppleRevenueUsd(19.99, 0.3), 13.99);
});

// ── Costing a month ──────────────────────────────────────────────────────────

test("a document that reads locally costs nothing to read", () => {
  assert.equal(ingestionUsd({ cacheHits: 0, geminiPages: 0, llamaParsePages: 0, locallyExtractedPages: 300, mistralPages: 0, totalPages: 300 }), 0);
});

test("only the escalated pages are paid for", () => {
  const report = modelStudentMonth(NORMAL_STUDENT);
  assert.equal(report.localExtractionShare, 0.85);
  const parserUsd = report.lines
    .filter((line) => ["gemini", "llamaparse", "mistral"].includes(line.provider))
    .reduce((total, line) => total + line.usd, 0);
  // 500 pages, 15% escalated = 75 paid pages, not 500.
  const everyPageThroughLlama = 500 * 0.00375;
  assert.ok(parserUsd < everyPageThroughLlama, `${parserUsd} should be well under ${everyPageThroughLlama}`);
});

test("every scenario names every provider, so nothing goes missing from a margin", () => {
  for (const month of SCENARIOS) {
    const report = modelStudentMonth(month);
    const named = new Set(report.lines.map((line) => line.provider));
    for (const provider of ["deepseek", "gemini", "mistral", "llamaparse", "brave", "xai_stt", "xai_tts", "vercel", "supabase"] as const) {
      assert.ok(named.has(provider), `${month.label} is missing ${provider}`);
    }
  }
});

test("the scenarios rise in cost, light through cap exhaustion", () => {
  // 🔴 THE LANGUAGE LEARNER IS OUT OF THE LADDER ON PURPOSE (2026-08-31). It is not a heavier
  // student, it is the SAME student talking to a different provider: the heavy profile with its
  // voice minutes moved onto Azure's lane, which costs several times xAI's for the same minute.
  // Sorting it into a rising ladder would be claiming a rank it does not have.
  const ladder = SCENARIOS.filter((month) => month.label !== "language learner");
  const costs = ladder.map((month) => modelStudentMonth(month).cogsBeforePaymentUsd);
  for (let i = 1; i < costs.length; i += 1) {
    assert.ok(costs[i]! > costs[i - 1]!, `${ladder[i]!.label} must cost more than ${ladder[i - 1]!.label}`);
  }
  // And it must land between the profile it is built from and the ceiling: same work, dearer voice.
  const heavy = modelStudentMonth(SCENARIOS.find((m) => m.label === "heavy")!).cogsBeforePaymentUsd;
  const language = modelStudentMonth(SCENARIOS.find((m) => m.label === "language learner")!).cogsBeforePaymentUsd;
  assert.ok(language > heavy, "the language lane is supposed to cost MORE than the same month on the canvas lane");
});

test("🔴🔴🔴 the cap-exhaustion row spends NOTHING on Azure, because Azure has no cap to exhaust", () => {
  // The row means "every meter at its cap". `/api/speech/token` mints a ten-minute Azure token to
  // any signed-in browser and counts nothing, so there is no meter to put at a cap — and a figure
  // invented for it makes the row read as a bound when it is a guess. The first attempt did exactly
  // that: an arbitrary 10,000 phrases put $25 of Azure in the ceiling and reported a $24.91 loss
  // that no entitlement could ever have produced.
  const ceiling = modelStudentMonth(SCENARIOS.find((m) => m.label === "cap exhaustion")!);
  const azure = ceiling.lines.filter((l) => l.provider.startsWith("azure")).reduce((sum, l) => sum + l.usd, 0);
  assert.equal(azure, 0, "the ceiling is claiming a bound on the one lane that has none");
});

test("🔴🔴 the unmetered lane is reported as a RATE, and it is not small", () => {
  // The honest shape for something unbounded. If this ever becomes metered, this test should be
  // replaced by a cap in the ceiling above — not deleted.
  const burn = unmeteredLanguageBurn();
  assert.ok(burn.ttsPerHourUsd > 0.5, "continuous dialect speech should not read as free");
  assert.equal(burn.scoringPerHourUsd, 1.3, "assessment is real-time STT plus the prosody add-on");
  assert.ok(burn.bothPerDayUsd > 40, `one account running both all day is ${burn.bothPerDayUsd}, which is the number that matters`);
});

test("🔴 every scenario is flagged synthetic, because there is no paying cohort", () => {
  // 🔴 GEMINI CAME OFF THIS LIST AND THAT IS A REAL CHANGE, NOT A LOOSENED TEST.
  // Its rate was `assumed` at $0.002 and is now `published` at $0.0000258 --
  // 258 input tokens at Flash-Lite's rate -- and #681 gave it an actual meter in
  // the parse worker. Infrastructure stays synthetic: Vercel and Supabase are
  // still amortised guesses, so every scenario is still flagged.
  // 🔴 AZURE CAME BACK OFF THIS LIST THE SAME DAY IT WENT ON. It was added `assumed` when the owner
  // pointed out the model had no Azure line at all, then read off the price page hours later at his
  // request — neural TTS $16 per million characters, and assessment $1.30 an hour (real-time STT at
  // $1.00 plus the $0.30 prosody add-on, which is why the planning figure of $1.00 was 30% light).
  // Infrastructure stays: Vercel and Supabase are still amortised guesses.
  assert.deepEqual(syntheticProviders().sort(), ["supabase", "vercel"]);
  for (const month of SCENARIOS) {
    assert.equal(modelStudentMonth(month).synthetic, true, `${month.label} must declare itself synthetic`);
  }
  assert.equal(MEASUREMENT_STATE.payingSubscribers, 0);
  assert.ok(MEASUREMENT_STATE.instrumentationGaps.length >= 3);
});

// ── Margins ──────────────────────────────────────────────────────────────────

const CHANNELS: readonly Channel[] = [
  "web_monthly", "web_annual", "ios_monthly_sbp", "ios_annual_sbp", "ios_monthly_standard", "ios_annual_standard",
];

test("normal use is comfortably profitable on every channel", () => {
  for (const channel of CHANNELS) {
    const margin = marginFor(channel, NORMAL_STUDENT);
    assert.ok(margin.contributionPercent > 50, `${channel} normal: ${margin.contributionPercent}%`);
  }
});

test("monthly and annual both clear the house rule at normal use", () => {
  for (const channel of ["web_monthly", "web_annual"] as const) {
    const margin = marginFor(channel, NORMAL_STUDENT);
    assert.ok(margin.contributionPercent / 100 >= HOUSE_MARGIN, `${channel}: ${margin.contributionPercent}%`);
  }
});

test("a realistic power user is still profitable on web", () => {
  for (const channel of ["web_monthly", "web_annual"] as const) {
    const margin = marginFor(channel, POWER_STUDENT);
    assert.ok(margin.contributionUsd > 0, `${channel} power: $${margin.contributionUsd}`);
  }
});

test("🔴 cap exhaustion is where the money goes, and the model says so out loud", () => {
  // Not a forecast. The point is that the answer exists and is a number rather
  // than a surprise on an invoice.
  const web = marginFor("web_monthly", CAP_EXHAUSTION);
  const annual = marginFor("web_annual", CAP_EXHAUSTION);
  assert.ok(web.cogsUsd > marginFor("web_monthly", HEAVY_STUDENT).cogsUsd);
  // Annual carries less monthly revenue, so if either goes negative first it is
  // annual. Asserting the ORDER rather than the sign keeps this true whichever
  // way the rates move.
  assert.ok(annual.contributionUsd < web.contributionUsd);
});

test("a free account at its own caps costs about a dollar and change", () => {
  const cost = freeCeilingUsd();
  assert.ok(cost > OTHER_COGS_USD, "it must cost more than the flat platform line");
  assert.ok(cost < 3, `a free account at cap costs $${cost}`);
});

// ── Arithmetic ───────────────────────────────────────────────────────────────

test("token costing and metering agree with the valve", () => {
  const split = { cachedInput: 1_000_000, input: 1_000_000, output: 250_000 };
  assert.equal(meteredTokens(split), 1_000_000 + 100_000 + 250_000);
  assert.equal(completionUsd("deepseek-v4-flash", split), round(0.14 + 0.0028 + 0.07, 6));
  assert.equal(completionUsd("not-a-model", split), null);
});

test("the light scenario is genuinely light", () => {
  const light = modelStudentMonth(LIGHT_STUDENT);
  const heavy = modelStudentMonth(HEAVY_STUDENT);
  assert.ok(light.variableUsd < heavy.variableUsd / 4);
});

console.log("workload-cost.test.ts OK");
