import { supabase } from "./supabase";

// AC10 account data lifecycle (Phase 7). Export = the export_my_data() RPC (0119,
// auth.uid()-scoped, authenticated-only). Delete = the account-delete edge fn, which
// service-role-deletes auth.users(uid) so every owned table cascades. Both attach the
// user JWT automatically (supabase-js); the service role never touches the bundle.

/** The caller's own data (export_my_data jsonb). Loosely typed — it's a user-facing dump. */
export interface ExportBundle {
  exported_at: string;
  user_id: string;
  profile: unknown;
  health_context: unknown;
  subscription: unknown;
  watchlist: unknown[];
  saved_reports: unknown[];
  answers: unknown[];
}

/** GET the caller's own data as one bundle (doc-18 data export). */
export async function exportMyData(): Promise<ExportBundle> {
  const { data, error } = await supabase.rpc("export_my_data");
  if (error) throw new Error(`export failed: ${error.message}`);
  return (data ?? {}) as ExportBundle;
}

/** Permanently delete the caller's account (irreversible). Requires explicit confirm. */
export async function deleteAccount(): Promise<void> {
  const { error } = await supabase.functions.invoke("account-delete", { body: { confirm: true } });
  if (error) throw new Error(`account deletion failed: ${error.message}`);
}
