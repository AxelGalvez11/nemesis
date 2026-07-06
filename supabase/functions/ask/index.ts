// Supabase Edge Function: ask  (IMPLEMENTATION_PLAN.md §7)
//
// The /ask answer engine: intent classify -> entity resolve -> safety classify
// -> retrieve -> generate -> citation enforce -> trace store -> respond (§8).
//
// Safety is layered + deterministic where it matters:
//   - preScreen (regex, pre-LLM)        : emergency/overdose/self-harm/sourcing
//   - classify safety_flags (LLM)       : catches what regex missed
//   - detectViolations (regex, post-LLM): the doc-20 forbidden-string guarantee
//
// Auth: a VERIFIED authenticated user (token checked against the auth server).
// Phase 3 is authenticated-only; guest mode (Supabase anonymous sign-in) is a
// Phase-6 decision. The function uses the service key for catalog reads + the
// trace write, scoping every user-owned read to the VERIFIED user id.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

import { detectSmallTalk, preScreen, suppressEmergencyForGeneralToxicity } from "./safety.ts";
import { isBenignSalvageable, resolveSafety } from "./sanitize.ts";
import { classify } from "./classify.ts";
import { resolveEntities } from "./resolve.ts";
import { retrieve } from "./retrieve.ts";
import { generate } from "./generate.ts";
import { buildReviewedSet, citationMeta, collectSourceTexts, enforceCitations, type RetrievedChunk } from "./citation.ts";
import { attachSupport } from "./support-span.ts";
import { gatherLiveCandidates, liveToChunk } from "./live-sources.ts";
import { rerankChunks } from "./rerank.ts";
import { balanceCitedSlice } from "./cite-balance.ts";
import { buildSubQueries, extractSearchTerms } from "./search-query.ts";
import { espellCorrect } from "../core-source-sync/providers/pubmed.ts";
import { decideNewsGate } from "./news-gate.ts";
import { fetchGoogleNews, type NewsItem } from "../news/news-source.ts";
import { isFabricatedDrugQuery } from "./fabrication.ts";
import { assumptionNote, findTypoCorrections } from "./typo-correct.ts";
import { applyGradeCeiling, fetchStoredEvidenceGrade } from "./evidence-grade.ts";
import { chat, hasLlmKey, llmApiKey } from "./llm.ts";
import { modelFor } from "./model-router.ts";
import { type AnswerStyle, PROMPT_VERSION } from "./prompts.ts";
import { withProfessionalRouting } from "./routing.ts";
import { applyReconToUnderstanding, isConsumerProductOnlyQuery, understandQuery } from "./query-understanding.ts";
import { runWebRecon, type WebReconResult } from "./web-recon.ts";
import { evidenceRole, rateSourceSupport } from "./source-support.ts";
import {
  CONSERVATIVE_FALLBACK_COPY,
  EMERGENCY_COPY,
  FRESH_INFO_COPY,
  GREETING_COPY,
  LAB_DRAFT_REFUSAL_COPY,
  NO_SOURCE_COPY,
  providerPriorityForIntent,
  SOURCING_COPY,
  STANDARD_QUESTIONS,
} from "./templates.ts";
import { detectFreshInfo, detectGeneralAssistant, generalAssistantEnabled, laneRouterEnabled } from "./lane-router.ts";
import type {
  AnswerNewsItem,
  AnswerTemplate,
  AskMode,
  AskResponse,
  Citation,
  DetectedEntity,
  EvidenceGrade,
  Intent,
  SafetyFlag,
} from "../../../packages/shared/src/answer.ts";

const DEFAULT_ALLOWED_ORIGINS = [
  "https://app.pharmaorb.app",
  "https://pharmaorb.app",
  "https://www.pharmaorb.app",
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:8081",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
  "http://127.0.0.1:8081",
];

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

// Retrieval cutoff: below this cosine similarity we treat the corpus as having
// no support and refuse (AC3). Tuned empirically in scripts/phase3-validate.ts
// (real example questions clear it; a made-up compound returns zero).
const ASK_MATCH_THRESHOLD = 0.5;
// Sources shown to the generator (and surfaced as citations) after reranking. Raised 8 -> 12 alongside
// the broadened PubMed retrieval (paywalled abstracts now eligible) so more of the strongest evidence
// reaches the answer. The fabrication guard runs over the full retrieved `pool`, not this slice, so a
// wider slice never weakens it.
const MATCH_COUNT = 12;
// Thorough mode's DEPTH lever: a bigger cited slice shown to the generator, so the fuller answer has more real
// sources to draw on. The label family is still capped at LABEL_SLICE_CAP, so the extra slots go to research /
// trials, never more label prose. Fast/default keep MATCH_COUNT (today's breadth) so the quick answer never thins.
const THOROUGH_MATCH_COUNT = 18;
// Task 3: "also reviewed" breadth. The reranker already returns the WHOLE reranked union
// (guardPool, e.g. 31-67 chunks) without truncating; only the cited slice (MATCH_COUNT /
// THOROUGH_MATCH_COUNT) was ever surfaced to the reader as "reviewed". These two constants
// let the panel show much more of that real, already-retrieved pool instead of the ~18-item
// leftovers of the cited slice — display-only, does not touch ret.chunks or the generator.
const REVIEWED_CAP = 34; // max "also reviewed" sources shown (total shown ~= cited ~6 + reviewed <=34 ~= 40)
const REVIEWED_SCORE_FLOOR = 0.35; // min relevance (rerank_score, else dense similarity) to be shown as reviewed
// Task 3b: parallel multi-query DENSE recall. A single dense query under-retrieves the library side of the
// pool (esp. thin-live consumer questions). We fan the question into a few deterministic sub-queries
// (buildSubQueries) and keep a bigger merged dense pool that then feeds augmentWithLive's rerank. This is
// GATED behind LIVE_SOURCES_ON so the dense-only path stays byte-for-byte the behavior the gate locks in:
// with live off we pass no sub-queries and recallPool == matchCount, i.e. today's single-query retrieve.
const RECALL_POOL = 28; // merged dense candidates kept (fast/default) when live sources are on
const THOROUGH_RECALL_POOL = 40; // merged dense candidates kept (thorough) when live sources are on

