import assert from "node:assert/strict";
import test from "node:test";

import { reportMarkdown } from "./report-markdown";
import type { ResearchIO } from "./run-research";
import { runResearch } from "./run-research";

// The whole pipeline, end to end, with the network replaced. What is worth testing here lives
// BETWEEN the calls: whether a dead search costs the run or only its query, whether a sentence that
// fails its own check is genuinely removed, and whether a fact index survives being remapped into a
// citation number. None of that is visible from a single unit.

/** A stub whose behaviour is driven by which prompt it was handed. */
function stubIO(over: Partial<{
  plan: string;
  queries: string;
  facts: (url: string) => string;
  report: string;
  verdict: (point: string) => string;
  search: ResearchIO["search"];
}> = {}): ResearchIO & { calls: { search: string[]; complete: number } } {
  const calls = { complete: 0, search: [] as string[] };
  return {
    calls,
    complete: async (messages) => {
      calls.complete += 1;
      const text = messages.map((m) => m.content).join("\n");
      if (text.includes("Break this question into")) return over.plan ?? '{"subQuestions":["Part one?","Part two?","Part three?"]}';
      if (text.includes("web search queries")) return over.queries ?? '{"queries":["query a","query b"]}';
      if (text.includes("Here is ONE source")) {
        const url = /URL: (\S+)/.exec(text)?.[1] ?? "";
        return over.facts ? over.facts(url) : `{"facts":["A fact from ${url}"],"followUps":[]}`;
      }
      if (text.includes("Write the report answering")) {
        return over.report ?? '{"summary":"The summary.","sections":[{"heading":"Findings","points":[{"text":"Point one.","support":[1]}]}],"gaps":["A gap."]}';
      }
      if (text.includes("Does the sentence say only")) {
        const point = /SENTENCE: (.*)/.exec(text)?.[1] ?? "";
        return over.verdict ? over.verdict(point) : '{"supported":true,"why":"yes"}';
      }
      return "";
    },
    search: over.search ?? (async (query) => {
      calls.search.push(query);
      return [
        { description: "x".repeat(200), title: "Cornell LII", url: "https://www.law.cornell.edu/a" },
        { description: "y".repeat(200), title: "A blog", url: "https://blog.example/b" },
      ];
    }),
  };
}

const ok = <T,>(v: T | { error: string }): T => {
  assert.ok(!(v && typeof v === "object" && "error" in v), `run failed: ${(v as { error?: string })?.error}`);
  return v as T;
};

test("a question becomes a cited report", async () => {
  const io = stubIO();
  const report = ok(await runResearch("u1", "When does an activity fall outside the commerce power?", { io }));
  assert.equal(report.subQuestions.length, 3);
  assert.equal(report.summary, "The summary.");
  assert.ok(report.sections.length >= 1);
  assert.ok(report.sources.length >= 1, "a report with no sources is not a report");
  assert.deepEqual(report.gaps, ["A gap."]);
  assert.equal(report.stats.kept, 1);
  assert.equal(report.stats.dropped, 0);
});

test("🔴 a sentence that fails its own check is REMOVED from the report", async () => {
  // The check is the whole difference between this and a chat answer with links stapled on. If a
  // failing verdict left the sentence in place, the feature would be a lie with extra steps.
  const io = stubIO({
    report: JSON.stringify({
      gaps: ["g"],
      sections: [
        { heading: "Findings", points: [{ support: [1], text: "Supported point." }, { support: [1], text: "Overreaching point." }] },
      ],
      summary: "S",
    }),
    verdict: (point) => (point.startsWith("Overreaching") ? '{"supported":false,"why":"goes past the passage"}' : '{"supported":true}'),
  });
  const report = ok(await runResearch("u1", "A long enough question to research", { io }));
  const texts = report.sections.flatMap((s) => s.points.map((p) => p.text));
  assert.deepEqual(texts, ["Supported point."], "an unsupported sentence survived");
  assert.equal(report.stats.dropped, 1, "the drop was not counted");
  assert.equal(report.stats.kept, 1);
  // And the count reaches the reader.
  assert.match(reportMarkdown(report), /1 was removed for saying more than those sources did/);
});

test("🔴 a report where nothing survives the check is not saved at all", async () => {
  const io = stubIO({ verdict: () => '{"supported":false,"why":"no"}' });
  const outcome = await runResearch("u1", "A long enough question to research", { io });
  assert.ok("error" in outcome, "an entirely unsupported report was returned as a report");
  assert.match(outcome.error, /did not save/i);
});

