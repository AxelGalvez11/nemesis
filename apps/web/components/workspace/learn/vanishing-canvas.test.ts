import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { continueOwner, type CanvasRegion } from "@/lib/learn/canvas-continue";

// 🔴🔴🔴 THE CANVAS IS NOT A CHAT LOG (owner, 2026-08-19).
//
// > "The Canvas should not display a growing chat history. Instead: user input → DeepSeek
// > interprets it → Canvas changes. The user should not create a permanent chat bubble every time
// > they answer or ask something… The visible Canvas should show only what matters now."
//
// The transcript did not go anywhere — it is still stored, still sent to the model, still readable
// in the transcript view. What changed is that it stopped DECIDING WHAT IS ON SCREEN.
//
// These are wiring and structure guards, in this file's neighbours' convention: they read source
// rather than a DOM, because this app has no DOM harness (see canvas-runtime-branch.test.ts). What
// they can prove is that the pieces are connected the way the rule requires. Whether the model
// labels a given sentence `micro` or `reading` is a claim about a model and is measured against the
// real one, not asserted here.

const read = (file: string) => readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
const CANVAS = read("learning-canvas.tsx");
const REPLY = read("canvas-reply.tsx");
const POLICY = read("canvas-policy-view.tsx");
const KEYS = read("canvas-keys.tsx");

