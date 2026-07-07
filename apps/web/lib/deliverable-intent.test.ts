// npx tsx lib/deliverable-intent.test.ts
import assert from "node:assert/strict";
import { detectDeliverableIntent } from "./deliverable-intent.ts";

// --- SLIDES ---
{
  const r = detectDeliverableIntent("make me slides on statin safety");
  assert.equal(r.isDeliverable, true);
  assert.equal(r.format, "slides");
  assert.equal(r.topic, "statin safety");
}
{
  const r = detectDeliverableIntent("create a slide deck about GLP-1 agonists");
  assert.equal(r.isDeliverable, true);
  assert.equal(r.format, "slides");
  assert.equal(r.topic, "GLP-1 agonists");
}
{
  const r = detectDeliverableIntent("build a presentation for metformin and cancer risk");
  assert.equal(r.isDeliverable, true);
  assert.equal(r.format, "slides");
  assert.equal(r.topic, "metformin and cancer risk");
}
{
  const r = detectDeliverableIntent("can you make a powerpoint on tirzepatide efficacy");
  assert.equal(r.isDeliverable, true);
  assert.equal(r.format, "slides");
  assert.equal(r.topic, "tirzepatide efficacy");
}

// --- DOCUMENT ---
{
  const r = detectDeliverableIntent("write a document about GLP-1 evidence");
  assert.equal(r.isDeliverable, true);
  assert.equal(r.format, "document");
  assert.equal(r.topic, "GLP-1 evidence");
}
{
  const r = detectDeliverableIntent("draft a write-up on creatine and hair loss");
  assert.equal(r.isDeliverable, true);
  assert.equal(r.format, "document");
  assert.equal(r.topic, "creatine and hair loss");
}
{
  const r = detectDeliverableIntent("please write a research paper on semaglutide safety");
  assert.equal(r.isDeliverable, true);
  assert.equal(r.format, "document");
  assert.equal(r.topic, "semaglutide safety");
}

// --- POSTER ---
{
  const r = detectDeliverableIntent("make a poster on metformin");
  assert.equal(r.isDeliverable, true);
  assert.equal(r.format, "poster");
  assert.equal(r.topic, "metformin");
}
{
  const r = detectDeliverableIntent("create a conference poster about statin safety");
  assert.equal(r.isDeliverable, true);
  assert.equal(r.format, "poster");
  assert.equal(r.topic, "statin safety");
}

// --- NO-HIJACK: normal research questions must NEVER match ---
{
  const r = detectDeliverableIntent("What does the latest paper say about statins?");
  assert.equal(r.isDeliverable, false);
  assert.equal(r.format, null);
}
{
  const r = detectDeliverableIntent("Is there a good review of GLP-1 safety?");
  assert.equal(r.isDeliverable, false);
}
{
  const r = detectDeliverableIntent("Summarize the report on tirzepatide.");
  assert.equal(r.isDeliverable, false);
}
{
  const r = detectDeliverableIntent("Is it true that creatine causes hair loss?");
  assert.equal(r.isDeliverable, false);
}
{
  const r = detectDeliverableIntent("What is metformin used for?");
  assert.equal(r.isDeliverable, false);
}
{
  // "report" alone as trailing noun is deliberately excluded from DOCUMENT_NOUNS (too much overlap
  // with normal research asks like "write a report on X" which many users mean as "answer me").
  const r = detectDeliverableIntent("write a report on GLP-1 safety");
  assert.equal(r.isDeliverable, false);
}
{
  const r = detectDeliverableIntent("Can a poster child for good sleep hygiene also have insomnia?");
  assert.equal(r.isDeliverable, false);
}

// --- FAIL-SAFE: empty topic after stripping ---
{
  const r = detectDeliverableIntent("make me slides");
  assert.equal(r.isDeliverable, false);
  assert.equal(r.topic, "");
}
{
  const r = detectDeliverableIntent("make a deck");
  assert.equal(r.isDeliverable, false);
}
{
  const r = detectDeliverableIntent("");
  assert.equal(r.isDeliverable, false);
}
{
  const r = detectDeliverableIntent("   ");
  assert.equal(r.isDeliverable, false);
}

// --- trailing punctuation stripped from topic ---
{
  const r = detectDeliverableIntent("make me slides on statin safety.");
  assert.equal(r.topic, "statin safety");
}
{
  const r = detectDeliverableIntent("make me slides on statin safety!");
  assert.equal(r.topic, "statin safety");
}

console.log("deliverable-intent.test.ts: all assertions passed");
