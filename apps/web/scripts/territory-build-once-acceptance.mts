/**
 * BUILD ONCE — the acceptance criterion, executable, and CURRENTLY UNRUNNABLE FROM NODE.
 *
 * Run: pnpm --filter @nemesis/web exec tsx scripts/territory-build-once-acceptance.mts
 *
 * 🔴 READ THIS BEFORE YOU RUN IT. As of 2026-08-13 this script CANNOT reach its first leg, and the
 * reason is worth knowing before you spend an hour rediscovering it:
 *
 *     constructTerritory(...)  →  took=0ms  value=null  error="Sign in to chat."
 *
 * `postChatCompletion` refuses without a real authenticated session, BEFORE any network call. So
 * the model call is unreachable from a Node harness for exactly the same reason it is unreachable
 * from a signed-out browser. There is no harness route to the build leg: a session is not one path
 * of two, it is the only path. Kept in the tree because it is the executable definition of the
 * criterion, and because the next person to think "I will just run it from a script" should find
 * this note instead of the discovery.
 *
 * 🔴 AND WHEN IT FAILED THAT WAY, LEGS 2 AND 3 BOTH "PASSED". Zero new rows and zero rebuild are
 * exactly what a run that did nothing produces. That is why leg 1 is a hard control that VOIDS the
 * rest rather than a check that merely reports itself — without it this script emits two green
 * ticks for a mechanism that never executed.
 *
 * 🔴 WHAT IT PROVES, AND WHAT IT DOES NOT. It proves the MECHANISM on the real path against the
 * real database: a topic canvas builds a territory once, a second resolve rebuilds nothing, and a
 * rename rebuilds nothing and keeps the original subject. It does NOT prove the SURFACE wires that
 * correctly — a learner opening the page is Integration's grade, on a deployed build, with a real
 * session. A mechanism proof described as a product proof is the overclaim to avoid here.
 *
 * 🔴 LEG 1 IS THE POSITIVE CONTROL AND THE RUN IS VOID WITHOUT IT. If the first resolve does not
 * genuinely BUILD, then leg 2 showing "no new rows" measures nothing — it is the same trap as
 * "zero new rows passes trivially if nothing ran", wearing a different costume. So leg 1 asserts
 * rows were CREATED, and every later leg is reported as ungradeable if it was not.
 *
 * 🔴 IT SPENDS AND IT WRITES, ON A THROWAWAY CANVAS. Authorised by Brain: the rows are material
 * about a TOPIC, never a claim about a person. Integration's fixture `213c2d47` is deliberately NOT
 * used — they are blocked on a session, not on a fixture, and it must still be there when a session
 * arrives.
 *
 * 🔴 CLEANUP HAS POSITIVE PROVENANCE AND CHECKS THE CASCADE FIRST. Only ids that did not exist in
 * the BEFORE snapshot are deleted — never "everything matching this topic", because knowledge
 * identity is content-derived and shared across canvases, so a careless delete would take the
 * owner's own rows. And deleting a knowledge object CASCADES two hops to learner_evidence, so the
 * evidence count against these objectives is VERIFIED to be zero before anything is removed. There
 * will be none, because nothing is answered here — but the cascade is real and verifying is cheap.
 */

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const TOPIC = "how a pendulum clock escapement regulates timekeeping";
const RENAMED = "Clocks — week 3 tidy-up";

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

const results: { check: string; pass: boolean; detail: string }[] = [];
const record = (check: string, pass: boolean, detail: string) => {
  results.push({ check, detail, pass });
  console.log(`${pass ? "🟢 PASS" : "🔴 FAIL"}  ${check}\n         ${detail}`);
};

