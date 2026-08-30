// Picking a file on the front door STAGES it. It does not send it.
//
// 🔴🔴 REPORTED 2026-08-21: *"it still will automatically send the attachment and not attach to the
// chat composer so that i can add more."* `startWithFiles` called `putPending` and `router.push` in
// the same breath, so one PDF was the entire instruction — no second file, no "focus on chapter 4",
// no chance to change your mind. A learner with three lecture PDFs had to open three canvases.
//
// 🔴 THESE ARE SOURCE GUARDS, AND THAT IS A REAL LIMIT WORTH STATING. There is no DOM in this test
// runner, so nothing here proves a chip renders or that clicking × removes it. What they do prove is
// the property the defect was: that the pick handler cannot navigate, and that the send handler is
// the only thing that hands material over. That is the part a refactor would quietly undo.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const HOME = readFileSync(new URL("./canvas-home.tsx", import.meta.url), "utf8");

/** The body of one function, from its name to the line that closes it at the top level. */
function bodyOf(name: string): string {
  const start = HOME.indexOf(`const ${name} = (`);
  assert.notEqual(start, -1, `${name} is gone`);
  const end = HOME.indexOf("\n  };", start);
  assert.notEqual(end, -1, `${name} has no recognisable end`);
  return HOME.slice(start, end);
}

test("🔴 picking material cannot navigate, and cannot hand it over", () => {
  const stage = bodyOf("stageFiles");
  assert.ok(!stage.includes("router.push"), "picking a file navigates again — this is the reported defect");
  assert.ok(!stage.includes("putPending"), "picking a file hands material over before the learner sent it");
  assert.match(stage, /setStaged/, "the pick handler no longer stages anything");
});

// 🔴 THE PICK PATHS ALL GO THROUGH ONE HANDLER. A drop, a file dialog, a finished recording and a
// recovered recording are four ways in, and the defect only has to survive in one of them to be
// the same bug. `startWithFiles` must not exist under any name.
test("🔴 every way material arrives goes through staging", () => {
  assert.ok(!HOME.includes("startWithFiles"), "the auto-sending handler is back");
  assert.equal((HOME.match(/stageFiles\(/g) ?? []).length >= 4, true, "a route in stopped staging");
});

test("🔴 only Start hands the files over", () => {
  const start = bodyOf("start");
  assert.match(start, /if \(staged\.length > 0\) putPending\(staged\)/);
  assert.match(start, /router\.push|setTimeout\(\(\) => router\.push/);
  // 🔴 AND `putPending` HAPPENS EXACTLY ONCE IN THE FILE. Two stashes would mean the second clears
  // the first — `takePending` reads once and clears — so a file would vanish rather than duplicate.
  assert.equal((HOME.match(/putPending\(/g) ?? []).length, 1);
});

// 🔴🔴 BARE `/learn` RENDERS THIS PAGE, NOT A CANVAS. Files staged with no topic typed would have
// been stashed for a canvas that never mounted, and `takePending` clears as it reads — so they
// would have been silently lost on the next visit. `?new=1` is what mounts the canvas surface.
test("🔴 material with no topic still opens a canvas", () => {
  const start = bodyOf("start");
  // 🔴 REPOINTED 2026-08-29: the href now carries `${filing}` — the project chosen before the canvas
  // existed. The invariant is unchanged and is what is asserted: material with no words still opens
  // a canvas, through `?new=1`.
  assert.match(start, /staged\.length > 0\s*\?\s*`\/learn\?new=1\$\{filing\}`/);
  // 🔴 AND THE FILING RIDES BOTH DOORS. A chat started from typed words and one started from
  // dropped material are the same new canvas; a project chosen before either must file either.
  const askLine = start.split("\n").find((l) => l.includes("?ask=")) ?? "";
  assert.ok(askLine.includes("${filing}"), "a typed topic does not carry the chosen project");
  assert.match(start, /const filing = project \? `&folder=\$\{encodeURIComponent\(project\)\}` : "";/, "the filing parameter is gone");
});

test("🔴 material alone is enough to send — except under a staged capability, which needs words", () => {
  // The capability half mirrors the session composer's own §3 rule (`canStartFromAttachment`
  // refuses a capability there too): a chip is a declaration ABOUT words, and it is also what
  // keeps `start`'s `&cap=` riding only beside a real `?ask=`.
  assert.match(HOME, /disabled=\{capability \? !text\.trim\(\) : !text\.trim\(\) && staged\.length === 0\}/);
});

// 🔴 NOTHING IS UPLOADED, PARSED OR PAID FOR UNTIL START. Extraction is the expensive step; a file
// sitting in a chip has not begun it, which is the whole reason removing one is free.
test("🔴 staging does not extract", () => {
  const stage = bodyOf("stageFiles");
  for (const spend of ["extractFile", "attachFiles", "await"]) {
    assert.ok(!stage.includes(spend), `staging calls ${spend} — picking a file now costs money`);
  }
});
