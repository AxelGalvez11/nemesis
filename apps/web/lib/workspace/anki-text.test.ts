import assert from "node:assert/strict";
import test from "node:test";

import {
  ankiFieldToText,
  ankiNoteToCard,
  buildAnkiExportFile,
  countImageTags,
  escapeAnkiField,
  NEEDS_IMAGE_TAG,
  normalizeAnkiDeckName,
  splitAnkiFields,
} from "./anki-text";

test("fields split on the unit separator", () => {
  assert.deepEqual(splitAnkiFields("front\u001fback\u001fextra"), ["front", "back", "extra"]);
  assert.deepEqual(splitAnkiFields("solo"), ["solo"]);
});

test("html fields become markdown-ish text", () => {
  assert.equal(ankiFieldToText("<b>Metoprolol</b><br>selective <i>beta-1</i>"), "**Metoprolol**\nselective *beta-1*");
  assert.equal(ankiFieldToText("Beta&nbsp;blocker &amp; more&#39;s &lt;tagless&gt;"), "Beta blocker & more's <tagless>");
  assert.equal(ankiFieldToText('drop <img src="heart.jpg"> media [sound:beep.mp3] here'), "drop media here");
  assert.equal(ankiFieldToText("<ul><li>first</li><li>second</li></ul>"), "- first\n- second");
  assert.equal(ankiFieldToText("<div>one</div><div>two</div>"), "one\ntwo");
  assert.equal(ankiFieldToText("{{c1::<b>ACE</b>::class}} inhibitors"), "{{c1::**ACE**::class}} inhibitors");
  assert.equal(ankiFieldToText("<br><div> </div>"), "");
});

test("study links survive as markdown instead of dead words", () => {
  assert.equal(
    ankiFieldToText('Enzymes<br><a href="https://youtu.be/abc">YouTube Link</a>'),
    "Enzymes\n[YouTube Link](https://youtu.be/abc)",
  );
  // A bare anchor with no text keeps the URL itself.
  assert.equal(ankiFieldToText('<a href="https://khanacademy.org/x"></a>'), "https://khanacademy.org/x");
  // Non-http hrefs (Anki internal refs) degrade to their label.
  assert.equal(ankiFieldToText('<a href="deck:1234">Related card</a>'), "Related card");
  // Nested markup inside the label is flattened, brackets stripped.
  assert.equal(ankiFieldToText('<a href="https://e.com"><b>See [this]</b></a>'), "[See this](https://e.com)");
});

test("an image resolver carries pictures over as markdown", () => {
  const resolve = (src: string) => (src === "heart.jpg" ? "https://cdn/m1.jpg" : null);
  assert.equal(ankiFieldToText('Anatomy<br><img src="heart.jpg">', resolve), "Anatomy\n![](https://cdn/m1.jpg)");
  // Unresolved images still drop.
  assert.equal(ankiFieldToText('x <img src="gone.png"> y', resolve), "x y");
  // Entity-encoded src decodes before lookup.
  const resolveAmp = (src: string) => (src === "a&b.png" ? "https://cdn/m2.png" : null);
  assert.equal(ankiFieldToText('<img src="a&amp;b.png">', resolveAmp), "![](https://cdn/m2.png)");
  // An image wrapped in a link keeps the image and drops the wrapper.
  assert.equal(ankiFieldToText('<a href="https://e.com"><img src="heart.jpg"></a>', resolve), "![](https://cdn/m1.jpg)");
});

test("picture-answer cards import whole when images resolve", () => {
  const resolve = () => "https://cdn/eq.png";
  const card = ankiNoteToCard(["How do you convert Ka to Kb?", '<img src="eq.png">'], "chem", false, resolve);
  assert.equal(card?.back, "![](https://cdn/eq.png)");
  assert.equal(card?.needsImage, false);
  assert.deepEqual(card?.tags, ["chem"]);
  // Cloze blank holding only an image now keeps a real answer.
  const cloze = ankiNoteToCard(["Density of water: {{c1::<img src=\"x.png\">}}", ""], "", false, resolve);
  assert.equal(cloze?.needsImage, false);
  assert.ok(cloze?.front.includes("{{c1:: ![](https://cdn/eq.png) }}"));
});

test("image tags are counted before stripping", () => {
  assert.equal(countImageTags('a <img src="x"> b <IMG src="y">'), 2);
  assert.equal(countImageTags("no images"), 0);
});

test("deck names normalize both separator styles", () => {
  assert.equal(normalizeAnkiDeckName("Pharm::Cardio:: Beta blockers "), "Pharm::Cardio::Beta blockers");
  assert.equal(normalizeAnkiDeckName("Pharm\u001fRespiratory"), "Pharm::Respiratory");
  assert.equal(normalizeAnkiDeckName("  Default  "), "Default");
});

