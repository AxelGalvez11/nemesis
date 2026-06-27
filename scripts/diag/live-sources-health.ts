// Production smoke gate for LIVE_SOURCES-backed /ask answers.
//
// Run:
//   deno run --allow-env --allow-net scripts/diag/live-sources-health.ts
//
// Required env:
//   SUPABASE_URL, SUPABASE_ANON_KEY, TEST_USER_JWT

interface AskCitationLike {
  source_id?: unknown;
}

interface AskSmokeResponse {
  citations?: AskCitationLike[];
  reviewed_sources?: AskCitationLike[];
  evidence_grade?: string;
}

const url = Deno.env.get("SUPABASE_URL");
const anon = Deno.env.get("SUPABASE_ANON_KEY");
const jwt = Deno.env.get("TEST_USER_JWT");

if (!url || !anon || !jwt) {
  throw new Error("Set SUPABASE_URL, SUPABASE_ANON_KEY, and TEST_USER_JWT.");
}

const questions = [
  "Is Celsius energy drink dangerous for the heart?",
  "What recent clinical trials exist for retatrutide?",
  "Has semaglutide had recent FDA label or safety changes?",
];

let liveHits = 0;

for (const question of questions) {
  const res = await fetch(`${url}/functions/v1/ask`, {
    method: "POST",
    headers: {
      apikey: anon,
      authorization: `Bearer ${jwt}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ question, mode: "thorough", include_source_text: true }),
  });
  const json = await res.json() as AskSmokeResponse | Record<string, unknown>;
  if (!res.ok) throw new Error(`${question}: ${res.status} ${JSON.stringify(json)}`);

  const answer = json as AskSmokeResponse;
  const citations = answer.citations ?? [];
  const reviewed = answer.reviewed_sources ?? [];
  const hasLiveSource = [...citations, ...reviewed]
    .some((c) => String(c.source_id ?? "").startsWith("live:"));
  if (hasLiveSource) liveHits++;

  console.log(JSON.stringify({
    question,
    citations: citations.length,
    reviewed: reviewed.length,
    has_live_source: hasLiveSource,
    grade: answer.evidence_grade,
  }));
}

if (liveHits === 0) {
  throw new Error("LIVE_SOURCES smoke failed: no live:* source ids appeared in any response.");
}
