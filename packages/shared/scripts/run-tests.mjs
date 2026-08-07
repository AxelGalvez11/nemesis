/**
 * Run this package's Node tests.
 *
 * 🔴 WHY THIS FILE EXISTS: `packages/shared` HAD NO TEST SCRIPT AT ALL.
 *
 * `turbo run test` runs the `test` script of each workspace package, and this
 * package defined none — so seventeen `node:test` files here, covering
 * entitlements, extraction coverage, course filing, untrusted content and the
 * document model, were never run by any command. They passed when someone
 * remembered to invoke them by hand and were otherwise decorative. A test that
 * nothing runs is worse than no test: it reads as coverage.
 *
 * The tests are DISCOVERED, not listed, because a hand-kept list is how a new
 * file quietly stays unrun — which is the same failure one level up.
 *
 * `src/` also holds tests written against Deno's standard library, which import
 * over https and cannot load under Node at all. They are skipped here by looking
 * at what a file actually imports rather than by name, and the count of both
 * kinds is printed so the split stays visible instead of becoming folklore.
 */
import { readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";

const files = readdirSync("src").filter((name) => name.endsWith(".test.ts"));
const node = [];
const deno = [];
for (const name of files) {
  const source = readFileSync(`src/${name}`, "utf8");
  if (/from "node:test"/.test(source)) node.push(`src/${name}`);
  else deno.push(name);
}

console.log(`shared: ${node.length} node test files, ${deno.length} deno test files (not run here)`);
if (node.length === 0) process.exit(0);

const result = spawnSync("npx", ["tsx", "--test", ...node], { stdio: "inherit" });
process.exit(result.status ?? 1);
