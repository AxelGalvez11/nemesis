import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { readExtraction, readQueries, readReportBody, readSubQuestions, readVerdict } from "./research-parse";
import { checkMessages, extractMessages, planMessages, writeMessages } from "./research-prompts";

// The border between what the model proposes and what a learner is shown. A research report's only
// claim on anybody's trust is that its sentences are traceable, so the citation numbers are exactly
// where a hallucination would do most damage and be least visible.

test("🔴 a citation pointing past the end of the pool is dropped, not rendered", () => {
  // The model cites fact 9; five facts were found. Fact 9 does not exist. Rendering it would print
  // a citation marker aimed at nothing, which looks identical to a real one.
  const body = readReportBody(
    JSON.stringify({
      gaps: ["something"],
      sections: [{ heading: "H", points: [{ support: [1, 9, 3], text: "A point" }] }],
      summary: "The answer.",
    }),
    5,
  );
  assert.deepEqual(body?.sections[0]?.points[0]?.support, [0, 2], "an invented citation survived");
});

test("🔴 fact numbers are 1-based in and 0-based out", () => {
  // Getting this wrong attaches every sentence to the wrong source while looking perfectly correct.
  const body = readReportBody(
    JSON.stringify({ sections: [{ heading: "H", points: [{ support: [1], text: "P" }] }], summary: "S" }),
    3,
  );
  assert.deepEqual(body?.sections[0]?.points[0]?.support, [0], "fact 1 must index element 0");
});

test("🔴 an uncited sentence never reaches the report", () => {
  // The one sentence a reader has no way to check is the one with nothing behind it. A point whose
  // support is empty, missing, or entirely out of range is dropped; a section emptied that way goes
  // with it, and a report with no sections left is not a report.
  const body = readReportBody(
    JSON.stringify({
      sections: [
        { heading: "Kept", points: [{ support: [2], text: "cited" }, { support: [], text: "bare" }] },
        { heading: "Emptied", points: [{ support: [99], text: "all out of range" }] },
      ],
      summary: "S",
    }),
    3,
  );
  assert.equal(body?.sections.length, 1, "an emptied section stayed in the report");
  assert.deepEqual(body?.sections[0]?.points.map((p) => p.text), ["cited"]);
  assert.equal(
    readReportBody(JSON.stringify({ sections: [{ heading: "H", points: [{ support: [], text: "x" }] }], summary: "S" }), 3),
    null,
    "a report where nothing was cited should not be saved at all",
  );
});

test("a duplicated citation is counted once", () => {
  const body = readReportBody(
    JSON.stringify({ sections: [{ heading: "H", points: [{ support: [2, 2, 2], text: "P" }] }], summary: "S" }),
    4,
  );
  assert.deepEqual(body?.sections[0]?.points[0]?.support, [1]);
});

test("a report with no summary is refused", () => {
  // The summary is the answer. A report that goes straight into themed sections has buried it.
  assert.equal(readReportBody(JSON.stringify({ sections: [{ heading: "H", points: [] }] }), 2), null);
  assert.equal(readReportBody("not json at all", 2), null);
});

test("model output wrapped in fences or chat still parses", () => {
  const wrapped = 'Here you go!\n```json\n{"subQuestions":["a?","b?","c?"]}\n```\nHope that helps.';
  assert.deepEqual(readSubQuestions(wrapped), ["a?", "b?", "c?"]);
});

test("🔴 two sub-questions is not a research plan", () => {
  // Running it anyway produces a thin report that reads as though the evidence was thin, which is
  // a different and worse claim than "I could not plan this".
  assert.equal(readSubQuestions('{"subQuestions":["one?","two?"]}'), null);
  assert.equal(readSubQuestions('{"subQuestions":[]}'), null);
  assert.equal(readSubQuestions("garbage"), null);
  assert.equal(readSubQuestions('{"subQuestions":["a?","b?","c?","d?","e?","f?","g?"]}')?.length, 5, "capped");
});

test("a query too long for the search provider is dropped here", () => {
  // Brave refuses over 50 words, and a refused query falls silently through to a slower provider:
  // the symptom is "the fast one never wins" with no error anywhere to find.
  const long = Array.from({ length: 60 }, (_, i) => `word${i}`).join(" ");
  assert.deepEqual(readQueries(JSON.stringify({ queries: [long, "a fine query"] }), 4), ["a fine query"]);
});

