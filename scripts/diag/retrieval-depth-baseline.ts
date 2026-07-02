// READ-ONLY baseline probe: how many sources does the LIVE ask engine actually return per prompt,
// vs the ~40 ChatGPT shows for the same question? Measures the retrieval-depth gap the owner raised.
// Nothing in prod changes — it self-provisions an ephemeral enterprise-quota user (same pattern as
// scripts/guardrail-suite.ts), asks a handful of representative prompts across registers, counts
// cited + reviewed sources and their provider breakdown, then tears the user down.
//
// Usage: SB_URL=.. SERVICE_KEY=.. ANON_KEY=.. deno run -A scripts/diag/retrieval-depth-baseline.ts

import type { AskResponse, Citation } from "../../packages/shared/src/answer.ts";

const SB_URL = Deno.env.get("SB_URL");
const SERVICE_KEY = Deno.env.get("SERVICE_KEY");
const ANON_KEY = Deno.env.get("ANON_KEY");
if (!SB_URL || !SERVICE_KEY || !ANON_KEY) {
  console.error("SB_URL + SERVICE_KEY + ANON_KEY required");
  Deno.exit(1);
}

type Mode = "fast" | "thorough";
let userId: string | undefined;
let JWT: string | undefined;

// Representative spread: a consumer "is X bad for me", a drug-efficacy question, a mechanism question,
// and an interaction — the query types the owner compares against ChatGPT.
const PROMPTS: Array<{ label: string; question: string; mode?: Mode }> = [
  { label: "consumer/thorough", question: "Is sucralose bad for me?", mode: "thorough" },
  { label: "efficacy/thorough", question: "How effective is tirzepatide for weight loss?", mode: "thorough" },
  { label: "mechanism/base", question: "How does metformin lower blood sugar?" },
  { label: "interaction/thorough", question: "Can I take ibuprofen with lisinopril?", mode: "thorough" },
];

function providerBreakdown(cites: Citation[]): string {
  const by: Record<string, number> = {};
  for (const c of cites) by[c.source_type ?? "?"] = (by[c.source_type ?? "?"] ?? 0) + 1;
  return Object.entries(by).sort((a, b) => b[1] - a[1]).map(([p, n]) => `${p}:${n}`).join(" ");
}

async function ask(question: string, mode?: Mode): Promise<AskResponse | { __error: string }> {
  const res = await fetch(`${SB_URL}/functions/v1/ask`, {
    method: "POST",
    headers: { apikey: ANON_KEY!, Authorization: `Bearer ${JWT}`, "Content-Type": "application/json" },
    body: JSON.stringify(mode ? { question, mode } : { question }),
  });
  if (!res.ok) return { __error: `${res.status} ${(await res.text()).slice(0, 160)}` };
  return await res.json();
}

async function teardown() {
  if (!userId) return;
  try {
    await fetch(`${SB_URL}/rest/v1/generated_answers?user_id=eq.${userId}`, {
      method: "DELETE",
      headers: { apikey: SERVICE_KEY!, Authorization: `Bearer ${SERVICE_KEY}`, Prefer: "return=minimal" },
    });
    await fetch(`${SB_URL}/auth/v1/admin/users/${userId}`, {
      method: "DELETE",
      headers: { apikey: SERVICE_KEY!, Authorization: `Bearer ${SERVICE_KEY}` },
    });
  } catch (e) {
    console.warn(`teardown error: ${(e as Error).message} — orphaned userId=${userId}`);
  }
}

async function main() {
  const email = `retrieval-probe+${crypto.randomUUID().slice(0, 8)}@pharmabro.test`;
  const password = crypto.randomUUID();
  const created = await fetch(`${SB_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: SERVICE_KEY!, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, email_confirm: true }),
  }).then((r) => r.json());
  userId = created?.id ?? created?.user?.id;
  if (!userId) throw new Error(`user create failed: ${JSON.stringify(created).slice(0, 160)}`);

  const grant = await fetch(`${SB_URL}/rest/v1/subscriptions`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY!, Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json", Prefer: "return=minimal",
    },
    body: JSON.stringify({ user_id: userId, plan: "enterprise", status: "active" }),
  });
  if (!grant.ok) throw new Error(`quota grant failed (${grant.status}): ${(await grant.text()).slice(0, 160)}`);

  JWT = (await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON_KEY!, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  }).then((r) => r.json())).access_token;
  if (!JWT) throw new Error("sign-in failed");

  console.log("Retrieval-depth baseline — live ask engine, sources returned per prompt\n");
  const rows: string[] = [];
  for (const p of PROMPTS) {
    const r = await ask(p.question, p.mode);
    if ("__error" in r) {
      console.log(`✗ [${p.label}] ${p.question}\n    error: ${r.__error}\n`);
      rows.push(`${p.label}\tERROR`);
      continue;
    }
    const cited = r.citations ?? [];
    const reviewed = r.reviewed_sources ?? [];
    const total = cited.length + reviewed.length;
    console.log(`• [${p.label}] "${p.question}"`);
    console.log(`    total sources: ${total}  (cited ${cited.length} + reviewed ${reviewed.length})`);
    console.log(`    cited by provider:    ${providerBreakdown(cited) || "—"}`);
    console.log(`    reviewed by provider: ${providerBreakdown(reviewed) || "—"}\n`);
    rows.push(`${p.label}\ttotal=${total}\tcited=${cited.length}\treviewed=${reviewed.length}`);
    await new Promise((res) => setTimeout(res, 1500));
  }
  console.log("SUMMARY (tab-separated):");
  console.log(rows.join("\n"));
}

main().catch((e) => {
  console.error("probe failed:", (e as Error).message);
}).finally(teardown);
