// The habits that make writing read as machine-written — for the material
// Nemesis SAVES, not just what it says in chat.
//
// SOURCE. Wikipedia's "Signs of AI writing" (en.wikipedia.org/wiki/
// Wikipedia:Signs_of_AI_writing), an editor-maintained field guide compiled from
// real articles and drafts. Used as a catalogue of habits to avoid. Note the
// page's own caveat, which applies here too: these are observations, not rules,
// and human writing shows them as well. We are not detecting AI — we ARE the AI.
// The list is useful to us in exactly one direction: as things not to do.
//
// WHY A SEPARATE FILE FROM writing-voice.ts. Two different costs, so two
// different homes:
//
//   writing-voice.ts   rides EVERY turn on both surfaces. Sentence-level habits
//                      that apply to a one-line answer as much as an essay.
//                      Every character is paid for on every message forever.
//   this file          rides only the turns that BUILD something the student
//                      keeps — a note, a study guide, a deck. Document-level
//                      habits that cannot show up in a one-line answer at all.
//
// WHY IT MATTERS MORE IN SAVED WRITING THAN IN CHAT. A chat reply is read once
// and scrolled past. A note goes into the Library, gets revised from, gets turned
// into flashcards, and gets read the night before an exam. A padded section, a
// left-in placeholder, or three names for one concept does not just read badly
// there — it becomes what the student learns, and then what they are tested on.
//
// 🔴 SIZE IS LOAD-BEARING. selectChatSkills SKIPS an oversized packet SILENTLY
// (`continue`, not a throw), so a skill pushed past SKILL_CHAR_SHARE vanishes on
// any turn where a second skill matched — which reads as "the model ignored the
// instruction". `test-craft` is already 2,118 of its 2,500 share, which is why
// this block is composed into the note and slide builders (346 and 342) and NOT
// into that one. A test asserts every packet still fits.

/**
 * Document-level tells, for turns that write something into the workspace.
 *
 * Ordered by how much damage each does to a student, not by how obvious it is.
 * Written as instructions, not explanations — the model needs the rule, and the
 * reasoning is what this file's header is for.
 */
export const SAVED_WRITING_TELLS = [
  "WRITING THAT GETS SAVED — habits to avoid, because this becomes what they revise from:",
  // The most damaging one, and the least discussed. It is a direct consequence
  // of the repetition penalty that makes models reach for synonyms.
  "Name each thing ONE way and keep that name for the whole document. Do not vary a term for elegance — if it is the sodium-potassium pump on page one, it is not 'the ion transporter' on page two. A student revising from this will think they are two things, and a flashcard made from it will be wrong.",
  // Fabrication-by-hedging. EVIDENCE_HONESTY covers inventing a citation; this
  // covers inventing the CONTENT and labelling the invention as a gap.
  "If the material does not cover something, leave it out. Never write around a gap with 'while specific details are limited', 'this likely reflects', 'though not extensively documented' and then guess anyway — a guess wearing a hedge is still a guess, and it is the hardest kind for a student to catch.",
  // Padding shapes. These are the outline habits from the source guide.
  "No filler sections. Do not end with 'Challenges', 'Future Directions', 'Significance', or a 'Conclusion' that restates the document. If a topic has real open questions, name them specifically; otherwise stop when the material stops.",
  "Do not open sections by announcing them ('In this section we will explore...'), and do not tell the reader something is important instead of showing why. Cut 'it is important to note that' entirely — either the point earns its place or it does not.",
  // Artifacts that are pure embarrassment when they reach a saved file.
  "Never leave a placeholder in saved work: no '[insert date]', no 'XX', no 'add source here', no bracketed instructions to yourself. If you do not have the value, write the sentence without it or leave the line out.",
  "No conversational asides in a saved document — no 'Certainly!', no 'Here's a breakdown', no 'Would you like me to expand this?', no sign-off. The note is the deliverable; talk to the student in chat, not inside the file.",
  // Structure, kept short because the always-on voice already covers bold,
  // Title Case, em dashes and emoji.
  "Structure by what the material actually contains, not by a template. A heading with one line under it should have been a sentence in the section above.",
].join("\n");

/** One line for card and question writing, where the document-level rules do not
 *  apply but the naming rule still does — arguably more, since a card is read in
 *  isolation and cannot be disambiguated by its surroundings. */
export const CONSISTENT_NAMING_RULE =
  "Use ONE name per concept across the whole set. A card that calls something by a synonym the student has never seen tests recall of your vocabulary, not of the material.";

/** Rough ceiling for the saved-writing block, held by a test. It is composed
 *  into packets that must stay under SKILL_CHAR_SHARE (2,500), and the largest
 *  host is flashcard-craft at ~1,580 — so anything past this makes that packet
 *  vanish on a two-skill turn instead of failing loudly. */
export const SAVED_WRITING_TELLS_MAX_CHARS = 1_800;
