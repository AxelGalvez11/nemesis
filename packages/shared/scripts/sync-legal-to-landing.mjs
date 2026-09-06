/**
 * Write landing/lib/legal-content.ts from packages/shared/src/legal.
 *
 * The landing site is its OWN pnpm workspace (landing/pnpm-workspace.yaml says `packages: []`)
 * and deploys as its own Vercel project with root directory `landing`, so it cannot import
 * `@nemesis/shared`. Rather than hold a second hand-written copy of the Terms and the Privacy
 * Policy, which is how the two copies drifted in the first place, the landing copy is GENERATED
 * from the shared source and checked in. `apps/web/lib/legal-sync.test.ts` fails when the two
 * differ, so an edit to the shared words without a re-run of this script cannot reach main.
 *
 * Run from the repo root:  node packages/shared/scripts/sync-legal-to-landing.mjs
 *
 * How it works: the four shared modules are plain data with no dependencies outside the folder.
 * They are concatenated in dependency order with their `import` lines removed, which leaves one
 * self-contained TypeScript module that the landing tsconfig can compile on its own.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const SHARED_LEGAL_DIR = resolve(here, "../src/legal");
export const LANDING_LEGAL_FILE = resolve(here, "../../../landing/lib/legal-content.ts");

/** Dependency order: each file only imports from the ones before it. */
const ORDER = ["types.ts", "subprocessors.ts", "terms.ts", "privacy.ts"];

const HEADER = `// generated from packages/shared/src/legal, do not edit by hand
//
// Regenerate with:  node packages/shared/scripts/sync-legal-to-landing.mjs
// apps/web/lib/legal-sync.test.ts fails when this file and the shared source differ.
`;

/** The generated module's text, built from the shared source files. */
export function renderLandingLegal(sharedDir = SHARED_LEGAL_DIR) {
  const parts = ORDER.map((name) => {
    const source = readFileSync(resolve(sharedDir, name), "utf8");
    const body = source
      .split("\n")
      .filter((line) => !/^import\b/.test(line))
      .join("\n")
      .trim();
    return `// ---- ${name} ----\n${body}\n`;
  });
  return `${HEADER}\n${parts.join("\n")}`;
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  writeFileSync(LANDING_LEGAL_FILE, renderLandingLegal());
  console.log(`wrote ${LANDING_LEGAL_FILE}`);
}
