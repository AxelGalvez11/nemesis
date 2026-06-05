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

import { detectViolations, preScreen } from "./safety.ts";
import { classify } from "./classify.ts";
import { resolveEntities } from "./resolve.ts";
import { retrieve } from "./retrieve.ts";
import { generate } from "./generate.ts";
import { enforceCitations, type RetrievedChunk } from "./citation.ts";
import { hasLlmKey, llmApiKey } from "./llm.ts";
import { PROMPT_VERSION } from "./prompts.ts";
import { withProfessionalRouting } from "./routing.ts";
import {
  CONSERVATIVE_FALLBACK_COPY,
  EMERGENCY_COPY,
  NO_SOURCE_COPY,
  providerPriorityForIntent,
  SOURCING_COPY,
  STANDARD_QUESTIONS,
} from "./templates.ts";
import type {
  AnswerTemplate,
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
const MATCH_COUNT = 8;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405, req);

  if (!hasLlmKey()) return json({ error: "LLM API key not configured" }, 500, req);

  // ---- verify caller (authenticated-only) ----
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const userId = await verifyUser(token);
  if (!userId) return json({ error: "authentication required" }, 401, req);

  let body: { question?: string; use_health_context?: boolean; conversation_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400, req);
  }
  const question = (body.question ?? "").trim();
  if (!question) return json({ error: "question required" }, 400, req);

  try {
    const resp = await runAsk(question, !!body.use_health_context, userId);
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
): Promise<AskResponse> {
  const answerId = crypto.randomUUID();
  const apiKey = llmApiKey();

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

  // ---- 0b. server-side usage limit (before LLM classify/generate spend) ----
  const quota = await consumeAskQuota(userId);
  if (!quota.allowed) throw new QuotaExceeded(quota);

  // ---- 1. classify ----
  const cls = await classify(question, apiKey);
  const flags = unique<SafetyFlag>([...pre.flags, ...cls.safety_flags]);

  if (flags.some((f) => f === "emergency_possible" || f === "overdose_possible" || f === "self_harm")) {
    return await finalizeTemplate(answerId, question, "emergency_overdose", flags, [], userId,
      "emergency_routing", cls.model, false);
  }
  if (cls.intent === "drug_sourcing" || flags.includes("drug_sourcing")) {
    return await finalizeTemplate(answerId, question, "drug_sourcing", flags, [], userId,
      "sourcing_refusal", cls.model, false);
  }

  // ---- 2. resolve entities ----
  const entities = await resolveEntities(cls.entity_mentions, SB_URL, SERVICE_KEY);
  const resolvedIds = entities.map((e) => e.entity_id).filter((id): id is string => !!id);
  const scopeId = resolvedIds.length === 1 ? resolvedIds[0] : null; // 2+ entities -> broad

  // ---- 3. retrieve ----
  const priority = providerPriorityForIntent(cls.intent);
  let ret = await retrieve({
    question,
    providers: priority,
    entityId: scopeId,
    threshold: ASK_MATCH_THRESHOLD,
    matchCount: MATCH_COUNT,
    sbUrl: SB_URL,
    serviceKey: SERVICE_KEY,
  });
  // Scoped retrieval can come back empty for an investigational drug (no FDA
  // label -> fails a label-first provider filter) or one whose sources weren't
  // bridged to its entity in Phase 2 (e.g. retatrutide, BPC-157 — their
  // trials/PubMed chunks exist but the drug_entity_sources link is sparse). Before
  // refusing, retry with NO provider AND NO entity filter (broad semantic search).
  if (ret.chunks.length === 0 && (priority !== null || scopeId !== null)) {
    ret = await retrieve({
      question,
      providers: null,
      entityId: null,
      threshold: ASK_MATCH_THRESHOLD,
      matchCount: MATCH_COUNT,
      sbUrl: SB_URL,
      serviceKey: SERVICE_KEY,
    });
  }

  if (ret.chunks.length === 0) {
    return await finalizeTemplate(answerId, question, cls.intent,
      unique<SafetyFlag>([...flags, "no_sources_found"]), entities, userId,
      "no_source", cls.model, true);
  }

  // ---- 4. health context (verified-user-scoped) ----
  const healthContext = useHealthContext ? await loadHealthContext(userId) : null;

  // ---- 5. generate (graceful: a total LLM failure degrades to a cited refusal,
  //         never a user-facing 500) ----
  let gen: Awaited<ReturnType<typeof generate>>;
  try {
    gen = await generate({
      question,
      intent: cls.intent,
      chunks: ret.chunks,
      healthContext,
      apiKey,
    });
  } catch (e) {
    console.error("ask generate failed after retries:", (e as Error).message);
    return await finalizeTemplate(answerId, question, cls.intent,
      unique<SafetyFlag>([...flags, "no_sources_found"]), entities, userId,
      "no_source", `${cls.model}|generate_failed`, true, ret.chunks);
  }
  const modelName = `${cls.model}|${gen.model}`;

  // ---- 6a. post-generation safety filter (the doc-20 guarantee) ----
  // Scan every DECLARATIVE model section (assertions the system would be making).
  // questions_to_ask is excluded ON PURPOSE: it is interrogative — "is it safe
  // for me?" / "should I stop X?" are questions to pose to a clinician, NOT the
  // forbidden assertions "[X] is safe" / "stop taking X", and scanning them with
  // the claim detectors false-positives (discarding good answers).
  const assembled = [
    gen.raw.bottom_line.text,
    ...gen.raw.what_we_know.map((p) => p.text),
    ...gen.raw.safety_notes.map((p) => p.text),
    ...gen.raw.what_we_do_not_know.map((p) => p.text),
  ].join("  ");
  const violations = detectViolations(assembled);
  if (violations.length > 0) {
    // Discard the unsafe generation; surface the retrieved sources as related
    // info instead of the synthesized (unsafe) text. LOG why (rule + snippet):
    // a backstop that silently swallows a cited answer is not debuggable, and a
    // spurious discard (cautious interrogative phrasing mis-flagged) is
    // indistinguishable from a real catch without this line — in prod too.
    console.error("ask safety_fallback — discarded generation:", JSON.stringify(violations));
    return await finalizeTemplate(answerId, question, cls.intent,
      flags, entities, userId, "safety_fallback", modelName, true, ret.chunks);
  }

  // ---- 6b. citation enforcement ----
  const enf = enforceCitations({ ...gen.raw, chunks: ret.chunks });
  if (enf.refusedUnsupported) {
    return await finalizeTemplate(answerId, question, cls.intent,
      unique<SafetyFlag>([...flags, "no_sources_found"]), entities, userId,
      "no_source", modelName, true, ret.chunks);
  }

  // ---- 7. assemble ----
  // Deterministic professional-routing guarantee: generation under-emits the
  // "talk to your pharmacist/prescriber" line for personal-decision intents, so
  // append it here (post-enforcement — an uncited safety note would otherwise be
  // dropped by enforceCitations). See routing.ts.
  const answer_sections = {
    ...enf.answer_sections,
    safety_notes: withProfessionalRouting(enf.answer_sections.safety_notes, cls.intent),
  };
  const resp: AskResponse = {
    answer_id: answerId,
    intent: cls.intent,
    plain_english_summary: enf.plain_english_summary,
    evidence_grade: gen.raw.evidence_grade,
    answer_sections,
    citations: enf.citations,
    safety_flags: flags,
    refused_unsupported: false,
    oldest_source_date: enf.oldest_source_date,
  };

  // ---- 8. trace store ----
  await storeTrace({
    id: answerId,
    user_id: userId,
    question,
    intent: cls.intent,
    detected_entities: entities,
    answer: resp,
    evidence_grade: gen.raw.evidence_grade,
    source_ids: unique(enf.citations.map((c) => c.source_id)),
    retrieval_scores: ret.chunks.map((c) => ({ chunk_id: c.chunk_id, similarity: c.similarity })),
    model_name: modelName,
    prompt_version: PROMPT_VERSION,
    safety_flags: flags,
    used_health_context: !!healthContext,
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
    await fetch(`${SB_URL}/rest/v1/generated_answers`, {
      method: "POST",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(row),
    });
  } catch (e) {
    // A trace-write failure must not fail the user's answer, but it MUST be
    // visible — a dropped emergency/self-harm trace is a lost safety audit record.
    console.error("storeTrace failed (trace lost):", (e as Error).message);
  }
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
