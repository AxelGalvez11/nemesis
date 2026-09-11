import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

// ── Every component family is covered by the design system ──────────────────────────────────────────────
//
// Owner, 2026-09-11: "I need the design to encompass all the components of your web app, everything." A design system
// that covers the components someone happened to remember is a partial one, and the gap is always the family added
// last. This fails when a directory or top-level component appears in apps/web/components without a row in
// /design/COVERAGE.md, so a new surface cannot arrive without a decision about what governs it.

const components = new URL("../../components/", import.meta.url);
const coverage = readFileSync(new URL("../../../../design/COVERAGE.md", import.meta.url), "utf8");

test("🔴🔴 every component family and top-level component has a row in /design/COVERAGE.md", () => {
  const names: string[] = [];
  for (const entry of readdirSync(components, { withFileTypes: true })) {
    if (entry.isDirectory()) names.push(`components/${entry.name}`);
    else if (entry.name.endsWith(".tsx")) names.push(`components/${entry.name}`);
  }
  for (const entry of readdirSync(new URL("workspace/", components), { withFileTypes: true })) {
    if (entry.isDirectory()) names.push(`components/workspace/${entry.name}`);
  }
  assert.ok(names.length > 40, "could not list apps/web/components");
  const missing = names.filter((name) => !coverage.includes(`| \`${name}\` |`));
  assert.deepEqual(missing, [], `no design-system row for: ${missing.join(", ")}`);
});

test("🔴 the rulings and the documents they point at exist", () => {
  const readme = readFileSync(new URL("../../../../design/README.md", import.meta.url), "utf8");
  assert.match(readme, /## The owner's rulings, newest first/);
  for (const doc of ["SURFACES", "BRAND", "COVERAGE", "DESIGN", "TOKENS", "COMPONENTS"]) {
    assert.ok(readme.includes(`(${doc}.md)`), `README.md no longer links ${doc}.md`);
    assert.ok(readFileSync(new URL(`../../../../design/${doc}.md`, import.meta.url), "utf8").length > 500, `/design/${doc}.md is missing`);
  }
});
