import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { turnRouterMessages, type TurnContext } from "./turn-router";

// ── a capability the model is not told about does not exist (workstream H) ───────────────────
//
// Owner's build order: *"Nemesis can draw sixteen kinds of things … but the model decides when to
// draw. So someone can have five conversations and never see one — and this is supposed to be the
// reason they chose you."*
//
// 🔴🔴🔴 THIS FILE EXISTS BECAUSE THE PROTECTION IT PROVIDES WAS ALREADY CLAIMED AND WAS NOT
// THERE. `turn-router.ts` carried this sentence:
//
//     "Anything added to canvas-visual.ts or subject-visuals.ts must be added HERE in the same
//      commit, and visual-route.test.ts now fails the build if it is not."
//
// It did not. `visual-route.test.ts` has thirty-nine tests and not one of them reads the turn
// packet. So the file documented a safety net that did not exist — which is worse than having no
// net, because the next person to add a renderer would read that sentence and trust it.
//
// 🔴🔴 AND THE FAILURE IT GUARDS AGAINST IS MEASURED, NOT HYPOTHETICAL. Between 2026-08-20 and
// 2026-08-24 the packet named EIGHT kinds while FIFTEEN were built, tested, merged and deployed.
// Circuits, sheet music, 3D surfaces, 3D molecules, the whole body atlas and the licensed figure
// shelf all existed and the model was told they did not. Production evidence from that window:
// asked for a series circuit it computed the right 320 Ω and described the diagram in words;
// asked to teach anatomy it wrote "[figure: relationship diagram of …]" — a prose description of
// the picture it wanted — against an atlas that resolves a named structure in microseconds.
//
// 🔴 THE MAPPING BELOW IS THE FORCING FUNCTION, and its incompleteness is the point. A new kind
// with no entry fails immediately, with a message naming both places to edit. That is the whole
// mechanism: it is not possible to add a renderer and quietly leave the model ignorant of it.

const kindsIn = (file: string): readonly string[] => {
  const source = readFileSync(new URL(file, import.meta.url), "utf8");
  return [...new Set([...source.matchAll(/kind: "([a-z]+)"/g)].map((match) => match[1]!))].sort();
};

/** Every kind that a renderer can actually draw, read from the two files that define them. */
const RENDERABLE = [...new Set([...kindsIn("./canvas-visual.ts"), ...kindsIn("./subject-visuals.ts")])].sort();

/**
 * How the packet names each kind to the model.
 *
 * 🔴 LEARNER-FACING PHRASES, NOT SLUGS, because that is what the contract sentence is written in
 * — "a bar of music", not `score`. Matching on the slug would pass for a sentence that never
 * mentioned music, which is exactly the failure this guards.
 */
const PHRASE_FOR_KIND: Record<string, RegExp> = {
  anatomy: /an anatomical structure/,
  circuit: /a circuit/,
  code: /a traced snippet of code/,
  construction: /a geometric construction/,
  equation: /an equation/,
  figure: /a licensed textbook figure/,
  macromolecule: /a protein/,
  mechanism: /a whole reaction mechanism/,
  quantitative: /a plot/,
  relationship: /a diagram/,
  score: /a bar of music/,
  structure: /a molecule/,
  surface: /a 3D surface/,
  table: /a table/,
  timeline: /a timeline/,
  vectors: /a force diagram/,
};

/**
 * How the packet tells the model to WRITE each kind.
 *
 * 🔴🔴🔴 THIS HALF WAS MISSING, AND `figure` FELL STRAIGHT THROUGH THE GAP. The map above asks
 * "is this kind named?" — `figure` was named, as "a licensed textbook figure", so every test in
 * this file passed. The question that mattered is "can the model actually write one?", and the
 * answer was no: its single field, `subject`, appeared nowhere in the packet. A kind whose shape
 * cannot be guessed is refused exactly as silently as a kind that was never mentioned.
 *
 * Measured on production 2026-08-24: *"show me a diagram of meiosis and walk me through the
 * stages"* produced a complete, correct, entirely wordless lesson with no `[figure n]` marker
 * anywhere. `/api/learn/reference-image` answers that same subject with a real captioned meiosis
 * diagram in one call. Five thousand licensed pictures were unreachable for want of one field name.
 *
 * 🔴 EACH ENTRY MATCHES A FIELD NAME, NOT A PHRASE, because a field name is the thing the model
 * has to reproduce exactly. A shape sentence that mentions a kind without naming its fields would
 * pass a prose match and still leave the model guessing.
 */
