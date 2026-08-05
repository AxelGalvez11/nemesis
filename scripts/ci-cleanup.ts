#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read --allow-write
/**
 * The safety net every CI job that mints an account runs as its LAST step, with
 * `if: always()` — the one condition GitHub still schedules after a cancellation.
 *
 * Each harness writes a small manifest the instant its account exists and deletes
 * that file once it has torn itself down. So on a healthy run this finds nothing
 * and says so; on a cancelled one it finds the record the dying process could not
 * act on, and removes the account through the provenance gate.
 *
 * Exits 0 always. A red cleanup step on an otherwise green job is its own false
 * alarm — the leftover account is the signal, and it is printed here.
 *
 *   deno run --allow-net --allow-env --allow-read --allow-write scripts/ci-cleanup.ts
 */
import { cleanupLeftovers } from "./lib/ci-account-cleanup.ts";

const SB_URL = Deno.env.get("SB_URL");
const SERVICE_KEY = Deno.env.get("SERVICE_KEY");
if (!SB_URL || !SERVICE_KEY) {
  console.warn("cleanup: SB_URL + SERVICE_KEY not set, skipping.");
  Deno.exit(0);
}

// Every prefix any harness mints under. A file that is not there costs nothing;
// a prefix that is missing from this list leaks an account on every cancelled run.
const PATHS = ["guardrail", "eval", "smoke"].map((p) => `ci-run-${p}.json`);
const override = Deno.env.get("CI_RUN_MANIFEST");
if (override) PATHS.push(override);

await cleanupLeftovers({ SB_URL, SERVICE_KEY }, PATHS);
Deno.exit(0);
