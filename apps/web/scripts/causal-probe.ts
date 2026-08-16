/**
 * Does the causal lane produce a single correct edge from a REAL lecture?
 *
 * 🔴 THE MARKER SAYS IT HAS RUN ONCE, EVER. `mechanismsUnder` is set on 1 of 18 production canvases,
 * and the one causal row in `knowledge_objects` is the owner's synthetic test sentence. So every
 * green unit test on this lane has been checked against fixtures, and nothing has ever demonstrated
 * that a real parse yields a real mechanism. That is what this measures, end to end, through the real
 * metered door with a real learner's key — the same shape as `controller-acceptance.ts`.
 *
 * It prints the objects kept, the refusal tally by reason (which is the output too), the grounding
 * truncation, and a token estimate — so the recurring cost of running this per document is a measured
 * number rather than a guess.
 *
 * Usage, from apps/web:
 *
 *     NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... SUPABASE_SERVICE_KEY=... \
 *       pnpm exec tsx scripts/causal-probe.ts "<file name fragment>"
 */
import { excerptsFromSourceContext, groundingBlock } from "@/lib/learn/canvas-grounding";
import { causalMessages } from "@/lib/learn/canvas-prompts";
import { parseCausalTerritory } from "@/lib/learn/causal-grounded";
import type { CanvasSource } from "@/lib/learn/canvas-model";
import { sourceContextFromModel } from "@/lib/sources/source-context";

const SB = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_KEY!;
const svc = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" };
const LLM = `${SB}/functions/v1/nemesis-llm`;

const WANT = process.argv[2] ?? "Physiology and Pathophysiology of Diabetes";

