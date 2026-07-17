import { supabase } from "./supabase";
import { toHealthContext } from "./cast";
import type { HealthContext, HealthContextInput } from "@nemesis/shared";

// My Health Context CRUD (user_health_context, 0109) — owner-only via the uhc_owner
// RLS policy. Unlike watchlist_items, this table has NO `DEFAULT auth.uid()` on
// user_id (only 0117 added that, to watchlist), so we set user_id explicitly from the
// JWT on write — which the RLS WITH CHECK (auth.uid() = user_id) then pins to the
// caller. No backend change: the authenticated role already holds the table GRANT
// (same default privilege that lets watchlist write). doc-18: this data is optional,
// independently deletable, and never sent to analytics.

/** doc-18 consent version the user accepts on save. Bump when the consent copy changes. */
export const HEALTH_CONTEXT_CONSENT_VERSION = "2026-06-04";

const COLUMNS =
  "age_range,sex,pregnancy_status,allergies,medications,supplements,conditions,kidney_disease_flag,liver_disease_flag,goals,consent_version,updated_at";

/** GET — the caller's single context row (RLS-scoped), or null if none saved yet. */
export async function fetchHealthContext(): Promise<HealthContext | null> {
  const { data, error } = await supabase.from("user_health_context").select(COLUMNS).maybeSingle();
  if (error) throw new Error(`load health context failed: ${error.message}`);
  return toHealthContext(data);
}

/** UPSERT — create or replace the caller's context (UNIQUE user_id). consent_version
 * + user_id are set here, not by the caller. */
export async function saveHealthContext(input: HealthContextInput): Promise<void> {
  const { data: auth, error: uErr } = await supabase.auth.getUser();
  if (uErr || !auth?.user) throw new Error("sign in to save your health context");
  const { error } = await supabase
    .from("user_health_context")
    .upsert(
      { user_id: auth.user.id, ...input, consent_version: HEALTH_CONTEXT_CONSENT_VERSION },
      { onConflict: "user_id" },
    );
  if (error) throw new Error(`save health context failed: ${error.message}`);
}

/** DELETE — the doc-18 independent "Health context deletion" (distinct from deleting
 * the whole account). Owner policy scopes it to the caller's own row. */
export async function deleteHealthContext(): Promise<void> {
  const { data: auth, error: uErr } = await supabase.auth.getUser();
  if (uErr || !auth?.user) throw new Error("sign in to delete your health context");
  const { error } = await supabase.from("user_health_context").delete().eq("user_id", auth.user.id);
  if (error) throw new Error(`delete health context failed: ${error.message}`);
}