// Live evidence sources (PubMed / Europe PMC / ClinicalTrials / openFDA / FAERS) are gated behind a
// flag so deploying this code is non-breaking: with LIVE_SOURCES unset the pipeline is byte-for-byte
// the dense-only behavior the gate/guardrail suite locks in. The owner flips LIVE_SOURCES=on to enable.
const LIVE_SOURCES_ON = Deno.env.get("LIVE_SOURCES") === "on";
const LIVE_PER_SOURCE_MAX = 8; // how many candidates to pull per live source before the merge/rerank
// Thorough mode also casts a WIDER candidate net per live source (more abstracts/trials feed the rerank),
// which — paired with the bigger THOROUGH_MATCH_COUNT slice above — lets the deeper search surface AND show
// more of the real evidence. Fast/default keep LIVE_PER_SOURCE_MAX so the quick answer never looks thinner.
const THOROUGH_LIVE_PER_SOURCE_MAX = 12;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405, req);

  if (!hasLlmKey()) return json({ error: "LLM API key not configured" }, 500, req);

  // ---- verify caller (authenticated-only) ----
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const userId = await verifyUser(token);
  if (!userId) return json({ error: "authentication required" }, 401, req);

  let body: {
    question?: string;
    use_health_context?: boolean;
    conversation_id?: string;
    // Speed/depth dial (see AskMode): "fast" = plain + concise, "thorough" = technical + wider net.
    // Validated below; anything else (incl. absent) falls through to current behavior.
    mode?: string;
    // Verification opt-in: echo the verbatim source text behind each citation tag in the response
    // (a benchmark/judge aid — see SourceText). Default false → normal answers are byte-for-byte
    // unchanged. The sources are the public databases the answer already cites.
    include_source_text?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400, req);
  }
  const question = (body.question ?? "").trim();
  if (!question) return json({ error: "question required" }, 400, req);
  // Hard length cap. The per-user quota counts CALLS, not tokens, so without this an
  // authenticated user could push very large strings into the embed + classify + generate
  // calls and amplify cost well beyond one quota unit. 2000 chars covers any legitimate
  // question with context.
  if (question.length > 2000) return json({ error: "question too long (max 2000 characters)" }, 400, req);
  // Validate the speed/depth dial at the boundary: only the two known modes pass through; an unknown
  // or absent value becomes undefined → current behavior (mobile / older clients / saved-chat replays).
  const mode: AskMode | undefined = body.mode === "fast" || body.mode === "thorough" ? body.mode : undefined;

  try {
    const resp = await runAsk(question, !!body.use_health_context, userId, !!body.include_source_text, mode);
    return json(resp, 200, req);
  } catch (e) {
    if (e instanceof QuotaExceeded) return json(e.payload, 429, req);
    // Log the detail server-side; return a generic message so PostgREST /
    // Anthropic internals (schema, policy names, request ids) don't leak.
    console.error("ask pipeline error:", (e as Error).message);
    return json({ error: "ask failed" }, 500, req);
  }
});

