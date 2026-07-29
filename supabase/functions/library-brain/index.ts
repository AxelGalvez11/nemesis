// library-brain — unified Library + Calendar + Study retrieval, plus safe
// background organization proposals.
//
// User endpoints:
//   POST /context { query, today? }
//   POST /organize { documentId }       (manual refresh)
//   POST /apply { proposalId }
//   POST /reject { proposalId }
//   POST /undo { activityId }
//
// Cron endpoint:
//   POST /drain, Authorization: Bearer <service role>
//
// This function is deployed with verify_jwt=false and verifies user JWTs against
// Supabase Auth itself. /drain additionally requires the exact service key.
// All user reads use a JWT-scoped client so table RLS remains the account
// boundary. Admin access is used only after an ownership check or for the
// service-only queue.

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import {
  embedCoreTexts,
  sha256Hex,
} from "../core-source-sync/embeddings.ts";
import {
  parseLinkProposals,
  proposalMarkdownLine,
  type BrainRelation,
} from "./proposals.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const DEEPSEEK_KEY = Deno.env.get("DEEPSEEK_API_KEY") ?? "";
const GLM_KEY = Deno.env.get("GLM_API_KEY") ?? "";
const GLM_MODEL = Deno.env.get("GLM_MODEL") ?? "glm-5.2";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ALLOWED_ORIGINS = [
  "https://app.enternemesis.com",
  "https://app.pharmaorb.app",
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:8081",
];

const MAX_QUERY_CHARS = 1_000;
const MAX_ORGANIZER_CHARS = 30_000;
const DRAIN_LIMIT = 3;

interface BrainQueueRow {
  attempts: number;
  document_id: string;
  queue_id: string;
  reason: "manual" | "new_material" | "new_question" | "repeated_lapse";
  user_id: string;
}

interface BrainDocument {
  content: string | null;
  deleted: boolean;
  id: string;
  kind: string;
  path: string;
  title: string;
  user_id: string;
}

interface BrainProposalRow {
  action: string;
  id: string;
  reason: string;
  relation: BrainRelation | null;
  source_document_id: string | null;
  status: string;
  target_document_id: string | null;
  user_id: string;
}

function allowedOrigin(origin: string): boolean {
  return ALLOWED_ORIGINS.includes(origin) ||
    /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);
}

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Origin": origin && allowedOrigin(origin)
      ? origin
      : "https://app.enternemesis.com",
  };
}

function json(
  req: Request,
  body: unknown,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json", ...corsHeaders(req) },
    status,
  });
}

function bearer(req: Request): string {
  return (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
}

async function verifyUser(token: string): Promise<string | null> {
  if (!token || !SUPABASE_URL || !ANON_KEY) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const user = await res.json().catch(() => null) as {
      id?: unknown;
      is_anonymous?: unknown;
    } | null;
    return typeof user?.id === "string" && user.is_anonymous !== true
      ? user.id
      : null;
  } catch {
    return null;
  }
}

function userClient(token: string): SupabaseClient {
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

function pathAction(req: Request): string {
  return new URL(req.url).pathname.split("/").filter(Boolean).pop() ?? "";
}

function isoDay(value: unknown): string {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  return new Date().toISOString().slice(0, 10);
}

function plusDays(day: string, days: number): string {
  const value = new Date(`${day}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function idList(values: readonly string[]): string {
  return values.map((value) => `"${value.replace(/"/g, "")}"`).join(",");
}