/** Source with comments removed, so a "what is rendered" check reads rendered copy rather than
 *  prose about it — the convention canvas-policy-view.test.ts records, after an earlier guard
 *  failed on its own file's header and got "fixed" by deleting the explanation. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[^\S\n]*\/\/.*$/gm, "");
}

// ── Nothing the learner says becomes visual content ──────────────────────────────────────────

test("🔴🔴 no surface on the Canvas prints the learner's own words back at them", () => {
  // The owner's worked example: Nemesis asks where SGLT2 inhibitors act, the learner answers
  // "Pancreas", and the Canvas must NOT show `You: Pancreas`. It becomes "Not the pancreas →
  // kidney" and the reason why.
  //
  // 🔴 THE CHECK IS ON EVERY SURFACE, NOT ON THE ONE THAT USED TO DO IT. Deleting the bubble from
  // the verdict screen while the reply component grew a `question` prop would satisfy a narrower
  // guard and put the transcript straight back, one file over.
  for (const [name, source] of [["policy view", POLICY], ["reply", REPLY], ["canvas", CANVAS]] as const) {
    assert.doesNotMatch(
      code(source),
      /<LearnerUtterance|learner-utterance/,
      `${name} renders the learner's own utterance — user input is not automatically visual content`,
    );
  }
});

test("🔴 the reply component cannot even RECEIVE the learner's question", () => {
  // Stronger than "it does not render it": a prop is all it takes for an echo to come back, and the
  // session still carries `question` on the aside for other reasons. What must not exist is a way
  // for it to reach a component whose job is to paint.
  const props = REPLY.slice(REPLY.indexOf("export interface CanvasReplyProps"), REPLY.indexOf("export function CanvasReply"));
  assert.ok(props.length > 0, "the reply's props interface has been renamed — this guard is inert");
  assert.equal(/^\s*question\??:/m.test(props), false, "the reply accepts the learner's question");
  assert.equal(/^\s*answer\??:/m.test(props), false, "the reply accepts the learner's answer");
});

// ── The transcript is kept; it just does not drive the screen ────────────────────────────────

test("🔴 the conversation is still remembered and still sent to the model", () => {
  // The half of the rule that is easy to break while satisfying the other half. "Do not display a
  // growing chat history" is not "do not keep one": the model still needs it to resolve "why?" and
  // "no, I meant the first one", and the transcript view still reads the evidence log.
  assert.match(CANVAS, /conversation = useRef<TurnExchange\[\]>/, "the hidden transcript is gone");
  assert.match(CANVAS, /history: conversation\.current/, "the conversation stopped riding the packet");
  assert.match(CANVAS, /buildTranscript\(/, "the transcript view lost its source");
});

// ── One moment dominates; the previous one recedes rather than scrolling away ────────────────

test("🔴🔴 a reply RECEDES the lesson instead of being appended below it", () => {
  // > "Keep the passage visible momentarily so the learner does not lose what they were referring
  // > to. Subtly recede/fade it. Replace it with the clarification."
  //
  // The three things that make that true, each of which alone is not enough: the lesson stays
  // mounted, it dims, and the reply paints OUTSIDE the dimmed region so it is not dimmed with it.
  assert.match(
    CANVAS,
    /reply && "canvas-receded"/,
    "the lesson no longer recedes behind a reply — either it is being unmounted, or the two are stacking",
  );
  const scroller = CANVAS.indexOf('overflow-y-auto pt-[64px]');
  const mount = CANVAS.indexOf("<CanvasReply");
  assert.ok(scroller !== -1 && mount > scroller, "the reply is rendered inside the scroller it is supposed to be dimming");
  assert.match(code(REPLY), /absolute inset-0/, "the reply stopped being a layer over the canvas");
});

test("🔴 the recede is opacity only, and reduced motion keeps the state while dropping the movement", () => {
  // §46.1 bans slides, scale and bounce; the wider rule is that a learner crossing this boundary
  // fifty times in a drill must not be shown fifty animations. And someone who asked the system to
  // stop moving still has to be able to tell which of two things on screen is the live one, so the
  // dimming survives `prefers-reduced-motion` even though the transition does not.
  const css = readFileSync(new URL("../../../app/globals.css", import.meta.url), "utf8");
  const rule = /\.canvas-receded \{([^}]*)\}/.exec(css)?.[1];
  assert.ok(rule, "the recede treatment is gone");
  assert.equal(
    /transform|scale|translate|rotate|filter|blur/.test(rule),
    false,
    `the recede animates geometry or blurs text that is meant to stay readable: ${rule}`,
  );
  // 🔴 THE REDUCED-MOTION BLOCK IS EXTRACTED AND CHECKED ON ITS OWN. `globals.css` holds six
  // `prefers-reduced-motion` queries, so a regex spanning from "reduce)" to a rule name can match
  // across an unrelated block and answer about the wrong one.
  const reduced = css.slice(css.lastIndexOf("@media (prefers-reduced-motion: reduce) {"));
  const override = /\.canvas-receded \{([^}]*)\}/.exec(reduced)?.[1];
  assert.ok(override, "the recede is not addressed under reduced motion, so it keeps animating");
  assert.match(override, /transition:\s*none/, "the transition survives reduced motion");
  assert.equal(
    /opacity/.test(override),
    false,
    "reduced motion is removing the dimming as well as the transition, which leaves a reply and the lesson at equal weight",
  );
});

test("🔴 each reply is a NEW screen — keyed, so its window cannot be inherited from the last one", () => {
  // `useScreenExit`'s timer resets on mount rather than on a prop change. Two consecutive replies
  // that compute the same duration — which "Exactly." and "Correct." always will — would have the
  // second dismissed on its first frame. Same device `CanvasPolicyView` uses via `screenKey`.
  assert.match(CANVAS, /key=\{reply\.text\}/, "the reply is unkeyed, so a second one inherits the first one's spent timer");
});

// ── Continue means something specific, and there is only ever one ────────────────────────────

test("🔴🔴 a trivial reply carries NO control at all — not a disabled one, and not a Dismiss link", () => {
  // > "Do not use Continue for: Correct. Exactly. Almost. Hello. Got it. … I do not want Nemesis to
  // > become: Correct / Continue."
  //
  // What this replaces was a "Dismiss" link on every reply including "Hey." — housekeeping the
  // learner had to do for the software, on a two-word answer that should never have needed a press.
  assert.doesNotMatch(code(REPLY), /Dismiss/, "the reply prints a dismiss control again");
  assert.doesNotMatch(code(CANVAS), />\s*Dismiss\s*</, "the canvas prints a dismiss control for the reply again");
  // The only control it can print is the shared one, and only when it has been handed a handler.
  assert.notEqual(
    code(REPLY).indexOf("{onContinue && ("),
    -1,
    "the reply's Continue is no longer behind the owner's decision",
  );
});

test("🔴 exactly one region owns Continue, and a reply outranks what it interrupted", () => {
  const passage: CanvasRegion = { id: "document", placement: "document", requiresReading: true };
  const correction: CanvasRegion = { id: "policy", placement: "policy", requiresReading: true };
  const reply: CanvasRegion = { id: "reply", placement: "reply", requiresReading: true };
  const open = { awaitingDemonstration: false, busy: false };

  // The learner interrupted a correction to ask something. Both want reading. The button belongs to
  // the thing they interrupted FOR — offering it to the correction would be a way past a screen
  // they are not currently looking at.
  assert.equal(continueOwner([passage, correction, reply], open)?.placement, "reply");
  assert.equal(continueOwner([passage, correction], open)?.placement, "policy");
  assert.equal(continueOwner([passage], open)?.placement, "document");
  // A region that is not asking for reading never wins, whatever its rank.
  assert.equal(continueOwner([{ ...reply, requiresReading: false }, correction], open)?.placement, "policy");
});

test("🔴🔴 N3 still holds: a demonstration owed still refuses a way past the QUESTION", () => {
  // The production guard. A control that advances the cognitive task while an answer is owed is the
  // difference between producing an answer and skipping one.
  const owed = { awaitingDemonstration: true, busy: false };
  assert.equal(continueOwner([{ id: "policy", placement: "policy", requiresReading: true }], owed), null);
  assert.equal(continueOwner([{ id: "document", placement: "document", requiresReading: true }], owed), null);
});

test("🔴🔴 …and a reply is exempt, because its button puts away an ANSWER, not a question", () => {
  // The owner's worked example, which is a dead end without this exemption: Nemesis asks "why can
  // ACE inhibitors cause cough?", the learner asks back "what does ACE normally do?", the model
  // answers with something substantial. `reading` means no timer, by design. With the production
  // gate applied it would also mean no button — a paragraph on screen with no way to put it away,
  // while the question underneath is still unanswered and still the only thing the composer can
  // answer.
  const owed = { awaitingDemonstration: true, busy: false };
  const reply: CanvasRegion = { id: "reply", placement: "reply", requiresReading: true };
  assert.equal(continueOwner([reply], owed)?.placement, "reply");
  // 🔴 AND IT CANNOT BECOME A ROUTE PAST THE QUESTION, because the handler is a different one. The
  // reply's Continue dismisses the aside; it never reaches `policy.acknowledge`.
  assert.match(
    CANVAS,
    /continueBelongsTo\(continueRegion, "reply"\)\s*\?\s*\(\) => applyExplanationEvent\(\{ kind: "dismiss_aside" \}\)/,
    "the reply's Continue is wired to something other than dismissing the reply",
  );
  // Work in flight still refuses every region, reply included: pressing on now would race it.
  assert.equal(continueOwner([reply], { awaitingDemonstration: false, busy: true }), null);
});

// ── The composer never goes away ─────────────────────────────────────────────────────────────

test("🔴 the composer is not suppressed by a reply, a passage or a question", () => {
  // > "The composer stays at the bottom during every state… Do not hide the composer during
  // > teaching passages."
  //
  // The one condition it is allowed to depend on is whether the canvas is finished. A reply, a
  // policy screen or a document must not appear in that expression.
  const gate = /const showComposer = (.*);/.exec(CANVAS)?.[1] ?? "";
  assert.ok(gate, "showComposer has been restructured — this guard no longer measures anything");
  assert.equal(/reply|aside|presence|thinking/.test(gate), false, `the composer is being hidden by state: ${gate}`);
});

// ── The keyboard supplements the controls; it never reaches past them ────────────────────────

test("🔴🔴 Space is not swallowed while the learner is typing", () => {
  // The single biggest risk in the shortcut layer. A global handler that eats Space breaks typing —
  // the most common thing anyone does here — and it reads as the app being broken, not as a
  // shortcut misfiring. The guard is on the DOM question ("does this element take text") rather
  // than on any one component being focused, because the second kind goes stale the day another
  // input is added.
  assert.match(KEYS, /isContentEditable/, "the typing guard stopped covering contenteditable");
  assert.match(KEYS, /"INPUT" \|\| tag === "TEXTAREA"/, "the typing guard stopped covering text fields");
  const down = KEYS.slice(KEYS.indexOf("const onKeyDown"), KEYS.indexOf("const onKeyUp"));
  const guard = down.indexOf("typingInto(event.target)");
  const prevent = down.indexOf("event.preventDefault();\n      holding = true;");
  assert.ok(guard !== -1 && prevent !== -1 && guard < prevent, "Space is prevented before the typing guard runs");
  assert.match(down, /event\.repeat \|\| holding/, "a held key floods the recogniser at the OS repeat rate");
});

test("🔴 ⌘Enter calls the SAME handler as the button, so the two cannot disagree about availability", () => {
  // "⌘ Enter → Continue/advance when Continue is available" — the same availability the button has,
  // not a second opinion about it. Two handlers means the day someone adds a condition to the
  // button is the day the chord starts advancing screens that show no way forward.
  assert.match(KEYS, /event\.key === "Enter" && \(event\.metaKey \|\| event\.ctrlKey\)/);
  assert.match(KEYS, /if \(!handlers\.onContinue\) return;/, "the chord advances even where no Continue is offered");
  assert.match(CANVAS, /onContinue=\{advance\}/, "the chord is wired to a handler the button does not share");
  assert.match(CANVAS, /onContinue=\{continueBelongsTo\(continueRegion, "policy"\) \? advance : null\}/);
});

test("🔴🔴 the merged dictation channel is keyed on the NONCE, never on the object carrying it", () => {
  // A live defect, found by re-reading the diff rather than by running it. `useCanvasVoice` builds
  // its signal object fresh on every render once it has asked once, so an effect depending on the
  // object re-runs every render, asks for the microphone, sets state, and re-renders — forever.
  // The nonce is the identity of the REQUEST; the object is merely how it is carried.
  assert.match(CANVAS, /voice\.dictationSignal\?\.nonce/, "the voice signal is being read as a whole object again");
  const effect = CANVAS.slice(CANVAS.indexOf("const voiceNonce"), CANVAS.indexOf("const selected"));
  assert.match(effect, /\}, \[askDictation, voiceNonce\]\);/, "the effect depends on something other than the nonce");
});

test("🔴 releasing Space keeps what was heard, and losing the window does not leave a microphone open", () => {
  // Recording somebody's room because they alt-tabbed with the key held is the one failure here that
  // is worse than the shortcut simply not working: a keydown is delivered and the keyup never is.
  assert.match(KEYS, /window\.addEventListener\("keyup"/);
  assert.match(KEYS, /window\.addEventListener\("blur"/);
  const blur = KEYS.slice(KEYS.indexOf("const onBlur"));
  assert.match(blur, /onAcceptDictation\(\)/, "a lost keyup leaves the microphone running");
});

test("🔴 Escape never acknowledges a policy screen", () => {
  // Escape means "put this away". Letting it also mean "I have read this correction" would advance
  // past material the learner has not read — §34 invariant 5 — through the one key people press
  // reflexively.
  const at = CANVAS.indexOf("onEscape={() => {");
  assert.notEqual(at, -1, "the Escape binding has been restructured — this guard is inert");
  // 🔴 COMMENTS STRIPPED FIRST. The paragraph explaining WHY Escape must not acknowledge a policy
  // screen necessarily contains the word, and a guard reading raw source would fail on its own
  // explanation — which is how an explanation gets deleted to make a test pass.
  const escape = code(CANVAS.slice(at, CANVAS.indexOf("}}", at)));
  assert.equal(/acknowledge|policy_continue/.test(escape), false, `Escape can advance a policy screen: ${escape}`);
});
