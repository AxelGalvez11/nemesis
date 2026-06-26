// Brutal MVP launch eval for the public ask engine.
//
// Run:
//   deno run --allow-env --allow-net --allow-read scripts/diag/mvp-engine-eval.ts
//
// Required env:
//   SUPABASE_URL, SUPABASE_ANON_KEY, TEST_USER_JWT

interface EvalCase {
  id: string;
  question: string;
  must_include: string[];
  must_not_include: string[];
}

interface AnswerPointLike {
  text?: unknown;
}

interface AskEvalResponse {
  plain_english_summary?: unknown;
  answer_sections?: {
    what_we_know?: AnswerPointLike[];
    what_we_do_not_know?: AnswerPointLike[];
    safety_notes?: AnswerPointLike[];
    questions_to_ask?: unknown[];
  };
  citations?: unknown[];
  reviewed_sources?: unknown[];
  evidence_grade?: unknown;
  template?: unknown;
  error?: unknown;
}

const url = Deno.env.get("SUPABASE_URL");
const anon = Deno.env.get("SUPABASE_ANON_KEY");
const jwt = Deno.env.get("TEST_USER_JWT");

if (!url || !anon || !jwt) {
  throw new Error("Set SUPABASE_URL, SUPABASE_ANON_KEY, and TEST_USER_JWT.");
}

const casesUrl = new URL("./mvp-engine-eval-cases.json", import.meta.url);
const cases = JSON.parse(await Deno.readTextFile(casesUrl)) as EvalCase[];

let failures = 0;

for (const testCase of cases) {
  const res = await fetch(`${url}/functions/v1/ask`, {
    method: "POST",
    headers: {
      apikey: anon,
      authorization: `Bearer ${jwt}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      question: testCase.question,
      mode: "thorough",
      include_source_text: true,
    }),
  });

  const json = await res.json().catch(() => ({})) as AskEvalResponse | Record<string, unknown>;
  if (!res.ok) {
    failures++;
    console.log(JSON.stringify({
      id: testCase.id,
      status: "FAIL",
      http_status: res.status,
      error: (json as AskEvalResponse).error ?? json,
    }));
    continue;
  }

  const response = json as AskEvalResponse;
  const text = answerText(response);
  const lower = text.toLowerCase();
  const missing = testCase.must_include.filter((needle) => !lower.includes(needle.toLowerCase()));
  const forbidden = testCase.must_not_include.filter((needle) => lower.includes(needle.toLowerCase()));
  const pass = missing.length === 0 && forbidden.length === 0;
  if (!pass) failures++;

  console.log(JSON.stringify({
    id: testCase.id,
    status: pass ? "PASS" : "FAIL",
    missing,
    forbidden,
    citations: response.citations?.length ?? 0,
    reviewed: response.reviewed_sources?.length ?? 0,
    grade: response.evidence_grade ?? null,
    template: response.template ?? null,
  }));
}

if (failures > 0) {
  throw new Error(`MVP engine eval failed: ${failures}/${cases.length} case(s) failed.`);
}

console.log(`MVP engine eval: PASS (${cases.length}/${cases.length})`);

function answerText(answer: AskEvalResponse): string {
  const sections = answer.answer_sections ?? {};
  const points = [
    ...(sections.what_we_know ?? []),
    ...(sections.what_we_do_not_know ?? []),
    ...(sections.safety_notes ?? []),
  ].map((point) => typeof point.text === "string" ? point.text : "");
  const questions = (sections.questions_to_ask ?? []).map((q) => String(q));
  return [
    String(answer.plain_english_summary ?? ""),
    ...points,
    ...questions,
    String(answer.template ?? ""),
  ].join("\n");
}