const SHAPE_FOR_KIND: Record<string, RegExp> = {
  anatomy: /"kind":"anatomy","structure"/,
  circuit: /circuit \{elements:\{arrangement/,
  code: /code \{language, source, trace\}/,
  construction: /construction \{points:\[\{id,x,y\}\], segments/,
  equation: /equation \{latex\}/,
  figure: /"kind":"figure","subject"/,
  macromolecule: /"kind":"macromolecule","accession"/,
  // 🔴 `arrows` BECAME `highlight` ON 2026-08-26, when the curly arrows were withdrawn. This guard
  // reddened the moment the router changed and this line did not, which is exactly what pinning the
  // literal string is for: a packet advertising a field the validator has stopped accepting is a
  // capability the model keeps writing for and silently losing.
  mechanism: /mechanism \{steps:\[\{value, highlight, label\}\]\}/,
  quantitative: /quantitative \{xLabel, yLabel, series/,
  relationship: /relationship \{nodes:\[\{id,label\}\], edges/,
  score: /score \{abc\}/,
  structure: /"kind":"structure","notation"/,
  surface: /surface \{expression, xFrom, xTo/,
  table: /table \{columns:\[\{key,label\}\], rows/,
  timeline: /timeline \{unit, events/,
  vectors: /vectors \{bodyLabel, vectors/,
};

const EMPTY: TurnContext = {
  canvasTitle: "",
  clarified: [],
  courseRequested: false,
  demonstrated: 0,
  history: [],
  lessonInProgress: false,
  materialContext: "",
  memory: "",
  objectives: 0,
  passages: 0,
  searchesLeft: 0,
  sources: 0,
  pinnedComments: "",
  stagedPassage: "",
  toolCatalogue: "",
  toolContext: "",
  toolRoundsLeft: 0,
  today: "Tuesday, 18 August 2026",
  webContext: "",
};

const PACKET = turnRouterMessages({ context: EMPTY, utterance: "explain how a series circuit works" })
  .map((message) => message.content)
  .join("\n");

test("🔴 the renderable kinds are read from the renderers, not from a list in this file", () => {
  // If this ever reads a hardcoded array, the guard becomes a copy that drifts alongside the one
  // it is supposed to be checking.
  assert.ok(RENDERABLE.length >= 15, `only ${RENDERABLE.length} kinds found — the source files moved or changed shape`);
  for (const expected of ["anatomy", "circuit", "score", "macromolecule", "surface"]) {
    assert.ok(RENDERABLE.includes(expected), `${expected} is no longer discoverable from the renderer files`);
  }
});

test("🔴🔴🔴 every kind a renderer can draw is named in the packet the model reads", () => {
  // Calibration: delete "a bar of music" from turn-router.ts's capability sentence and this
  // reddens naming `score`.
  const missing: string[] = [];
  for (const kind of RENDERABLE) {
    const phrase = PHRASE_FOR_KIND[kind];
    if (!phrase) continue; // reported by the next test, with better instructions
    if (!phrase.test(PACKET)) missing.push(kind);
  }
  assert.deepEqual(
    missing,
    [],
    "these renderers exist and the model is not told about them, so it will describe the picture in " +
      "words instead of drawing it — add each to the capability sentence in turn-router.ts",
  );
});

test("🔴🔴 a NEW kind cannot be added without telling the model about it", () => {
  // The forcing function. Adding a renderer to canvas-visual.ts or subject-visuals.ts and stopping
  // there fails here, with the two places to edit named in the message.
  const unmapped = RENDERABLE.filter((kind) => !PHRASE_FOR_KIND[kind]);
  assert.deepEqual(
    unmapped,
    [],
    "a renderer was added with no phrase for it. Two edits, same commit: (1) name it in the " +
      "capability sentence in lib/learn/turn-router.ts, in learner-facing words, and (2) add that " +
      "phrase to PHRASE_FOR_KIND in this file. A capability the model is not told about does not exist.",
  );
});

test("🔴🔴🔴 every kind is told to the model in a shape it can actually write", () => {
  // 🔴 THE TEST THAT WOULD HAVE CAUGHT `figure`. Being NAMED is not being usable: the packet
  // advertised "a licensed textbook figure" while never once saying the field is `subject`, so the
  // model wrote prose about meiosis instead of asking for the diagram that was sitting there.
  // Calibration: delete the figure shape from turn-router.ts and this reddens naming `figure`.
  const unwritable: string[] = [];
  for (const kind of RENDERABLE) {
    const shape = SHAPE_FOR_KIND[kind];
    if (!shape) continue; // reported by the next test, with better instructions
    if (!shape.test(PACKET.replace(/\s+/g, " "))) unwritable.push(kind);
  }
  assert.deepEqual(
    unwritable,
    [],
    "these kinds are named to the model but their FIELDS are not, so anything it writes for them is " +
      "refused silently — state each shape in the exact-shapes section of turn-router.ts",
  );
});

test("🔴🔴 a NEW kind cannot be added without telling the model its shape either", () => {
  const unmapped = RENDERABLE.filter((kind) => !SHAPE_FOR_KIND[kind]);
  assert.deepEqual(
    unmapped,
    [],
    "a renderer was added with no SHAPE entry. Naming a kind is not enough — the model has to know " +
      "which fields to write, or the validator drops what it produces without a word. Two edits, " +
      "same commit: state the shape in lib/learn/turn-router.ts, and add it to SHAPE_FOR_KIND here.",
  );
});

test("🔴🔴🔴 the packet says a marker without a payload draws nothing", () => {
  // 🔴 MEASURED ON PRODUCTION 2026-08-24, MINUTES AFTER THE FIGURE SHAPE WAS ADDED. Asked for a
  // diagram of meiosis, the model wrote "Here's a diagram of meiosis showing both divisions:"
  // followed by `[figure 1]`, and sent NO `visuals` array at all — stored canvas 204d3e54,
  // `visuals: null`. The learner got a sentence promising a picture and the literal text
  // `[figure 1]` underneath.
  //
  // It is the same half-step as the `visuals: []` case that the filled-in template was written to
  // fix, and it needs the same treatment: say the negative out loud. A marker is a POSITION; the
  // picture is the entry in `visuals`.
  const packet = PACKET.replace(/\s+/g, " ");
  assert.match(packet, /\[figure n\] marker draws NOTHING on its own/, "the marker-without-payload warning is gone");
  assert.match(packet, /\[figure 1\] needs "visuals"\[0\]/, "the packet no longer says which marker maps to which entry");
});

test("🔴🔴 the packet warns that a wordy figure subject fetches the wrong picture", () => {
  // 🔴 ALSO MEASURED, against the live repository, asking for one diagram four ways:
  //   "meiosis"                                   → the real meiosis diagram
  //   "meiosis I and meiosis II stages"           → the real meiosis diagram
  //   "the stages of meiosis"                     → the life stages of NAEGLERIA FOWLERI
  //   "diagram of meiosis showing both divisions" → the layers of human skin
  //   "meiosis showing both divisions"            → an illustration of cleft lip
  // Every one returned `ok`. "stages", "diagram", "showing" and "both" appear in millions of
  // captions and outvote the one word that identifies the subject — and a wrong picture is worse
  // than none, because it arrives captioned, credited, and confidently placed beside prose about
  // something else.
  const packet = PACKET.replace(/\s+/g, " ");
  assert.match(packet, /SHORTEST NAME of the thing itself/, "the short-subject rule is gone");
  assert.match(packet, /Do not describe the picture you want/, "the packet stopped warning against describing the picture");
});

test("🔴🔴 describing a picture, and offering one as a follow-up, are both banned", () => {
  // 🔴 THE SAME REFUSAL IN THREE FORMS, AND ONLY TWO WERE COVERED. The packet already bans a
  // picture made of CHARACTERS. It did not ban a picture made of SENTENCES, which is what the model
  // reaches for instead — measured 2026-08-24, asked for the C major scale "in standard notation":
  // the letters `C D E F G A B C` in a fence, then a bulleted list reading *"E — bottom line, F —
  // first space, G — second line"*, against a renderer that engraves ABC from one field.
  //
  // 🔴 AND THE TELL IS IDENTICAL ACROSS CASES. It closed with *"If you'd like it, I can also show
  // this as ABC notation"* — the same shape as the ethanol case's *"if you want it as a proper
  // structural diagram, just say the word."* A model offering a drawing has already decided the
  // drawing is worth making, so the offer itself is the thing to ban.
  const packet = PACKET.replace(/\s+/g, " ");
  assert.match(packet, /Never DESCRIBE a picture you could draw/, "describing a picture in prose is allowed again");
  assert.match(packet, /never offer one as a follow-up/, "the model may once more offer a drawing instead of drawing it");
  // The older character-art ban must survive alongside it: they catch different failures.
  assert.match(packet, /Never draw a picture out of text characters/, "the ASCII-art ban was replaced rather than joined");
});

test("🔴 the packet's own claim about where it is guarded is true", () => {
  // The sentence that started this: turn-router.ts pointed at visual-route.test.ts, which never
  // checked the packet. A comment naming the wrong guard is worse than naming none, because the
  // next person to add a renderer reads it and trusts it.
  const router = readFileSync(new URL("./turn-router.ts", import.meta.url), "utf8");
  const claim = /`?visual-route\.test\.ts`? now fails the build/.test(router);
  assert.ok(!claim, "turn-router.ts still points at visual-route.test.ts, which does not read the packet");
  assert.match(router, /visuals-are-told\.test\.ts/, "turn-router.ts no longer names the guard that actually holds this");
});
