import assert from "node:assert/strict";
import test from "node:test";

import {
  ankiFieldToText,
  ankiNoteToCard,
  buildAnkiExportFile,
  countImageTags,
  escapeAnkiField,
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
  assert.deepEqual(basic, { back: "Vitamin K antagonist", cardType: "basic", front: "Warfarin", tags: ["cardio", "anticoag"] });
  assert.equal(ankiNoteToCard(["Warfarin", "Vitamin K antagonist"], "", true)?.cardType, "reversed");
  assert.equal(ankiNoteToCard(["{{c1::Lisinopril}} causes cough", "bradykinin"], "", true)?.cardType, "cloze");
  assert.equal(ankiNoteToCard(["<br>", "back only"], "", false), null);
  assert.equal(ankiNoteToCard(["front", "", "second extra"], "", false)?.back, "second extra");
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
