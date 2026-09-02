// Owner, 2026-09-02, with a screenshot of the reply: *"I asked it to make a document and it
// literally did not, it just gave me reasoning out loud and no action, like what the heck."*
//
// What he was shown, verbatim: *"A document is a thing you keep and work from… let me build it
// properly. The research report is being saved into your Library now."*
//
// Reproduced on production against a fresh canvas — asked a web question, then "make a document on
// it", then watched for two minutes:
//
//     +15s outputs=0   +30s outputs=0   +45s outputs=0   +60s outputs=0   +90s outputs=0
//     failed requests: []      page errors: []
//
// Not one failed request. A research run makes many, so the run NEVER STARTED: `wantsReport` came
// back null while the reply described the report as under way. His own canvas confirms it —
// "Claude updates and news", two moments, zero outputs.
//
// Two faults, and the second is the worse one.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const ROUTER = readFileSync("lib/learn/turn-router.ts", "utf8");
const SESSION = readFileSync("components/workspace/learn/use-canvas-session.ts", "utf8");

test("🔴🔴🔴 an outright request for a document is not a borderline call", () => {
  // The cost paragraph argues against choosing a report in every sentence, and it works — it was
  // written to stop a minute-long run being picked for any question with sources in it. It worked
  // on "make a document on it" too, which is not a judgement call: it is the learner naming the
  // thing they want. The caution is for deciding on their behalf.
  assert.match(ROUTER, /None of that caution applies when the learner ASKS for the artefact outright/,
    "the model is back to weighing the cost of a document the learner already asked for");
  // 🔴 THE EXAMPLES ARE PHRASINGS, NOT A KEYWORD LIST TO MATCH ON. The router still decides by
  // intent — §"route by intent" (owner 2026-08-24) — and nothing here greps the learner's text.
  assert.ok(!/wantsReport[\s\S]{0,200}\.includes\(|\/make a document\/i/.test(ROUTER),
    "the request is being detected by matching the learner's words instead of by intent");
});

test("🔴🔴🔴 offering is not an allowed answer to an outright request", () => {
  // 🔴 THE FIRST FIX SHIPPED HALF-WORKING AND THIS IS THE OTHER HALF. Driven on production the same
  // hour: the honesty rule worked exactly as written — *"I haven't made a document. I only answered
  // your question in the chat"* — and then it asked *"would you like me to actually write one up?"*
  // about a document he had asked for in plain words one message earlier.
  //
  // The wording handed it that. The honesty rule ended "either make one or say plainly that you have
  // not, and offer", which reads as two equally good branches, and the cost paragraph above spends
  // five sentences arguing for the second. Telling the truth and still not acting is, for the
  // learner, the same outcome with better manners.
  assert.match(ROUTER, /Never answer an outright request by OFFERING to do it\./,
    "offering is an allowed answer again, so an explicit request can still end in a question");
  assert.match(ROUTER, /such a request is never \\"borderline\\"/,
    "an outright request can be read as borderline again, which is what the cost paragraph then decides");
  assert.match(ROUTER, /That is the only case where offering is right\./,
    "the honesty rule offers a way out again instead of naming the one case that earns it");
});

test("🔴🔴🔴 the reply may not announce a document the flag did not ask for", () => {
  // This is the defect, and it outranks the missing document. `reply` and `wantsReport` are two
  // fields of ONE envelope and nothing has ever made them agree, so the model can decline the run
  // in one field and describe it as under way in the other. A learner cannot tell those apart —
  // they read the sentence, then go looking for a file that was never written.
  assert.match(ROUTER, /Your reply and this field must tell the same story\./,
    "the reply can promise a document again without asking for one");
  assert.match(ROUTER, /on this same turn/, "the promise is no longer tied to the flag that does the work");
  assert.match(ROUTER, /is being made, saved, written or added to their Library unless you have set/,
    "the ban on announcing an unmade document is gone");
});

test("🔴 and the flag still reaches the thing that makes the file", () => {
  // The wiring was never the problem and must not become one: nothing here changed it, so this is
  // the receipt that the chain still runs end to end.
  assert.match(SESSION, /if \(decision\.wantsReport\) void makeDeliverable\("report", decision\.wantsReport, undefined, true\);/,
    "nothing acts on the flag any more, so setting it would be as empty as not setting it");
  assert.match(ROUTER, /const wantsReport = reportAsk\.length >= 8 \? reportAsk\.slice\(0, 500\) : null;/,
    "the parse gate moved; a short research question would be silently dropped");
});