async function runAsk(
  question: string,
  useHealthContext: boolean,
  userId: string,
  includeSourceText = false,
  mode?: AskMode,
): Promise<AskResponse> {
  const answerId = crypto.randomUUID();
  const apiKey = llmApiKey();
  // Map the request mode onto the three levers it controls. All default to current behavior when mode is
  // absent: undefined style → the standard register; the base per-source net + base cited slice → today's
  // retrieval breadth. Fast=plain is the web default; the differences make Fast a quick gist and Thorough deep.
  //  - register: Fast writes a short plain gist, Thorough writes a fuller technical answer (generateSystem / AnswerStyle).
  //  - perSourceMax: Thorough casts a WIDER candidate net per live source into the rerank.
  //  - matchCount: Thorough shows a BIGGER cited slice (THOROUGH_MATCH_COUNT) so the fuller answer has more
  //    real sources to draw on; the label family stays capped, so the extra slots are research/trials.
  const style: AnswerStyle | undefined = mode === "fast" ? "plain" : mode === "thorough" ? "thorough" : undefined;
  const perSourceMax = mode === "thorough" ? THOROUGH_LIVE_PER_SOURCE_MAX : LIVE_PER_SOURCE_MAX;
  const matchCount = mode === "thorough" ? THOROUGH_MATCH_COUNT : MATCH_COUNT;

  // ---- 0. deterministic pre-screen (no LLM) ----
  const pre = preScreen(question);
  if (pre.shortCircuit === "emergency_routing") {
    return await finalizeTemplate(answerId, question, "emergency_overdose", pre.flags, [], userId,
      "emergency_routing", "deterministic-prescreen", false);
  }
  if (pre.shortCircuit === "sourcing_refusal") {
    return await finalizeTemplate(answerId, question, "drug_sourcing", pre.flags, [], userId,
      "sourcing_refusal", "deterministic-prescreen", false);
  }

  // ---- 0a. small-talk short-circuit (no LLM, no quota spend) ----
  // A pure greeting / thanks / "what can you do" message is answered conversationally instead of
  // being force-fed through clinical retrieval (which turned "hi" into a PubMed search for the
  // abbreviation "HI"). preScreen already ran above, so an emergency/overdose/self-harm/sourcing
  // message is hard-routed first and can never reach this branch.
  if (detectSmallTalk(question)) {
    return await finalizeSmallTalk(answerId, question, userId);
  }

  // ---- 0a2. fresh-info lane (LANE_ROUTER=on, DEFAULT OFF — zero behavior change until enabled) ----
  // Current-events / named-person questions with zero biomedical signal get an honest "this needs
  // live web, not an evidence library" reply instead of being force-fit into clinical retrieval
  // (the 4-lane router's lane 0.5 — docs/research/chatgpt-openevidence-routing-2026-07.md §5).
  // Deterministic + conservative (any biomedical marker or known entity keeps the question in the
  // normal pipeline); preScreen already hard-routed emergencies above. No LLM call, no quota spend.
  if (laneRouterEnabled()) {
    const fresh = detectFreshInfo(question);
    if (fresh.fires) {
      return await finalizeFreshInfo(answerId, question, userId, fresh.reason ?? "current_events");
    }
  }

  // ---- 0b. server-side usage limit (before LLM classify/generate spend) ----
  const quota = await consumeAskQuota(userId);
  if (!quota.allowed) throw new QuotaExceeded(quota);

  // ---- 0c. general-assistant lane (GENERAL_ASSISTANT_LANE=on, DEFAULT OFF) ----
  // A clearly non-medical task ("write me a cover letter", "translate this") gets a natural, helpful
  // reply instead of being force-fit through clinical retrieval (lane 0.6). Runs after the quota
  // consume because it spends one cheap LLM call. Fail-safe twice over: the detector requires a
  // POSITIVE general-task signal (a medical question can't match), and finalizeGeneralAssistant
  // returns null on any LLM failure/empty completion, so we fall straight through to classify and
  // the normal engine. preScreen already hard-routed emergencies far above.
  if (generalAssistantEnabled() && detectGeneralAssistant(question).fires) {
    const general = await finalizeGeneralAssistant(answerId, question, userId, apiKey);
    if (general) return general;
  }

  // ---- 1. classify ----
  const cls = await classify(question, apiKey);
  // Relax the classifier's over-eager emergency_possible on a general "is X lethal/toxic/dangerous"
  // inquiry (the reported "is celsius lethal" over-route). Deterministic + fail-safe: only a SOLO
  // emergency_possible on a third-person educational toxicity question is dropped; first-person
  // distress, lethal-amount, overdose_possible, and self_harm all keep full emergency routing. See
  // safety.ts. preScreen's emergency family already short-circuited above, so this only ever acts on
  // a flag the LLM added.
  const rawFlags = unique<SafetyFlag>([...pre.flags, ...cls.safety_flags]);
  const flags = suppressEmergencyForGeneralToxicity(question, rawFlags);
  const webRecon = await runWebRecon(question);
  const queryUnderstanding = applyReconToUnderstanding(
    understandQuery(question, cls.entity_mentions),
    webRecon,
  );
  // Observability for a SAFETY RELAXATION: a backstop that quietly downgrades an emergency must leave
  // an audit trail. Logs only when the carve-out actually fired (emergency_possible was present, now isn't).
  if (rawFlags.includes("emergency_possible") && !flags.includes("emergency_possible")) {
    console.warn(`ask toxicity carve-out — relaxed classifier emergency_possible on educational toxicity question: ${JSON.stringify(question.slice(0, 120))}`);
  }

  // ---- 1b. news lane (paid-only walled panel) ----
  // Kicked off HERE so its fetch overlaps retrieve + live-augment + generate (latency hidden behind the
  // LLM step); awaited only at assembly. Paid users see news on ANY question (owner widened from
  // drug-only); the search string is the named drug(s) when present, else the extracted topic. THE WALL:
  // the result attaches to resp.news ONLY — it is never converted to a chunk/citation, never grounded,
  // never reranked into the evidence pool. fetchGoogleNews is fault-tolerant (never throws), so a
  // dangling promise on an early template return (emergency/sourcing/no-source/fabrication) is harmless
  // — and correct: a refusal or a possibly-fabricated drug must NOT carry hype headlines.
  const newsSearch = queryUnderstanding.sourceQuery || (extractSearchTerms(question) || question);
  const newsGate = decideNewsGate({ plan: quota.plan, query: newsSearch, liveSourcesOn: LIVE_SOURCES_ON });
  const newsPromise: Promise<AnswerNewsItem[]> = newsGate.fetch
    ? fetchGoogleNews({ query: newsGate.query }).then(toAnswerNews).catch(() => [])
    : Promise.resolve([]);

  if (flags.some((f) => f === "emergency_possible" || f === "overdose_possible" || f === "self_harm")) {
    return await finalizeTemplate(answerId, question, "emergency_overdose", flags, [], userId,
      "emergency_routing", cls.model, false);
  }
  if (cls.intent === "drug_sourcing" || flags.includes("drug_sourcing")) {
    return await finalizeTemplate(answerId, question, "drug_sourcing", flags, [], userId,
      "sourcing_refusal", cls.model, false);
  }

  // ---- 2. resolve entities ----
  const entities = await resolveEntities(queryUnderstanding.fieldMentions, SB_URL, SERVICE_KEY);
  const resolvedIds = entities.map((e) => e.entity_id).filter((id): id is string => !!id);
  const scopeId = resolvedIds.length === 1 ? resolvedIds[0] : null; // 2+ entities -> broad

  // ---- 3. retrieve ----
  const consumerProductOnly = isConsumerProductOnlyQuery(queryUnderstanding);
  // No-drug general-health/symptom questions ("why do I have white flakes in my hair?") route to
  // consumer-health + literature sources (MedlinePlus/PubMed/EuropePMC), NOT FDA labels (#82).
  const noDrugGeneralHealth =
    queryUnderstanding.fieldMentions.length === 0 &&
    (cls.intent === "general_health" || cls.intent === "health_context" || cls.intent === "side_effects");
  const effectiveIntent = noDrugGeneralHealth ? "general_health" : cls.intent;
  // Consumer-product-only queries (e.g. "Celsius") stay on pubmed_oa; everything else uses the
  // intent-scoped priority (now symptom-aware via effectiveIntent).
  const priority = consumerProductOnly ? ["pubmed_oa"] : providerPriorityForIntent(effectiveIntent);
  // Multi-query dense recall — ONLY when live sources are on (see RECALL_POOL comment). With live off,
  // subQueries=undefined + recallPool=matchCount makes retrieve() a single-query matchCount call, i.e.
  // byte-identical to today's dense-only path (the gate/guardrail baseline).
  // effectiveIntent (not cls.intent) so a no-drug symptom/general-health question gets the general_health
  // sub-query variant — exactly the thin-live case where the extra dense recall helps most.
  const subQueries = LIVE_SOURCES_ON ? buildSubQueries(question, cls.entity_mentions, effectiveIntent) : undefined;
  const recallPool = LIVE_SOURCES_ON ? (mode === "thorough" ? THOROUGH_RECALL_POOL : RECALL_POOL) : matchCount;
  let ret = await retrieve({
    question,
    providers: priority,
    entityId: scopeId,
    threshold: ASK_MATCH_THRESHOLD,
    matchCount,
    subQueries,
    recallPool,
    sbUrl: SB_URL,
    serviceKey: SERVICE_KEY,
  });
  // Scoped retrieval can come back empty for an investigational drug (no FDA
  // label -> fails a label-first provider filter) or one whose sources weren't
  // bridged to its entity in Phase 2 (e.g. retatrutide, BPC-157 — their
  // trials/PubMed chunks exist but the drug_entity_sources link is sparse). Before
  // refusing, retry with NO provider AND NO entity filter (broad semantic search).
  if (!consumerProductOnly && ret.chunks.length === 0 && (priority !== null || scopeId !== null)) {
    ret = await retrieve({
      question,
      providers: null,
      entityId: null,
      threshold: ASK_MATCH_THRESHOLD,
      matchCount,
      subQueries,
      recallPool,
      sbUrl: SB_URL,
      serviceKey: SERVICE_KEY,
    });
  }

  // ---- 3b. live evidence augmentation (flag-gated; non-breaking when off) ----
  // Pull live candidates (PubMed/EuropePMC/ClinicalTrials/openFDA/FAERS), merge with the library
  // hits, and rerank the union on the cross-encoder's single scale. Fault-tolerant: any failure
  // degrades to the dense library result rather than failing the answer. A real-but-new drug with
  // no library coverage can still be answered from live evidence here. `pool` is the full reranked
  // union (for the fabrication guard); `top` is the MATCH_COUNT slice shown to the generator.
  let guardPool: RetrievedChunk[] = ret.chunks;
  if (LIVE_SOURCES_ON) {
    const labelCap = noDrugGeneralHealth ? 0 : undefined;
    const aug = await augmentWithLive(question, cls.entity_mentions, ret.chunks, perSourceMax, matchCount, webRecon, labelCap);
    guardPool = aug.pool;
    ret = { ...ret, chunks: aug.top };
  }

  if (ret.chunks.length === 0) {
    return await finalizeTemplate(answerId, question, cls.intent,
      unique<SafetyFlag>([...flags, "no_sources_found"]), entities, userId,
      "no_source", cls.model, true);
  }

  // ---- 3c. fabrication guard (answer-layer entity check; flag-gated) ----
  // Live sources move the fabricated-drug refusal OFF the dense floor: a class-plausible fake
  // ("florizagliflozin") pulls REAL class-sibling evidence that ranks high on both cosine and the
  // reranker. The guard fires when a drug the user literally named appears NOWHERE in the retrieved
  // pool — the fabricated-drug signature. It STAYS strict (no typo/edit-distance tolerance: a 1-char
  // slip "tesamorein"→"tesamorelin" is indistinguishable from a fake near-miss "BPC-158"→"BPC-157", so
  // loosening it would re-admit fakes — see fabrication.test.ts).
  //
  // BUT when it fires we have, by construction, a NON-EMPTY pool (the empty case returned above). A flat
  // "no reliable source" is then misleading — we DID retrieve relevant evidence, just not the literal
  // token (a typo, a colloquial abbreviation like "HGH", or a genuine fake). So degrade to the
  // conservative fallback: SHOW the sources we found (no claim) rather than denying them. This NEVER runs
  // the generator, so the anti-fabrication guarantee is fully intact — it only turns a dead-end refusal
  // into "here's the most relevant evidence I found" + sources + good questions. ("unverified_entity"
  // tags the trace for analytics without a new SafetyFlag.)
  // When the guard fires, distinguish a genuine TYPO of a real drug we DO have evidence for (assume &
  // answer, ChatGPT-style, with the assumption STATED) from a real fabricated drug (keep refusing).
  // findTypoCorrections is adversarially unit-tested (typo-correct.test.ts): every class-plausible fake
  // returns null → falls through to the conservative refusal below. The fabrication guard is untouched.
  let assumption = "";
  let genQuestion = queryUnderstanding.assumptions.length
    ? `${question}\n\nAssumption: ${queryUnderstanding.assumptions.join(" ")}`
    : question;
  if (LIVE_SOURCES_ON && queryUnderstanding.fieldMentions.length > 0 && isFabricatedDrugQuery(queryUnderstanding.fieldMentions, guardPool)) {
    const corrections = findTypoCorrections(queryUnderstanding.fieldMentions, entities, guardPool);
    if (!corrections) {
      return await finalizeTemplate(answerId, question, cls.intent,
        flags, entities, userId, "safety_fallback", `${cls.model}|unverified_entity`, true, ret.chunks);
    }
    assumption = assumptionNote(corrections);
    for (const corr of corrections) {
      // Rewrite the typo'd token to the assumed real drug for generation, so the answer grounds cleanly
      // on the evidence we already retrieved for it (word-boundary, case-insensitive).
      const esc = corr.mention.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      genQuestion = genQuestion.replace(new RegExp(`(?<![a-z0-9])${esc}(?![a-z0-9])`, "gi"), corr.corrected);
    }
  }

  // ---- 4. health context (verified-user-scoped) ----
  const healthContext = useHealthContext ? await loadHealthContext(userId) : null;

  // ---- 5. generate (graceful: a total LLM failure degrades to a cited refusal,
  //         never a user-facing 500) ----
  let gen: Awaited<ReturnType<typeof generate>>;
  try {
    gen = await generate({
      question: genQuestion,
      intent: cls.intent,
      chunks: ret.chunks,
      healthContext,
      apiKey,
      style,
    });
  } catch (e) {
    console.error("ask generate failed after retries:", (e as Error).message);
    return await finalizeTemplate(answerId, question, cls.intent,
      unique<SafetyFlag>([...flags, "no_sources_found"]), entities, userId,
      "no_source", `${cls.model}|generate_failed`, true, ret.chunks);
  }
  const modelName = `${cls.model}|${gen.model}`;

  // ---- 6a. post-generation safety filter (the doc-20 guarantee) ----
  // detectViolations (safety.ts) is the untouched teeth; resolveSafety (sanitize.ts) is the pure,
  // unit-tested decision around it. It scans every DECLARATIVE model section — questions_to_ask is
  // excluded ON PURPOSE: it is interrogative ("is it safe for me?" / "should I stop X?" are questions
  // to pose to a clinician, NOT the forbidden assertions), and scanning it false-positives. Outcomes:
  //   clean    -> deliver as generated.
  //   salvaged -> a BENIGN answer had an offending line; drop ONLY that line and keep the cited rest
  //               (survivors re-scanned, so the guarantee holds). Restores the good acne-type answers
  //               that a single "X is safe" / "cures" / dose line used to throw away wholesale.
  //   fallback -> unsalvageable (headline trips, residual after scrub, nothing substantive left) OR a
  //               SENSITIVE class (peptide / dosing / high-risk drug) where one forbidden line still
  //               refuses the WHOLE answer, exactly as before. Conservative template + the sources.
  // LOG either way: a backstop that silently swallows a cited answer is not debuggable.
  const resolution = resolveSafety(gen.raw, { salvageable: isBenignSalvageable(cls.intent, flags) });
  if (resolution.kind === "fallback") {
    console.error(
      `ask safety_fallback — discarded generation (${resolution.reason}):`,
      JSON.stringify(resolution.violations),
    );
    return await finalizeTemplate(answerId, question, cls.intent,
      flags, entities, userId, "safety_fallback", modelName, true, ret.chunks);
  }
  if (resolution.kind === "salvaged") {
    console.warn(
      `ask safety_salvage — dropped ${resolution.droppedCount} offending point(s), delivered the rest:`,
      JSON.stringify(resolution.violations),
    );
    gen = { ...gen, raw: resolution.raw };
  }

  // ---- 6b. citation enforcement ----
  const enf = enforceCitations({ ...gen.raw, chunks: ret.chunks });
  if (enf.refusedUnsupported) {
    return await finalizeTemplate(answerId, question, cls.intent,
      unique<SafetyFlag>([...flags, "no_sources_found"]), entities, userId,
      "no_source", modelName, true, ret.chunks);
  }

  // ---- 6c. deterministic evidence-grade ceiling ----
  // The model self-grades its answer's evidence strength (gen.raw.evidence_grade).
  // Where we have a resolved single drug with an offline-computed §9 tier, trust that
  // auditable, countable-evidence tier instead — as a CEILING that can only LOWER the
  // grade, never raise it. No stored tier (or a multi-/zero-entity query) leaves the
  // model grade untouched, so this is strictly non-degrading versus current behavior.
  let finalGrade: EvidenceGrade = gen.raw.evidence_grade;
  if (scopeId !== null) {
    const storedTier = await fetchStoredEvidenceGrade(scopeId, SB_URL, SERVICE_KEY);
    finalGrade = applyGradeCeiling(gen.raw.evidence_grade, storedTier);
  }

  // ---- 7. assemble ----
  // Deterministic professional-routing guarantee: generation under-emits the
  // "talk to your pharmacist/prescriber" line for personal-decision intents, so
  // append it here (post-enforcement — an uncited safety note would otherwise be
  // dropped by enforceCitations). See routing.ts.
  // Attach each claim's supporting source passage (deterministic, verbatim) so the UI can highlight
  // the exact line that backs a citation. Additive only — runs after enforcement; the support quotes
  // are verbatim source provenance, not assistant prose, so they do not alter the answer or its scan.
  const answer_sections = attachSupport({
    ...enf.answer_sections,
    safety_notes: withProfessionalRouting(enf.answer_sections.safety_notes, cls.intent),
  }, ret.chunks);
  const supportRatings = rateSourceSupport(ret.chunks, answer_sections);
  const ratedCitations = enf.citations.map((c) => ({ ...c, ...supportRatings.get(c.chunk_tag) }));
  // A resolved drug name for the answer header's molecule image (PubChem renders by name). First
  // resolved canonical name, else the first literal mention; absent when nothing resolved. The web
  // <img> 404-hides for anything PubChem can't depict (e.g. a condition), so setting it loosely is safe.
  const primaryDrug = entities.find((e) => e.canonical_name)?.canonical_name ?? cls.entity_mentions[0];
  // The full evidence base for the panel: the reranked sources the generator reviewed but the answer
  // didn't end up citing. Surfaced as "also reviewed" so the breadth (e.g. 9 PubMed + 4 trials) stays
  // visible even when the answer text leans on a few — additive DISPLAY only; never affects the answer,
  // the cited set, or citation enforcement.
  //
  // Task 3: derive this from `guardPool` (the FULL reranked union — aug.pool when LIVE_SOURCES is on,
  // ret.chunks otherwise), not from `ret.chunks` (the ~12-18 item cited slice fed to the generator).
  // guardPool tags are pool-local and collide with the cited slice's retagged "1".."N" tags, so cited
  // chunks are excluded by their stable `chunk_id` instead. buildReviewedSet re-tags survivors starting
  // at citedCount+1 so reviewed tags never collide with the cited namespace; ret.chunks/generate()/the
  // fabrication guard are untouched by this — it only changes what the panel surfaces as "reviewed".
  //
  // No support-rating lookup here: `supportRatings` is keyed by `ret.chunks` tags ("1".."N", the cited
  // slice's namespace), and guardPool's re-tagged reviewed tags (citedCount+1, citedCount+2, ...) can
  // land inside that SAME numeric range, so a `supportRatings.get(reviewedTag)` would attach an
  // unrelated cited chunk's rating instead of returning undefined. A reviewed source never had a claim
  // cited against it, so it correctly carries no support rating.
  const citedTags = new Set(enf.citations.map((c) => c.chunk_tag));
  const citedChunkIds = new Set(
    ret.chunks.filter((c) => citedTags.has(c.tag)).map((c) => c.chunk_id),
  );
  const reviewedSources = buildReviewedSet(
    // Pass the cited-tag SET (not its size): reviewed tags must start above max(citedTags), because the
    // generator cites a SPARSE subset of 1..matchCount — offsetting by the count would collide with
    // higher cited tags and mis-paint a "Supports this claim" highlight on a non-cited source.
    guardPool, citedChunkIds, citedTags, REVIEWED_SCORE_FLOOR, REVIEWED_CAP,
    // Restore the differentiated source-class badge on reviewed cards via the PURE per-chunk
    // evidenceRole() — never the tag-keyed supportRatings (its "1".."N" keys collide with the
    // re-tagged reviewed namespace). support_level/claim_relation stay omitted (flat for non-cited).
    (c) => {
      const er = evidenceRole(c);
      return { evidence_role: er.role, evidence_weight: er.weight, support_reason: er.reason };
    },
  );
  // Walled news (paid) / locked teaser (free). Resolved here so its fetch overlapped the work above.
  // It is attached as a SEPARATE field — never folded into citations/reviewed_sources/the chunk pool.
  const news = await newsPromise;
  const surfacedAssumption = [
    assumption ? `${assumption}.` : "",
    ...queryUnderstanding.assumptions,
  ].filter(Boolean).join(" ");
  const resp: AskResponse = {
    answer_id: answerId,
    intent: cls.intent,
    // State the typo assumption up front ("Assuming you mean tesamorelin") when we recovered a typo'd
    // drug name — transparent, never silent. Empty for normal answers.
    plain_english_summary: surfacedAssumption ? `${surfacedAssumption} ${enf.plain_english_summary}` : enf.plain_english_summary,
    evidence_grade: finalGrade,
    answer_sections,
    citations: ratedCitations,
    safety_flags: flags,
    refused_unsupported: false,
    oldest_source_date: enf.oldest_source_date,
    ...(primaryDrug ? { primary_drug: primaryDrug } : {}),
    ...(reviewedSources.length ? { reviewed_sources: reviewedSources } : {}),
    ...(news.length ? { news } : {}),
    ...(newsGate.locked ? { news_locked: true } : {}),
  };

  // ---- 8. trace store ----
  await storeTrace({
    id: answerId,
    user_id: userId,
    question,
    intent: cls.intent,
    detected_entities: entities,
    answer: resp,
    evidence_grade: finalGrade,
    source_ids: unique(ratedCitations.map((c) => c.source_id)),
    retrieval_scores: ret.chunks.map((c) => ({ chunk_id: c.chunk_id, similarity: c.similarity })),
    model_name: modelName,
    prompt_version: PROMPT_VERSION,
    safety_flags: flags,
    used_health_context: !!healthContext,
  });

  // Verification opt-in: attach the verbatim per-tag source text AFTER the trace write, so the stored
  // trace and every normal response stay lean. Built from the same reranked `ret.chunks` the answer was
  // generated and cited from, so a consumer can resolve each claim's [n] to the EXACT text it cited.
  return includeSourceText ? { ...resp, source_texts: collectSourceTexts(ret.chunks) } : resp;
}

