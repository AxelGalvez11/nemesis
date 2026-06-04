import { supabase } from "./supabase";

// §11 user-facing "report this answer": flags the caller's OWN generated_answer via the
// report_answer RPC (0120, SECURITY DEFINER + auth.uid()-scoped, authenticated-only). The
// flag surfaces the answer in the operator review queue (list_flagged_answers).
export async function reportAnswer(answerId: string): Promise<void> {
  const { data, error } = await supabase.rpc("report_answer", { p_answer_id: answerId });
  if (error) throw new Error(`report failed: ${error.message}`);
  // report_answer returns false when no own-row matched (stale/invalid id) — treat that as
  // a failure so the UI shows "couldn't report", not a false confirmation.
  if (data !== true) throw new Error("could not report this answer");
}