test("extraction keeps an empty answer as an empty answer", () => {
  // "This source had nothing relevant" is a true and useful result. Turning it into a failure would
  // push the model to invent something rather than report nothing.
  assert.deepEqual(readExtraction('{"facts":[],"followUps":[]}'), { facts: [], followUps: [] });
  assert.deepEqual(readExtraction("nonsense"), { facts: [], followUps: [] });
  assert.equal(readExtraction(JSON.stringify({ facts: ["a", "b", "c", "d", "e"] })).facts.length, 3, "capped per source");
});

test("🔴 an unreadable verdict counts as NOT supported", () => {
  // A check that fails open is not a check. Dropping one good sentence costs a little; keeping one
  // fabricated sentence in a document the learner will quote costs the whole feature.
  assert.equal(readVerdict('{"supported":true,"why":"the passage says it"}'), true);
  assert.equal(readVerdict('{"supported":false,"why":"no"}'), false);
  assert.equal(readVerdict("the model rambled instead of answering"), false);
  assert.equal(readVerdict('{"supported":"true"}'), false, "a string is not a yes");
  assert.equal(readVerdict(""), false);
});

test("🔴 no prompt in this lane names a field", () => {
  // The engine this replaces opened with "You are PharmaBro's answer engine: a conservative,
  // educational medical-information service" and asked for MeSH terminology. The same run now has
  // to serve tort law, heat exchangers and the Gracchi, so the instructions may only describe the
  // SHAPE of good research.
  const prompts = readFileSync(new URL("./research-prompts.ts", import.meta.url), "utf8")
    .split("\n")
    .filter((line) => {
      const s = line.trim();
      return !(s.startsWith("//") || s.startsWith("*") || s.startsWith("/*"));
    })
    .join("\n");
  for (const word of ["medical", "clinical", "drug", "patient", "mesh", "biomedical", "pharmac"]) {
    assert.ok(!new RegExp(word, "i").test(prompts), `a research prompt says "${word}"`);
  }
  // And it says so positively, rather than merely omitting it.
  const built = planMessages("anything").map((m) => m.content).join("\n");
  assert.match(built, /may be in any discipline/i, "the model is not told the learner could be anyone");
});

test("🔴 the extractor is handed ONE source and told not to fill gaps", () => {
  // Handed ten pages at once a model writes a fact that is true of the batch and traceable to none
  // of them. Handed one page, every fact has exactly one place it could have come from.
  const built = extractMessages("Does X cause Y?", ["Part one?", "Part two?"], "A title", "https://x.example/a", "Some page text.", 3)
    .map((m) => m.content)
    .join("\n");
  assert.match(built, /Here is ONE source/);
  // 🔴 And it sees the WHOLE brief. A page is read once and then skipped for the rest of the run,
  // so extracting it against only the sub-question that happened to find it throws away everything
  // else it knows. Measured: six good pages yielded five facts before this changed.
  assert.match(built, /Part one\?/);
  assert.match(built, /Part two\?/);
  assert.match(built, /bear on ANY of those parts/);
  assert.match(built, /if the text does not say it, you do not know it/i);
  assert.match(built, /empty list, which is a normal and useful answer/i);
});

test("🔴 the writer may cite only numbers, and must state its gaps", () => {
  const built = writeMessages("Q?", ["a", "b"], "1. fact one\n2. fact two").map((m) => m.content).join("\n");
  assert.match(built, /You may use nothing else/i, "the model was not fenced to the pool");
  assert.match(built, /A point with no support is not allowed/i);
  assert.match(built, /Never leave this empty/i, "gaps are optional, so they will be omitted");
});

test("🔴 the checker is asked about SUPPORT, not truth", () => {
  // The distinction is the honest limit of the whole feature: a page can assert something false and
  // a claim quoting it faithfully passes. What this catches is a sentence drifting from its
  // evidence while being written, which is where confident, well-cited, wrong reports come from.
  const built = checkMessages("A sentence.", "[1] title\npassage").map((m) => m.content).join("\n");
  assert.match(built, /Do not use your own knowledge of the subject/i);
  assert.match(built, /a true sentence the passages do not support is still a no/i);
});