/**
 * Merge live-source candidates with the library chunks and rerank the union. Returns the full reranked
 * `pool` (for the fabrication guard) and the MATCH_COUNT `top` slice (for the generator). Fault-tolerant
 * by design: any failure returns the library chunks unchanged so live sources can never sink an answer.
 */
async function augmentWithLive(
  question: string,
  entityMentions: string[],
  libChunks: RetrievedChunk[],
  perSourceMax: number = LIVE_PER_SOURCE_MAX,
  matchCount: number = MATCH_COUNT,
  webRecon?: WebReconResult,
  labelCap?: number,
): Promise<{ pool: RetrievedChunk[]; top: RetrievedChunk[] }> {
  // top feeds the generator and must stay matchCount-sized even when augmentation fails and even when
  // libChunks is now a bigger multi-query recall pool (Task 3b) — otherwise the generator would see the
  // full pool. pool keeps all of libChunks for the fabrication guard + reviewed breadth. When libChunks
  // is already <= matchCount (today's dense-only path), slice is a no-op, so this stays byte-identical.
  const fallback = { pool: libChunks, top: libChunks.slice(0, matchCount) };
  try {
    const baseResearchQuery = extractSearchTerms(question) || question;
    const understood = webRecon
      ? applyReconToUnderstanding(understandQuery(question, entityMentions, baseResearchQuery), webRecon)
      : understandQuery(question, entityMentions, baseResearchQuery);
    // openFDA/FAERS/ClinicalTrials want a drug TERM, not a sentence (a raw question 400s). Use the
    // literal mentions when present — a real-but-new drug (retatrutide) is found by name; a fabricated
    // one returns nothing. Fall back to the question for general/non-drug queries.
    const term = understood.sourceQuery;
    // Research sources (PubMed/Europe PMC/OpenAlex/MedlinePlus) search the user's QUESTION (conversational
    // scaffolding stripped) so "<drug> side effects" / "<drug> mechanism" retrieves on-topic research
    // instead of generic drug papers; the field-scoped + adverse-event sources (openFDA/FAERS/trials)
    // keep the literal drug `term`. This is the lever behind the side-effects/interaction/mechanism gap.
    let researchQuery = understood.researchQuery;
    // Typo-correct the research string ONLY on the no-drug path (general/benign topics like
    // "metfromin and the livr"). When classify pulled a literal drug mention we leave the query alone —
    // espell only ever rewrites the research search string, never the literal `term`/entityMentions the
    // fabrication guard checks, so a real-but-new drug is still found by name and a fabricated one still
    // finds nothing. Best-effort: espellCorrect returns the query unchanged on any failure.
    if (understood.fieldMentions.length === 0) {
      researchQuery = await espellCorrect(researchQuery);
    }
    const live = await gatherLiveCandidates({ query: term, mentions: understood.fieldMentions, researchQuery, perSourceMax });
    if (live.length === 0) return fallback;

    const combined = [...libChunks, ...live.map((c, i) => liveToChunk(c, String(i + 1)))];
    let ordered: RetrievedChunk[];
    try {
      ordered = await rerankChunks(question, combined);
    } catch (e) {
      console.error("ask live rerank failed; using dense library order:", (e as Error).message);
      return fallback;
    }
    // Take the cited slice with the label-family cap (so primary research isn't crowded out by long
    // FDA-label chunks that out-score short abstracts on the reranker), then retag 1..N for the
    // generator + citation layer. Reorder/select only — the fabrication guard still runs on `pool`.
    const top = balanceCitedSlice(ordered, matchCount, labelCap).map((c, i) => ({ ...c, tag: String(i + 1) }));
    return { pool: ordered, top };
  } catch (e) {
    console.error("ask live augmentation failed; using library only:", (e as Error).message);
    return fallback;
  }
}

