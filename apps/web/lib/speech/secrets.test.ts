// The Azure key stays on the server. This is the test that proves it rather than the comment that
// asks for it.
//
// 🔴 THE FAILURE THIS PREVENTS IS ONE RENAME. Next.js only inlines `NEXT_PUBLIC_*` variables into a
// client bundle, so importing the config module from a component today yields an EMPTY key — safe,
// and completely silent. The next person debugging "why is Azure not working in the browser" fixes
// it the obvious way, by renaming the variable, and ships a Speech credential to every visitor. No
// review catches a one-word rename in an env file.
//
// 🔴 SO THIS READS THE SOURCE. Type checking cannot express "this module must never be reachable
// from a client component", and a runtime throw only fires if somebody runs the path. A source scan
// fires in CI on the commit that introduces it.

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const WEB_ROOT = new URL("../../", import.meta.url).pathname;
const SEARCHED = ["app", "components", "lib", "hooks"];
const SKIP = new Set(["node_modules", ".next", "__fixtures__"]);

function sourceFiles(): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (SKIP.has(entry)) continue;
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(ts|tsx)$/.test(path)) found.push(path);
    }
  };
  for (const dir of SEARCHED) walk(join(WEB_ROOT, dir));
  return found;
}

/**
 * A file's source with its comments removed.
 *
 * 🔴 NEEDED BECAUSE THE WARNINGS NAME THE THING THEY WARN ABOUT. `config.ts`'s header says, in so
 * many words, never to rename this to `NEXT_PUBLIC_AZURE_SPEECH_KEY` — and a scanner matching raw
 * text would flag that comment, which would end with somebody deleting the warning to get the suite
 * green. The comment is the most valuable line in the file.
 */
function code(source: string): string {
  return source
    .split("\n")
    .filter((line) => {
      const trimmed = line.trimStart();
      return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
    })
    .join("\n");
}

const FILES = sourceFiles().map((path) => ({ path, source: code(readFileSync(path, "utf8")) }));
const relative = (path: string) => path.slice(WEB_ROOT.length);
/**
 * Everything that actually ships.
 *
 * Test files are excluded from the scans about bundling because nothing bundles them — and this file
 * necessarily contains the very patterns it looks for. They are NOT excluded from the literal-key
 * scan: a key committed in a test is a key that needs rotating.
 */
const SHIPPED = FILES.filter((file) => !file.path.endsWith(".test.ts"));

test("🔴 the Azure key is never exposed through a public environment variable", () => {
  for (const file of SHIPPED) {
    assert.ok(
      !/NEXT_PUBLIC_AZURE/i.test(file.source),
      `${relative(file.path)} references a public Azure variable — the key must stay server-side`,
    );
  }
});

test("🔴 AZURE_SPEECH_KEY is read in exactly one place", () => {
  // One reader is what makes "is the key handled correctly?" a question with one answer. Every
  // additional `process.env.AZURE_SPEECH_KEY` is another place to forget a check.
  const readers = FILES.filter((file) => /process\.env\.AZURE_SPEECH_KEY|env\.AZURE_SPEECH_KEY/.test(file.source))
    .map((file) => relative(file.path))
    .filter((path) => !path.endsWith(".test.ts"));
  assert.deepEqual(readers, ["lib/speech/azure/config.ts"]);
});

test("🔴 no client component can reach the module that holds the key", () => {
  // A `"use client"` file importing this would compile, run, and silently receive an empty key —
  // which is the state that invites somebody to "fix" it by making the variable public.
  for (const file of SHIPPED) {
    if (!/^["']use client["']/m.test(file.source)) continue;
    assert.ok(
      !/from\s+["'][^"']*speech\/azure\//.test(file.source),
      `${relative(file.path)} is a client component importing a server-only Azure module`,
    );
  }
});

test("🔴 the token route returns a minted token and has no field a key could occupy", () => {
  const route = readFileSync(join(WEB_ROOT, "app/api/speech/token/route.ts"), "utf8");
  assert.ok(route.includes("verifyBearer"), "the token endpoint is unauthenticated");
  assert.ok(!/config\.key/.test(route.split("return new Response")[1] ?? ""), "the response body can reach the key");
  assert.match(route, /Cache-Control[^\n]*no-store/, "a credential response is cacheable");
});

test("every Azure route requires a signed-in user", () => {
  for (const name of ["token", "voices", "tts", "pronunciation"]) {
    const route = readFileSync(join(WEB_ROOT, `app/api/speech/${name}/route.ts`), "utf8");
    assert.ok(route.includes("verifyBearer"), `/api/speech/${name} does not verify the caller`);
  }
});

test("🔴 no source file contains anything shaped like an Azure key", () => {
  // Azure Speech keys are 32 hex characters. A committed one is a rotation, not a revert.
  const keyish = /(?:AZURE_SPEECH_KEY|Ocp-Apim-Subscription-Key)\s*[:=]\s*["'][0-9a-f]{32}["']/i;
  for (const file of FILES) {
    assert.ok(!keyish.test(file.source), `${relative(file.path)} looks like it contains a literal Azure key`);
  }
});
