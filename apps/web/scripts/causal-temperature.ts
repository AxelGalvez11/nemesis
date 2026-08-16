/**
 * Does the deployed valve actually honour `temperature`, or drop it?
 *
 * 🔴 SOURCE IS NOT EVIDENCE HERE. `supabase/functions/nemesis-llm/index.ts` forwards the whole body
 * to the provider, so temperature SHOULD pass through — but this repo has already been bitten by the
 * live valve diverging from its own source, so the only trustworthy answer is a measurement.
 *
 * Sends the identical causal prompt N times at the valve's default sampling, then N times at
 * temperature 0, and reports whether the edge count stops moving. A criterion like "never invent a
 * causal claim" is not checkable against a lane that answers differently on a re-run.
 */
import { excerptsFromSourceContext } from "@/lib/learn/canvas-grounding";
import { causalMessages } from "@/lib/learn/canvas-prompts";
import { CAUSAL_EXTRACTION_TEMPERATURE } from "@/lib/learn/causal-extraction-contract";
import { causalMaterial } from "@/lib/learn/causal-material";
import type { CanvasSource } from "@/lib/learn/canvas-model";
import { sourceContextFromModel } from "@/lib/sources/source-context";

const SB = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_KEY!;
const svc = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" };
const LLM = `${SB}/functions/v1/nemesis-llm`;
const WANT = process.argv[2] ?? "1. Physiology and Pathophysiology of Diabetes";
const RUNS = Number(process.argv[3] ?? 3);

async function main(): Promise<void> {
  const stamp = Math.random().toString(16).slice(2, 10);
  const email = `temp-${stamp}@nemesis.test`;
  const password = `Temp-${stamp}-${stamp}`;
  await fetch(`${SB}/auth/v1/admin/users`, {
    body: JSON.stringify({ email, email_confirm: true, password }),
    headers: svc,
    method: "POST",
  });
  const token = (await fetch(`${SB}/auth/v1/token?grant_type=password`, {
    body: JSON.stringify({ email, password }),
    headers: { apikey: ANON, "Content-Type": "application/json" },
    method: "POST",
  }).then((r) => r.json())) as { access_token?: string };
  const minted = (await fetch(`${LLM}/device-key`, {
    body: JSON.stringify({ label: "temp" }),
    headers: { Authorization: `Bearer ${token.access_token}`, "Content-Type": "application/json" },
    method: "POST",
  }).then((r) => r.json())) as { key?: string };
  if (!minted.key) throw new Error("no device key");

  const rows = (await fetch(
    `${SB}/rest/v1/library_sources?select=id,file_name,parsed_document_id&parsed_document_id=not.is.null&limit=1000`,
    { headers: svc },
  ).then((r) => r.json())) as { id: string; file_name?: string; parsed_document_id?: string }[];
  const row = rows.find((s) => (s.file_name ?? "").includes(WANT))!;
  const parsed = (await fetch(
    `${SB}/rest/v1/parsed_documents?id=eq.${row.parsed_document_id}&select=structure,doc_kind`,
    { headers: svc },
  ).then((r) => r.json())) as { structure?: { model?: unknown }; doc_kind?: string }[];
  const context = sourceContextFromModel({
    model: parsed[0]!.structure!.model,
    sourceId: row.id,
    sourceKind: parsed[0]?.doc_kind ?? "pdf",
  } as never);

  const raw = {
    durability: "durable",
    excerpts: excerptsFromSourceContext("s1", context),
    id: "s1",
    kind: "pdf",
    librarySourceId: row.id,
    title: row.file_name,
  } as CanvasSource;
  const sources = causalMaterial([raw], [context]);
  const messages = causalMessages({ sources, topic: row.file_name ?? "" });

  const ask = async (temperature?: number): Promise<string> => {
    const res = await fetch(`${LLM}/v1/chat/completions`, {
      body: JSON.stringify({
        messages,
        model: "deepseek-chat",
        ...(temperature === undefined ? {} : { temperature }),
      }),
      headers: { Authorization: `Bearer ${minted.key}`, "Content-Type": "application/json", "X-Nemesis-Client": "web" },
      method: "POST",
    });
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return body.choices?.[0]?.message?.content ?? "";
  };

  const count = (text: string): number => {
    try {
      return ((JSON.parse(text) as { relations?: unknown[] }).relations ?? []).length;
    } catch {
      return -1;
    }
  };

  console.log(`material ${row.file_name}`);
  console.log(`excerpts ${sources[0]?.excerpts.length}\n`);

  const dflt: string[] = [];
  for (let i = 0; i < RUNS; i += 1) dflt.push(await ask());
  console.log(`default sampling : counts=${dflt.map(count).join(",")}  distinct responses=${new Set(dflt).size}/${RUNS}`);

  const zero: string[] = [];
  for (let i = 0; i < RUNS; i += 1) zero.push(await ask(CAUSAL_EXTRACTION_TEMPERATURE));
  console.log(`temperature ${CAUSAL_EXTRACTION_TEMPERATURE}    : counts=${zero.map(count).join(",")}  distinct responses=${new Set(zero).size}/${RUNS}`);

  // 🔴 AN ALL-EMPTY RUN PROVES NOTHING. Identical `{"relations":[]}` responses are trivially
  // identical, and reading that as "temperature is honoured" is how a dropped field looks correct.
  const meaningful = zero.some((t) => count(t) > 0);
  const verdict = !meaningful
    ? "UNPROVEN — every temperature-0 response was empty, so identical responses say nothing"
    : new Set(zero).size === 1 && new Set(dflt).size > 1
      ? "HONOURED — the spread collapsed with non-empty output"
      : new Set(zero).size > 1
        ? "NOT HONOURED — output still moves at temperature 0"
        : "UNPROVEN — default sampling was already stable, nothing to collapse";
  console.log(`\nverdict: ${verdict}`);
}

main().catch((e: unknown) => { console.error(e); process.exit(1); });