/** Map engine NewsItems to the client-facing AnswerNewsItem and cap the panel size. A plain field
 *  copy across the wall's type boundary — a NewsItem is never carried into the evidence path. */
function toAnswerNews(items: NewsItem[]): AnswerNewsItem[] {
  return items.slice(0, 6).map((n) => ({
    title: n.title,
    url: n.url,
    source: n.source,
    published_at: n.published_at,
  }));
}

// ---------------------------------------------------------------------------
// Small-talk (conversational, non-clinical) response
// ---------------------------------------------------------------------------

/** Friendly reply for a pure greeting/thanks/capability message: no retrieval, no generation,
 *  no clinical sections, no evidence grade. Not a refusal template — it carries no `template`
 *  field, so the app renders it as a plain conversational message (see ask/page.tsx Answer). */
async function finalizeSmallTalk(
  answerId: string,
  question: string,
  userId: string,
): Promise<AskResponse> {
  const resp: AskResponse = {
    answer_id: answerId,
    intent: "smalltalk",
    plain_english_summary: GREETING_COPY,
    evidence_grade: "not_applicable",
    answer_sections: { what_we_know: [], what_we_do_not_know: [], safety_notes: [], questions_to_ask: [] },
    citations: [],
    safety_flags: [],
    refused_unsupported: false,
    oldest_source_date: null,
  };

  await storeTrace({
    id: answerId,
    user_id: userId,
    question,
    intent: "smalltalk",
    detected_entities: [],
    answer: resp,
    evidence_grade: "not_applicable",
    source_ids: [],
    retrieval_scores: [],
    model_name: "deterministic-smalltalk",
    prompt_version: PROMPT_VERSION,
    safety_flags: [],
    used_health_context: false,
  });

  return resp;
}

