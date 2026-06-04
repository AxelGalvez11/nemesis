import { supabase } from "./supabase";
import { toAskResponse } from "./cast";
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
  const { data, error } = await supabase.functions.invoke("ask", {
    body: { question, use_health_context: useHealthContext },
  });
  if (error) throw new Error(`ask failed: ${error.message}`);
  const resp = toAskResponse(data);
  if (!resp) throw new Error("ask returned an unexpected response shape");
  return resp;
}
