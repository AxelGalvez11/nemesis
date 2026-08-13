/**
 * The territory column's ROUND TRIP, executed against production — not asserted in a fixture.
 *
 * Run: pnpm --filter @nemesis/web exec tsx scripts/territory-roundtrip-acceptance.mts
 *
 * 🔴 WHY THIS EXISTS. Six structural fields have died at this codebase's boundaries by passing
 * their own unit tests and then not surviving the trip through storage. `territory` is exactly that
 * shape of field — written by one function, read by another, and deliberately ABSENT from
 * `canvasToRow` — so the unit tests over hand-built objects prove nothing about the chain. This runs
 * the REAL `saveCanvasTerritory` → REAL `saveCanvas` → REAL `loadCanvasTerritory` → REAL
 * `territoryReuse`, through the REAL supabase client, against the REAL table.
 *
 * 🔴 IT COSTS NOTHING. `constructTerritory` is never called: the territory is handed in. So this
 * proves the boundary without spending a model call and without minting knowledge for anybody.
 *
 * 🔴 IT USES A THROWAWAY CANVAS AND DELETES IT BY ITS OWN ID. Positive provenance for the cleanup:
 * the row is created here, its id is minted here, and only that id is removed. Nothing pre-existing
 * is touched. The id is also NOT pre-created, which exercises the branch that matters — the upsert
 * on a canvas whose row does not exist yet.
 */

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

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
  // Set BEFORE the app modules are imported: `lib/supabase.ts` builds its client at module load.
  process.env.NEXT_PUBLIC_SUPABASE_URL = url;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = key;

  const db = createClient(url, key, { auth: { persistSession: false } });

  // An existing owner, so the row is well-formed and RLS would have something true to check.
  const { data: owners, error: ownerError } = await db.from("learning_canvases").select("user_id").limit(1);
  if (ownerError) throw ownerError;
  const userId = String(owners![0].user_id);

  const { emptyCanvas } = await import("../lib/learn/canvas-model");
  const { loadCanvasTerritory, saveCanvas, saveCanvasTerritory } = await import("../lib/learn/canvas-store");
  const { frozenTopic, territoryReuse } = await import("../lib/learn/canvas-territory");
  const { KNOWLEDGE_IDENTITY_VERSION } = await import("../lib/learn/knowledge-identity");

  const canvasId = crypto.randomUUID();
  const TOPIC = "how a four-stroke diesel engine works";
  const canvas = { ...emptyCanvas(canvasId, new Date().toISOString()), title: TOPIC };

  console.log(`\nthrowaway canvas ${canvasId}\nowner            ${userId}\ntopic            "${TOPIC}"\n`);

  try {
    // ── 1. the row does NOT exist yet: the upsert branch that a bare .update() would no-op on ──
    const { count: before } = await db
      .from("learning_canvases")
      .select("id", { count: "exact", head: true })
      .eq("id", canvasId);
    record("the row does not exist before the marker is written", (before ?? 0) === 0, `rows = ${before ?? 0}`);

    const territory = {
      identityVersion: KNOWLEDGE_IDENTITY_VERSION,
      objects: [
        {
          id: "rt1",
          identityKey: "rt-identity-1",
          statement: "Intake stroke draws air into the cylinder",
          type: "association" as const,
          unanchoredProvenance: ["model" as const],
        },
      ],
      topic: TOPIC,
    };
    await saveCanvasTerritory(userId, canvas, territory);

    const { count: after } = await db
      .from("learning_canvases")
      .select("id", { count: "exact", head: true })
      .eq("id", canvasId);
    record(
      "🔴 saveCanvasTerritory creates the row when it is missing (a bare update would have no-opped SILENTLY)",
      (after ?? 0) === 1,
      `rows = ${after ?? 0}`,
    );

    // ── 2. the real saveCanvas runs afterwards. This is the clobber question, on the real column ──
    await saveCanvas(userId, canvas);
    const { data: raw } = await db.from("learning_canvases").select("territory,document").eq("id", canvasId).maybeSingle();
    const survived = (raw as { territory?: { topic?: string } | null } | null)?.territory?.topic === TOPIC;
    record(
      "🔴 the territory SURVIVES a full saveCanvas — canvasToRow omits it, and omission is safe",
      survived,
      `territory.topic after saveCanvas = ${JSON.stringify((raw as { territory?: { topic?: string } | null } | null)?.territory?.topic ?? null)}`,
    );

    // ── 3. read it back through the real loader, and decide with the real decision function ──
    const loaded = await loadCanvasTerritory(userId, canvasId);
    record(
      "loadCanvasTerritory returns a validated territory (jsonb round trip, identityVersion still a number)",
      loaded !== null && typeof loaded.identityVersion === "number" && loaded.objects.length === 1,
      loaded ? `topic="${loaded.topic}" identityVersion=${loaded.identityVersion} objects=${loaded.objects.length}` : "null",
    );

    const reuse = territoryReuse({ identityVersion: KNOWLEDGE_IDENTITY_VERSION, stored: loaded });
    record("🔴 a reopen REUSES — this is the whole fix, end to end", reuse.reuse, JSON.stringify(reuse.reuse ? { reuse: true, objects: reuse.objects.length } : reuse));

    // ── 4. the Library case: a rename must NOT change what this canvas teaches ───────────────
    const afterRename = frozenTopic({ stored: loaded, title: "Diesel — week 3" });
    record(
      "🔴 renaming the canvas leaves the TOPIC frozen — filing must not re-topic a learner",
      afterRename === TOPIC && territoryReuse({ identityVersion: KNOWLEDGE_IDENTITY_VERSION, stored: loaded }).reuse,
      `frozenTopic under the new title = ${JSON.stringify(afterRename)}`,
    );

    // ── 5. calibration: the reuse above must be a DECISION, not a constant ───────────────────
    const bumped = territoryReuse({ identityVersion: KNOWLEDGE_IDENTITY_VERSION + 1, stored: loaded });
    record(
      "🔴 CONTROL — a bumped identity version REBUILDS rather than replaying under stale keys",
      !bumped.reuse && bumped.miss === "identity-version-changed",
      JSON.stringify(bumped),
    );
  } finally {
    // ── cleanup, by the id this script minted and nothing else ───────────────────────────────
    const { error: deleteError } = await db.from("learning_canvases").delete().eq("id", canvasId);
    const { count: left } = await db
      .from("learning_canvases")
      .select("id", { count: "exact", head: true })
      .eq("id", canvasId);
    console.log(
      `\ncleanup: deleted ${canvasId} ${deleteError ? `(ERROR ${deleteError.message})` : ""} — rows remaining with that id: ${left ?? 0}`,
    );
  }

  const failed = results.filter((entry) => !entry.pass);
  console.log(`\n═══ ${results.length - failed.length}/${results.length} passed ═══`);
  if (failed.length) {
    for (const entry of failed) console.log(`   🔴 ${entry.check}`);
    process.exit(1);
  }
}

void main();
