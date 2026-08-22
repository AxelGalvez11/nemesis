/**
 * Every credential the code reads is named in `.env.example`.
 *
 * 🔴🔴 WHY THIS EXISTS. On 2026-08-21 that file still said "PharmaBro", still named the project by
 * a dead name, and listed EIGHT keys while the code read over forty. No DeepSeek, no Azure, no
 * Mistral, no Brave, no Stripe. Anyone setting the project up from it — including the owner on a
 * new machine — got an app that booted and then failed one feature at a time, with nothing saying
 * why. It drifted for months because nothing was checking it, and a document nothing checks is a
 * document that is wrong.
 *
 * 🔴 CREDENTIALS ONLY, AND THAT NARROWNESS IS THE POINT. Behaviour switches come and go with
 * experiments and pinning every one of them here would make this test a chore that gets deleted.
 * A missing API key is different in kind: it is unrecoverable by reading the code, because the
 * value has to come from a person with an account.
 */

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const REPO = join(import.meta.dirname, "..", "..", "..");
const EXAMPLE = readFileSync(join(REPO, ".env.example"), "utf8");

/** Reads like a credential: something a person has to fetch from an account somewhere. */
const CREDENTIAL = /_(?:API_KEY|KEY|SECRET|TOKEN|DSN|PASSWORD)$/;

/**
 * Names that match the shape but are not configuration anyone supplies.
 *
 * Kept explicit rather than filtered by path, so adding one is a decision somebody has to write
 * down. If a real key ends up here the test still passes and the setup still breaks — so the bar
 * for this list is "the value cannot be set by a person", not "the test is annoying".
 */
const NOT_CONFIGURATION = new Set([
  // Fed by the harness itself, not by an operator.
  "NEMESIS_EVAL_KEY",
  // A destructuring target inside the Supabase client factory, not an environment read.
  "SUPABASE_SECRET_KEYS",
]);

function sources(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry === "dist" || entry.startsWith(".")) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) sources(path, found);
    else if (/\.(?:ts|tsx|mts)$/.test(entry) && !entry.includes(".test.")) found.push(path);
  }
  return found;
}

test("🔴 no credential is readable in code and absent from .env.example", () => {
  const reads = /(?:Deno\.env\.get\(\s*["']([A-Z0-9_]+)["']|process\.env\.([A-Z0-9_]+)|process\.env\[\s*["']([A-Z0-9_]+)["'])/g;
  const missing = new Map<string, string>();

  for (const root of ["apps/web", "apps/mobile", "supabase/functions", "packages"]) {
    for (const file of sources(join(REPO, root))) {
      const src = readFileSync(file, "utf8");
      for (const match of src.matchAll(reads)) {
        const name = match[1] ?? match[2] ?? match[3] ?? "";
        if (!CREDENTIAL.test(name) || NOT_CONFIGURATION.has(name)) continue;
        // 🔴 Plain `includes`, so naming a key in a COMMENT counts. Several are fallback aliases of
        // one another (ASSEMBLY_API_KEY / ASSEMBLYAI_API_KEY, BRAVE_API_KEY / BRAVE_SEARCH_API_KEY),
        // and demanding a blank line for each would push somebody to set both.
        if (EXAMPLE.includes(name)) continue;
        if (!missing.has(name)) missing.set(name, file.slice(REPO.length + 1));
      }
    }
  }

  assert.deepEqual(
    [...missing].map(([name, file]) => `${name} (read in ${file})`),
    [],
    "these credentials are read by the code and documented nowhere — add them to .env.example, "
      + "under the section for the place they actually have to be set",
  );
});

test("🔴 the file still says which of the three places each key belongs in", () => {
  // The single most useful thing this file does, and the thing the old one got wrong by having no
  // structure at all: a Vercel key set as a Supabase secret is invisible to the web app, and the
  // failure looks exactly like a missing key. Calibration: delete a heading and this reddens.
  for (const place of ["VERCEL", "SUPABASE SECRETS", "EXPO / EAS"]) {
    assert.ok(EXAMPLE.includes(place), `.env.example no longer separates ${place}`);
  }
  // And the name of the product it configures.
  assert.ok(EXAMPLE.startsWith("# Nemesis"), ".env.example does not say what it configures");
  assert.doesNotMatch(EXAMPLE, /PharmaBro|PharmaOrb/i, "a dead product name is back in .env.example");
});