async function main(): Promise<void> {
  // ── a throwaway learner, so the metered door is exercised exactly as a real one is ──────────
  const stamp = Math.random().toString(16).slice(2, 10);
  const email = `causal-${stamp}@nemesis.test`;
  const password = `Caus-${stamp}-${stamp}`;
  const created = (await fetch(`${SB}/auth/v1/admin/users`, {
    body: JSON.stringify({ email, email_confirm: true, password }),
    headers: svc,
    method: "POST",
  }).then((r) => r.json())) as { id?: string };
  if (!created.id) throw new Error("could not seed a learner");
  const token = (await fetch(`${SB}/auth/v1/token?grant_type=password`, {
    body: JSON.stringify({ email, password }),
    headers: { apikey: ANON, "Content-Type": "application/json" },
    method: "POST",
  }).then((r) => r.json())) as { access_token?: string };
  if (!token.access_token) throw new Error("could not sign the learner in");

  const minted = (await fetch(`${LLM}/device-key`, {
    body: JSON.stringify({ label: "causal-probe" }),
    headers: { Authorization: `Bearer ${token.access_token}`, "Content-Type": "application/json" },
    method: "POST",
  }).then((r) => r.json())) as { key?: string };
  if (!minted.key) throw new Error("could not mint a device key");
  console.log(`learner   ${created.id} (${email})`);

  // ── real production material ────────────────────────────────────────────────────────────────
  const sources = (await fetch(
    `${SB}/rest/v1/library_sources?select=id,file_name,parsed_document_id&parsed_document_id=not.is.null&limit=1000`,
    { headers: svc },
  ).then((r) => r.json())) as { id: string; file_name?: string; parsed_document_id?: string }[];
  const row = sources.find((s) => (s.file_name ?? "").includes(WANT));
  if (!row) throw new Error(`no source matching "${WANT}"`);

  const parsed = (await fetch(
    `${SB}/rest/v1/parsed_documents?id=eq.${row.parsed_document_id}&select=structure,doc_kind,parser_version`,
    { headers: svc },
  ).then((r) => r.json())) as { structure?: { model?: unknown }; doc_kind?: string; parser_version?: string }[];
  const model = parsed[0]?.structure?.model;
  if (!model) throw new Error("that parse carries no document model");
  console.log(`material  ${row.file_name}`);
  console.log(`parser    ${parsed[0]?.parser_version}`);

  const context = sourceContextFromModel({
    model,
    sourceId: row.id,
    sourceKind: parsed[0]?.doc_kind ?? "pdf",
  } as never);

  const excerpts = excerptsFromSourceContext("s1", context);
  const source: CanvasSource = {
    durability: "durable",
    excerpts,
    id: "s1",
    kind: "pdf",
    librarySourceId: row.id,
    title: row.file_name ?? row.id,
  } as CanvasSource;

  const grounding = groundingBlock([source]);
  const dropped = (/\((\d+) further excerpts? were not included/.exec(grounding) ?? [])[1] ?? "0";
  console.log(`excerpts  ${excerpts.length} (anchorable ${excerpts.filter((e) => e.unitId).length})`);
  console.log(`grounding ${grounding.length} chars, excerpts dropped for budget: ${dropped}`);

  const messages = causalMessages({ sources: [source], topic: row.file_name ?? "" });
  const promptChars = messages.reduce((n, m) => n + m.content.length, 0);
  console.log(`prompt    ${promptChars} chars  (~${Math.round(promptChars / 4)} tokens)\n`);

  // ── the real metered door, the real model ───────────────────────────────────────────────────
  const started = Date.now();
  const res = await fetch(`${LLM}/v1/chat/completions`, {
    body: JSON.stringify({ messages, model: "deepseek-chat" }),
    headers: {
      Authorization: `Bearer ${minted.key}`,
      "Content-Type": "application/json",
      "X-Nemesis-Client": "web",
    },
    method: "POST",
  });
  if (!res.ok) throw new Error(`llm ${res.status}: ${(await res.text()).slice(0, 400)}`);
  const body = (await res.json()) as {
    choices?: { message?: { content?: string }; finish_reason?: string }[];
    usage?: Record<string, number>;
    model?: string;
  };
  const text = body.choices?.[0]?.message?.content ?? "";
  // 🔴 THE MODEL THAT ANSWERED, NOT THE ONE WE ASKED FOR. The valve routes, and it has diverged from
  // its own source before; a measurement that does not record which model produced it cannot be
  // compared against another run.
  console.log(`model replied in ${Date.now() - started}ms`);
  console.log(`  asked=deepseek-chat  answered=${body.model}  finish=${body.choices?.[0]?.finish_reason}`);
  console.log(`  usage=${JSON.stringify(body.usage ?? {})}`);
  console.log(`  raw first 300: ${JSON.stringify(text).slice(0, 300)}`);

  // ── the real pure function production calls ─────────────────────────────────────────────────
  const result = parseCausalTerritory({ model: "deepseek-chat", sources: [source], text });

  console.log(`\n================ CAUSAL RESULT ================`);
  console.log(`objects kept : ${result.objects.length}`);
  const byReason: Record<string, number> = {};
  for (const r of result.refusals) byReason[r.reason] = (byReason[r.reason] ?? 0) + 1;
  console.log(`refused      : ${result.refusals.length} ${JSON.stringify(byReason)}`);
  for (const r of result.refusals.slice(0, 8)) console.log(`   refusal: ${r.detail}`);

  console.log(`\n---- edges, for hand-checking against the source ----`);
  for (const [i, object] of result.objects.entries()) {
    const rel = object.relation!;
    console.log(`\n[${i + 1}] ${object.statement}`);
    console.log(`    relation=${rel.relation} negated=${rel.negated}${rel.qualifier ? ` qualifier="${rel.qualifier}" (${rel.qualifierKind ?? "?"})` : ""}`);
    console.log(`    verb=${rel.sourceVerb ?? "-"}`);
    console.log(`    ASSERTION: ${rel.assertion}`);
    const anchor = object.sourceAnchors?.[0];
    console.log(`    anchor unit=${anchor?.unitId} quote=${JSON.stringify(anchor?.quote?.exact ?? "").slice(0, 90)}`);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
