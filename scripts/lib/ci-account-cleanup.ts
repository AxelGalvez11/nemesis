/**
 * One place where CI harnesses create, record, and remove their throwaway accounts.
 *
 * 🔴 WHY A FILE AND NOT A VARIABLE. 42 accounts had piled up in the production
 * auth table, and every one came from a run that never finished — each with a
 * PARTIAL answer count where a whole run makes 51. The newest was created eleven
 * seconds before `cancel-in-progress` killed its run. Teardown was never broken;
 * it lived inside the dying process, and a cancelled job does not get to finish
 * its `finally`. So the id goes to disk the moment the account exists, and a
 * workflow step with `if: always()` — which GitHub still schedules after a
 * cancellation — reads it back and removes what the run could not.
 *
 * Three harnesses mint accounts (`scripts/guardrail-suite.ts`,
 * `eval/lib/corpus.ts`, `eval/live-prod-smoke.ts`). They share this module rather
 * than three copies, because the first copy is how you end up fixing the leak
 * twice and missing the third caller.
 *
 * Every delete goes through `planAcceptanceCleanup`, so a harness can only remove
 * an account the DATABASE agrees was created after that run started.
 */
import {
  assertCleanupSafe,
  cleanupReport,
  planAcceptanceCleanup,
  type RunManifest,
} from "../../packages/shared/src/acceptance-cleanup.ts";

export interface CiEnv {
  SB_URL: string;
  SERVICE_KEY: string;
}

/** Identity for one harness run, stamped BEFORE anything is created. */
export interface CiRun {
  runId: string;
  startedAt: string;
  email: string;
  manifestPath: string;
}

/**
 * `prefix` becomes the local part of the address — `guardrail`, `eval`, `smoke`.
 * The manifest file is named after it too, so two harnesses on one runner cannot
 * overwrite each other's record.
 */
export function newCiRun(prefix: string): CiRun {
  const runId = crypto.randomUUID().slice(0, 8);
  return {
    runId,
    startedAt: new Date().toISOString(),
    email: `${prefix}+${runId}@nemesis.test`,
    manifestPath: Deno.env.get("CI_RUN_MANIFEST") ?? `ci-run-${prefix}.json`,
  };
}

function manifestFor(run: CiRun, userId: string): RunManifest {
  return {
    runId: run.runId,
    startedAt: run.startedAt,
    created: [{ id: userId, kind: "auth_user", label: run.email }],
    touched: [],
  };
}

/** Call the instant the account exists — before any other work. */
export async function recordCiAccount(run: CiRun, userId: string): Promise<void> {
  try {
    await Deno.writeTextFile(run.manifestPath, JSON.stringify(manifestFor(run, userId), null, 2));
  } catch (e) {
    // Not fatal: the in-process teardown still runs on a normal finish. It only
    // costs the safety net, so say so rather than failing the harness.
    console.warn(`could not write ${run.manifestPath}: ${(e as Error).message} — no net if this run is killed`);
  }
}

async function readManifest(path: string): Promise<RunManifest | null> {
  try {
    return JSON.parse(await Deno.readTextFile(path)) as RunManifest;
  } catch {
    return null;
  }
}

async function dropManifest(path: string): Promise<void> {
  try {
    await Deno.remove(path);
  } catch { /* already gone, which is the point */ }
}

/**
 * Ask the database — not this process's memory — when the account was created.
 * The whole point of the gate is that a run's own recollection is not evidence.
 */
async function createdAt(env: CiEnv, id: string): Promise<string | null> {
  try {
    const row = await fetch(`${env.SB_URL}/auth/v1/admin/users/${id}`, {
      headers: { apikey: env.SERVICE_KEY, Authorization: `Bearer ${env.SERVICE_KEY}` },
    }).then((r) => (r.ok ? r.json() : null));
    const made = row?.created_at ?? row?.user?.created_at;
    return typeof made === "string" ? made : null;
  } catch {
    return null;
  }
}

/**
 * Delete the account a run created, and everything that cascades from it.
 *
 * 🔴 `generated_answers.user_id` is the ONE `ON DELETE SET NULL` foreign key of
 * the 63 that reference `auth.users`. Deleting the account alone leaves its
 * answers behind with no owner, so they go first — that is not tidiness, it is
 * the difference between a clean removal and permanent orphan rows.
 *
 * Returns true when the account is gone.
 */
export async function removeCiAccount(env: CiEnv, manifest: RunManifest): Promise<boolean> {
  const target = manifest.created.find((item) => item.kind === "auth_user");
  if (!target) return true;

  const plan = planAcceptanceCleanup(manifest, [{
    id: target.id,
    kind: target.kind,
    label: target.label,
    createdAt: await createdAt(env, target.id),
  }]);
  try {
    assertCleanupSafe(plan);
  } catch (e) {
    console.error(`cleanup REFUSED: ${(e as Error).message}`);
    return false;
  }
  if (plan.remove.length === 0) {
    // Also the "already deleted" path: a missing row has no creation time, so the
    // gate keeps it, and there is nothing left to keep. Both are fine outcomes.
    console.warn(`cleanup: no provenance for ${target.label}, nothing deleted.`);
    console.warn(cleanupReport(plan));
    return false;
  }

  let ok = true;
  const del = async (url: string, what: string) => {
    try {
      const res = await fetch(url, {
        method: "DELETE",
        headers: { apikey: env.SERVICE_KEY, Authorization: `Bearer ${env.SERVICE_KEY}`, Prefer: "return=minimal" },
      });
      // 404 is "nothing there to delete" — the row is gone, or the whole table
      // is (generated_answers was dropped in a later schema). Either way the
      // goal state holds; counting it as failure printed "orphaned" over
      // accounts that were in fact fully removed.
      if (!res.ok && res.status !== 404) {
        ok = false;
        console.warn(`cleanup: ${what} failed (${res.status})`);
      }
    } catch (e) {
      ok = false;
      console.warn(`cleanup: ${what} error: ${(e as Error).message}`);
    }
  };
  await del(`${env.SB_URL}/rest/v1/generated_answers?user_id=eq.${target.id}`, "generated_answers delete");
  await del(`${env.SB_URL}/auth/v1/admin/users/${target.id}`, "auth user delete");
  if (ok) console.log(`cleanup: removed ${target.label}`);
  else console.warn(`cleanup: orphaned ${target.label}`);
  return ok;
}

/** The normal in-process teardown: remove the account, then forget the record. */
export async function teardownCiRun(env: CiEnv, run: CiRun, userId: string | undefined): Promise<void> {
  if (!userId) return;
  if (await removeCiAccount(env, manifestFor(run, userId))) await dropManifest(run.manifestPath);
}

/**
 * The safety net, run as its own `if: always()` workflow step.
 *
 * No manifest means the run tore itself down properly, which is the normal case
 * and not a failure. Never throws — a red cleanup step on an otherwise green job
 * would be its own false alarm; the leftover account is the signal.
 */
export async function cleanupLeftovers(env: CiEnv, paths: string[]): Promise<void> {
  let found = false;
  for (const path of paths) {
    const manifest = await readManifest(path);
    if (!manifest) continue;
    found = true;
    console.log(`cleanup: run ${manifest.runId} did not finish tearing itself down (${path}).`);
    if (await removeCiAccount(env, manifest)) await dropManifest(path);
  }
  if (!found) console.log("cleanup: nothing left over.");
}
