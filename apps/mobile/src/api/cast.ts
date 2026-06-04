import type { DrugOverview } from "@pharmabro/shared";

// get_drug returns jsonb, which `supabase gen types` types as `Json` — so the
// narrowing to the frozen §8 DrugOverview DTO happens here, at the client boundary.
// We guard the mandatory fields so a backend shape change surfaces as not-found
// rather than a screen rendering undefined. A null RPC body (PostgREST 200 null) is
// also not-found (the get_drug convention). (Full per-field validation via a schema
// is a possible later hardening — see the reviewers' note; not security-critical
// since the data is from our own authenticated RPC and the sink is RN <Text>.)
export function toDrugOverview(raw: unknown): DrugOverview | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || typeof r.canonical_name !== "string") return null;
  return r as unknown as DrugOverview;
}
