/**
 * WHY is the causal lane throwing away most of the edges a real lecture yields?
 *
 * 🔴 THE REFUSAL TALLY SAYS `quote-not-in-source` AND THAT NAME HIDES FOUR DIFFERENT BUGS. Either
 * the model invented a sentence (refusing is correct), or the sentence is real and we destroyed it —
 * by cutting the document finer than a claim, or by showing the model one string and checking its
 * quote against a different one. Those need different fixes and look identical from the tally.
 *
 * The honest ceiling test is: does the quote appear in WHAT THE MODEL WAS SHOWN? `groundingBlock`
 * renders `[id] (label) text` — so the passage the model reads is not `excerpt.text`, and any quote
 * drawn from the label or spanning the rendered line fails a check against `text` alone.
 *
 * Runs the model several times because this lane is called at the valve's default sampling: the
 * contract measured 12.8% of passages flipping between runs, and a single run cannot separate a real
 * rate from noise.
 */
import { excerptsFromSourceContext, groundingBlock } from "@/lib/learn/canvas-grounding";
import { causalMessages } from "@/lib/learn/canvas-prompts";
import { normalizeForIdentity } from "@/lib/learn/knowledge-identity";
import type { CanvasSource } from "@/lib/learn/canvas-model";
import { sourceContextFromModel } from "@/lib/sources/source-context";

const SB = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_KEY!;
const svc = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" };
const LLM = `${SB}/functions/v1/nemesis-llm`;
const WANT = process.argv[2] ?? "1. Physiology and Pathophysiology of Diabetes";
const RUNS = Number(process.argv[3] ?? 3);

const norm = (s: string) => normalizeForIdentity(s);
/** Collapse standalone single-character list markers — the bullet a PDF extracts as a letter. */
const collapse = (s: string) => s.replace(/(?<=^|\s)\S(?=\s|$)/gu, " ").replace(/\s+/g, " ").trim();

async function main(): Promise<void> {
  const stamp = Math.random().toString(16).slice(2, 10);
  const email = `diag-${stamp}@nemesis.test`;
  const password = `Diag-${stamp}-${stamp}`;
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
    body: JSON.stringify({ label: "diag" }),
    headers: { Authorization: `Bearer ${token.access_token}`, "Content-Type": "application/json" },
    method: "POST",
  }).then((r) => r.json())) as { key?: string };
  if (!minted.key) throw new Error("no device key");

  const sources = (await fetch(
    `${SB}/rest/v1/library_sources?select=id,file_name,parsed_document_id&parsed_document_id=not.is.null&limit=1000`,
    { headers: svc },
  ).then((r) => r.json())) as { id: string; file_name?: string; parsed_document_id?: string }[];
  const row = sources.find((s) => (s.file_name ?? "").includes(WANT))!;
  const parsed = (await fetch(
    `${SB}/rest/v1/parsed_documents?id=eq.${row.parsed_document_id}&select=structure,doc_kind`,
    { headers: svc },
  ).then((r) => r.json())) as { structure?: { model?: unknown }; doc_kind?: string }[];
  const context = sourceContextFromModel({
    model: parsed[0]!.structure!.model,
    sourceId: row.id,
    sourceKind: parsed[0]?.doc_kind ?? "pdf",
  } as never);
  const excerpts = excerptsFromSourceContext("s1", context);
  const source = {
    durability: "durable", excerpts, id: "s1", kind: "pdf", librarySourceId: row.id, title: row.file_name,
  } as CanvasSource;
  console.log(`material ${row.file_name} — ${excerpts.length} excerpts\n`);

  // Exactly what the model is shown, line for line.
  const linesById = new Map(
    excerpts.map((e) => [e.id, `[${e.id}]${e.label ? ` (${e.label})` : ""} ${e.text}`] as const),
  );
  const shown = groundingBlock([source]);

  const totals = { ok: 0, shownLine: 0, shownBlock: 0, fabricated: 0, edges: 0 };

  for (let run = 1; run <= RUNS; run += 1) {
    const res = await fetch(`${LLM}/v1/chat/completions`, {
      body: JSON.stringify({
        messages: causalMessages({ sources: [source], topic: row.file_name ?? "" }),
        model: "deepseek-chat",
      }),
      headers: { Authorization: `Bearer ${minted.key}`, "Content-Type": "application/json", "X-Nemesis-Client": "web" },
      method: "POST",
    });
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    let edges: Record<string, unknown>[] = [];
    try {
      edges = (JSON.parse(body.choices?.[0]?.message?.content ?? "") as { relations?: Record<string, unknown>[] }).relations ?? [];
    } catch { /* unreadable response is itself a datum */ }

    const run_ = { ok: 0, shownLine: 0, shownBlock: 0, fabricated: 0 };
    for (const edge of edges) {
      const quote = String(edge.quote ?? "");
      const cited = excerpts.find((e) => e.id === String(edge.excerptId ?? ""));
      if (cited && norm(cited.text).includes(norm(quote))) { run_.ok += 1; continue; }
      const line = cited ? linesById.get(cited.id)! : "";
      if (line && norm(collapse(line)).includes(norm(collapse(quote)))) { run_.shownLine += 1; continue; }
      if (norm(collapse(shown)).includes(norm(collapse(quote)))) { run_.shownBlock += 1; continue; }
      run_.fabricated += 1;
    }
    console.log(
      `run ${run}: ${edges.length} edges  ` +
        `kept-today=${run_.ok}  in-its-own-shown-line=${run_.shownLine}  ` +
        `elsewhere-in-what-we-showed=${run_.shownBlock}  not-in-material=${run_.fabricated}`,
    );
    totals.ok += run_.ok; totals.shownLine += run_.shownLine;
    totals.shownBlock += run_.shownBlock; totals.fabricated += run_.fabricated;
    totals.edges += edges.length;
  }

  console.log(`\n================ DIAGNOSIS over ${RUNS} runs ================`);
  console.log(`edges returned                                    : ${totals.edges}`);
  console.log(`kept today (quote inside excerpt.text)            : ${totals.ok}`);
  console.log(`quote IS in the line we showed for that excerpt   : ${totals.shownLine}   <- destroyed by show/validate mismatch`);
  console.log(`quote is elsewhere in the material we showed      : ${totals.shownBlock}   <- destroyed by cutting finer than a claim`);
  console.log(`quote is NOT in the material at all               : ${totals.fabricated}   <- must stay refused`);
  const recoverable = totals.shownLine + totals.shownBlock;
  console.log(`\nrecoverable without loosening the fabrication guard: ${recoverable}`);
  console.log(`edge count is unstable across identical runs, which is the temperature defect: see CAUSAL_EXTRACTION_TEMPERATURE`);
}

main().catch((e: unknown) => { console.error(e); process.exit(1); });
