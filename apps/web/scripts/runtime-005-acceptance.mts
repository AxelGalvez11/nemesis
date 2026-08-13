/**
 * RUNTIME-005 acceptance, EXECUTED against production — not asserted in a fixture.
 *
 * Run: pnpm --filter @nemesis/web exec tsx scripts/runtime-005-acceptance.mts
 *
 * 🔴 WHY THIS SCRIPT EXISTS AT ALL. `RUNTIME-001`'s acceptance test #2 was semantically correct,
 * was never executed, and the evidence loop stayed dead for a whole cycle while the board said it
 * was open. A gate is not proven by a unit test over the pure decision that feeds it — the unit
 * tests all passed while `learner_evidence` could not become non-zero on any real canvas, because
 * each layer was correct alone. So this runs THE REAL `ensureKnowledgeForCanvas`, on THE REAL
 * production canvas, through THE REAL supabase client, with NO bypass flag.
 *
 * 🔴 IT WRITES. `ensureKnowledgeForCanvas` calls `saveKnowledge`, so a run that stopped short of
 * the write would be exactly the fixture-shaped proof this task forbids. Both upserts conflict on
 * identity and do nothing, so this converges rather than accumulating — and the script prints the
 * knowledge/objective rows for this user BEFORE and AFTER with their `created_at`, so what a run
 * actually created is a matter of record rather than of assumption (positive provenance: row
 * `created_at`, never `updated_at`).
 *
 * 🔴 CANVAS `796a6045` IS NAMED DELIBERATELY AND MUST NOT BE SWAPPED. It is the ONLY one of the six
 * live canvases that reaches the ownership gate; the other five die earlier, at the durable-source
 * clause, which is `RUNTIME-004`'s territory. Running this on one of those five would show no
 * objectives and look like a failed fix.
 */

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const CANVAS_PREFIX = "796a6045";