/** Honest out-of-corpus reply for the fresh-info lane (lane-router.ts, gated LANE_ROUTER=on):
 *  a current-events / named-person question our evidence library can't answer. Mirrors
 *  finalizeSmallTalk — no retrieval, no generation, no quota spend, rendered as a plain
 *  conversational message. Reuses the "smalltalk" wire intent so no shared-type or frontend
 *  change is needed; the trace's model_name ("deterministic-fresh-info:<reason>") keeps it
 *  distinguishable in analytics. */
async function finalizeFreshInfo(
  answerId: string,
  question: string,
  userId: string,
  reason: string,
): Promise<AskResponse> {
  const resp: AskResponse = {
    answer_id: answerId,
    intent: "smalltalk",
    plain_english_summary: FRESH_INFO_COPY,
    evidence_grade: "not_applicable",
    answer_sections: { what_we_know: [], what_we_do_not_know: [], safety_notes: [], questions_to_ask: [] },
    citations: [],
    safety_flags: [],
    refused_unsupported: false,
    oldest_source_date: null,
  };

  await storeTrace({
    id: answerId,
    user_id: userId,
    question,
    intent: "smalltalk",
    detected_entities: [],
    answer: resp,
    evidence_grade: "not_applicable",
    source_ids: [],
    retrieval_scores: [],
    model_name: `deterministic-fresh-info:${reason}`,
    prompt_version: PROMPT_VERSION,
    safety_flags: [],
    used_health_context: false,
  });

  return resp;
}

