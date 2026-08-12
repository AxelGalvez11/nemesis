/**
 * Does the RUNTIME land on the objectives production already holds?
 *
 * Run: pnpm --filter @nemesis/web exec tsx scripts/policy-convergence-acceptance.mts
 *
 * 🔴 THIS IS THE CLAIM THE WHOLE CROSS-SESSION STORY RESTS ON, AND IT IS THE ONE THING A UNIT TEST
 * CANNOT CHECK. There is no canvas → knowledge lookup table. A second canvas does not FIND the
 * first canvas's rows; it independently re-derives identity from the source and lands on them. So
 * if the identity the runtime computes from the REAL stored parse differs by one character from
 * what is stored — a normalisation change, a role read differently, a version bump — then every
 * unit test still passes, every row still looks right, and evidence quietly attaches to a second
 * set of objectives that no other canvas will ever ask about.
 *
 * READ-ONLY. It writes nothing, and it prints identity keys, roles and counts — never a learner's
 * evidence and never a line of anyone's document beyond the two halves of the pair under test,
 * which are the acceptance fixture's own synthetic content.
 */

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

import { extractKnowledgeObjects } from "../lib/learn/knowledge-extraction";
import { objectivesForKnowledge } from "../lib/learn/learning-objective";
import { objectivePromptText, retrievalPromptFor } from "../lib/learn/objective-task";
import { buildSourceContext } from "../lib/sources/source-context";

function env(): { url: string; key: string } {
  // A worktree has no `.env` of its own — credentials live once, in the primary checkout.
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

const SOURCE_ID = process.argv[2] ?? "021f8c74-8a56-401d-b37b-2e9115f88735";

async function main() {
  const { key, url } = env();
  const db = createClient(url, key, { auth: { persistSession: false } });

  const { data: source, error: sourceError } = await db
    .from("library_sources")
    .select("id, file_name, user_id, parsed_document_id, parsed_documents(structure, doc_kind)")
    .eq("id", SOURCE_ID)
    .maybeSingle();
  if (sourceError || !source) throw sourceError ?? new Error(`no library source ${SOURCE_ID}`);

  const parsed = (Array.isArray(source.parsed_documents) ? source.parsed_documents[0] : source.parsed_documents) as
    | { structure: unknown; doc_kind: string }
    | undefined;
  if (!parsed) throw new Error("that source has never been parsed");

  console.log(`\nsource   ${source.file_name}  (${String(source.id).slice(0, 8)})`);
  console.log(`parse    ${parsed.doc_kind}, stored — this is the SAME row the app reads at runtime\n`);

  // Exactly what `ensureKnowledgeForCanvas` does, minus the writes.
  const context = buildSourceContext({
    sourceId: source.id as string,
    sourceKind: parsed.doc_kind ?? "unknown",
    structure: parsed.structure,
  });
  const extraction = extractKnowledgeObjects(context);
  console.log(`extraction outcome: ${extraction.outcome}   objects: ${extraction.objects.length}`);

  const computed = extraction.objects.flatMap((object) =>
    objectivesForKnowledge(object).map((objective) => ({ knowledge: object.identityKey, objective })),
  );

  const { data: stored, error: storedError } = await db
    .from("learning_objectives")
    .select("id, identity_key, label, parameters, knowledge_object_id")
    .eq("user_id", source.user_id as string);
  if (storedError) throw storedError;

  console.log(`\ncomputed here: ${computed.length} objectives     already in production: ${stored!.length}\n`);

  const storedKeys = new Set(stored!.map((row) => row.identity_key as string));
  let converged = 0;
  for (const { objective } of computed) {
    const hit = storedKeys.has(objective.identityKey);
    if (hit) converged += 1;
    const role = objective.parameters.outputRole ?? `dir=${objective.parameters.direction}`;
    console.log(
      `${hit ? "✅ CONVERGES" : "🔴 NEW ROW"}  ${objective.identityKey}  produce=${role}`,
    );
    console.log(`             asks: “${objectivePromptText(objective)}”  expects: “${retrievalPromptFor(objective, "-").expectedAnswer}”`);
  }

  // 🔴 THE TWO DIRECTIONS MUST ASK DIFFERENT QUESTIONS. If they do not, "the reverse is still
  // unknown" would be true for the wrong reason — the learner was never actually asked it.
  const wordings = new Set(computed.map(({ objective }) => objectivePromptText(objective)));
  console.log(`\ndistinct questions: ${wordings.size} of ${computed.length}`);

  // 🔴 THE ALARM IS AN ORPHAN, NOT A NEW ROW, AND CONFLATING THEM MAKES THIS CHECK USELESS.
  //
  //   ORPHAN  — a stored objective this run did NOT reproduce. Identity has drifted: existing
  //             evidence now points at a key nothing will ever compute again, so it is invisible
  //             for ever while every row still looks perfectly well-formed. This is the failure.
  //
  //   NEW     — computed but not yet stored. Entirely ordinary: it means the document teaches
  //             something nobody has saved yet, which is what a first attach is FOR. Reading it
  //             as a failure would make the check red on every healthy document and it would be
  //             ignored within a week.
  const orphans = stored!.filter((row) => !computed.some(({ objective }) => objective.identityKey === row.identity_key));
  console.log("\n--- what this proves ---");
  console.log(`${converged}/${stored!.length} STORED objectives were recomputed exactly from the real stored parse.`);
  console.log(`${computed.length - converged} computed objectives are new — this document teaches more than was saved by hand.`);
  console.log(`${orphans.length} orphans (stored, and NOT reproduced by this run).`);
  if (orphans.length === 0 && computed.length > 0) {
    console.log("\nA second canvas over this source recomputes these exact keys, so evidence written by");
    console.log("the first canvas is the evidence the second one reads. Convergence is a property of the");
    console.log("identity function, not of a join — it survives the first canvas being deleted.");
  } else {
    console.log("\n🔴 IDENTITY HAS DRIFTED. Evidence already stored against the orphaned keys is now");
    console.log("   unreachable: nothing will compute those keys again, and no canvas will ask about them.");
  }
}

main().catch((cause) => {
  console.error(cause);
  process.exit(1);
});
