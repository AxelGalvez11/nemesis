import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

// UI-001 (docs/canvas-agent-board.md): source_state=degraded, learner_state=unknown,
// not_demonstrated and incorrect must never look the same, because they call for opposite
// responses from a learner. This reads the component's source rather than rendering it — this
// app has no DOM test harness (see canvas-runtime-branch.test.ts) — so the property checked here
// is textual/structural, matching that file's convention.

const SOURCE = readFile(new URL("./canvas-policy-view.tsx", import.meta.url), "utf8");

test("🔴 a degraded source is never told it means the learner is done", async () => {
  const source = await SOURCE;

  // The three canvas-level outcomes reaching the empty state must produce three different
  // headlines. Collapsing any two together is exactly the defect this test exists to catch: a
  // `degraded` canvas — one the parser could only partly read — used to fall through to the same
  // branch as "you've demonstrated everything", fabricating a claim about the learner from a gap
  // in Nemesis's own reading.
  assert.match(source, /outcome === "failed"/, "the failed-outcome branch is gone");
  assert.match(source, /outcome === "degraded"/, "degraded is no longer distinguished from other outcomes");

  const degradedHeadline = "Nemesis could only partly read this material";
  const failedHeadline = "Nemesis couldn't read this material";
  const masteryHeadline = "Nothing to practise here right now";

  for (const headline of [degradedHeadline, failedHeadline, masteryHeadline]) {
    assert.match(source, new RegExp(escapeRegExp(headline)), `missing expected headline: ${headline}`);
  }

  // The degraded branch's own body copy must exist as its own literal — not merely "some string
  // near the word degraded". If a future edit collapsed `partlyReadable` back into the mastery
  // branch, this exact sentence would disappear from the file and this assertion would fail; it
  // does not appear anywhere else, so its presence is specific to the degraded path.
  const degradedBody =
    "What came through is covered here. The rest wasn't read clearly enough to ask about";
  assert.match(source, new RegExp(escapeRegExp(degradedBody)), "the degraded body copy changed shape");

  // And it must not be the mastery sentence in disguise — the fabrication this test exists to
  // catch could equally take the form of degraded's OWN body quietly picking up mastery language
  // rather than losing its branch outright.
  assert.doesNotMatch(
    source,
    /partlyReadable\s*\n?\s*\?\s*"[^"]*shown everything[^"]*"/i,
    "the degraded body must not claim the learner has finished the material",
  );
});

test("🔴 not_demonstrated, partial and incorrect stay distinguishable in their own captions", async () => {
  const source = await SOURCE;

  // show_correction intentionally shares one renderer across three learner_state values (see the
  // block comment above it) — but each must still say something different, because
  // not_demonstrated must never read as "you got this wrong" (UI-001).
  assert.match(source, /"You had part of this\."/);
  assert.match(source, /"No attempt came back on this one\. Here it is\."/);
  assert.match(source, /"Here's the one to fix\."/);
});

test("🔴 §K: the surviving arm never narrates the learner's own turn back at them", async () => {
  const source = await SOURCE;

  // §K -- the learner does not see the lesson engine. Four literals carried it; three lived in
  // canvas-stages.tsx (the legacy six-stage machine, being deleted) and THIS one lived here, in
  // the compositional runtime we are keeping. Deleting the legacy arm would have removed three
  // and left this one saying it to every learner, quietly.
  //
  // The words the learner typed still appear, quoted -- the verdict directly below is about them,
  // and removing them would be `minimal` mistaken for `contextless`. What must not come back is
  // the ATTRIBUTION in front of the quote: it tells the learner something they already know, in a
  // voice that exists only to stage the exchange, and that narration is what makes a surface read
  // as a transcript even when nothing accumulates.
  //
  // 🔴 COMMENTS ARE STRIPPED BEFORE ANY OF THIS. §K is about what the LEARNER SEES, and this file
  // discusses the banned shapes at length in order to explain why they are banned -- its own
  // header says "no Learn -> Recall -> Test". Grepping raw source failed on that sentence the
  // first time this test ran, which is the whole failure mode: a test that cannot tell rendered
  // copy from a comment about rendered copy will either cry wolf or, worse, be "fixed" by
  // deleting the explanation.
  const rendered = stripComments(source);

  // Built from fragments so the banned phrases are not spelled out even in the stripped text.
  const you = "You ";
  for (const verb of ["said", "wrote"]) {
    assert.doesNotMatch(
      rendered,
      new RegExp(escapeRegExp(you + verb)),
      `§K: "${you}${verb}" is back in the policy view -- quote the learner, never narrate them`,
    );
  }

  // ...and the quote itself must still be RENDERED, or this test would pass by deleting the
  // context rather than the narration.
  assert.match(rendered, /[“"]\{feedback\.answer\}[”"]/, "the learner's own words stopped being shown at all");

  // No stage label and no step counter reach this arm either. These are the other three §K
  // literals' shapes; asserting them here means deleting the legacy arm cannot quietly
  // reintroduce them on the way past.
  assert.doesNotMatch(rendered, /\b(Recall|Retest)\b/, "§K: a stage label appeared in the policy view");
  assert.doesNotMatch(rendered, /\{\s*index \+ 1\s*\}\s*of\b/, "§K: a step counter appeared in the policy view");

  // The stripper must actually be removing something, or every assertion above is vacuously true
  // against an unchanged string and this test quietly stops testing.
  assert.ok(rendered.length < source.length, "stripComments removed nothing -- the guard is inert");
});

