import assert from "node:assert/strict";
import test from "node:test";

import { reportMarkdown, reportTitle } from "./report-markdown";
import type { ResearchReport } from "./research-model";

const REPORT: ResearchReport = {
  gaps: ["Nobody has measured the second case since 2019."],
  question: "When does an activity fall outside the commerce power?",
  sections: [
    {
      heading: "The three categories",
      points: [
        { support: [0], text: "Congress may regulate the channels of interstate commerce." },
        { support: [0, 2], text: "It may also regulate activities with a substantial effect on it." },
      ],
    },
    { heading: "Where the line was drawn", points: [{ support: [1], text: "Lopez struck down a possession statute." }] },
  ],
  sources: [
    { rank: "primary", title: "United States v. Lopez", url: "https://www.law.cornell.edu/supremecourt/text/514/549" },
    { rank: "reference", title: "Commerce Clause", url: "https://en.wikipedia.org/wiki/Commerce_Clause" },
    { rank: "ordinary", title: "A law blog", url: "https://blog.example/commerce" },
  ],
  stats: { dropped: 4, found: 12, kept: 3, searched: 9 },
  subQuestions: ["What are the categories?", "What did Lopez decide?", "What did Morrison add?"],
  summary: "It falls outside when the activity is not economic and the link to interstate commerce is a chain of inferences.",
};

test("the markers a reader sees match the numbers in the source list", () => {
  const md = reportMarkdown(REPORT);
  assert.match(md, /channels of interstate commerce\. \[1\]/, "single citation");
  assert.match(md, /substantial effect on it\. \[1\]\[3\]/, "a sentence resting on two sources");
  assert.match(md, /1\. \[United States v\. Lopez\]\(https:\/\/www\.law\.cornell\.edu/);
  assert.match(md, /3\. \[A law blog\]\(https:\/\/blog\.example/);
});

test("🔴 a citation index past the end of the source list is not printed", () => {
  // Belt and braces behind research-parse: a marker pointing at a source that is not in the list
  // below it is worse than no marker, because it looks checkable and is not.
  const broken: ResearchReport = {
    ...REPORT,
    sections: [{ heading: "H", points: [{ support: [0, 99], text: "A point." }] }],
  };
  const md = reportMarkdown(broken);
  assert.match(md, /A point\. \[1\]$/m);
  assert.ok(!md.includes("[100]"), "an out-of-range marker was rendered");
});

test("🔴 the footer says how much of the draft failed its own check", () => {
  // A research tool that hides its drop rate has turned the check into decoration.
  const md = reportMarkdown(REPORT);
  assert.match(md, /9 searches, 12 facts/);
  assert.match(md, /Of 7 sentences drafted, 3 were confirmed/, "kept + dropped must be the draft total");
  assert.match(md, /4 were removed for saying more than those sources did/);
});

test("the footer counts in English, not in \"(s)\"", () => {
  // The learner reads this line, and sometimes so does whoever they hand the report to. "1 were
  // removed" undercuts every careful sentence above it.
  const one = reportMarkdown({ ...REPORT, stats: { dropped: 1, found: 3, kept: 1, searched: 2 } });
  assert.match(one, /1 was confirmed against the cited sources and 1 was removed/);
});

test("🔴 the report states the limit of its own checking", () => {
  // "Every claim is verified" would be a bigger promise than the machinery makes. What was checked
  // is that the retrieved passage supports the sentence, which is not the page being correct and
  // not the whole page having been read.
  const md = reportMarkdown(REPORT);
  assert.match(md, /confirms the source says it, not that the source is correct/i);
  assert.match(md, /extract rather than the whole page/i);
});

test("gaps are given their own section, and rank is shown in words", () => {
  const md = reportMarkdown(REPORT);
  assert.match(md, /## What this does not settle/);
  assert.match(md, /- Nobody has measured the second case since 2019\./);
  assert.match(md, /_\(primary\)_/);
  assert.match(md, /_\(reference\)_/);
  assert.ok(!md.includes("_(ordinary)_"), "an ordinary source does not need a label");
});

test("🔴 the report contains no em dash", () => {
  // The owner's rule holds wherever Nemesis appears to be speaking, and a saved report is the most
  // durable thing it writes: it goes into an essay, a slide deck, and somebody's revision notes.
  assert.ok(!reportMarkdown(REPORT).includes("—"), "an em dash reached a saved report");
});

test("a question becomes a filename without becoming a stub", () => {
  assert.equal(reportTitle("When does an activity fall outside the commerce power?"), "When does an activity fall outside the commerce power");
  // A short leading clause is not a useful name on its own, so the whole question is kept.
  assert.equal(reportTitle("Why, exactly, does the second law hold?"), "Why, exactly, does the second law hold");
  assert.equal(reportTitle("   "), "Research");
  assert.ok(reportTitle("x".repeat(400)).length <= 110);
});
