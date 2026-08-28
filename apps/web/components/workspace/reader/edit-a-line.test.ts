import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// 🔴🔴 THE OWNER REJECTED THE OTHER SHAPE. Offered "you ask, and Nemesis writes you a new deck",
// 2026-08-28: *"why would it need to make an entirely new PowerPoint file for... if it's just asking
// for a edit on one slide, then does that make sense? I want users to edit, like, specifically one
// thing, not just that nemesis reads what they want and invents an entirely new one."*
//
// So an edit is a splice into the original part: `lib/reader/ooxml-edit.ts` holds the arithmetic and
// its tests prove a real deck comes back with every other part byte-for-byte identical. This file
// guards the SURFACE — the gesture, and the promise the bar makes about where the change lives.

const strip = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const read = (name: string) => strip(readFileSync(new URL(name, import.meta.url), "utf8"));
const READER = read("./document-reader.tsx");
const LINE = read("./editable-line.tsx");
const SLIDES = read("./slides-document-view.tsx");

test("🔴🔴 the bar never lets a learner believe they saved", () => {
  // The edit lives in this browser tab. The file in the Library is still the one they uploaded, and
  // closing the reader ends the edit. A bar that said "Saved" — or said nothing — would be the
  // worst defect this feature could ship, because the learner finds out days later.
  assert.match(READER, /here only\. Download to keep it\./, "the bar stopped saying where the change lives");
  assert.match(READER, /data-testid="reader-edit-bar"/, "there is no bar at all");
  assert.match(READER, /Download edited copy/, "there is no way to keep the change");
  assert.match(READER, /Discard changes/, "there is no way out of an edit");
});

test("🔴🔴 the stored original is never written to", () => {
  // Deliberate first shape. Replacing the file in the Library would leave the parse, the citations
  // and any flashcards made from it describing text that no longer exists — so the edited bytes
  // stay in memory and the learner decides. Calibration: call `uploadLibrarySource` from here and
  // this reddens.
  assert.ok(!/upload|storage\.from|librarySource/i.test(READER.slice(READER.indexOf("const editLine"), READER.indexOf("const editLine") + 1200)), "the edit is writing to storage");
  assert.match(READER, /const opened = useRef<ArrayBuffer \| null>\(null\)/, "the file as opened is no longer kept, so Discard cannot be real");
  assert.match(READER, /opened\.current = buffer;/, "the original is never captured");
});

test("🔴 an edited file downloads from memory, not from the bucket", () => {
  // The signed URL still points at the original, which is the one thing the learner does NOT want
  // at that moment. Calibration: drop the `edits > 0` branch and the download hands back the file
  // they just changed.
  assert.match(READER, /if \(edits > 0 && bytes\)/, "the download no longer prefers the edited bytes");
  assert.match(READER, /\(edited\)/, "the edited copy is saved under the original's name");
});

test("🔴🔴 double-click, because a single click is how you select", () => {
  // A single click inside a document starts a SELECTION, and a selection is what raises the five
  // reader actions. Turning a line into a field on one click would take the highlight gesture away
  // from every line to give an edit gesture to one.
  assert.match(LINE, /onDoubleClick=/, "editing is on the wrong gesture");
  assert.ok(!/onClick=\{editable/.test(LINE), "a single click opens the editor again");
  // 🔴 AND THE DOUBLE-CLICK'S OWN WORD SELECTION IS CLEARED, or the learner gets a field to type in
  // AND a floating "Ask about this" bar over the line they are editing.
  assert.match(LINE, /window\.getSelection\(\)\?\.removeAllRanges\(\)/, "the word selected by the double-click is left raising the action bar");
});

test("🔴 Escape abandons the edit without closing the document", () => {
  // The docked source panel closes on Escape. Without stopping the event, a learner pressing Escape
  // to abandon a typo loses the whole document.
  assert.match(LINE, /event\.stopPropagation\(\)/, "a keystroke in the field still reaches the reader's shortcuts");
  assert.match(LINE, /if \(event\.key === "Escape"\)/, "Escape no longer abandons the edit");
});

test("🔴 an unchanged line is not an edit", () => {
  // Opening a field, changing nothing and clicking away must not repack the file, bump the counter,
  // or turn a read into "you have unsaved changes".
  assert.match(LINE, /if \(next && next !== text\.trim\(\)\) onCommit\(next\)/, "committing an unchanged line counts as an edit");
});

test("🔴 only lines with something replaceable offer a cursor", () => {
  // A table row is several cells joined for reading; a slide-number field is recomputed by
  // PowerPoint. Both come back with no runs, and a line with no runs is not editable.
  assert.match(SLIDES, /editable=\{Boolean\(onEditLine\) && paragraph\.runs\.length > 0\}/, "a line with nothing to splice offers an edit cursor");
  assert.match(SLIDES, /editable=\{Boolean\(onEditLine\) && slide\.titleRuns\.length > 0\}/, "a slide with no title offers an edit cursor on nothing");
});

test("🔴 the gesture is said out loud, because a double-click is not discoverable", () => {
  assert.match(READER, /Double-click a line to edit it/, "nothing tells the learner the lines can be edited");
});
