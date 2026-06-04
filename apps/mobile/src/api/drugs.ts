import { supabase } from "./supabase";
import { castLabelDocs, castPubmed, castTrials, toDrugOverview } from "./cast";
import type { DrugPubmed, DrugTrial, LabelDoc } from "./types";
import type { DrugOverview } from "@pharmabro/shared";

// The §8 drug reads. All authenticated-only (anon REVOKEd: 0110/0111/0112), so a
// signed-in session must exist; supabase-js attaches the user JWT automatically.
// Each throws on an RPC error so TanStack Query surfaces the doc-06 error state.

/** GET /drugs/{id} (get_drug). null = not-found. */
export async function fetchDrug(id: string): Promise<DrugOverview | null> {
  const { data, error } = await supabase.rpc("get_drug", { p_id: id });
  if (error) throw new Error(`get_drug failed: ${error.message}`);
  return toDrugOverview(data);
}

/** GET /drugs/{id}/label (get_drug_label) — extracted FDA/DailyMed sections + citation (AC4). */
export async function fetchDrugLabel(id: string): Promise<LabelDoc[]> {
  const { data, error } = await supabase.rpc("get_drug_label", { p_id: id });
  if (error) throw new Error(`get_drug_label failed: ${error.message}`);
  return castLabelDocs(data);
}

/** GET /drugs/{id}/trials (get_drug_trials) — ClinicalTrials.gov studies + citation (AC5). */
export async function fetchDrugTrials(id: string): Promise<DrugTrial[]> {
  const { data, error } = await supabase.rpc("get_drug_trials", { p_id: id });
  if (error) throw new Error(`get_drug_trials failed: ${error.message}`);
  return castTrials(data);
}

/** GET /drugs/{id}/pubmed (get_drug_pubmed) — PubMed articles + citation (AC6). */
export async function fetchDrugPubmed(id: string): Promise<DrugPubmed[]> {
  const { data, error } = await supabase.rpc("get_drug_pubmed", { p_id: id });
  if (error) throw new Error(`get_drug_pubmed failed: ${error.message}`);
  return castPubmed(data);
}
