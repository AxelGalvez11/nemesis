import { supabase } from "./supabase";
import { toSourceDetail } from "./cast";
import type { SourceDetail } from "@nemesis/shared";

/**
 * GET /sources/{id} (get_source) — the doc-12 Source Viewer record. Authenticated-only
 * (anon REVOKEd: 0118). null = not-found (drives the doc-06 no-source state).
 */
export async function fetchSource(id: string): Promise<SourceDetail | null> {
  const { data, error } = await supabase.rpc("get_source", { p_id: id });
  if (error) throw new Error(`get_source failed: ${error.message}`);
  return toSourceDetail(data);
}
