import assert from "node:assert/strict";
import { detectRequestedExportFormats, reportExportHref } from "./report-deliverable";

assert.deepEqual(detectRequestedExportFormats("make me a powerpoint on semaglutide"), ["pptx"]);
assert.deepEqual(detectRequestedExportFormats("Create a Word document and PPT deck"), ["docx", "pptx"]);
assert.deepEqual(detectRequestedExportFormats("answer in plain English"), []);

assert.equal(
  reportExportHref("report-123", "pptx", "ama"),
  "/api/reports/report-123/export/pptx?style=ama",
);

console.log("report-deliverable.test.ts OK");
