import assert from "node:assert/strict";
import { test } from "node:test";

import { glossaryKey, wordShares, worthDefining } from "./vocabulary-lookup";

// 🔴 THE TESTS ARE IN FOUR LANGUAGES ON PURPOSE. The rule this file exists to prove is that
// "is this a function word?" is answered by the learner's own material rather than by a list, and a
// suite written only in English cannot tell a working frequency rule from a hidden English stop-word
// list — both pass. Spanish, German and Japanese are here to make that difference visible.

/** A short document about one subject, in the shape prose actually arrives in. */
const ENGLISH = [
  "The reading frame determines which amino acid is produced.",
  "A deletion shifts the reading frame downstream of the change.",
  "The frame is preserved when the deletion is a multiple of three.",
  "Termination occurs when the ribosome reaches a stop codon.",
  "The stop codon is not read as an amino acid.",
  "A frameshift usually introduces a premature stop codon.",
  "The protein is truncated when termination is premature.",
  "Truncation removes the domains downstream of the stop.",
  "The severity depends on where in the sequence the change falls.",
  "A change near the start removes more of the protein.",
].join(" ");

const shared = (material: string) => ({
  sentenceCount: material.split(/[.!?\n]+/u).filter((s) => s.trim()).length,
  shares: wordShares(material),
});

test("glossary keys fold case, spacing and punctuation, in any script", () => {
  assert.equal(glossaryKey("  Reading Frame  "), "reading frame");
  assert.equal(glossaryKey("stop-codon"), "stop codon");
  assert.equal(glossaryKey("Grenzfläche,"), "grenzfläche");
  assert.equal(glossaryKey("読み枠"), "読み枠");
});

// ── the refusals ────────────────────────────────────────────────────────────

test("🔴 a selection with no word in it is not a lookup", () => {
  for (const junk of ["", "   ", "—", "()", "…"]) {
    const decision = worthDefining({ term: junk });
    assert.equal(decision.define, false, junk);
    assert.equal(decision.define === false ? decision.refusal : null, "not-a-word");
  }
});

test("🔴 a sentence is something to EXPLAIN, and that action already exists", () => {
  const decision = worthDefining({ term: "the reading frame determines which amino acid is produced" });
  assert.equal(decision.define === false ? decision.refusal : null, "too-long");
});

test("a term of art up to three words is still a definition", () => {
  assert.equal(worthDefining({ term: "minimum inhibitory concentration" }).define, true);
  assert.equal(worthDefining({ term: "res ipsa loquitur" }).define, true);
});

test("🔴 a two-character term is NOT too short — real ones exist", () => {
  // "pH" and "μm" are terms. What the length rule catches is a single stray letter from the edge of
  // a drag, and refusing two characters would take the real ones with it.
  assert.equal(worthDefining({ term: "pH" }).define, true);
  assert.equal(worthDefining({ term: "x" }).define === false, true);
});

// ── the language-agnostic part, which is the whole point ────────────────────

test("🔴🔴 an article is refused because it is EVERYWHERE in the material, not because it is listed", () => {
  const decision = worthDefining({ term: "the", ...shared(ENGLISH) });
  assert.equal(decision.define, false);
  assert.equal(decision.define === false ? decision.refusal : null, "function-word");
});

test("🔴🔴 and the same rule refuses the Spanish, German and Japanese articles, with no list", () => {
  // 🔴 THE TEST THAT DISCRIMINATES A FREQUENCY RULE FROM AN ENGLISH STOP-WORD LIST. A list passes
  // the English case above and fails every one of these.
  const spanish = [
    "El marco de lectura determina el aminoácido producido.",
    "Una deleción desplaza el marco de lectura.",
    "El marco se conserva cuando la deleción es múltiplo de tres.",
    "El codón de terminación no se lee como el aminoácido.",
    "La proteína se trunca cuando el final es prematuro.",
    "El cambio cerca del inicio elimina más de la proteína.",
    "El efecto depende del lugar donde ocurre el cambio.",
    "Una mutación en el marco produce el codón prematuro.",
  ].join(" ");
  const german = [
    "Der Leserahmen bestimmt die Aminosäure.",
    "Eine Deletion verschiebt der Leserahmen nicht immer.",
    "Der Rahmen bleibt erhalten wenn die Deletion durch drei teilbar ist.",
    "Der Ribosom erreicht der Stopcodon am Ende.",
    "Der Stopcodon wird nicht als Aminosäure gelesen.",
    "Der Frameshift erzeugt der vorzeitigen Stopcodon.",
    "Der Protein wird verkürzt wenn der Abbruch früh erfolgt.",
    "Der Effekt hängt davon ab wo der Wechsel liegt.",
  ].join(" ");

  assert.equal(
    worthDefining({ term: "el", ...shared(spanish) }).define,
    false,
    "the Spanish article must be refused by the same rule",
  );
  assert.equal(
    worthDefining({ term: "der", ...shared(german) }).define,
    false,
    "and the German one",
  );
  // …while the terms those documents are ABOUT survive.
  assert.equal(worthDefining({ term: "marco", ...shared(spanish) }).define, true);
  assert.equal(worthDefining({ term: "Leserahmen", ...shared(german) }).define, true);
});

test("🔴 a technical term the material is ABOUT is defined, however often it appears", () => {
  // The failure in the other direction: a frequency rule that is too eager refuses exactly the words
  // a document is teaching, which are the ones a learner most needs.
  for (const term of ["reading frame", "stop codon", "frameshift", "truncated"]) {
    assert.equal(worthDefining({ term, ...shared(ENGLISH) }).define, true, term);
  }
});

test("🔴 a multi-word term containing an article survives", () => {
  // Refusing on ANY common word would reject most multi-word terms in most languages, because most
  // of them carry an article or a preposition.
  assert.equal(worthDefining({ term: "the reading frame", ...shared(ENGLISH) }).define, true);
});

test("🔴 with too little material the frequency rule stands down rather than guessing", () => {
  // In four sentences a genuine key term easily appears in half of them. A rule that fired here
  // would refuse the document's own subject on the thinnest possible evidence.
  const thin = "The frame shifts. The frame matters. The frame is read.";
  assert.equal(worthDefining({ term: "frame", ...shared(thin) }).define, true);
  assert.equal(worthDefining({ term: "the", ...shared(thin) }).define, true, "and it allows, never refuses, when blind");
});

test("word shares count SENTENCES, not occurrences", () => {
  // A word repeated three times in one line is one piece of evidence, not three.
  const shares = wordShares("Frame frame frame. Codon appears here. Codon appears again.");
  assert.equal(shares.get("frame"), 1 / 3);
  assert.equal(shares.get("codon"), 2 / 3);
});
