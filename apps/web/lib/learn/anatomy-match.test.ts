// The atlas matcher: names in, region files and highlight lists out, nothing invented.
//
// 🔴 THE TEST THIS FILE EXISTS TO BE is the multi-match one. "cervical vertebrae" is FIVE nodes in
// the atlas, and a matcher that picked one arbitrarily would highlight C3 while the lesson talks
// about the neck — plausible, wrong, and invisible. Every match travels, like a pointer circling a
// group on a wall chart.

import assert from "node:assert/strict";
import test from "node:test";

import { ANATOMY_ATLAS } from "./anatomy-atlas";
import { resolveStructureName } from "./anatomy-match";

test("the registry holds every harvested region with the atlas's own names", () => {
  assert.ok(ANATOMY_ATLAS.length >= 8, `only ${ANATOMY_ATLAS.length} regions harvested`);
  const total = ANATOMY_ATLAS.reduce((sum, region) => sum + region.structures.length, 0);
  assert.ok(total > 1200, `only ${total} structures across the atlas`);
  for (const region of ANATOMY_ATLAS) {
    assert.match(region.assetPath, /^\/anatomy\/[a-z0-9-]+\.glb$/);
    assert.ok(region.title.trim(), `${region.region} has no title`);
    assert.ok(region.structures.length > 0, `${region.region} has no structures`);
  }
});

test("🔴 the atlas is not just bones — muscles, nerves and vessels are in it", () => {
  // The owner's whole ask ("I don't just want bones"), asserted rather than assumed.
  for (const name of ["biceps brachii", "median nerve", "brachial artery", "femoral vein"]) {
    const resolved = resolveStructureName(name);
    assert.ok(resolved, `the atlas carries no "${name}"`);
    assert.ok((resolved?.structures.length ?? 0) > 0, `"${name}" resolved to a whole region rather than a structure`);
  }
});

test("🔴 …and it is not one body either — the female organs answer by name", () => {
  // 🔴🔴 THE GAP THAT COULD NOT HAVE CLOSED BY MATCHING HARDER. Z-Anatomy and Open3DModel both
  // descend from BodyParts3D, and BodyParts3D has NO female reproductive organs — its own parts
  // list carries fifteen prostate/testis/penis entries and zero for uterus, ovary or uterine tube.
  // Half the learners Nemesis serves could not see their own anatomy, and no scoring change would
  // have fixed it; a third atlas had to arrive. This test is what stops it silently leaving again.
  const female: Record<string, string> = {
    "cervix": "female-reproductive-system",
    "fallopian tube": "female-reproductive-system",
    "fundus of uterus": "female-reproductive-system",
    "mammary gland": "breast",
    "nipple": "breast",
    "ovary": "female-reproductive-system",
    "placenta": "placenta",
    "umbilical cord": "placenta",
    "uterus": "female-reproductive-system",
  };
  for (const [name, region] of Object.entries(female)) {
    const resolved = resolveStructureName(name);
    assert.ok(resolved, `the atlas carries no "${name}"`);
    assert.equal(resolved?.region, region, `"${name}" resolved to ${resolved?.region}`);
    assert.ok((resolved?.structures.length ?? 0) > 0, `"${name}" resolved to a whole region`);
  }
});

test("🔴 the third atlas took no ask away from the first two", () => {
  // A new region is also a new competitor for every existing name, and the tie-breaks are decided
  // partly on region SIZE — three small regions are exactly the shape that could quietly steal a
  // whole-body ask. Nothing HRA-sourced shares a name with anything already harvested, and these
  // are the asks that would notice first if that stopped being true.
  assert.equal(resolveStructureName("sacrum")?.region, "overview-skeleton");
  assert.equal(resolveStructureName("prostate")?.region, "visceral-systems");
  assert.equal(resolveStructureName("liver")?.region, "visceral-systems");
  assert.equal(resolveStructureName("femur")?.region, "overview-skeleton");
});

test("a single bone resolves to itself", () => {
  const resolved = resolveStructureName("sacrum");
  assert.ok(resolved);
  assert.deepEqual(resolved?.structures, ["Sacrum"]);
  assert.equal(resolved?.region, "overview-skeleton");
});

test("🔴 a group name resolves to EVERY member, never an arbitrary one", () => {
  const resolved = resolveStructureName("cervical vertebrae");
  assert.ok(resolved);
  assert.ok((resolved?.structures.length ?? 0) >= 5, `only ${resolved?.structures.length} matched`);
  assert.ok(resolved?.structures.every((name) => name.toLowerCase().includes("cervical")));
});

test("🔴 the model that names it exactly wins, so a hand bone is shown in a hand", () => {
  // The hand carries "1st metacarpal bone"; the whole skeleton carries it as "…bone.r". Both
  // survive the band, and the exact name is the model being asked about.
  const resolved = resolveStructureName("1st metacarpal bone");
  assert.equal(resolved?.region, "hand");
});

test("🔴 …and a bone only INCIDENTALLY in a limb model still resolves to the skeleton", () => {
  // The upper-limb model carries the sacrum for context. Both name it exactly, both match once,
  // so the most focused region wins — which is also the smaller download.
  assert.equal(resolveStructureName("sacrum")?.region, "overview-skeleton");
});

test("🔴 an ask too broad to point at anything becomes the whole region, not a smear of highlights", () => {
  assert.deepEqual(resolveStructureName("bone")?.structures, []);
  assert.deepEqual(resolveStructureName("skeleton")?.structures, []);
  assert.deepEqual(resolveStructureName("hand")?.structures, []);
});

test("a structure the atlas does not carry resolves to nothing", () => {
  // Torso organs are the honest gap while the upstream project finishes them.
  assert.equal(resolveStructureName("qwertyuiop"), null);
  assert.equal(resolveStructureName(""), null);
});