function env(): { url: string; key: string } {
  const candidates = [
    new URL("../../../.env", import.meta.url).pathname,
    `${process.env.HOME}/Desktop/AIcodingProjects/nemesis/.env`,
  ];
  const found = candidates.find((path) => {
    try {
      readFileSync(path, "utf8");
      return true;
    } catch {
      return false;
    }
  });
  if (!found) throw new Error(`no .env found in: ${candidates.join(", ")}`);
  const raw = readFileSync(found, "utf8");
  const find = (name: string) =>
    raw.split("\n").find((line) => line.startsWith(`${name}=`))?.slice(name.length + 1).trim().replace(/^["']|["']$/g, "") ?? "";
  const url = find("SUPABASE_URL") || find("NEXT_PUBLIC_SUPABASE_URL");
  const key = find("SUPABASE_SERVICE_ROLE_KEY") || find("SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not found in .env");
  return { key, url };
}

async function main() {
  const { key, url } = env();

  // 🔴 SET BEFORE THE APP MODULES ARE IMPORTED. `lib/supabase.ts` builds its client at module load
  // from these two variables, so the real client is pointed at production here and every app module
  // below is then imported dynamically. The service-role key stands in for the anon key so the
  // harness can read another account's rows; RLS is what the browser relies on, and this is a
  // harness, not a code path anyone ships.
  process.env.NEXT_PUBLIC_SUPABASE_URL = url;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = key;

  const db = createClient(url, key, { auth: { persistSession: false } });

  const { data: rows, error } = await db
    .from("learning_canvases")
    .select("*")
    .eq("deleted", false);
  if (error) throw error;
  const row = rows!.find((candidate) => String(candidate.id).startsWith(CANVAS_PREFIX));
  if (!row) throw new Error(`canvas ${CANVAS_PREFIX} not found`);

  const userId = String(row.user_id);
  console.log(`\ncanvas ${row.id}  "${row.title}"  state=${row.state}`);
  console.log(`owner  ${userId}`);

  // 🔴 THE TABLE NAMES ARE `knowledge_objects` / `learning_objectives` — TAKEN FROM `learner-store.ts`,
  // NOT GUESSED. A first draft of this script read `learner_knowledge` / `learner_objectives`, which
  // do not exist; PostgREST answered with an error, the error was not checked, and both snapshots
  // reported a confident `0 rows`. A provenance record that cannot fail loudly is not a provenance
  // record, so the error is thrown now.
  const snapshot = async (label: string) => {
    const { data: knowledge, error: knowledgeError } = await db
      .from("knowledge_objects")
      .select("id, identity_key, created_at")
      .eq("user_id", userId);
    if (knowledgeError) throw knowledgeError;
    const { data: objectives, error: objectiveError } = await db
      .from("learning_objectives")
      .select("id, identity_key, created_at")
      .eq("user_id", userId);
    if (objectiveError) throw objectiveError;
    console.log(
      `\n── ${label} ── knowledge_objects: ${knowledge?.length ?? 0} rows | learning_objectives: ${objectives?.length ?? 0} rows`,
    );
    for (const k of knowledge ?? []) console.log(`   knowledge  ${k.identity_key}   created_at=${k.created_at}`);
    for (const o of objectives ?? []) console.log(`   objective  ${o.identity_key}   created_at=${o.created_at}`);
    return {
      knowledge: new Map((knowledge ?? []).map((k) => [String(k.id), k])),
      objectives: new Map((objectives ?? []).map((o) => [String(o.id), o])),
    };
  };

  const before = await snapshot("BEFORE");

  const { canvasFromRow } = await import("../lib/learn/canvas-store");
  const { ensureKnowledgeForCanvas } = await import("../lib/learn/canvas-knowledge");

  const canvas = canvasFromRow(row as never);
  console.log(`\nsources on the canvas: ${canvas.sources.length} (durable: ${canvas.sources.filter((s) => s.librarySourceId).length})`);

  // 🔴 NO `bypassOwnership`. That is the whole point — the ordinary path, exactly as a learner
  // opening this canvas without `?policy=force` would run it.
  console.log("\nrunning ensureKnowledgeForCanvas(userId, canvas)  — NO bypass, NO ?policy=force …");
  const resolved = await ensureKnowledgeForCanvas(userId, canvas);

  console.log(`\n═══ RESULT ═══`);
  console.log(`  outcome            : ${resolved.outcome}`);
  console.log(`  coverage           : substantive=${resolved.coverage.substantive} represented=${resolved.coverage.represented} unrepresented=${resolved.coverage.unrepresented}`);
  console.log(`  ownership          : owns=${resolved.ownership.owns} refusal=${resolved.ownership.refusal ?? "none"}`);
  console.log(`  objectives.length  : ${resolved.objectives.length}`);
  for (const entry of resolved.objectives) {
    console.log(`      · ${entry.objective.capability.padEnd(8)} ${entry.objective.identityKey}`);
  }

  const after = await snapshot("AFTER");

  const newKnowledge = [...after.knowledge.keys()].filter((id) => !before.knowledge.has(id));
  const newObjectives = [...after.objectives.keys()].filter((id) => !before.objectives.has(id));
  console.log(`\n── what this run CREATED ── knowledge: ${newKnowledge.length} | objectives: ${newObjectives.length}`);
  for (const id of newKnowledge) console.log(`   + knowledge ${after.knowledge.get(id)!.identity_key} created_at=${after.knowledge.get(id)!.created_at}`);
  for (const id of newObjectives) console.log(`   + objective ${after.objectives.get(id)!.identity_key} created_at=${after.objectives.get(id)!.created_at}`);
  if (newKnowledge.length === 0 && newObjectives.length === 0) {
    console.log(`   none — the upserts converged on rows that already existed. Idempotence, observed.`);
  }

  // ── Acceptance test 3, and it has to be built to be DECISIVE ────────────────────────────────
  //
  // 🔴 THE OBVIOUS VERSION OF THIS TEST PASSES VACUOUSLY. Every source in production that extracts
  // to `degraded` yields ZERO knowledge objects, so running the real function on one shows
  // `objectives: 0` whether the trust gate exists or not — it would be proving the emptiness, not
  // the gate. So the canvas below pairs the degraded source with the COMPLETE one that yields real
  // objects. `outcome` is the worst result across a canvas's sources, so the canvas is `degraded`
  // while 2 knowledge objects are genuinely extractable from it. Objectives must still be zero.
  //
  // The sources, the parses, the extraction and the gate are all real production ones; only the
  // canvas wrapper holding them together is constructed. Synthetic CONTENT is fine, a synthetic
  // PIPELINE is not — and there is no synthetic pipeline here.
  //
  // This is also the fence Brain stated: `degraded` refuses the whole canvas, including its clean
  // sources, and that over-refusal is accepted until unit locality survives the boundary.
  const { data: allSources } = await db
    .from("library_sources")
    .select("id, user_id, parsed_documents(structure, doc_kind)")
    .eq("user_id", userId);
  const { extractKnowledgeObjects } = await import("../lib/learn/knowledge-extraction");
  const { buildSourceContext } = await import("../lib/sources/source-context");

  let degradedId: string | null = null;
  for (const candidate of allSources ?? []) {
    const parsed = (Array.isArray(candidate.parsed_documents) ? candidate.parsed_documents[0] : candidate.parsed_documents) as
      | { structure: unknown; doc_kind: string }
      | undefined;
    if (!parsed) continue;
    const context = buildSourceContext({ sourceId: String(candidate.id), sourceKind: parsed.doc_kind ?? "unknown", structure: parsed.structure });
    if (extractKnowledgeObjects(context).outcome === "degraded") {
      degradedId = String(candidate.id);
      break;
    }
  }

  let three: boolean | null = null;
  let forced: boolean | null = null;
  if (!degradedId) {
    console.log(`\n⚠ acceptance 3 SKIPPED — no production source extracts to "degraded" any more.`);
  } else {
    const cleanSource = canvas.sources[0]!;
    const mixed = {
      ...canvas,
      sources: [cleanSource, { ...cleanSource, id: `${cleanSource.id}-degraded`, librarySourceId: degradedId }],
    };
    console.log(`\nrunning ensureKnowledgeForCanvas on a canvas of {clean ${String(cleanSource.librarySourceId).slice(0, 8)} + degraded ${degradedId.slice(0, 8)}} …`);
    const mixedResult = await ensureKnowledgeForCanvas(userId, mixed);
    console.log(`  outcome           : ${mixedResult.outcome}`);
    console.log(`  objectives.length : ${mixedResult.objectives.length}   (2 knowledge objects ARE extractable from the clean source)`);
    three = mixedResult.outcome === "degraded" && mixedResult.objectives.length === 0;

    // 🔴 AND THE SAME CANVAS UNDER `?policy=force` — TRUST IS NOT BYPASSABLE.
    //
    // `bypassOwnership` skips ownership, which is a judgement about presentation. It must NOT skip
    // trust, which is a fact about whether the source was read. `saveKnowledge` upserts on
    // `(user_id, identity_key)` with no forced-session marker, so knowledge minted from a flattened
    // parse under a query parameter would be indistinguishable from a genuine one forever — and
    // downstream it becomes a question about something the source never said, with the learner's
    // wrong answer recorded as their gap. Executed rather than asserted, because this one WRITES if
    // it is wrong.
    console.log(`\nrunning the SAME degraded canvas WITH bypassOwnership: true  (?policy=force) …`);
    const forcedResult = await ensureKnowledgeForCanvas(userId, mixed, { bypassOwnership: true });
    console.log(`  outcome           : ${forcedResult.outcome}`);
    console.log(`  objectives.length : ${forcedResult.objectives.length}   ← must be 0: a flag may not override a FACT`);
    forced = forcedResult.objectives.length === 0;
  }

  console.log(`\n═══ ACCEPTANCE ═══`);
  const one = resolved.objectives.length > 0;
  const four = resolved.coverage.unrepresented > 0 && resolved.ownership.refusal !== undefined;
  console.log(`  1. objectives.length > 0 on ${CANVAS_PREFIX} with no ?policy=force ......... ${one ? "🟢 PASS" : "🔴 FAIL"}  (${resolved.objectives.length})`);
  console.log(`  4. unrepresented still computed and REPORTED beside the objectives ......... ${four ? "🟢 PASS" : "🔴 FAIL"}  (unrepresented=${resolved.coverage.unrepresented}, ownership.owns=${resolved.ownership.owns}, refusal=${resolved.ownership.refusal})`);
  console.log(`\n  2. an ordinary submission writes a learner_evidence row .................... ⏸  NOT RUN — INTEGRATION-001's re-run condition.`);
  console.log(`     Needs a DEPLOYED commit and a real browser session under the learner's JWT.`);
  console.log(`     The production alias has been frozen since 18:04. Not approximated here.`);
  console.log(`  3. a canvas with outcome "degraded" still produces nothing ................. ${three === null ? "⚠ SKIPPED" : three ? "🟢 PASS" : "🔴 FAIL"}  (clean + degraded, 2 objects extractable, 0 produced)`);

  console.log(`  5. ?policy=force may NOT bypass the trust gate (Brain, 2026-08-12) ......... ${forced === null ? "⚠ SKIPPED" : forced ? "🟢 PASS" : "🔴 FAIL"}  (degraded canvas, forced, 0 produced)`);

  if (!one || three === false || forced === false) process.exitCode = 1;
}

main().catch((cause) => {
  console.error(cause);
  process.exit(1);
});
