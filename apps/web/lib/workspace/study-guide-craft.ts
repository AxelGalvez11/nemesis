// Study-guide craft — the difference between a document a learner READS and a
// document a learner can be TESTED BY.
//
// Why this is its own leaf module, exactly like `item-writing.ts`: more than one
// lane in this app writes a study guide, and they must not drift apart. Every
// lane that produces revision material imports this constant, so improving the
// craft improves all of them at once and no lane can quietly fall behind.
//
// 🔴🔴 THE MEASUREMENT THAT MADE THIS FILE NECESSARY. Until this landed,
// `CARDS_SYSTEM` in canvas-deliverables.ts carried roughly 4,500 characters of
// hard-won craft (the owner's own rule sheet of 2026-09-03), while the note
// writer beside it ended with a single clause:
//
//     "Otherwise write a summary note: short sections that cover the material
//      faithfully and compactly."
//
// That is the entire specification of a study guide. One line, against which
// every model behaves identically and competently, and the result is what the
// owner reported on 2026-09-09: study guides from Nemesis, from Opus and from
// ChatGPT are all "not good enough", and the only remedy was re-explaining the
// shape by hand on every single request.
//
// 🔴🔴 THE REASON A COMPETENT SUMMARY IS A BAD STUDY GUIDE, AND IT IS MEASURED.
// Dunlosky, Rawson, Marsh, Nathan & Willingham (2013), "Improving Students'
// Learning With Effective Learning Techniques", rated ten study techniques by
// how much they actually raise performance:
//
//     HIGH utility      practice testing, distributed practice
//     MODERATE utility  elaborative interrogation, self-explanation,
//                       interleaved practice
//     LOW utility       summarization, highlighting, keyword mnemonic,
//                       imagery for text, REREADING
//
// A summary is built out of the two lowest-rated techniques on that list: it is
// a summarization, produced to be reread. It is not a weak version of a study
// guide; it is a different artifact that happens to look like one, which is why
// the failure is so hard to name while reading the output. The document is
// well-organised, accurate, and covers the material. It is also close to inert.
//
// So the rules below move the artifact from summarization to RETRIEVAL. The
// document's job is to make the learner produce the answer before they are
// shown it. That is the testing effect (Roediger & Karpicke 2006), the single
// most robust finding available to us, and it is a property of the DOCUMENT'S
// SHAPE, which is a thing a prompt can actually control.
//
// 🔴 FIELD-NEUTRAL, AND THAT IS A CORRECTNESS REQUIREMENT, NOT A STYLE NOTE
// (CLAUDE.md). Nemesis is a field-agnostic academic OS. A law student revises by
// distinguishing neighbouring cases and a mechanical engineering student revises
// by re-deriving a result and checking where the assumption breaks; both are the
// same STRUCTURE and neither is named below. Every rule is stated by shape, and
// where a concrete instance is needed it comes from the LEARNER'S OWN MATERIAL,
// which is field-correct by construction. `study-guide-craft.test.ts` fails on a
// subject word appearing here.
//
// 🔴 NO EM DASH IN ANY OF THIS, on purpose. The writer's instructions are the
// only prose it has in front of it, and a prompt that models the punctuation the
// product bans is how forty-nine em dashes got into the turn packet (see
// no-em-dashes.test.ts).
//
// Pure data. No imports, no dependencies, safe for any lane to pull in.

/**
 * The craft, written as instructions to a model.
 *
 * 🔴 SIZE, AND WHICH LANE MAY CARRY IT. This constant is ~2,600 characters,
 * which is OVER `SKILL_CHAR_SHARE` (2,500) in chat-skills.ts. That is deliberate
 * and safe, because its consumers are standalone system prompts with no packet
 * ceiling. It is NOT safe inside a `ChatSkill`: `selectChatSkills` skips an
 * oversized packet SILENTLY, so a skill built on this would vanish on any turn
 * where a second skill matched, which reads as "the model ignored the
 * instruction". A packet-constrained lane takes `STUDY_GUIDE_RULES_SHORT`
 * instead. Held by `study-guide-craft.test.ts`.
 *
 * 🔴 THE SECTION TYPES ARE A VOCABULARY, NEVER A CHECKLIST, and the rule saying
 * so is load-bearing rather than decorative. `SAVED_WRITING_TELLS` already tells
 * the writer to "structure by what the material actually contains, not by a
 * template", and a list of available sections read as a form to fill in would
 * contradict it directly. A prompt that argues with itself loses, and the half
 * carrying concrete examples is the half that wins. So the sections are offered
 * as shapes to reach for when the material supports them, and the instruction
 * to omit the ones it does not support is stated in the same breath, not left
 * to be inferred.
 */
export const STUDY_GUIDE_RULES = [
  "A STUDY GUIDE IS ANSWERED, NOT READ. A guide the learner only reads through is a summary, and rereading a summary is one of the weakest uses of their time there is. Build a document that makes them produce the answer before it shows them one.",
  "Open every section with the questions it makes answerable, as a short numbered list, and put the answers below them. The learner must be able to cover the answers and still have something to work against. A section with no question at the top is one they will only skim.",
  "In the answer parts, one idea per line. Write a paragraph only where the reasoning genuinely runs across several steps, and then keep it to the steps.",
  "The contrasts are the most valuable part of a guide and the part a summary always drops. Where the material puts two things near each other that are easy to confuse, write the pair and the ONE feature that separates them. Never manufacture a pair the material does not contain.",
  "Where the material works something through, show the reasoning line by line rather than only the result, then give one parallel case and leave it unworked. A result with no visible reasoning cannot be reapplied to a case they have not seen.",
  "Carry every exact specific exactly as the material wrote it: a quantity, a threshold, a proper name, a date or duration, the order of a sequence, a formula, a wording that is itself the thing being learned. Never round it, soften it into a vague word, or paraphrase it.",
  "Say when a rule does NOT hold. The conditions, the exceptions and the boundary cases are where the material is actually tested, and they are the first thing lost when a document is compressed.",
  "Name the mistakes. Where the material shows a step that is routinely got wrong, or two things routinely swapped, write that down as the mistake it is, in the words a learner would recognise it by.",
  "Everything comes from THIS material. A point you are sure of but cannot locate in what you were given does not belong in the guide, however true it is. If the material supports a short guide, write a short guide.",
  "Close by naming what the material did not cover, in one line, so the learner knows the edge of what they have. That line is the ending; never follow it with a section that restates the guide.",
  "These section shapes are a vocabulary to build from, never a form to fill in: the questions this makes answerable, the idea stated once and precisely, what this is confused with, a worked case then one to try, the specifics to carry exactly, when it does not hold, the mistakes that get made. Use the ones this material supports and leave out the rest.",
].join("\n");

/**
 * One-line version for prompts and tool descriptions with room for a pointer only.
 *
 * 🔴 IT CARRIES THE THESIS, NOT A SAMPLE OF THE RULES. This string is what most
 * lanes will actually see, so it leads with the one instruction that changes the
 * artifact ("answered, not read") rather than with the tidiest-sounding clause.
 * A short form that opened with formatting advice would leave every lane using
 * it producing exactly the summary this file exists to prevent.
 */
export const STUDY_GUIDE_RULES_SHORT =
  "A study guide is answered, not read: open each section with the questions it makes answerable and put the answers below them, one idea per line. Write the contrasts (what this is confused with and the one feature that separates them), show reasoning line by line then leave one parallel case unworked, carry every exact specific verbatim, and say when the rule does not hold. Everything from the learner's own material; no Conclusion, no filler sections.";
