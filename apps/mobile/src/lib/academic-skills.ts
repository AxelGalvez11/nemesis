/**
 * Academic skills for Nemesis chat.
 *
 * Routing decides which model/search lane a turn uses. Skills decide how the
 * assistant should behave as an educator. Keeping those concerns separate is
 * what prevents "quiz me" from receiving a mini lecture with the answer in it,
 * while "teach me" still gets a complete explanation.
 *
 * 🔴 WHICH SKILL A TURN GETS IS DECIDED BY THE MODEL (@nemesis/shared, chat-intent.ts), NOT BY
 * `detectAcademicSkill`'s nine regexes. This module is still pure — it owns the teaching contracts
 * and the one-skill-per-turn rule, both testable without React Native or Supabase.
 */

// The same rules the web builders carry (apps/web/lib/workspace/chat-skills.ts).
// Two apps, two prompt strings, one source — the shape of bug this session has
// already fixed twice (library `position`, the calendar tool description).
import {
  CONSISTENT_NAMING_RULE,
  SAVED_WRITING_TELLS,
  studyCreationKindFromPreferencePrompt,
} from "@nemesis/shared";

export type AcademicSkill =
  | "general"
  | "teach"
  | "quiz"
  | "test-builder"
  | "flashcard-builder"
  | "notes-builder"
  | "slides-builder";

export const GENERATED_NOTES_FOLDER = "Nemesis/Notes";
export const GENERATED_SLIDES_FOLDER = "Nemesis/Slides";
export const GENERATED_TESTS_GROUP = "Generated tests";

/**
 * When each skill applies, in one line, written for the model that chooses.
 *
 * 🔴 THIS REPLACED `detectAcademicSkill`, WHICH WAS NINE REGEXES AND A PRECEDENCE LADDER. CREATE,
 * REQUEST_ARTIFACT, FLASHCARDS, TEST_ARTIFACT, SLIDES, NOTES, QUIZ, TEACH, BARE_ARTIFACT — and a
 * comment explaining that "test me" had to be checked before the ambiguous noun "test", which is
 * the sound a word list makes when it is losing. A student who wrote "I have no clue, bruh" got
 * `general` and was answered as though they had asked a factual question.
 *
 * Written as CONDITIONS rather than trigger words, so they hold for a law student and a machinist
 * alike. Consumed by the shared turn decision (`@nemesis/shared`, chat-intent.ts), which returns
 * the ids it wants.
 */
export const ACADEMIC_SKILL_CATALOG: readonly { id: AcademicSkill; when: string }[] = [
  { id: "slides-builder", when: "the student wants a slide deck or presentation made" },
  { id: "flashcard-builder", when: "the student wants flashcards made and kept" },
  { id: "quiz", when: "the student asked to be quizzed, drilled or tested interactively, meaning they want to be asked questions rather than told answers" },
  { id: "test-builder", when: "the student wants a practice test or exam questions written and saved" },
  { id: "notes-builder", when: "the student wants notes or a study guide written and kept" },
  { id: "teach", when: "the student wants something explained, or has said in any words that they do not follow it, including frustration, giving up, or saying it makes no sense" },
];

/**
 * The one the model asked for, or `general`.
 *
 * 🔴 THE MODEL PICKS, THIS FUNCTION ENFORCES. Exactly one skill rides a phone turn (unlike web,
 * which allows two), so catalog order breaks ties — and an id that is not in the catalog is dropped
 * rather than thrown, because a model naming a skill that does not exist should cost the turn some
 * craft and not its answer.
 */
export function chooseAcademicSkill(requested: readonly string[]): AcademicSkill {
  const wanted = new Set(requested);
  for (const entry of ACADEMIC_SKILL_CATALOG) {
    if (wanted.has(entry.id)) return entry.id;
  }
  return "general";
}

