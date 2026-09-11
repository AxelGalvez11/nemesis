import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";

/**
 * 🔴 THE SPACE WORKSPACE SHIPS ITS LAYOUT AND BEHAVIOUR, NEVER ANOTHER PRODUCT'S ASSETS (docs/space/PLAN.md).
 *
 * It was built against a measured local copy of a reference app. That copy held the reference's icons, artwork,
 * settings text, its store's third-party templates and hotlinks to its servers, and it never enters this repository.
 * This test is what keeps it that way: a pasted icon, a hotlink or a leftover product name fails here, not in review.
 */
const WEB = path.resolve(__dirname, "../..");
const ROOTS = ["space", "components/space", "lib/space", "scripts/space-icons.mjs", "scripts/space-emoji.mjs", "scripts/space-scope-css.mjs"];
const SELF = path.resolve(__filename);

function files(rel: string): string[] {
  const abs = path.join(WEB, rel);
  if (!statSync(abs).isDirectory()) return [abs];
  return readdirSync(abs).flatMap((name) => files(path.join(rel, name)));
}

const ALL = ROOTS.flatMap(files).filter((f) => f !== SELF && /\.(js|mjs|ts|tsx|css|json|md)$/.test(f));

test("no product name, host or copied asset from the reference app", () => {
  const banned: Array<[RegExp, string]> = [
    [/notion/i, "the reference product's name (class names use nsp-)"],
    [/app\.notion|notion\.so|notion-static/i, "a hotlink to the reference's servers"],
    [/lh3\.googleusercontent\.com\/a\//, "a hotlinked personal avatar"],
    [/unpkg\.com/, "a script loaded from a CDN at runtime"],
    [/Axel|axelgalvez/i, "a real person's name or email baked into the product"],
  ];
  assert.ok(ALL.length > 10, "the scan found the Space files");
  for (const file of ALL) {
    const text = readFileSync(file, "utf8");
    for (const [re, why] of banned) {
      const m = re.exec(text);
      assert.equal(m, null, `${path.relative(WEB, file)} contains ${JSON.stringify(m?.[0])}: ${why}`);
    }
  }
});

test("every interface icon is a generated Lucide glyph, not pasted geometry", async () => {
  const { ICONS } = await import("../../space/app/icons.js");
  for (const [name, svg] of Object.entries(ICONS as Record<string, string>)) {
    assert.ok(svg.startsWith('<svg viewBox="0 0 24 24"'), `${name} is not a generated 24px glyph`);
  }
  const main = readFileSync(path.join(WEB, "space/app/main.js"), "utf8");
  const pasted = main.match(/<path d="M[^"]{60,}"/);
  assert.equal(pasted, null, "main.js carries hand-pasted icon path data; add the icon to space/icons/map.json instead");
});
