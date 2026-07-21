import assert from "node:assert/strict";

import { activeClozeNumber, clozeNumbers, hasCloze, renderCloze } from "./study-cloze";

const TEXT = "{{c1::Beta blockers}} slow the heart via {{c2::beta-1::receptor subtype}} blockade.";

// Parsing: numbers dedupe and sort; plain text has none.
{
  assert.deepEqual(clozeNumbers(TEXT), [1, 2]);
  assert.deepEqual(clozeNumbers("{{c3::b}} then {{c1::a}} and {{c1::again}}"), [1, 3]);
  assert.deepEqual(clozeNumbers("no markers here"), []);
  assert.ok(hasCloze(TEXT));
  assert.ok(!hasCloze("plain front"));
}

// Rotation: repetitions cycle through the card's numbers; bad input is safe.
{
  assert.equal(activeClozeNumber(TEXT, 0), 1);
  assert.equal(activeClozeNumber(TEXT, 1), 2);
  assert.equal(activeClozeNumber(TEXT, 2), 1);
  assert.equal(activeClozeNumber(TEXT, -5), 1);
  assert.equal(activeClozeNumber(TEXT, Number.NaN), 1);
  assert.equal(activeClozeNumber("plain", 3), null);
}

// Hidden state: active blank masked (hint shown when present), others plain.
{
  assert.equal(
    renderCloze(TEXT, 1, false),
    "**[...]** slow the heart via beta-1 blockade.",
  );
  assert.equal(
    renderCloze(TEXT, 2, false),
    "Beta blockers slow the heart via **[receptor subtype]** blockade.",
  );
}

// Revealed state: active answer bolded, others stay plain.
{
  assert.equal(
    renderCloze(TEXT, 2, true),
    "Beta blockers slow the heart via **beta-1** blockade.",
  );
  // Multiple instances of the same number all hide together.
  assert.equal(renderCloze("{{c1::A}} and {{c1::B}}", 1, false), "**[...]** and **[...]**");
}

console.log("study-cloze.test.ts OK");