async function context(
  req: Request,
  scoped: SupabaseClient,
  body: Record<string, unknown>,
): Promise<Response> {
  const query = typeof body.query === "string"
    ? body.query.trim().slice(0, MAX_QUERY_CHARS)
    : "";
  if (!query) return json(req, { error: "empty query" }, 400);

  let embedding: number[] | undefined;
  try {
    [embedding] = await embedCoreTexts([query], "query", { strict: true });
  } catch (error) {
    console.warn("brain query embedding failed", (error as Error).message);
  }
  if (!embedding) {
    return json(req, { error: "brain retrieval unavailable" }, 503);
  }

  const today = isoDay(body.today);
  const horizon = plusDays(today, 30);
  const { data: hits, error: hitError } = await scoped.rpc(
    "match_library_brain",
    {
      match_count: 10,
      match_threshold: 0.35,
      query_embedding: embedding,
    },
  );
  if (hitError) {
    console.warn("brain ANN failed", hitError.message);
    return json(req, { error: "brain retrieval unavailable" }, 503);
  }

  const noteHits = Array.isArray(hits) ? hits : [];
  const primaryIds = [
    ...new Set(
      noteHits.flatMap((row) =>
        typeof row?.document_id === "string" ? [row.document_id] : []
      ),
    ),
  ].slice(0, 8);

  let connections: unknown[] = [];
  let linkedNotes: unknown[] = [];
  let provenance: unknown[] = [];
  if (primaryIds.length) {
    const ids = idList(primaryIds);
    const [
      { data: edgeRows },
      { data: provenanceRows },
    ] = await Promise.all([
      scoped.from("library_link_edges")
        .select(
          "id,source_document_id,target_document_id,target_ref,relation,origin,confidence,source_excerpt",
        )
        .or(
          `source_document_id.in.(${ids}),target_document_id.in.(${ids})`,
        )
        .limit(40),
      scoped.from("library_provenance")
        .select(
          "id,document_id,source_kind,source_id,source_path,location,excerpt",
        )
        .in("document_id", primaryIds)
        .limit(30),
    ]);
    connections = edgeRows ?? [];
    provenance = provenanceRows ?? [];

    const neighborIds = [
      ...new Set(
        (edgeRows ?? []).flatMap((edge) => [
          edge.source_document_id,
          edge.target_document_id,
        ]).filter((id): id is string =>
          typeof id === "string" && !primaryIds.includes(id)
        ),
      ),
    ].slice(0, 12);
    if (neighborIds.length) {
      const { data } = await scoped.from("readable_library_documents")
        .select("id,path,title,content,updated_at")
        .in("id", neighborIds)
        .eq("deleted", false)
        .limit(12);
      linkedNotes = (data ?? []).map((note) => ({
        ...note,
        content: typeof note.content === "string"
          ? note.content.slice(0, 1_200)
          : "",
      }));
    }
  }

  const [
    { data: events },
    { data: weakCards },
    { data: proposals },
  ] = await Promise.all([
    scoped.from("calendar_events")
      .select("id,title,date,time,kind,course,note,source")
      .gte("date", today)
      .lte("date", horizon)
      .order("date", { ascending: true })
      .limit(20),
    scoped.from("study_cards")
      .select(
        "id,deck_id,front,back,source_path,lapses,due_at,study_decks(name)",
      )
      .eq("suspended", false)
      .gte("lapses", 2)
      .order("lapses", { ascending: false })
      .limit(12),
    scoped.from("library_organization_proposals")
      .select(
        "id,action,source_document_id,target_document_id,relation,reason,confidence,trigger_kind,created_at",
      )
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(12),
  ]);

  return json(req, {
    connections,
    events: events ?? [],
    linkedNotes,
    notes: noteHits,
    proposals: proposals ?? [],
    provenance,
    weakCards: weakCards ?? [],
  });
}