// The general-assistant lane's system prompt (lane 0.6, gated GENERAL_ASSISTANT_LANE=on). The
// question already passed the deterministic general-task detector (lane-router.ts) — a clearly
// non-medical request. Answer it naturally, no medical theater. Kept short so a misrouted question
// (should never happen given the positive-signal detector) can't produce a long unscanned medical
// essay. If the model somehow gets a medical-looking request here, it defers rather than advising.
const GENERAL_ASSISTANT_SYSTEM =
  "You are PharmaOrb. Your specialty is cited medical evidence, but this request is a general, " +
  "non-medical one, so just help the user naturally and well — like a capable, friendly assistant. " +
  "Answer directly and concisely. Do not add medical framing, citations, evidence grades, or " +
  "disclaimers, and do not mention that you are usually a medical tool. If the request turns out to " +
  "be about a health, medical, drug, or supplement topic, do NOT give medical advice — instead say " +
  "in one line that they can ask that as a normal question to get a cited, evidence-backed answer.";

/** Lane 0.6 — a natural reply to a clearly non-medical request (gated GENERAL_ASSISTANT_LANE=on).
 *  One light LLM call, no retrieval, no citations, no safety-scan (positive-signal detector kept
 *  medical questions out — see lane-router.ts). Rendered as a plain conversational message via the
 *  reused "smalltalk" wire intent (no shared-type/frontend change). Any LLM failure degrades to the
 *  normal engine by returning null, so the caller falls through to classify. */
async function finalizeGeneralAssistant(
  answerId: string,
  question: string,
  userId: string,
  apiKey: string,
): Promise<AskResponse | null> {
  let content: string;
  try {
    const res = await chat({
      model: modelFor("classify"),
      max_tokens: 900,
      system: GENERAL_ASSISTANT_SYSTEM,
      messages: [{ role: "user", content: question }],
      temperature: 0.7,
    }, apiKey);
    content = res.choices[0]?.message?.content?.trim() ?? "";
    if (!content) return null; // empty completion → let the normal engine handle it
  } catch {
    return null; // never fail the request on the general lane — fall through to classify
  }

  const resp: AskResponse = {
    answer_id: answerId,
    intent: "smalltalk",
    plain_english_summary: content,
    evidence_grade: "not_applicable",
    answer_sections: { what_we_know: [], what_we_do_not_know: [], safety_notes: [], questions_to_ask: [] },
    citations: [],
    safety_flags: [],
    refused_unsupported: false,
    oldest_source_date: null,
  };

  await storeTrace({
    id: answerId,
    user_id: userId,
    question,
    intent: "smalltalk",
    detected_entities: [],
    answer: resp,
    evidence_grade: "not_applicable",
    source_ids: [],
    retrieval_scores: [],
    model_name: "general-assistant",
    prompt_version: PROMPT_VERSION,
    safety_flags: [],
    used_health_context: false,
  });

  return resp;
}

// ---------------------------------------------------------------------------
// Template (deterministic / refusal) responses
// ---------------------------------------------------------------------------

function templateCopy(t: AnswerTemplate): string {
  switch (t) {
    case "emergency_routing": return EMERGENCY_COPY;
    case "sourcing_refusal": return SOURCING_COPY;
    case "no_source": return NO_SOURCE_COPY;
    case "safety_fallback": return CONSERVATIVE_FALLBACK_COPY;
    // index.ts never emits lab_draft_refused (that path lives in the lab_draft handler), but
    // AnswerTemplate includes it — handle it for exhaustiveness so this switch type-checks cleanly.
    case "lab_draft_refused": return LAB_DRAFT_REFUSAL_COPY;
  }
}

/** Build + persist a template/refusal answer in one place. */
async function finalizeTemplate(
  answerId: string,
  question: string,
  intent: Intent,
  flags: SafetyFlag[],
  entities: DetectedEntity[],
  userId: string,
  template: AnswerTemplate,
  modelName: string,
  refused: boolean,
  relatedChunks: RetrievedChunk[] = [],
): Promise<AskResponse> {
  // For no-source / safety-fallback, surface what WAS retrieved as related
  // citations (doc-20: offer related source-backed info) without any claim.
  const citations: Citation[] = relatedChunks.map((c) => ({
    chunk_tag: c.tag,
    source_id: c.source_id,
    source_type: c.provider,
    title: c.title,
    section: c.section,
    url: c.url,
    license: c.license,
    published_date: c.published_date,
    retrieved_at: c.retrieved_at,
    ...citationMeta(c),
  }));
  const grade: EvidenceGrade = "not_applicable";

  const resp: AskResponse = {
    answer_id: answerId,
    intent,
    plain_english_summary: templateCopy(template),
    evidence_grade: grade,
    answer_sections: {
      what_we_know: [],
      what_we_do_not_know: [],
      safety_notes: [],
      questions_to_ask: template === "emergency_routing" ? [] : STANDARD_QUESTIONS,
    },
    citations,
    safety_flags: flags,
    template,
    refused_unsupported: refused,
    oldest_source_date: null,
  };

  await storeTrace({
    id: answerId,
    user_id: userId,
    question,
    intent,
    detected_entities: entities,
    answer: resp,
    evidence_grade: grade,
    source_ids: unique(citations.map((c) => c.source_id)),
    retrieval_scores: [],
    model_name: modelName,
    prompt_version: PROMPT_VERSION,
    safety_flags: flags,
    used_health_context: false,
  });

  return resp;
}