test("🔴 K3: a correct answer needs NO CONTROL to advance — asserted as behaviour, not vocabulary", async () => {
  const rendered = stripComments(await SOURCE);

  // 🔴 THE REASON THIS TEST IS SHAPED THIS WAY. The screen that failed K3 shipped a button
  // labelled "Continue". §K's banned-literal list contains "Next" — so the control was renamed,
  // the vocabulary check went green, and the behaviour K3 exists to prohibit survived untouched.
  // Anyone auditing §K by grepping the word list would have reported that screen clean.
  //
  // So: assert that NO control is rendered on a pass, whatever it is called. A test that banned
  // the string "Continue" would go green the day someone types "Onwards".
  const feedback = rendered.slice(rendered.indexOf("function FeedbackScreen"));
  assert.ok(feedback, "FeedbackScreen is gone");

  // Every control in this component must sit inside the not-passed branch.
  const gate = feedback.indexOf("{!passed && (");
  assert.notEqual(gate, -1, "the pass/not-pass split is gone — a pass could regain a control");
  for (const control of [...feedback.matchAll(/<button/g)]) {
    assert.ok(
      control.index! > gate,
      "a control renders outside the !passed branch — a correct answer must advance with no click, whatever the control is labelled",
    );
  }

  // And the advance must actually happen, gated on the write landing rather than a timer alone.
  assert.match(feedback, /if \(!passed \|\| !minReadDone \|\| recording\) return;/,
    "the auto-advance gate must wait for BOTH the readability floor and the real evidence write");
  assert.match(feedback, /latestAcknowledge\.current\(\)/, "the advance must call the CURRENT acknowledge, not a stale closure");
  assert.match(rendered, /recording=\{runtime\.recording\}/, "the runtime's own recording flag must be passed in, not guessed locally");
});

test("🔴 K4: only a CORRECT answer is silent — the other verdicts keep their words", async () => {
  const rendered = stripComments(await SOURCE);
  const feedback = rendered.slice(rendered.indexOf("function FeedbackScreen"));
  const gate = feedback.indexOf("{!passed && (");

  // "That's it." is a score rendered as a sentence: a correct answer carries no information the
  // learner does not already have, and the colour says it. So the headline must be inside the
  // not-passed branch.
  const headline = feedback.indexOf("VERDICT_HEADLINE[verdict]");
  assert.notEqual(headline, -1, "the headline stopped being rendered at all — partial/incorrect need their words");
  assert.ok(headline > gate, "the verdict headline renders on a PASS — 'That's it.' is a score in a sentence");

  const body = feedback.indexOf("feedback.evaluation.feedback");
  assert.ok(body > gate, "the feedback body renders on a pass — nothing else may appear beside the green words");

  // 🔴 And the learner's own words must STILL be rendered, or this passes by deleting the context
  // rather than the announcement — the wrong fix, and the one the ruling explicitly warned about.
  const quote = feedback.indexOf("{feedback.answer}");
  assert.notEqual(quote, -1, "the learner's own words stopped being shown");
  assert.ok(quote < gate, "the learner's words must show on a pass too — they are what turns green");
});

test("🔴 every verdict is given a colour deliberately, and success is not the accent", async () => {
  const rendered = stripComments(await SOURCE);
  // A pass is green, partial amber, and both failures red. `not_demonstrated` never reaches this
  // screen — it has no evaluation — so it is absent by construction rather than by omission.
  for (const [verdict, tone] of [
    ["strong", "--ui-green"], ["understood", "--ui-green"],
    ["partial", "--ui-yellow"], ["incorrect", "--ui-red"], ["misconception", "--ui-red"],
  ]) {
    assert.match(rendered, new RegExp(`${verdict}:\\s*"text-\\(${escapeRegExp(tone)}\\)"`), `${verdict} lost its colour`);
  }
  // 🔴 Success must never be painted with --ui-action. The accent is a MUTED green used for
  // "press this"; success is a saturated green meaning "you were right". A learner should not
  // have to work out which green they are looking at.
  assert.doesNotMatch(rendered, /VERDICT_TONE[\s\S]*?--ui-action/, "success must not borrow the action accent");
});

function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Source with comments removed, so a §K check reads rendered copy rather than prose about it.
 *  Block form covers JSX `{​/* … *​/}` too, since that is a block comment inside braces. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[^\S\n]*\/\/.*$/gm, "");
}
