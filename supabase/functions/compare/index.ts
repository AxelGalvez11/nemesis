// Supabase Edge Function: compare  (IMPLEMENTATION_PLAN.md §8 — GET /compare)
//
// Structured side-by-side of two entities: mechanism, approved uses, evidence
// strength, trial status, safety, cost/access, sources (doc-11). Composes the
// existing authenticated reads (get_drug + get_drug_label + get_drug_trials) for
// each id and pairs them via the pure buildComparison(); the client renders, not
// computes. Service key for the catalog reads; the CALLER must be a verified
// authenticated (non-anonymous) user — guest scope is a Phase-6b decision.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

import { buildComparison, type CompareSideInput } from "./build.ts";
import type { SourceRef } from "../../../packages/shared/src/search.ts";
import type { EvidenceTier } from "../../../packages/shared/src/evidence.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SECTION_MAX = 500; // truncate label section prose — compare is a summary view

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "GET") return json({ error: "method not allowed" }, 405);

  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const userId = await verifyUser(token);
  if (!userId) return json({ error: "authentication required" }, 401);

  const params = new URL(req.url).searchParams;
  const left = params.get("left") ?? "";
  const right = params.get("right") ?? "";
  if (!UUID_RE.test(left) || !UUID_RE.test(right)) {
    return json({ error: "left and right must be entity uuids" }, 400);
  }
  if (left === right) return json({ error: "left and right must differ" }, 400);

  try {
    const [ls, rs] = await Promise.all([sideInput(left), sideInput(right)]);
    if (!ls || !rs) return json({ error: "entity not found" }, 404);
    return json(buildComparison(ls, rs));
  } catch (e) {
    console.error("compare error:", (e as Error).message);
    return json({ error: "compare failed" }, 500);
  }
});

interface DrugPayload {
  id?: string;
  canonical_name?: string;
  approved_status?: string;
  mechanism_summary?: string | null;
  evidence_score?: { score: EvidenceTier; rationale: string } | null;
  counts?: { trials?: number; prices?: number };
  sources?: SourceRef[];
}

async function sideInput(id: string): Promise<CompareSideInput | null> {
  const [drug, label, trials] = await Promise.all([
    rpc("get_drug", { p_id: id }) as Promise<DrugPayload | null>,
    rpc("get_drug_label", { p_id: id }) as Promise<Array<{ extracted_sections?: Record<string, unknown> }> | null>,
    rpc("get_drug_trials", { p_id: id, p_phase: null, p_status: null, max_results: 1 }) as Promise<Array<{ status?: string }> | null>,
  ]);
  if (!drug || !drug.id) return null;

  const sections = (Array.isArray(label) && label[0]?.extracted_sections) || {};
  const latestTrial = Array.isArray(trials) ? trials[0] : null;

  return {
    id: drug.id,
    name: drug.canonical_name ?? "",
    approved_status: drug.approved_status ?? "unknown",
    mechanism_summary: drug.mechanism_summary ?? null,
    evidence: drug.evidence_score
      ? { score: drug.evidence_score.score, rationale: drug.evidence_score.rationale }
      : null,
    indications: sectionText(sections, "indications"),
    boxed_warning: sectionText(sections, "boxed_warning"),
    key_warnings: sectionText(sections, "warnings") ?? sectionText(sections, "contraindications"),
    trial_count: drug.counts?.trials ?? 0,
    latest_trial_status: latestTrial?.status ?? null,
    price_points: drug.counts?.prices ?? 0,
    // From the drug_entity_sources bridge (all relation types — label_for/trial_of/
    // …), so label + trial citations are already represented.
    sources: Array.isArray(drug.sources) ? drug.sources : [],
  };
}

function sectionText(sections: Record<string, unknown>, key: string): string | null {
  const v = sections?.[key];
  if (v == null) return null;
  // openFDA sections (our primary label source) are plain strings; DailyMed-style
  // structured arrays carry prose under `.text`. Flatten both so the client never
  // renders a raw JSON blob.
  const flat = (x: unknown): string =>
    typeof x === "string"
      ? x
      : x && typeof x === "object"
      ? String((x as Record<string, unknown>).text ?? JSON.stringify(x))
      : String(x);
  const t = typeof v === "string" ? v : Array.isArray(v) ? v.map(flat).join(" ") : flat(v);
  const trimmed = t.trim();
  if (!trimmed) return null;
  return trimmed.length > SECTION_MAX ? `${trimmed.slice(0, SECTION_MAX)}…` : trimmed;
}

async function rpc(fn: string, args: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`${fn} -> ${res.status}`);
  return await res.json();
}

async function verifyUser(token: string): Promise<string | null> {
  if (!token) return null;
  try {
    const res = await fetch(`${SB_URL}/auth/v1/user`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const user = await res.json() as { id?: string; is_anonymous?: boolean };
    if (!user.id || user.is_anonymous) return null; // guest scope = Phase-6b decision
    return user.id;
  } catch (e) {
    console.error("compare verifyUser error:", (e as Error).message); // fail-closed, but log the cause
    return null;
  }
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