const SKILL_INSTRUCTIONS: Record<AcademicSkill, string> = {
  general:
    "Academic skill: General. Answer the student's actual request directly. Do not turn every answer into a quiz or create an artifact unless they asked for one.",
  teach:
    "Academic skill: Teach. Build understanding before recall: state the learning goal, explain the core idea in plain language, connect it to what the learner likely knows, work one concrete example, and surface the most likely misconception. End with one brief check-for-understanding question, but do not include that check's answer in the same message. Do not withhold the explanation as though this were a quiz.",
  quiz:
    "Academic skill: Quiz. Test retrieval without leaking the answer. Ask exactly one question at a time and wait for the learner's response. Do not include the answer, explanation, giveaway heading, or a second question before they answer. If they ask for a hint, give the smallest useful scaffold, not the answer. After they respond, clearly mark correct/incorrect, explain why, adapt difficulty, then ask the next single question. Do not save a test unless they explicitly ask to create one.",
  "test-builder":
    "Academic skill: Test Builder. You MUST call add_practice_test so the result appears in Study; never leave the test only in chat. Follow the question count, difficulty, and question types the learner just selected. Each item must test one objective, have one unambiguously best answer, plausible misconception-based distractors when applicable, no answer clues, and a concise rationale explaining why the correct option wins. Save it under the Generated tests Study group unless the learner names a course or folder.",
  "flashcard-builder":
    // 🔴 "You MUST call list_study_decks and then add_flashcards" put a deck sweep
    // FIRST, before the model had settled what the cards were even about. Asked for
    // cards "from this" after a recording, it opened the student's existing decks,
    // found an unrelated subject there, and built twenty cards on it (owner
    // 2026-07-30). The saving requirement was always the point; the ordering was an
    // accident. Decks are now consulted to choose a DESTINATION, after the source
    // is settled — and the source is whatever the student pointed at.
    "Academic skill: Flashcard Builder. First settle what the cards are FROM: if the learner points at something in this conversation, use that and do not go looking for other material. Then call add_flashcards so every card appears in Study; never leave cards only in chat, and call list_study_decks only to pick which deck they belong in. Follow the learner's selected format exactly and set each card_type to basic, cloze, or reversed. Apply the minimum-information principle: one retrievable fact or relationship per card, a precise prompt, a short self-contained answer, no duplicate prompts, no answer leaked in the question, and no vague pronouns without context. Prefer cards that require recall over recognition. Use an existing deck only when it matches what these cards are actually about; otherwise make a new one. " +
    CONSISTENT_NAMING_RULE,
  "notes-builder":
    `Academic skill: Notes Builder. You MUST call create_library_note so the note appears in Library; never leave it only in chat. Use the learner's requested folder when given, otherwise file it in "${GENERATED_NOTES_FOLDER}". Write skimmable markdown with a clear title, learning objectives, concise sections, worked examples where useful, misconceptions, and a short recap.\n\n${SAVED_WRITING_TELLS}`,
  "slides-builder":
    `Academic skill: Slides Builder. You MUST call create_slide_deck so the slide deck appears in Library; never leave it only in chat. Use the learner's requested folder when given, otherwise file it in "${GENERATED_SLIDES_FOLDER}". Make each slide serve one purpose, keep bullets concise, include speaker notes only when they add teaching value, and finish with retrieval questions rather than a decorative summary.\n\n${SAVED_WRITING_TELLS}`,
};

/**
 * What to do when the student has handed over course material — a lecture deck, a
 * reading, a photographed page — WITHOUT saying what they want made from it.
 *
 * Attaching a lecture is not a question, so the general skill would answer it as
 * one and produce a summary. A summary is the least useful thing to do with a
 * lecture: the student already has the lecture. What they cannot get from it
 * quickly is what the lecturer marked as important, and study material built from
 * it. So: pull out the signal, then ASK which artifact to build.
 *
 * It deliberately does NOT create anything unprompted — that stays true to the
 * general skill's rule, and creating a 60-card deck nobody asked for is worse than
 * asking one short question.
 */
const MATERIAL_OFFER = [
  "The student has attached course material and has not said what to make from it.",
  "First, extract the signal rather than summarising: state the learning objectives if the material names any (they are often on a slide titled Objectives or Outcomes), then the key content a student is expected to be able to use, and say what any figure, diagram or table is actually showing.",
  "Follow the material's own emphasis. Headings, bold text and how many slides a topic is given are the lecturer telling you what matters; administrative slides, contact details, acknowledgements and reading lists are not content.",
  "Do not pad this into a summary of everything, and do not restate the material in its own order just to be complete.",
  "Then ask which they want built from it: study notes, flashcards, a practice test, or all three. Ask once, in one short sentence, and do not create any of them until they answer.",
].join(" ");

export function academicSkillInstruction(
  /** The skill ids the turn's decision asked for. */
  requested: readonly string[],
  hasMaterial = false,
  priorAssistantText = "",
): string {
  // 🔴 STILL DETERMINISTIC, BECAUSE IT IS NOT A READING. This matches the exact prefix of a
  // question NEMESIS ITSELF wrote, so it is the software remembering what it asked — the same
  // category as an unanswered question on screen, and nothing a model should rediscover.
  const continuationKind = studyCreationKindFromPreferencePrompt(priorAssistantText);
  const skill = continuationKind === "test"
    ? "test-builder"
    : continuationKind === "flashcards"
      ? "flashcard-builder"
      : chooseAcademicSkill(requested);
  // Only when they have NOT asked for something specific. "Make flashcards from
  // this" already names the artifact, and asking again would be a stall.
  if (hasMaterial && skill === "general") return `${SKILL_INSTRUCTIONS.general}\n\n${MATERIAL_OFFER}`;
  return SKILL_INSTRUCTIONS[skill];
}
