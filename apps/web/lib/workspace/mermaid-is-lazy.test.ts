// 🔴🔴 THE ONLY THING KEEPING A MEGABYTE OUT OF EVERY PAGE IS THAT NOBODY WRITES ONE IMPORT LINE.
//
// `mermaid-diagram.tsx` has said since 2026-08-30 that the library "loads on first use, not in the
// bundle". That sentence was false for two days, because a SECOND door existed:
// `components/ai-elements/message.tsx` imported `@streamdown/mermaid`, and the whole published body
// of that package is `import n from "mermaid"` — static. One static import anywhere in a chunk's
// graph puts the library in that chunk, and a lazy import elsewhere cannot take it back out.
//
// MEASURED, production, 2026-09-02, opening `/learn` signed in:
//   • 69 script files, 8.86 MB uncompressed (1.87 MB gzipped)
//   • largest chunk 4.12 MB — the one carrying mermaid
//   • esbuild, `@streamdown/mermaid` alone: 3.37 MB min / 927 KB gz; its marginal cost beside the
//     other three Streamdown plugins: 3.12 MB min / 854 KB gz
//
// So this is a source test rather than a behavioural one, deliberately: what went wrong is not a
// wrong value at runtime — diagrams drew correctly the whole time — it is WHEN the bytes arrive,
// and nothing observable from inside the test runner can tell those two states apart. The import
// line is the fact, so the import line is what is asserted.

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { mermaidPlugin } from "./mermaid-plugin";

const WEB_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");

/** Every source file a browser chunk can be built from: the app, its components, its libraries. */
function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry === ".next" || entry.startsWith(".")) continue;
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(entry) || entry.includes(".test.")) continue;
      out.push(full);
    }
  };
  for (const dir of ["app", "components", "lib"]) walk(path.join(WEB_ROOT, dir));
  return out;
}

/**
 * A static, value-level import of the mermaid library, on a line that is code rather than prose.
 *
 * 🔴 IT IGNORES `import type`, WHICH IS THE DIFFERENCE BETWEEN A TYPE AND A MEGABYTE. TypeScript
 * erases a type-only import entirely, so `import type { MermaidConfig } from "mermaid"` costs
 * nothing at runtime and `mermaid-plugin.ts` legitimately uses one.
 *
 * 🔴 AND IT IGNORES COMMENTS, BECAUSE THIS FILE AND THE TWO IT GUARDS BOTH SPELL THE FORBIDDEN
 * IMPORT OUT IN PROSE TO EXPLAIN WHY IT IS FORBIDDEN. A "must not appear" test that matched its own
 * explanation would be red the moment anyone documented the rule — a shape this repo has been
 * bitten by before.
 */
function staticMermaidImport(source: string): string | null {
  for (const raw of source.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("//") || line.startsWith("*") || line.startsWith("/*")) continue;
    if (/^import\s+type\b/.test(line)) continue;
    if (/^import\s[^;]*\bfrom\s+"(?:@streamdown\/)?mermaid"/.test(line)) return line;
    if (/^import\s+"(?:@streamdown\/)?mermaid"/.test(line)) return line;
  }
  return null;
}

test("🔴🔴 nothing statically imports mermaid — it arrives when a diagram is drawn, not on page load", () => {
  const offenders = sourceFiles()
    .map((file) => ({ file: path.relative(WEB_ROOT, file), line: staticMermaidImport(readFileSync(file, "utf8")) }))
    .filter((row) => row.line !== null);

  assert.deepEqual(
    offenders,
    [],
    "a static mermaid import is back: it puts ~3.1 MB of minified JavaScript into the chunk that " +
      "holds it, on every page load, for a library most answers never use. Reach the engine through " +
      "`loadEngine()` in lib/workspace/mermaid-diagram.tsx instead.",
  );
});

test("🔴 the plugin answers Streamdown's contract without the library being present", () => {
  // 🔴 THIS TEST RUNNING AT ALL IS HALF THE ASSERTION. Importing the plugin in Node loads no
  // mermaid — the library is browser-shaped and would not survive it — so a module that reached the
  // engine eagerly could not get this far. `getMermaid()` returning a usable handle with nothing
  // loaded is the lazy property, stated as behaviour rather than as a regex over the source.
  const handle = mermaidPlugin.getMermaid();
  assert.equal(mermaidPlugin.name, "mermaid");
  assert.equal(mermaidPlugin.type, "diagram");
  assert.equal(mermaidPlugin.language, "mermaid", "Streamdown routes fences by this language id");
  assert.equal(typeof handle.render, "function", "Streamdown awaits `render(id, chart)` and destructures its `svg`");
  assert.equal(typeof handle.initialize, "function", "the plugin interface offers `initialize`; a missing one would throw for any caller that used it");
});

test("🔴 the Streamdown plugin loads the library inside `render`, so a message costs nothing until it draws", () => {
  const plugin = readFileSync(new URL("./mermaid-plugin.ts", import.meta.url), "utf8");
  assert.match(plugin, /await loadEngine\(\)/, "the plugin no longer loads the engine lazily");
  assert.match(plugin, /type: "diagram"/, "the plugin no longer answers Streamdown's diagram contract");

  // The one consumer of the plugin, pinned by name: if `message.tsx` goes back to the package
  // plugin the sweep above catches it, but this says which file the replacement belongs to.
  const message = readFileSync(new URL("../../components/ai-elements/message.tsx", import.meta.url), "utf8");
  assert.match(message, /mermaid: mermaidPlugin/, "MessageResponse is not using the lazy plugin");
});