test("🔴 one dead search costs its query, never the run", async () => {
  // Five sub-questions, and the first search throws. A run that gave up here would turn one flaky
  // network call into a wasted five minutes.
  let first = true;
  const io = stubIO({
    search: async (query) => {
      if (first) {
        first = false;
        throw new Error("network");
      }
      return [{ description: "z".repeat(200), title: "T", url: `https://example.edu/${encodeURIComponent(query)}` }];
    },
  });
  const report = ok(await runResearch("u1", "A long enough question to research", { io }));
  assert.ok(report.sources.length >= 1, "the run died with the first failed search");
});

test("🔴 two facts from one page collapse to ONE citation number", async () => {
  // The markers and the reference list have to agree. If the same page were numbered twice, a
  // reader following [2] would land on a source the report never distinguished from [1].
  const io = stubIO({
    facts: (url) => JSON.stringify({ facts: [`first from ${url}`, `second from ${url}`], followUps: [] }),
    report: JSON.stringify({
      gaps: ["g"],
      sections: [{ heading: "H", points: [{ support: [1, 2], text: "Rests on two facts from one page." }] }],
      summary: "S",
    }),
    search: async () => [{ description: "q".repeat(200), title: "One page", url: "https://one.example/page" }],
  });
  const report = ok(await runResearch("u1", "A long enough question to research", { io }));
  assert.equal(report.sources.length, 1, "one page was listed twice");
  assert.deepEqual(report.sections[0]?.points[0]?.support, [0], "two facts from one page kept two numbers");
  assert.match(reportMarkdown(report), /one page\. \[1\]$/im);
});

test("only sources a surviving sentence actually cites are listed", async () => {
  // A reference list padded with pages nothing used overstates the work and makes the real
  // citations harder to trust.
  const io = stubIO({
    report: JSON.stringify({
      gaps: ["g"],
      sections: [{ heading: "H", points: [{ support: [1], text: "Only cites fact one." }] }],
      summary: "S",
    }),
    search: async () => [
      { description: "a".repeat(200), title: "Used", url: "https://used.example/a" },
      { description: "b".repeat(200), title: "Unused", url: "https://unused.example/b" },
    ],
  });
  const report = ok(await runResearch("u1", "A long enough question to research", { io }));
  assert.deepEqual(report.sources.map((s) => s.url), ["https://used.example/a"]);
});

test("a source with no usable passage is skipped rather than cited empty", async () => {
  // Nothing to check a claim against means nothing to cite. A one-line SERP snippet is not evidence.
  const io = stubIO({ search: async () => [{ description: "too short", title: "T", url: "https://x.example/a" }] });
  const outcome = await runResearch("u1", "A long enough question to research", { io });
  assert.ok("error" in outcome);
  assert.match(outcome.error, /nothing usable/i);
});

test("🔴 an aggregator is never cited, whatever the search returns", async () => {
  const io = stubIO({ search: async () => [{ description: "c".repeat(200), title: "Chegg", url: "https://www.chegg.com/q/1" }] });
  const outcome = await runResearch("u1", "A long enough question to research", { io });
  assert.ok("error" in outcome, "a homework aggregator became a source");
});

test("a plan the model could not produce ends the run before it spends anything", async () => {
  const io = stubIO({ plan: '{"subQuestions":["only one?"]}' });
  const outcome = await runResearch("u1", "A long enough question to research", { io });
  assert.ok("error" in outcome);
  assert.equal(io.calls.search.length, 0, "🔴 it searched anyway, with no plan to search against");
});

test("progress steps only ever name work that is actually running", async () => {
  // The rule the canvas's thinking captions live under: a step is emitted BY the step, never by a
  // timer walking through plausible-sounding stages.
  const seen: string[] = [];
  const io = stubIO();
  await runResearch("u1", "A long enough question to research", { io, onStep: (step) => seen.push(step.kind) });
  assert.equal(seen[0], "planning", "planning was not the first thing reported");
  assert.ok(seen.includes("searching") && seen.includes("reading"));
  assert.ok(seen.indexOf("writing") < seen.indexOf("checking"), "it claimed to be checking before it had written");
  assert.equal(seen[seen.length - 1], "checking", "the run stopped reporting before it finished");
});

test("a question too short to research is refused without spending a call", async () => {
  const io = stubIO();
  const outcome = await runResearch("u1", "why", { io });
  assert.ok("error" in outcome);
  assert.equal(io.calls.complete, 0, "it called the model about a three-letter question");
});
