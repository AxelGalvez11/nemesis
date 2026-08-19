/**
 * No customer-facing surface may name a retired tier.
 *
 * 🔴 THIS EXISTS BECAUSE THE PRICING PAGE WAS MIGRATED AND THE APP WAS NOT. After
 * Free/Nemesis shipped and www.enternemesis.com was serving the new prices, the
 * signed-in sidebar still showed a badge reading "Student" — the literal string,
 * hardcoded, never reading a plan — and the usage panel printed
 * `plan.charAt(0).toUpperCase() + plan.slice(1)`, which renders whatever code is
 * in the column, so a legacy subscriber read "Pro". Both were found by opening
 * production in a browser, not by any test.
 *
 * The rule: a stored plan code becomes a customer-visible name through
 * `planLabel()` and through nothing else.
 */
import { strict as assert } from "node:assert";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { planLabel } from "./billing-contract.ts";

// 🔴 NOT `import.meta.dirname`. It is undefined when this file is run on its own
// rather than through `pnpm test`, and the whole suite then fails with
// `The "path" argument must be of type string` — an artifact that reads exactly
// like a real failure and has been reported as one more than once here.
const HERE = dirname(fileURLToPath(import.meta.url));

const ROOTS = ["components", "app"];
const RETIRED = ["Agent Pro", "Nemesis Student", "Nemesis Max", "Nemesis Pro", "PharmaOrb"];

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) { sourceFiles(full, out); continue; }
    if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/** Strip comments — the history of the ladder is worth writing down. */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
}

test("🔴 no rendered string names a retired tier", () => {
  const offenders: string[] = [];
  for (const root of ROOTS) {
    for (const file of sourceFiles(join(HERE, "..", root))) {
      const body = code(readFileSync(file, "utf8"));
      for (const name of RETIRED) {
        if (body.includes(name)) offenders.push(`${file.split("/apps/web/")[1]}: ${name}`);
      }
    }
  }
  assert.deepEqual(offenders, [], `retired tier names in shipped code:\n${offenders.join("\n")}`);
});

test("🔴 a plan badge is never a hardcoded tier name", () => {
  // The exact shape of the sidebar bug: a literal plan word inside a JSX badge.
  const sidebar = code(readFileSync(
    join(HERE, "..", "components/workspace/shell/chat-sidebar.tsx"), "utf8"));
  for (const literal of [">Student<", ">Pro<", ">Free<", ">Nemesis<", ">Max<", ">Plus<"]) {
    assert.ok(!sidebar.includes(literal), `sidebar renders the hardcoded badge ${literal}`);
  }
  assert.ok(sidebar.includes("planLabel("), "the sidebar badge must resolve through planLabel()");
});

test("🔴 capitalising a stored code is not a label", () => {
  // What CreditsPanel did. These are the codes that actually appear in the column.
  for (const stored of ["pro", "student", "plus", "max", "professional", "trial"]) {
    const naive = stored.charAt(0).toUpperCase() + stored.slice(1);
    assert.equal(planLabel(stored), "Nemesis", `${stored} must present as Nemesis`);
    assert.notEqual(planLabel(stored), naive, `${stored} must not present as "${naive}"`);
  }
  assert.equal(planLabel("free"), "Free");
  assert.equal(planLabel("nemesis"), "Nemesis");
});
