import { supabase } from "./supabase";
import { toDrugOverview } from "./cast";
import type { DrugOverview } from "@pharmabro/shared";

/**
 * GET /drugs/{id} — the get_drug RPC (§8). Authenticated-only (anon REVOKEd), so a
 * signed-in session must exist; supabase-js attaches the user JWT automatically.
 * Returns null when the entity is not found.
 */
export async function fetchDrug(id: string): Promise<DrugOverview | null> {
  const { data, error } = await supabase.rpc("get_drug", { p_id: id });
  if (error) throw new Error(`get_drug failed: ${error.message}`);
  return toDrugOverview(data);
}
