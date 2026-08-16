/**
 * Before/after for the causal seam fix, on real production parses.
 *
 * Three arms over the SAME document, so a difference is attributable:
 *
 *   STORED    what production does today — the canvas's own stored excerpts. On 4 of the 11
 *             canvases holding material these carry no `unitId`, and every edge is refused as
 *             "unanchorable" before the model is consulted. No model call is needed to show it.
 *   CANONICAL the fix: excerpts rebuilt from the canonical parse `mechanismsFor` already receives.
 *   FILTERED  the fix plus dropping units that cannot carry a claim (bullet glyphs, page numbers,
 *             date stamps) — measured separately because a filter that loses mechanisms is a
 *             regression wearing an efficiency win's clothes.
 *
 * Every arm is run several times at the pinned temperature, because this lane's output moved between
 * 6 and 37 edges on identical input at the valve's default sampling.
 */
import { excerptsFromSourceContext } from "@/lib/learn/canvas-grounding";
import { causalMessages } from "@/lib/learn/canvas-prompts";
import { CAUSAL_EXTRACTION_TEMPERATURE } from "@/lib/learn/causal-extraction-contract";
import { causalMaterial } from "@/lib/learn/causal-material";
import { parseCausalTerritory } from "@/lib/learn/causal-grounded";
import type { CanvasSource } from "@/lib/learn/canvas-model";
import { sourceContextFromModel } from "@/lib/sources/source-context";

const SB = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_KEY!;
const svc = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" };
const LLM = `${SB}/functions/v1/nemesis-llm`;
const RUNS = Number(process.env.RUNS ?? 2);
const DOCS = process.argv.slice(2);

let key = "";

async function ask(messages: { role: string; content: string }[]): Promise<{ text: string; model: string }> {
  const res = await fetch(`${LLM}/v1/chat/completions`, {
    body: JSON.stringify({ messages, model: "deepseek-chat", temperature: CAUSAL_EXTRACTION_TEMPERATURE }),
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-Nemesis-Client": "web" },
    method: "POST",
  });
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[]; model?: string };
  return { model: body.model ?? "?", text: body.choices?.[0]?.message?.content ?? "" };
}

async function main(): Promise<void> {
  const stamp = Math.random().toString(16).slice(2, 10);
  const email = `ab-${stamp}@nemesis.test`;
  const password = `Ab-${stamp}-${stamp}`;
  await fetch(`${SB}/auth/v1/admin/users`, {
    body: JSON.stringify({ email, email_confirm: true, password }),
    headers: svc, method: "POST",
  });
  const token = (await fetch(`${SB}/auth/v1/token?grant_type=password`, {
    body: JSON.stringify({ email, password }),
    headers: { apikey: ANON, "Content-Type": "application/json" }, method: "POST",
  }).then((r) => r.json())) as { access_token?: string };
  const minted = (await fetch(`${LLM}/device-key`, {
    body: JSON.stringify({ label: "ab" }),
    headers: { Authorization: `Bearer ${token.access_token}`, "Content-Type": "application/json" }, method: "POST",
  }).then((r) => r.json())) as { key?: string };
  key = minted.key!;

  const rows = (await fetch(
    `${SB}/rest/v1/library_sources?select=id,file_name,parsed_document_id&parsed_document_id=not.is.null&limit=1000`,
    { headers: svc },
  ).then((r) => r.json())) as { id: string; file_name?: string; parsed_document_id?: string }[];

  for (const want of DOCS) {
    const row = rows.find((s) => (s.file_name ?? "").includes(want));
    if (!row) { console.log(`\n### no source matching "${want}"`); continue; }
    const parsed = (await fetch(
      `${SB}/rest/v1/parsed_documents?id=eq.${row.parsed_document_id}&select=structure,doc_kind,parser_version`,
      { headers: svc },
    ).then((r) => r.json())) as { structure?: { model?: unknown }; doc_kind?: string; parser_version?: string }[];
    if (!parsed[0]?.structure?.model) { console.log(`\n### ${row.file_name}: no model`); continue; }

    const context = sourceContextFromModel({
      model: parsed[0].structure.model, sourceId: row.id, sourceKind: parsed[0].doc_kind ?? "pdf",
    } as never);

    console.log(`\n### ${row.file_name}`);
    console.log(`    library_source=${row.id}`);
    console.log(`    parsed_document=${row.parsed_document_id}  parser=${parsed[0].parser_version}`);

    const canonical = {
      durability: "durable", excerpts: excerptsFromSourceContext("s1", context),
      id: "s1", kind: "pdf", librarySourceId: row.id, title: row.file_name,
    } as CanvasSource;
    const filtered = causalMaterial([canonical], [context]);

    // STORED — deterministic, no model call needed: an excerpt with no unit can never be anchored.
    const stored = (await fetch(
      `${SB}/rest/v1/learning_canvases?select=document&limit=1000`, { headers: svc },
    ).then((r) => r.json())) as { document?: { sources?: CanvasSource[] } }[];
    const match = stored
      .flatMap((c) => c.document?.sources ?? [])
      .find((s) => s.librarySourceId === row.id);
    if (match) {
      const anchorable = (match.excerpts ?? []).filter((e) => e.unitId && match.librarySourceId).length;
      console.log(`    STORED    excerpts=${(match.excerpts ?? []).length} anchorable=${anchorable}` +
        `${anchorable === 0 ? "  -> EVERY causal edge refused, 0 objects, no model call can help" : ""}`);
    } else {
      console.log(`    STORED    (no canvas holds this source)`);
    }

    for (const [name, sources] of [["CANONICAL", [canonical]], ["FILTERED ", filtered]] as const) {
      const kept: number[] = [];
      const refused: Record<string, number> = {};
      for (let i = 0; i < RUNS; i += 1) {
        const { text, model } = await ask(causalMessages({ sources, topic: row.file_name ?? "" }));
        const result = parseCausalTerritory({ model, sources, text });
        kept.push(result.objects.length);
        for (const r of result.refusals) refused[r.reason] = (refused[r.reason] ?? 0) + 1;
      }
      console.log(`    ${name} excerpts=${sources[0]?.excerpts.length ?? 0} kept=[${kept.join(",")}] refusals=${JSON.stringify(refused)}`);
    }
  }
}

main().catch((e: unknown) => { console.error(e); process.exit(1); });
