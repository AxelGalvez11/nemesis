import assert from "node:assert/strict";
import {
  DEFAULT_EVIDENCE_PANEL_WIDTH,
  clampEvidencePanelWidth,
  evidencePanelWidthStyle,
} from "./evidence-panel-layout";

assert.equal(clampEvidencePanelWidth(120), 320);
assert.equal(clampEvidencePanelWidth(480), 480);
assert.equal(clampEvidencePanelWidth(1200, 1000), 720);
assert.equal(clampEvidencePanelWidth(Number.NaN), DEFAULT_EVIDENCE_PANEL_WIDTH);
assert.equal(evidencePanelWidthStyle(456), "456px");

console.log("evidence-panel-layout.test.ts OK");
