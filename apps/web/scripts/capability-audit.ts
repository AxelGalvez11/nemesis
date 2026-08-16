/**
 * END-TO-END CAPABILITY AUDIT — what Nemesis ACTUALLY does to real material, not what the
 * architecture supports.
 *
 * 🔴 EVIDENCE, NOT DESCRIPTION. Every number here comes from running the real pure functions over
 * the real stored production parse. Nothing is a fixture, nothing is estimated, and where a lane
 * produces nothing that is printed as a measurement rather than omitted.
 *
 * Stage 1  ingestion survival, per document — what concepts, knowledge types, causal relations,
 *          importance readings, figures and objectives come out the other side.
 * Stage 2  the brief window — of the objectives that exist, which ones can the teaching controller
 *          actually SEE on a turn, and does yield have anything to do with it.
 *
 * Usage, from apps/web:
 *   NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... SUPABASE_SERVICE_KEY=... \
 *     pnpm exec tsx scripts/capability-audit.ts
 */
import { extractKnowledgeObjects } from "@/lib/learn/knowledge-extraction";
import { sourceContextFromModel } from "@/lib/sources/source-context";
import { objectivesForKnowledge } from "@/lib/learn/learning-objective";
import { supportedObjectives } from "@/lib/learn/policy-runtime";
import { KNOWLEDGE_TYPES } from "@/lib/learn/knowledge-types";
import type { KnowledgeObject } from "@/lib/learn/knowledge-types";
import type { ResolvedObjective } from "@/lib/learn/canvas-knowledge";
import type { StoredObjective } from "@/lib/learn/learner-store";

const SB = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE = process.env.SUPABASE_SERVICE_KEY!;
const svc = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" };

/** The brief window the teaching controller pages the model over. Mirrors strategy-llm-teacher. */
const BRIEF_LIMIT = 40;

/**
 * Real production sources, chosen for SHAPE spread rather than domain spread.
 *
 * 🔴 THE CORPUS CANNOT TEST DOMAIN GENERALITY AND THAT IS ITSELF A FINDING. 18 of the 20 parsed
 * production sources are pharmacy material. What can be varied is document shape — slide deck,
 * lecture PDF, spreadsheet, Word prose, syllabus, equation sheet — which is what the field-agnostic
 * rule actually turns on, since it forbids subject-matter keyword lists and requires structural
 * signals. Domain generality on real non-pharmacy content stays untested.
 */
const SOURCES: readonly { id: string; shape: string }[] = [
  { id: "d00a28d9-633f-460d-8526-890162b1e9bb", shape: "lecture PDF (diabetes 2)" },
  { id: "1c9e47ce-3d64-4a29-84c6-3cd7f3a4b8a1", shape: "lecture PDF (diabetes 1)" },
  { id: "7e574c94-0000-0000-0000-000000000000", shape: "slide deck PPTX (SOAP)" },
  { id: "9e6eb160-99c9-4324-9722-a5bb891bc25c", shape: "spreadsheet XLSX (derailleur gearing)" },
  { id: "97ac20c1-0000-0000-0000-000000000000", shape: "Word prose DOCX (problem set)" },
  { id: "1d381527-988e-484d-ace8-c31df7d7a8bf", shape: "equation sheet PDF" },
  { id: "317f3172-0000-0000-0000-000000000000", shape: "syllabus PDF" },
  { id: "81d27bd2-0000-0000-0000-000000000000", shape: "drug chart PDF (wide grids)" },
];

interface Row {
  file: string;
  shape: string;
  parsedId: string;
  parserVersion: string;
  units: number;
  figuresFound: number;
  figuresDescribed: number;
  objects: number;
  byType: Record<string, number>;
  causalEdges: number;
  standing: { central: number; supporting: number; peripheral: number; none: number };
  importanceRefusals: Record<string, number>;
  blindSpots: Record<string, number>;
  objectives: number;
  staged: number;
  byOperation: Record<string, number>;
  extractionRefusals: Record<string, number>;
  outcome: string;
  sample: string[];
  windowCentral: number;
  windowSupporting: number;
  totalCentralStageable: number;
  error?: string;
}

function tally(values: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const value of values) out[value] = (out[value] ?? 0) + 1;
  return out;
}

async function rest<T>(path: string): Promise<T> {
  const response = await fetch(`${SB}/rest/v1/${path}`, { headers: svc });
  if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
  return (await response.json()) as T;
}

