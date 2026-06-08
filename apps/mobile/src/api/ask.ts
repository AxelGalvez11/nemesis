import { supabase } from "./supabase";
import { toAskResponse } from "./cast";
import { capture } from "@/lib/analytics";
import type { AskResponse } from "@pharmabro/shared";

/**
 * POST /ask (the `ask` edge function, §7/§8). Authenticated-only — it verifies the
 * bearer token and REJECTS anonymous sessions, so a guest must sign in first.
 * supabase-js attaches the user JWT automatically. A refusal / safety template is a
 * normal 200 AskResponse (not an error); only transport/auth/5xx throw.
 */
export async function askQuestion(
  question: string,
  useHealthContext = false,
): Promise<AskResponse> {
  // Analytics: WHETHER health context was used, never the question text (doc-14).
  capture("ask_question_submitted", { used_health_context: useHealthContext });
  const { data, error } = await supabase.functions.invoke("ask", {
    body: { question, use_health_context: useHealthContext },
  });
  if (error) throw new Error(`ask failed: ${error.message}`);
  const resp = toAskResponse(data);
  if (!resp) throw new Error("ask returned an unexpected response shape");
  // Only enum/boolean shape — the analytics core drops anything else.
  capture("answer_generated", {
    intent: resp.intent,
    evidence_grade: resp.evidence_grade,
    template: resp.template,
    has_sources: resp.citations.length > 0,
    refused: resp.refused_unsupported,
  });
  return resp;
}