async function main() {
  const { key, url } = env();
  process.env.NEXT_PUBLIC_SUPABASE_URL = url;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = key;
  const db = createClient(url, key, { auth: { persistSession: false } });

  const { data: owners, error: ownerError } = await db.from("learning_canvases").select("user_id").limit(1);
  if (ownerError) throw ownerError;
  const userId = String(owners![0].user_id);

  const ids = async (table: string): Promise<Set<string>> => {
    const { data, error } = await db.from(table).select("id").eq("user_id", userId);
    if (error) throw error;
    return new Set((data ?? []).map((row) => String((row as { id: string }).id)));
  };
  const territoryOf = async (canvasId: string) => {
    const { data } = await db.from("learning_canvases").select("territory").eq("id", canvasId).maybeSingle();
    return (data as { territory?: { topic?: string; objects?: unknown[] } | null } | null)?.territory ?? null;
  };

  const { emptyCanvas } = await import("../lib/learn/canvas-model");
  const { saveCanvas } = await import("../lib/learn/canvas-store");
  const { ensureKnowledgeForCanvas } = await import("../lib/learn/canvas-knowledge");

  const canvasId = crypto.randomUUID();
  let canvas = { ...emptyCanvas(canvasId, new Date().toISOString()), title: TOPIC };

  const knowledgeBefore = await ids("knowledge_objects");
  const objectivesBefore = await ids("learning_objectives");
  console.log(
    `\nthrowaway canvas ${canvasId}\nowner            ${userId}\ntopic            "${TOPIC}"\n` +
      `BEFORE           knowledge=${knowledgeBefore.size}  objectives=${objectivesBefore.size}\n`,
  );

  let legOneBuilt = false;
  try {
    await saveCanvas(userId, canvas);

    // ── LEG 1 — the positive control. This MUST genuinely build. ─────────────────────────────
    const started = Date.now();
    const first = await ensureKnowledgeForCanvas(userId, canvas);
    const firstMs = Date.now() - started;
    const knowledgeAfterOne = await ids("knowledge_objects");
    const createdByLegOne = [...knowledgeAfterOne].filter((id) => !knowledgeBefore.has(id));
    const territoryOne = await territoryOf(canvasId);
    legOneBuilt = createdByLegOne.length > 0 && first.objectives.length > 0 && territoryOne !== null;
    record(
      "🔴 LEG 1 (POSITIVE CONTROL) — a first open genuinely BUILDS: rows created and the marker written",
      legOneBuilt,
      `outcome=${first.outcome} objectives=${first.objectives.length} newKnowledge=${createdByLegOne.length} territory=${territoryOne ? `"${territoryOne.topic}" objects=${territoryOne.objects?.length ?? 0}` : "NULL"} took=${firstMs}ms`,
    );

    if (!legOneBuilt) {
      console.log(
        "\n🔴 LEG 1 DID NOT BUILD, SO LEGS 2 AND 3 ARE UNGRADEABLE AND ARE NOT REPORTED AS PASSES.\n" +
          "   'No new rows' is exactly what a run that did nothing produces.\n",
      );
    } else {
      // ── LEG 2 — reopen. Nothing may be built. ──────────────────────────────────────────────
      const startedTwo = Date.now();
      const second = await ensureKnowledgeForCanvas(userId, canvas);
      const secondMs = Date.now() - startedTwo;
      const knowledgeAfterTwo = await ids("knowledge_objects");
      const createdByLegTwo = [...knowledgeAfterTwo].filter((id) => !knowledgeAfterOne.has(id));
      record(
        "🔴 LEG 2 — a REOPEN builds nothing, and still has something to ask",
        createdByLegTwo.length === 0 && second.objectives.length > 0,
        `newKnowledge=${createdByLegTwo.length} (want 0) objectives=${second.objectives.length} (want >0) took=${secondMs}ms vs leg1 ${firstMs}ms`,
      );

      // ── LEG 3 — rename. Nothing built, and the SUBJECT must not move. ──────────────────────
      canvas = { ...canvas, title: RENAMED };
      await saveCanvas(userId, canvas);
      const third = await ensureKnowledgeForCanvas(userId, canvas);
      const knowledgeAfterThree = await ids("knowledge_objects");
      const createdByLegThree = [...knowledgeAfterThree].filter((id) => !knowledgeAfterTwo.has(id));
      const territoryThree = await territoryOf(canvasId);
      record(
        "🔴 LEG 3 — a RENAME files the canvas: nothing rebuilt, and the topic stays FROZEN",
        createdByLegThree.length === 0 && territoryThree?.topic === TOPIC && third.objectives.length > 0,
        `title now "${RENAMED}" · newKnowledge=${createdByLegThree.length} (want 0) · territory.topic=${JSON.stringify(territoryThree?.topic ?? null)} (want the ORIGINAL) · objectives=${third.objectives.length}`,
      );
    }
  } finally {
    // ── cleanup: by exact id, cascade checked first ─────────────────────────────────────────
    console.log("\n── cleanup ──");
    const knowledgeNow = await ids("knowledge_objects");
    const objectivesNow = await ids("learning_objectives");
    const newKnowledge = [...knowledgeNow].filter((id) => !knowledgeBefore.has(id));
    const newObjectives = [...objectivesNow].filter((id) => !objectivesBefore.has(id));

    // 🔴 THE CASCADE CHECK, BEFORE ANY DELETE. knowledge_objects → learning_objectives →
    // learner_evidence, both `on delete cascade`. Nothing was answered here so this must be zero;
    // verifying rather than assuming is the whole point.
    let evidenceAtRisk = 0;
    if (newObjectives.length) {
      const { count, error } = await db
        .from("learner_evidence")
        .select("id", { count: "exact", head: true })
        .in("objective_id", newObjectives);
      if (error) throw error;
      evidenceAtRisk = count ?? 0;
    }
    console.log(`   evidence rows referencing the objectives this run created: ${evidenceAtRisk} (must be 0)`);

    if (evidenceAtRisk > 0) {
      console.log("   🔴 REFUSING TO DELETE — a hard delete would cascade into real learner evidence.");
    } else {
      if (newKnowledge.length) await db.from("knowledge_objects").delete().in("id", newKnowledge);
      const objectivesLeft = await ids("learning_objectives");
      const stillNew = [...objectivesLeft].filter((id) => !objectivesBefore.has(id));
      if (stillNew.length) await db.from("learning_objectives").delete().in("id", stillNew);
      console.log(`   deleted knowledge_objects: ${newKnowledge.length} · learning_objectives: ${newObjectives.length}`);
    }
    await db.from("learning_canvases").delete().eq("id", canvasId);

    const knowledgeEnd = await ids("knowledge_objects");
    const objectivesEnd = await ids("learning_objectives");
    const { count: canvasLeft } = await db
      .from("learning_canvases")
      .select("id", { count: "exact", head: true })
      .eq("id", canvasId);
    console.log(
      `   AS FOUND?  knowledge ${knowledgeBefore.size} → ${knowledgeEnd.size}  ·  objectives ${objectivesBefore.size} → ${objectivesEnd.size}  ·  throwaway canvas rows remaining: ${canvasLeft ?? 0}`,
    );
    const asFound =
      knowledgeEnd.size === knowledgeBefore.size && objectivesEnd.size === objectivesBefore.size && (canvasLeft ?? 0) === 0;
    console.log(`   ${asFound ? "🟢 the account is demonstrably as found" : "🔴 THE ACCOUNT IS NOT AS FOUND — investigate"}`);
  }

  const failed = results.filter((entry) => !entry.pass);
  console.log(`\n═══ ${results.length - failed.length}/${results.length} passed ═══`);
  if (!legOneBuilt) console.log("🔴 leg 1 did not build — this run proves NOTHING about legs 2 and 3.");
  if (failed.length) process.exit(1);
}

void main();