async function auditOne(sourceId: string, shape: string): Promise<Row | null> {
  const sources = await rest<{ id: string; file_name: string; parsed_document_id: string | null }[]>(
    `library_sources?id=eq.${sourceId}&select=id,file_name,parsed_document_id`,
  );
  const source = sources[0];
  if (!source?.parsed_document_id) return null;

  const parses = await rest<
    {
      structure?: { model?: unknown };
      doc_kind?: string;
      parser_version?: string;
      coverage?: unknown;
      visual_count?: number;
      unit_count?: number;
    }[]
  >(
    `parsed_documents?id=eq.${source.parsed_document_id}&select=structure,doc_kind,parser_version,coverage,visual_count,unit_count`,
  );
  const parse = parses[0];
  if (!parse?.structure?.model) return null;

  const context = sourceContextFromModel({
    model: parse.structure.model,
    sourceId,
    sourceKind: parse.doc_kind ?? "pdf",
  } as never);

  const extraction = extractKnowledgeObjects(context);
  const objects = extraction.objects;
  // 🔴 WHY NOTHING CAME OUT IS A MEASUREMENT TOO. A document that yields zero knowledge and a
  // document nobody looked at are opposite facts; `refusals` is the only thing that tells them apart.
  const extractionRefusals = tally(
    extraction.refusals.map((refusal) => (refusal as { reason?: string }).reason ?? "?"),
  );
  const outcome = extraction.outcome;

  // Knowledge by declared type, every type printed including the zeroes.
  const byType: Record<string, number> = {};
  for (const type of KNOWLEDGE_TYPES) byType[type] = 0;
  for (const object of objects) {
    const type = (object as { type?: string }).type;
    if (type && type in byType) byType[type] = (byType[type] ?? 0) + 1;
  }

  // Causal edges actually carried, not just objects typed causal.
  let causalEdges = 0;
  for (const object of objects) {
    const payload = (object as { payload?: { edges?: unknown[] } }).payload;
    if (Array.isArray(payload?.edges)) causalEdges += payload.edges.length;
  }

  // 🔴 FOUR BUCKETS, NOT THREE. `none` is an object that got NO reading at all — a different fact
  // from `peripheral`, which means every observation looked and found nothing.
  const standing = { central: 0, none: 0, peripheral: 0, supporting: 0 };
  const blind: string[] = [];
  for (const object of objects) {
    const reading = object.importance;
    if (!reading) standing.none += 1;
    else {
      standing[reading.standing] += 1;
      for (const spot of reading.blindSpots) blind.push((spot as { reason?: string }).reason ?? "?");
    }
  }

  const resolved: ResolvedObjective[] = objects.flatMap((knowledge: KnowledgeObject) =>
    objectivesForKnowledge(knowledge).map((objective) => ({
      knowledge,
      objective: { ...objective, rowId: `audit-${objective.identityKey}` } as StoredObjective,
    })),
  );
  const staged = supportedObjectives(resolved);

  // 🔴 `capability`, NOT `operation` — the field the objective actually carries.
  const byOperation = tally(
    staged.map((entry) => {
      const capability = (entry.objective as { capability?: unknown }).capability;
      if (typeof capability === "string") return capability;
      const kind = (capability as { kind?: string } | undefined)?.kind;
      return kind ?? JSON.stringify(capability)?.slice(0, 28) ?? "?";
    }),
  );

  // Stage 2: the brief window. `windowOf` takes the first BRIEF_LIMIT with un-acted-on first — on a
  // fresh canvas nothing is acted on, so it is simply the first N in array order.
  const standingOf = (entry: (typeof staged)[number]): string =>
    entry.knowledge.importance?.standing ?? "none";
  const window = staged.slice(0, BRIEF_LIMIT);

  // 🔴 THE FIGURE NUMBERS LIVE IN `coverage`, NOT IN A COLUMN OF THEIR OWN.
  const coverage = parse.coverage as { figures?: { found?: number; described?: number } } | null | undefined;
  const figureStats = coverage?.figures;

  return {
    blindSpots: tally(blind),
    byOperation,
    byType,
    extractionRefusals,
    outcome,
    sample: staged.slice(0, 3).map((entry) => `${String((entry.objective as {label?:string}).label).slice(0, 74)}`),
    causalEdges,
    figuresDescribed: figureStats?.described ?? 0,
    figuresFound: figureStats?.found ?? 0,
    file: source.file_name,
    importanceRefusals: tally(
      extraction.importanceRefusals.map((refusal) => (refusal as { reason?: string }).reason ?? "?"),
    ),
    objectives: resolved.length,
    objects: objects.length,
    parsedId: source.parsed_document_id,
    parserVersion: parse.parser_version ?? "?",
    shape,
    staged: staged.length,
    standing,
    totalCentralStageable: staged.filter((entry) => standingOf(entry) === "central").length,
    units: context.units?.length ?? 0,
    windowCentral: window.filter((entry) => standingOf(entry) === "central").length,
    windowSupporting: window.filter((entry) => standingOf(entry) === "supporting").length,
  };
}