test("notes become cards with the right type", () => {
  const basic = ankiNoteToCard(["Warfarin", "Vitamin K antagonist"], " cardio  anticoag ", false);
  assert.deepEqual(basic, { back: "Vitamin K antagonist", cardType: "basic", flag: 0, front: "Warfarin", needsImage: false, suspended: false, tags: ["cardio", "anticoag"] });
  assert.equal(ankiNoteToCard(["Warfarin", "Vitamin K antagonist"], "", true)?.cardType, "reversed");
  assert.equal(ankiNoteToCard(["{{c1::Lisinopril}} causes cough", "bradykinin"], "", true)?.cardType, "cloze");
  assert.equal(ankiNoteToCard(["<br>", "back only"], "", false), null);
  assert.equal(ankiNoteToCard(["front", "", "second extra"], "", false)?.back, "second extra");
});

// Carried so a shared deck arrives in the state its owner left it in: AnKing
// ships mostly suspended, and importing 35,000 cards as active buries a student.
test("a card keeps the parked and marked state Anki had for it", () => {
  const parked = ankiNoteToCard(["Warfarin", "VKA"], "", false, undefined, { flag: 3, suspended: true });
  assert.equal(parked?.suspended, true);
  assert.equal(parked?.flag, 3);
  // Absent state is the safe default — Quizlet has neither concept.
  const plain = ankiNoteToCard(["Warfarin", "VKA"], "", false);
  assert.equal(plain?.suspended, false);
  assert.equal(plain?.flag, 0);
  // Anki stores the colour in the low 3 bits, and only 1-7 are real colours.
  assert.equal(ankiNoteToCard(["a", "b"], "", false, undefined, { flag: 99 })?.flag, 7);
});

test("picture-answer cards import flagged instead of blank", () => {
  // Answer lived only in an image (the Captain Hook deck has ~800 of these).
  const imageBack = ankiNoteToCard(["How do you convert Ka to Kb?", '<img src="eq.png">'], "chem", false);
  assert.equal(imageBack?.needsImage, true);
  assert.ok(imageBack?.back.includes("was a picture"));
  assert.deepEqual(imageBack?.tags, ["chem", NEEDS_IMAGE_TAG]);

  // Cloze whose blank held only an image renders as {{c1:: }} — same problem.
  const emptyCloze = ankiNoteToCard(["The density of water is:<br>{{c1::<img src=\"x.png\">}}", ""], "", false);
  assert.equal(emptyCloze?.needsImage, true);
  assert.ok(emptyCloze?.tags.includes(NEEDS_IMAGE_TAG));

  // A normal cloze with a real answer and no back is NOT flagged.
  const goodCloze = ankiNoteToCard(["{{c1::Lisinopril}} causes cough", ""], "", false);
  assert.equal(goodCloze?.needsImage, false);
  assert.equal(goodCloze?.back, "");
  assert.deepEqual(goodCloze?.tags, []);
});

test("export file carries headers, notetypes, and quoting Anki understands", () => {
  const { exported, skipped, text } = buildAnkiExportFile([
    { back: "Vitamin K antagonist", cardType: "basic", front: "Warfarin", tags: ["cardio", "anticoag"] },
    { back: 'has "quotes"\tand tab', cardType: "reversed", front: "line\nbreak", tags: [] },
    { back: "bradykinin", cardType: "cloze", front: "{{c1::Lisinopril}} causes cough", tags: ["cardio"] },
    { back: "notes", cardType: "image_occlusion", front: "SA node", tags: [] },
  ]);
  assert.equal(exported, 3);
  assert.equal(skipped, 1);
  const lines = text.trimEnd().split("\n");
  assert.deepEqual(lines.slice(0, 4), ["#separator:tab", "#html:false", "#notetype column:3", "#tags column:4"]);
  assert.equal(lines[4], "Warfarin\tVitamin K antagonist\tBasic\tcardio anticoag");
  // The second row's quoted fields keep their inner newline and tab intact.
  assert.ok(text.includes('"line\nbreak"\t"has ""quotes""\tand tab"\tBasic (and reversed card)\t'));
  assert.ok(text.includes("\tCloze\tcardio"));
});

test("field escaping only quotes when needed", () => {
  assert.equal(escapeAnkiField("plain text"), "plain text");
  assert.equal(escapeAnkiField("with\ttab"), '"with\ttab"');
  assert.equal(escapeAnkiField('say "hi"'), '"say ""hi"""');
  assert.equal(escapeAnkiField("a\r\nb"), '"a\nb"');
});

test("inline styling converts only paired tags with markers hugging the text", () => {
  assert.equal(ankiFieldToText("a<b> bold</b>z"), "a **bold**z");
  assert.equal(ankiFieldToText("<b>never closed"), "never closed");
  assert.equal(ankiFieldToText('H<sub style="x">2</sub>O and E=mc<sup>2</sup>'), "H<sub>2</sub>O and E=mc<sup>2</sup>");
  assert.equal(ankiFieldToText("<b>H<sub>2</sub>O</b>"), "**H<sub>2</sub>O**");
  assert.equal(ankiFieldToText("<u>key term</u>"), "<u>key term</u>");
});
