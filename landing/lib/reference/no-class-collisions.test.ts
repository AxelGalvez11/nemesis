import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// ── The preview pages must not share a class name with the old site's stylesheet ─────────────
//
// 🔴 THIS HAPPENED ON 2026-09-10. The logo exploration page used `.brand` as its root class, and
// app/globals.css already owns `.brand` for the old nav logo (a centred flex row, with `.brand b` set
// in Hanken Grotesk at 14px and 0.3em tracking). The page silently inherited all of it: its sections
// laid out side by side, the Inter wordmarks rendered in Hanken with wide spacing, and the name
// vanished on the dark cards. Every typecheck and every automated render passed while it looked
// broken. It took a screenshot and a matched-rules probe to find.
//
// The previews live in the same app as the old homepage, so any bare class name they use is one
// careless global rule away from the same fault. This guard fails the moment one overlaps.

const root = new URL("../../", import.meta.url).pathname;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (full.endsWith(".tsx")) out.push(full);
  }
  return out;
}

/** Class tokens from static parts of className attributes: "a b", {`a ${x}`}, {["a", x, "b"]}. */
function classTokens(source: string): Set<string> {
  const tokens = new Set<string>();
  const add = (text: string) => {
    for (const t of text.replace(/\$\{[^}]*\}/g, " ").split(/\s+/)) if (/^[a-z][a-z0-9-]*$/.test(t)) tokens.add(t);
  };
  for (const m of source.matchAll(/className="([^"]*)"/g)) add(m[1] ?? "");
  for (const m of source.matchAll(/className=\{`([^`]*)`\}/g)) add(m[1] ?? "");
  for (const m of source.matchAll(/className=\{\[([^\]]*)\]/g)) {
    for (const s of (m[1] ?? "").matchAll(/"([^"]*)"/g)) add(s[1] ?? "");
  }
  return tokens;
}

/** Every `.class` the old site's global stylesheet defines, comments removed first. */
function globalClasses(): Set<string> {
  const css = readFileSync(join(root, "app/globals.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  return new Set([...css.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1] ?? ""));
}

describe("preview pages do not collide with the old site's global classes", () => {
  const files = [
    ...walk(join(root, "app/preview")),
    ...walk(join(root, "components/reference")),
  ];

  it("scans the preview surface", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it("🔴🔴 no class used by a preview page is also defined in app/globals.css", () => {
    const globals = globalClasses();
    const collisions: string[] = [];
    for (const file of files) {
      for (const token of classTokens(readFileSync(file, "utf8"))) {
        if (globals.has(token)) collisions.push(`${token}  (${file.replace(root, "")})`);
      }
    }
    expect(collisions, `rename these; the old site's globals.css already styles them:\n${collisions.join("\n")}`).toEqual([]);
  });
});
