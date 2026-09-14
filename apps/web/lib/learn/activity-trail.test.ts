import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MAX_ACTIVITY_STEPS,
  activitySummary,
  readActivity,
  readPlan,
  serializeActivity,
  settleSteps,
  stepLabel,
  trailHasSteps,
  upsertStep,
  type ActivityStep,
} from "./activity-trail";

// The trail: what a turn did, kept with the turn. Owner, 2026-09-04, of ChatGPT's desktop app:
// *"it shows like it's running commands, it's searching web, with like an icon or favicon. So can
// we have that for Nemesis too, rather than just having like a thinking preview."*

describe("activity trail: steps", () => {
  it("a search is one step reporting twice, never two rows", () => {
    let steps: ActivityStep[] = [];
    steps = upsertStep(steps, { count: null, done: false, id: "search-1", kind: "search", query: "orphan drug designation", sites: [] });
    steps = upsertStep(steps, { count: 4, done: true, id: "search-1", kind: "search", query: "orphan drug designation", sites: ["fda.gov", "nih.gov"] });
    assert.equal(steps.length, 1);
    assert.equal(stepLabel(steps[0]!), "Searched the web for orphan drug designation");
    assert.deepEqual((steps[0] as unknown as { sites: string[] }).sites, ["fda.gov", "nih.gov"]);
  });

  it("stops at the cap rather than growing without bound", () => {
    let steps: ActivityStep[] = [];
    for (let index = 0; index < MAX_ACTIVITY_STEPS + 5; index += 1) {
      steps = upsertStep(steps, { done: true, id: `w${index}`, kind: "work", label: `Lookup ${index}` });
    }
    assert.equal(steps.length, MAX_ACTIVITY_STEPS);
  });

  it("a running step reads as running, and settles when the turn ends", () => {
    const running: ActivityStep = { count: null, done: false, id: "s", kind: "search", query: "rsv vaccine adults", sites: [] };
    assert.equal(stepLabel(running), "Searching the web for rsv vaccine adults");
    const [settled] = settleSteps([running]);
    assert.equal((settled as { done: boolean }).done, true);
    assert.equal(stepLabel(settled!), "Searched the web for rsv vaccine adults");
  });

  it("names the files it read, and counts the rest", () => {
    assert.equal(stepLabel({ count: 1, id: "r", kind: "read", titles: ["Lecture 9.pdf"] }), "Read Lecture 9.pdf");
    assert.equal(stepLabel({ count: 5, id: "r", kind: "read", titles: ["A.pdf", "B.docx"] }), "Read A.pdf, B.docx and 3 more");
    assert.equal(stepLabel({ count: 3, id: "r", kind: "read", titles: [] }), "Read 3 files");
  });
});

describe("activity trail: the collapsed line", () => {
  it("reads in ChatGPT's grammar, by kind, in a fixed order", () => {
    const steps: ActivityStep[] = [
      { count: 2, id: "r", kind: "read", titles: ["A", "B"] },
      { count: 3, done: true, id: "s1", kind: "search", query: "q", sites: [] },
      { count: 1, done: true, id: "s2", kind: "search", query: "q2", sites: [] },
      { app: "Google Calendar", done: true, id: "a", kind: "app", label: "Listed this week's events" },
      { done: true, id: "w", kind: "work", label: "Looked up metformin" },
      { count: 7, done: true, id: "p", kind: "papers" },
    ];
    assert.equal(activitySummary(steps), "Used Google Calendar, read 2 files, looked things up, searched the web, checked the literature");
  });

  it("two searches are one 'searched the web'; two apps are named; three are counted", () => {
    assert.equal(activitySummary([
      { count: 1, done: true, id: "s1", kind: "search", query: "q", sites: [] },
      { count: 1, done: true, id: "s2", kind: "search", query: "q", sites: [] },
    ]), "Searched the web");
    assert.equal(activitySummary([
      { app: "Gmail", done: true, id: "a", kind: "app", label: "x" },
      { app: "Notion", done: true, id: "b", kind: "app", label: "y" },
    ]), "Used Gmail and Notion");
    assert.equal(activitySummary([
      { app: "Gmail", done: true, id: "a", kind: "app", label: "x" },
      { app: "Notion", done: true, id: "b", kind: "app", label: "y" },
      { app: "Slack", done: true, id: "c", kind: "app", label: "z" },
    ]), "Used 3 apps");
    assert.equal(activitySummary([]), "");
  });
});

describe("activity trail: the plan", () => {
  it("keeps a plain plan and refuses the shapes a milestone refuses", () => {
    assert.equal(readPlan("I'll read your worksheet and lay out what each question asks.", { searching: false, tools: false }), "I'll read your worksheet and lay out what each question asks.");
    assert.equal(readPlan("Step 1: read the file", { searching: false, tools: false }), null);
    assert.equal(readPlan("This is 40% done", { searching: false, tools: false }), null);
    assert.equal(readPlan("I'll parse the JSON payload", { searching: false, tools: false }), null);
  });

  it("refuses a plan that claims a search on a turn that bought none", () => {
    assert.equal(readPlan("I'll search the web for the latest guidance.", { searching: false, tools: false }), null);
    assert.equal(readPlan("I'll search the web for the latest guidance.", { searching: true, tools: false }), "I'll search the web for the latest guidance.");
  });

  it("refuses a plan longer than two sentences' worth", () => {
    assert.equal(readPlan("x".repeat(400), { searching: false, tools: false }), null);
  });
});

describe("activity trail: stored with the turn", () => {
  it("round-trips through the moment, settled and capped, and nothing when there were no steps", () => {
    const stored = serializeActivity({
      plan: "I'll read the worksheet first.",
      seconds: 11.26,
      steps: [
        { count: 1, id: "r", kind: "read", titles: ["3. Regulatory Affairs Worksheet.docx"] },
        { count: null, done: false, id: "s", kind: "search", query: "q", sites: ["a.org", "b.org", "c.org", "d.org", "e.org", "f.org", "g.org"] },
      ],
    });
    assert.ok(stored);
    assert.equal(stored?.seconds, 11.3);
    assert.equal((stored?.steps[1] as { done: boolean }).done, true, "a step still running was stored as running");
    assert.equal((stored?.steps[1] as unknown as { sites: string[] }).sites.length, 6, "more favicons than the cap were kept");
    const back = readActivity(stored);
    assert.ok(trailHasSteps(back));
    assert.equal(back?.plan, "I'll read the worksheet first.");
    assert.equal(back?.steps.length, 2);
    assert.equal(serializeActivity({ plan: "only a plan", seconds: 2, steps: [] }), null, "a plan with no steps is not a trail");
  });

  it("reads a stored trail defensively", () => {
    assert.equal(readActivity(null), null);
    assert.equal(readActivity("x"), null);
    assert.equal(readActivity({ steps: [] }), null);
    const back = readActivity({ plan: 7, seconds: "no", steps: [null, { kind: "search" }, { kind: "read", count: 2 }, { kind: "app", app: "Gmail" }, { kind: "work", label: "Looked up x" }, { kind: "nope" }] });
    assert.ok(back);
    assert.equal(back?.plan, null);
    assert.equal(back?.seconds, 0);
    assert.deepEqual(back?.steps.map((step) => step.kind), ["read", "work"], "a step missing its text was let through, or a kind nobody knows was");
  });
});