async function main(): Promise<void> {
  // Resolve the placeholder ids by file-name prefix — some were listed from the console.
  const all = await rest<{ id: string; file_name: string; parsed_document_id: string | null }[]>(
    `library_sources?parsed_document_id=not.is.null&select=id,file_name,parsed_document_id&limit=50`,
  );
  const byName = (needle: string): string | null =>
    all.find((row) => row.file_name.toLowerCase().includes(needle.toLowerCase()))?.id ?? null;

  const targets: { id: string; shape: string }[] = [
    { id: byName("Physiology and Pathophysiology of Diabetes Mellitus - 2")!, shape: "lecture PDF" },
    { id: byName("SOAP_lecture_HF")!, shape: "slide deck PPTX" },
    { id: byName("derailleur")!, shape: "spreadsheet XLSX (mech-eng)" },
    { id: byName("problem set")!, shape: "Word prose DOCX" },
    { id: byName("Equation_Sheet")!, shape: "equation sheet PDF" },
    { id: byName("Syllabus")!, shape: "syllabus PDF" },
    { id: byName("drug_charts") ?? byName("Top_300")!, shape: "drug chart PDF (wide grids)" },
    { id: byName("Immunology") ?? byName("Microbiology")!, shape: "immunology lecture PDF" },
  ].filter((target) => target.id);

  const rows: Row[] = [];
  for (const target of targets) {
    try {
      const row = await auditOne(target.id, target.shape);
      if (row) rows.push(row);
      else console.log(`  (skipped ${target.id.slice(0, 8)} — no parse or no model)`);
    } catch (error) {
      console.log(`  (failed ${target.id.slice(0, 8)}: ${String(error).slice(0, 120)})`);
    }
  }

  console.log("\n════ STAGE 1 — WHAT SURVIVES INGESTION ════\n");
  for (const row of rows) {
    console.log(`── ${row.file.slice(0, 62)}`);
    console.log(`   shape ${row.shape} · parse ${row.parsedId.slice(0, 8)} · parser ${row.parserVersion}`);
    console.log(`   units ${row.units} · figures found ${row.figuresFound} described ${row.figuresDescribed}`);
    console.log(`   knowledge objects ${row.objects} → objectives ${row.objectives} → stageable ${row.staged}`);
    const present = Object.entries(row.byType).filter(([, count]) => count > 0);
    const absent = Object.entries(row.byType).filter(([, count]) => count === 0).map(([type]) => type);
    console.log(`   by type: ${present.map(([type, count]) => `${type}=${count}`).join("  ") || "(none)"}`);
    console.log(`   ZERO of: ${absent.join(", ")}`);
    console.log(`   causal edges carried: ${row.causalEdges}`);
    console.log(
      `   importance: central ${row.standing.central} · supporting ${row.standing.supporting} · peripheral ${row.standing.peripheral} · NO READING ${row.standing.none}`,
    );
    const refusals = Object.entries(row.importanceRefusals);
    if (refusals.length) console.log(`   importance refusals: ${refusals.map(([r, c]) => `${r}=${c}`).join("  ")}`);
    const spots = Object.entries(row.blindSpots);
    if (spots.length) console.log(`   blind spots: ${spots.map(([r, c]) => `${r}=${c}`).join("  ")}`);
    console.log(`   capabilities: ${Object.entries(row.byOperation).map(([o, c]) => `${o}=${c}`).join("  ") || "(none)"}`);
    console.log(`   extraction outcome: ${row.outcome}`);
    const exr = Object.entries(row.extractionRefusals);
    if (exr.length) console.log(`   extraction refusals: ${exr.map(([r, c]) => `${r}=${c}`).join("  ")}`);
    for (const line of row.sample) console.log(`   e.g. ${line}`);
    console.log("");
  }

  console.log("\n════ STAGE 2 — CAN THE CONTROLLER SEE THE IMPORTANT MATERIAL? ════\n");
  console.log("   The model is briefed on at most 40 objectives per turn (BRIEF_LIMIT).");
  console.log("   `windowOf` orders un-acted-on before acted-on, then slices. Yield is NOT consulted.\n");
  for (const row of rows) {
    if (row.staged === 0) continue;
    const truncated = row.staged > BRIEF_LIMIT;
    console.log(
      `   ${row.file.slice(0, 44).padEnd(46)} stageable ${String(row.staged).padStart(4)} · ` +
        `central total ${String(row.totalCentralStageable).padStart(3)} · in-window central ${String(row.windowCentral).padStart(3)}` +
        (truncated ? `  ← WINDOW TRUNCATES (${row.staged - BRIEF_LIMIT} unseen)` : "  (fits, no truncation)"),
    );
  }

  console.log("\n════ TOTALS ════");
  const totals = rows.reduce(
    (sum, row) => ({
      causal: sum.causal + row.causalEdges,
      central: sum.central + row.standing.central,
      none: sum.none + row.standing.none,
      objects: sum.objects + row.objects,
      peripheral: sum.peripheral + row.standing.peripheral,
      staged: sum.staged + row.staged,
      supporting: sum.supporting + row.standing.supporting,
    }),
    { causal: 0, central: 0, none: 0, objects: 0, peripheral: 0, staged: 0, supporting: 0 },
  );
  console.log(`   ${rows.length} documents · ${totals.objects} knowledge objects · ${totals.staged} stageable objectives`);
  console.log(`   causal edges across the whole corpus: ${totals.causal}`);
  console.log(
    `   importance: central ${totals.central} · supporting ${totals.supporting} · peripheral ${totals.peripheral} · no reading ${totals.none}`,
  );
}

void main().catch((error: unknown) => {
  console.error("capability audit failed:", error);
  process.exit(1);
});