// ---------------------------------------------------------------------------
// DB helpers (service key; user-owned reads scoped to the verified user id)
// ---------------------------------------------------------------------------

/** Verify the bearer token against the auth server. Returns user id or null. */
async function verifyUser(token: string): Promise<string | null> {
  if (!token) return null;
  try {
    const res = await fetch(`${SB_URL}/auth/v1/user`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const user = await res.json() as { id?: string; is_anonymous?: boolean };
    // Phase 3 is authenticated-only. Reject Supabase anonymous sign-in sessions
    // (a guest grant is a deliberate Phase-6 decision, not an accidental path).
    if (!user.id || user.is_anonymous) return null;
    return user.id;
  } catch {
    return null;
  }
}

async function loadHealthContext(userId: string): Promise<string | null> {
  try {
    const url = new URL(`${SB_URL}/rest/v1/user_health_context`);
    url.searchParams.set("user_id", `eq.${userId}`);
    url.searchParams.set(
      "select",
      "age_range,sex,pregnancy_status,allergies,medications,supplements,conditions,kidney_disease_flag,liver_disease_flag",
    );
    const res = await fetch(url, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    });
    if (!res.ok) return null;
    const rows = await res.json() as Array<Record<string, unknown>>;
    const row = rows[0];
    if (!row) return null;
    const parts: string[] = [];
    const list = (v: unknown) => Array.isArray(v) && v.length ? (v as string[]).join(", ") : null;
    if (row.age_range) parts.push(`age range: ${row.age_range}`);
    if (row.sex) parts.push(`sex: ${row.sex}`);
    if (row.pregnancy_status) parts.push(`pregnancy: ${row.pregnancy_status}`);
    const conditions = list(row.conditions);
    if (conditions) parts.push(`conditions: ${conditions}`);
    const meds = list(row.medications);
    if (meds) parts.push(`current medications: ${meds}`);
    const supps = list(row.supplements);
    if (supps) parts.push(`supplements: ${supps}`);
    const allergies = list(row.allergies);
    if (allergies) parts.push(`allergies: ${allergies}`);
    if (row.kidney_disease_flag === "yes") parts.push("kidney disease: yes");
    if (row.liver_disease_flag === "yes") parts.push("liver disease: yes");
    return parts.length ? parts.join("; ") : null;
  } catch {
    return null;
  }
}

interface TraceRow {
  id: string;
  user_id: string | null;
  question: string;
  intent: string;
  detected_entities: unknown;
  answer: unknown;
  evidence_grade: string;
  source_ids: unknown;
  retrieval_scores: unknown;
  model_name: string;
  prompt_version: string;
  safety_flags: unknown;
  used_health_context: boolean;
}

interface QuotaPayload {
  error: "quota_exceeded";
  counter_key: string;
  used: number;
  limit: number;
  plan: string;
}

interface ConsumeUsageResult {
  allowed: boolean;
  reason: string;
  plan: string;
  counter_key: string;
  used: number;
  limit: number;
}

class QuotaExceeded extends Error {
  readonly payload: QuotaPayload;

  constructor(result: ConsumeUsageResult) {
    super("quota_exceeded");
    this.payload = {
      error: "quota_exceeded",
      counter_key: result.counter_key,
      used: result.used,
      limit: result.limit,
      plan: result.plan,
    };
  }
}

async function consumeAskQuota(userId: string): Promise<ConsumeUsageResult> {
  const res = await fetch(`${SB_URL}/rest/v1/rpc/consume_usage`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      p_user_id: userId,
      p_counter_key: "ask_daily",
      p_cost: 1,
      p_metadata: { surface: "ask" },
    }),
  });
  if (!res.ok) throw new Error(`usage check failed (${res.status})`);
  const raw = await res.json() as Partial<ConsumeUsageResult>;
  return {
    allowed: raw.allowed === true,
    reason: typeof raw.reason === "string" ? raw.reason : "unknown",
    plan: typeof raw.plan === "string" ? raw.plan : "free",
    counter_key: typeof raw.counter_key === "string" ? raw.counter_key : "ask_daily",
    used: typeof raw.used === "number" ? raw.used : 0,
    limit: typeof raw.limit === "number" ? raw.limit : 0,
  };
}

async function storeTrace(row: TraceRow): Promise<void> {
  try {
    const traceRow = {
      ...row,
      model_name: modelNameWithSlots(row.model_name),
    };
    const res = await fetch(`${SB_URL}/rest/v1/generated_answers`, {
      method: "POST",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(traceRow),
    });
    // fetch resolves on HTTP 4xx/5xx (only network errors throw), so the status MUST be checked — an
    // un-inspected reject silently loses the trace AND breaks the answer_id FK on the saved chat message.
    if (!res.ok) {
      console.error(`storeTrace rejected (trace lost): ${res.status} ${(await res.text()).slice(0, 300)}`);
    }
  } catch (e) {
    // A trace-write failure must not fail the user's answer, but it MUST be
    // visible — a dropped emergency/self-harm trace is a lost safety audit record.
    console.error("storeTrace failed (trace lost):", (e as Error).message);
  }
}

function modelNameWithSlots(modelName: string): string {
  if (modelName.startsWith("deterministic-") || modelName.includes("|slots(")) return modelName;
  return `${modelName}|slots(classify=${modelFor("classify")};generate=${modelFor("generate")};verify=${modelFor("verify")})`;
}

function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

function allowedOrigins(): string[] {
  const env = Deno.env.get("WEB_ALLOWED_ORIGINS");
  if (!env) return DEFAULT_ALLOWED_ORIGINS;
  return [
    ...DEFAULT_ALLOWED_ORIGINS,
    ...env.split(",").map((s) => s.trim()).filter(Boolean),
  ];
}

function isAllowedOrigin(origin: string): boolean {
  if (allowedOrigins().includes(origin)) return true;
  return /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);
}

function corsHeaders(req?: Request): Record<string, string> {
  const origin = req?.headers.get("origin") ?? "";
  const allowOrigin = origin && isAllowedOrigin(origin) ? origin : "https://app.pharmaorb.app";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function json(payload: unknown, status = 200, req?: Request): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}