async function providerJson(prompt: string): Promise<string> {
  const providers = [
    {
      base: "https://api.deepseek.com",
      key: DEEPSEEK_KEY,
      model: "deepseek-chat",
    },
    {
      base: "https://api.z.ai/api/paas/v4",
      key: GLM_KEY,
      model: GLM_MODEL,
    },
  ].filter((provider) => provider.key);

  let lastError = "no organizer model key configured";
  for (const provider of providers) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    try {
      const res = await fetch(`${provider.base}/chat/completions`, {
        body: JSON.stringify({
          messages: [
            {
              content:
                "You organize a student's private knowledge graph. Return only valid JSON. Never suggest deleting or rewriting the student's words.",
              role: "system",
            },
            { content: prompt, role: "user" },
          ],
          model: provider.model,
          response_format: { type: "json_object" },
          temperature: 0.1,
        }),
        headers: {
          Authorization: `Bearer ${provider.key}`,
          "Content-Type": "application/json",
        },
        method: "POST",
        signal: controller.signal,
      });
      if (!res.ok) {
        lastError = `${provider.model}: ${res.status} ${
          (await res.text()).slice(0, 200)
        }`;
        continue;
      }
      const body = await res.json().catch(() => null) as {
        choices?: Array<{ message?: { content?: unknown } }>;
      } | null;
      const content = body?.choices?.[0]?.message?.content;
      if (typeof content === "string" && content.trim()) return content;
      lastError = `${provider.model}: empty response`;
    } catch (error) {
      lastError = `${provider.model}: ${(error as Error).message}`;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(lastError);
}

async function analyzeDocument(
  userId: string,
  documentId: string,
  triggerKind: BrainQueueRow["reason"],
): Promise<{ proposals: number; skipped: boolean }> {
  const { data: source, error: sourceError } = await admin
    .from("readable_library_documents")
    .select("id,user_id,path,title,content,kind,deleted")
    .eq("id", documentId)
    .eq("user_id", userId)
    .maybeSingle();
  if (sourceError) throw new Error(`read source: ${sourceError.message}`);
  const document = source as BrainDocument | null;
  if (!document || document.deleted || document.kind !== "note") {
    return { proposals: 0, skipped: true };
  }

  const canonical = `${document.title}\n${document.content ?? ""}`;
  const hash = await sha256Hex(canonical);
  const { data: state } = await admin.from("library_brain_state")
    .select("content_hash")
    .eq("document_id", documentId)
    .maybeSingle();
  if (state?.content_hash === hash && triggerKind !== "manual") {
    return { proposals: 0, skipped: true };
  }

  const [embedding] = await embedCoreTexts(
    [canonical.slice(0, MAX_ORGANIZER_CHARS)],
    "query",
    { strict: true },
  );
  if (!embedding) throw new Error("organizer embedding failed");
  const { data: rawHits, error: hitError } = await admin.rpc(
    "match_library_brain_for_user",
    {
      match_count: 16,
      match_threshold: 0.4,
      p_user_id: userId,
      query_embedding: embedding,
    },
  );
  if (hitError) throw new Error(`organizer ANN: ${hitError.message}`);

  const candidates = new Map<string, {
    content: string;
    id: string;
    path: string;
    similarity: number;
    title: string;
  }>();
  for (const hit of rawHits ?? []) {
    if (
      typeof hit.document_id !== "string" ||
      hit.document_id === documentId ||
      candidates.has(hit.document_id)
    ) continue;
    candidates.set(hit.document_id, {
      content: String(hit.content ?? "").slice(0, 1_500),
      id: hit.document_id,
      path: String(hit.path ?? ""),
      similarity: Number(hit.similarity) || 0,
      title: String(hit.title ?? ""),
    });
    if (candidates.size >= 10) break;
  }

  if (!candidates.size) {
    await admin.from("library_brain_state").upsert({
      analyzed_at: new Date().toISOString(),
      content_hash: hash,
      document_id: documentId,
      user_id: userId,
    }, { onConflict: "document_id" });
    return { proposals: 0, skipped: false };
  }

  const prompt = [
    "Classify only strong, useful relationships from SOURCE to a CANDIDATE.",
    "Allowed relations: prerequisite_of, part_of, related_to, contrasts_with, applied_in.",
    "Use prerequisite_of only when SOURCE is needed before TARGET; part_of only when SOURCE belongs inside TARGET; applied_in when SOURCE is an application/example used in TARGET.",
    "Do not force a relationship. Maximum 4.",
    'Return {"proposals":[{"target_document_id":"uuid","relation":"related_to","reason":"short explanation","confidence":0.0}]}',
    "",
    `SOURCE id=${document.id} title=${JSON.stringify(document.title)} path=${JSON.stringify(document.path)}`,
    (document.content ?? "").slice(0, 12_000),
    "",
    "CANDIDATES:",
    ...[...candidates.values()].map((candidate) =>
      [
        `id=${candidate.id} similarity=${candidate.similarity.toFixed(3)} title=${JSON.stringify(candidate.title)} path=${JSON.stringify(candidate.path)}`,
        candidate.content,
      ].join("\n")
    ),
  ].join("\n");

  const output = await providerJson(prompt);
  const parsed = parseLinkProposals(
    output,
    new Set(candidates.keys()),
    documentId,
  );

  let inserted = 0;
  for (const proposal of parsed) {
    const { error } = await admin.from("library_organization_proposals").insert({
      action: "add_link",
      confidence: proposal.confidence,
      payload: {},
      reason: proposal.reason,
      relation: proposal.relation,
      source_document_id: documentId,
      target_document_id: proposal.target_document_id,
      trigger_kind: triggerKind,
      user_id: userId,
    });
    // A duplicate pending proposal is a successful no-op.
    if (!error) inserted += 1;
    else if (error.code !== "23505") {
      throw new Error(`save proposal: ${error.message}`);
    }
  }

  const { error: stateError } = await admin.from("library_brain_state").upsert({
    analyzed_at: new Date().toISOString(),
    content_hash: hash,
    document_id: documentId,
    user_id: userId,
  }, { onConflict: "document_id" });
  if (stateError) throw new Error(`save state: ${stateError.message}`);
  return { proposals: inserted, skipped: false };
}

async function drain(req: Request): Promise<Response> {
  const { data, error } = await admin.rpc("claim_library_brain_queue", {
    p_limit: DRAIN_LIMIT,
  });
  if (error) return json(req, { error: error.message }, 500);
  const rows = (data ?? []) as BrainQueueRow[];
  let analyzed = 0;
  let proposals = 0;
  const failures: string[] = [];

  for (const row of rows) {
    try {
      const result = await analyzeDocument(
        row.user_id,
        row.document_id,
        row.reason,
      );
      if (!result.skipped) analyzed += 1;
      proposals += result.proposals;
      await admin.rpc("finish_library_brain_queue", {
        p_error: null,
        p_queue_id: row.queue_id,
      });
    } catch (error) {
      const message = (error as Error).message;
      failures.push(`${row.document_id}: ${message}`);
      await admin.rpc("finish_library_brain_queue", {
        p_error: message,
        p_queue_id: row.queue_id,
      });
    }
  }

  return json(req, {
    analyzed,
    claimed: rows.length,
    failures,
    proposals,
  });
}

async function readOwnedProposal(
  proposalId: string,
  userId: string,
): Promise<BrainProposalRow | null> {
  const { data } = await admin.from("library_organization_proposals")
    .select(
      "id,user_id,action,source_document_id,target_document_id,relation,reason,status",
    )
    .eq("id", proposalId)
    .eq("user_id", userId)
    .maybeSingle();
  return data as BrainProposalRow | null;
}

async function applyProposal(
  req: Request,
  userId: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const proposalId = typeof body.proposalId === "string"
    ? body.proposalId
    : "";
  const proposal = await readOwnedProposal(proposalId, userId);
  if (!proposal) return json(req, { error: "proposal not found" }, 404);
  if (proposal.status !== "pending") {
    return json(req, { error: "proposal is no longer pending" }, 409);
  }
  if (
    proposal.action !== "add_link" ||
    !proposal.source_document_id ||
    !proposal.target_document_id ||
    !proposal.relation
  ) {
    return json(req, { error: "this proposal type is not applyable yet" }, 409);
  }

  const [{ data: source }, { data: target }] = await Promise.all([
    admin.from("readable_library_documents")
      .select("id,user_id,title,content,deleted,kind")
      .eq("id", proposal.source_document_id)
      .eq("user_id", userId)
      .maybeSingle(),
    admin.from("readable_library_documents")
      .select("id,user_id,title,deleted,kind")
      .eq("id", proposal.target_document_id)
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  if (
    !source || !target || source.deleted || target.deleted ||
    source.kind !== "note" || target.kind !== "note"
  ) return json(req, { error: "a linked note no longer exists" }, 409);

  const line = proposalMarkdownLine(proposal.relation, target.title);
  const before = typeof source.content === "string" ? source.content : "";
  const alreadyPresent = before.split(/\r?\n/).some((value) =>
    value.trim() === line
  );
  const after = alreadyPresent
    ? before
    : before.trimEnd()
      ? `${before.trimEnd()}\n\n## Connections\n${line}\n`
      : `## Connections\n${line}\n`;

  if (!alreadyPresent) {
    const { error } = await admin.from("readable_library_documents")
      .update({ content: after })
      .eq("id", source.id)
      .eq("user_id", userId);
    if (error) return json(req, { error: "could not apply proposal" }, 500);
  }

  const { data: activity, error: activityError } = await admin
    .from("library_brain_activity")
    .insert({
      action: "add_link",
      after_state: { content: after, line },
      before_state: { content: before },
      document_id: source.id,
      proposal_id: proposal.id,
      reason: proposal.reason,
      user_id: userId,
    })
    .select("id")
    .single();
  if (activityError) {
    // Do not hide the completed safe edit. Return a partial state so operators
    // can repair the audit row rather than retrying and duplicating content.
    return json(req, { applied: true, auditError: true }, 500);
  }

  await admin.from("library_organization_proposals").update({
    applied_at: new Date().toISOString(),
    decided_at: new Date().toISOString(),
    status: "applied",
  }).eq("id", proposal.id).eq("user_id", userId);
  return json(req, { activityId: activity.id, applied: true });
}

async function rejectProposal(
  req: Request,
  userId: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const proposalId = typeof body.proposalId === "string"
    ? body.proposalId
    : "";
  const { data, error } = await admin.from("library_organization_proposals")
    .update({ decided_at: new Date().toISOString(), status: "rejected" })
    .eq("id", proposalId)
    .eq("user_id", userId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (error) return json(req, { error: "could not reject proposal" }, 500);
  if (!data) return json(req, { error: "proposal not found" }, 404);
  return json(req, { rejected: true });
}

async function undoActivity(
  req: Request,
  userId: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const activityId = typeof body.activityId === "string" ? body.activityId : "";
  const { data: activity } = await admin.from("library_brain_activity")
    .select("id,user_id,proposal_id,action,document_id,before_state,after_state,undone_at")
    .eq("id", activityId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!activity) return json(req, { error: "activity not found" }, 404);
  if (activity.undone_at) return json(req, { error: "already undone" }, 409);
  if (activity.action !== "add_link" || !activity.document_id) {
    return json(req, { error: "this activity cannot be undone yet" }, 409);
  }

  const line = typeof activity.after_state?.line === "string"
    ? activity.after_state.line
    : "";
  const { data: document } = await admin.from("readable_library_documents")
    .select("id,user_id,content")
    .eq("id", activity.document_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!document || !line) {
    return json(req, { error: "the note can no longer be safely undone" }, 409);
  }
  const lines = String(document.content ?? "").split(/\r?\n/);
  const index = lines.findIndex((value) => value.trim() === line);
  if (index < 0) {
    return json(req, { error: "the link was edited; undo would overwrite newer work" }, 409);
  }
  lines.splice(index, 1);
  const content = lines.join("\n")
    .replace(/\n## Connections\n\s*$/, "")
    .replace(/\n{3,}/g, "\n\n");
  const { error: updateError } = await admin.from("readable_library_documents")
    .update({ content })
    .eq("id", document.id)
    .eq("user_id", userId);
  if (updateError) return json(req, { error: "could not undo activity" }, 500);

  const now = new Date().toISOString();
  await Promise.all([
    admin.from("library_brain_activity").update({ undone_at: now })
      .eq("id", activity.id).eq("user_id", userId),
    activity.proposal_id
      ? admin.from("library_organization_proposals")
        .update({ status: "undone" })
        .eq("id", activity.proposal_id)
        .eq("user_id", userId)
      : Promise.resolve(),
  ]);
  return json(req, { undone: true });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
  }
  if (req.method !== "POST") {
    return json(req, { error: "method not allowed" }, 405);
  }
  if (!SUPABASE_URL || !SERVICE_ROLE || !ANON_KEY) {
    return json(req, { error: "function not configured" }, 500);
  }

  const action = pathAction(req);
  const token = bearer(req);
  if (action === "drain") {
    if (token !== SERVICE_ROLE) return json(req, { error: "forbidden" }, 403);
    return await drain(req);
  }

  const userId = await verifyUser(token);
  if (!userId) return json(req, { error: "sign in required" }, 401);
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;

  if (action === "context") {
    return await context(req, userClient(token), body);
  }
  if (action === "organize") {
    const documentId = typeof body.documentId === "string"
      ? body.documentId
      : "";
    if (!documentId) return json(req, { error: "documentId required" }, 400);
    try {
      const result = await analyzeDocument(userId, documentId, "manual");
      return json(req, result);
    } catch (error) {
      console.error("manual organize failed", (error as Error).message);
      return json(req, { error: "could not organize this note" }, 503);
    }
  }
  if (action === "apply") return await applyProposal(req, userId, body);
  if (action === "reject") return await rejectProposal(req, userId, body);
  if (action === "undo") return await undoActivity(req, userId, body);
  return json(req, { error: "unknown action" }, 404);
});

