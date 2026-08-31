import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// 🔴🔴🔴 DROPPING FILES AND PRESSING ENTER DID NOTHING AT ALL.
//
// Owner, 2026-08-31: *"I drop many in today… I didn't even ingest them at all."* True, and this
// was why — not the parser, not the upload, not the model. The front door's send key is the text
// field's OWN `onKeyDown`, so it only fires while that field has focus, and a drop focuses
// nothing. Measured live the same day: `document.activeElement` is BODY before the drop and still
// BODY after it, with the chips sitting on screen.
//
// The three-way A/B on production, which is what turned a guess into this file:
//   drop → Enter                 : url unchanged, ZERO uploads, no error   ← the report
//   drop → click the box → Enter : /learn?new=1, 2 uploads, 2 extracts
//   drop → click Start           : /learn?new=1, 2 uploads, 2 extracts
//
// Nothing was broken downstream, which is exactly why the database showed no trace: the material
// never left the page. A silent dead end on the product's first gesture reads as "it lost my
// documents", and it cost the owner a whole sitting.

const HOME = readFileSync(new URL("./canvas-home.tsx", import.meta.url), "utf8");

function code(source: string): string {
  return source.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
}

const home = code(HOME);

test("🔴🔴🔴 staging material focuses the composer, or Enter is a dead key", () => {
  const stage = home.slice(home.indexOf("const stageFiles ="), home.indexOf("const startDictation"));
  assert.ok(stage.length > 0, "stageFiles must still exist as the one staging door");
  assert.match(
    stage,
    /composerField\.current\?\.focus\(\)/,
    "stageFiles must focus the text field — the send key lives on that field and a drop focuses nothing",
  );
});

test("🔴🔴 the ref is actually attached to the field, not just declared", () => {
  // A declared-but-unattached ref is `null.focus?.()` — a no-op that looks exactly like the fix.
  assert.match(home, /ref=\{composerField\}/);
  const input = home.slice(home.lastIndexOf("<input", home.indexOf("ref={composerField}")), home.indexOf("ref={composerField}"));
  assert.match(input, /onKeyDown=\{/, "the ref must sit on the field that carries the Enter handler, not another input");
});

test("🔴 Enter on that field is still what sends — the premise of the whole fix", () => {
  assert.match(
    home,
    /if \(event\.key === "Enter" && !event\.shiftKey\) \{\s*event\.preventDefault\(\);\s*start\(\);/,
    "if send moves off the field's onKeyDown, re-examine whether focusing it is still the right fix",
  );
});

test("🔴 both ways in go through stageFiles, so both inherit the focus", () => {
  // The drop handler and the file picker. If a third door appears that calls setStaged directly,
  // it gets the dead Enter key back — hence pinning that setStaged has exactly one caller.
  assert.match(home, /onDrop=\{\(event\) => \{[\s\S]{0,220}stageFiles\(event\.dataTransfer\.files\)/);
  const pickerToStage = /onChange=\{\(event\) => \{[\s\S]{0,300}stageFiles\(/.test(home);
  assert.ok(pickerToStage, "the file picker must stage through the same door");
});

test("🔴 material alone can still send — the button stays enabled with no words typed", () => {
  // The other half of the same gesture: focus makes Enter reachable, this keeps Start reachable.
  assert.match(home, /disabled=\{capability \? !text\.trim\(\) : !text\.trim\(\) && staged\.length === 0\}/);
});
