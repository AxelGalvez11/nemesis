import assert from "node:assert/strict";
import { test } from "node:test";

import { SOURCE_DISAGREEMENT_RULE, sourceDisagreementInstruction } from "./source-authority";

test("course and external evidence coexist instead of one silently winning", () => {
  assert.match(SOURCE_DISAGREEMENT_RULE, /Course expects:/);
  assert.match(SOURCE_DISAGREEMENT_RULE, /External\/current evidence:/);
  assert.match(SOURCE_DISAGREEMENT_RULE, /course or exam/i);
  assert.match(SOURCE_DISAGREEMENT_RULE, /current or evidence based/i);
  assert.match(SOURCE_DISAGREEMENT_RULE, /never silently overwrite/i);
});

test("the disagreement rule only rides when both source roles exist", () => {
  assert.equal(sourceDisagreementInstruction({ hasAttachedMaterial: true, hasExternalEvidence: true }), SOURCE_DISAGREEMENT_RULE);
  assert.equal(sourceDisagreementInstruction({ hasAttachedMaterial: true, hasExternalEvidence: false }), "");
  assert.equal(sourceDisagreementInstruction({ hasAttachedMaterial: false, hasExternalEvidence: true }), "");
});
