/**
 * Academic skills for Nemesis chat.
 *
 * Routing decides which model/search lane a turn uses. Skills decide how the
 * assistant should behave as an educator. Keeping those concerns separate is
 * what prevents "quiz me" from receiving a mini lecture with the answer in it,
 * while "teach me" still gets a complete explanation.
 *
 * This module is intentionally pure so its intent detection and teaching
 * contracts can be tested without React Native or Supabase.
 */

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

const CREATE = /\b(?:create|make|build|generate|draft|prepare|save|turn .{0,30} into|put together|give me)\b/i;
const REQUEST_ARTIFACT = /\b(?:i (?:need|want)|please (?:make|create|prepare)|can you (?:make|create|prepare))\b/i;
const FLASHCARDS = /\b(?:flash\s*cards?|anki cards?|study deck)\b/i;
const TEST_ARTIFACT = /\b(?:tests?|practice test|mock exam|question bank|practice exam|full test)\b/i;
const SLIDES = /\b(?:slides?|slide deck|presentation)\b/i;
const NOTES = /\b(?:study notes?|class notes?|lecture notes?|study guide|revision guide)\b/i;
const QUIZ = /\b(?:quiz me|test me|ask me questions?|question me|oral exam|one question at a time)\b/i;
const TEACH = /\b(?:teach me|explain|walk me through|help me understand|tutor me|give me a lesson|break down)\b/i;
const BARE_ARTIFACT =
  /^(?:please\s+)?(?:\d+\s+)?(?:flash\s*cards?|anki cards?|slides?|slide deck|presentation|practice test|mock exam|question bank|study notes?|lecture notes?|study guide)\b/i;

export function detectAcademicSkill(text: string): AcademicSkill {
  const compact = text.trim();
  const requestsArtifact = CREATE.test(compact) || REQUEST_ARTIFACT.test(compact) || BARE_ARTIFACT.test(compact);
  if (requestsArtifact && SLIDES.test(compact)) return "slides-builder";
  if (requestsArtifact && FLASHCARDS.test(compact)) return "flashcard-builder";
  // "Test me" is an interactive retrieval session, even in phrasings such as
  // "I need you to test me." It must win over the ambiguous noun "test."
  if (QUIZ.test(compact)) return "quiz";
  if (requestsArtifact && TEST_ARTIFACT.test(compact)) return "test-builder";
  if (requestsArtifact && NOTES.test(compact)) return "notes-builder";
  if (TEACH.test(compact)) return "teach";
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
    "Academic skill: Test Builder. You MUST call add_practice_test so the result appears in Study; never leave the test only in chat. Unless the learner specifies otherwise, create 10 one-best-answer questions spanning recall, application, and transfer. Each item must test one objective, have one unambiguously best answer, plausible misconception-based distractors, no answer clues, and a concise rationale explaining why the correct option wins. Save it under the Generated tests Study group unless the learner names a course or folder.",
  "flashcard-builder":
    "Academic skill: Flashcard Builder. You MUST call list_study_decks and then add_flashcards so every card appears in Study; never leave cards only in chat. Apply the minimum-information principle: one retrievable fact or relationship per card, a precise prompt, a short self-contained answer, no duplicate prompts, no answer leaked in the question, and no vague pronouns without context. Prefer cards that require recall over recognition. Use an existing matching deck when possible.",
  "notes-builder":
    `Academic skill: Notes Builder. You MUST call create_library_note so the note appears in Library; never leave it only in chat. Use the learner's requested folder when given, otherwise file it in "${GENERATED_NOTES_FOLDER}". Write skimmable markdown with a clear title, learning objectives, concise sections, worked examples where useful, misconceptions, and a short recap.`,
  "slides-builder":
    `Academic skill: Slides Builder. You MUST call create_slide_deck so the slide deck appears in Library; never leave it only in chat. Use the learner's requested folder when given, otherwise file it in "${GENERATED_SLIDES_FOLDER}". Make each slide serve one purpose, keep bullets concise, include speaker notes only when they add teaching value, and finish with retrieval questions rather than a decorative summary.`,
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

export function academicSkillInstruction(text: string, hasMaterial = false): string {
  const skill = detectAcademicSkill(text);
  // Only when they have NOT asked for something specific. "Make flashcards from
  // this" already names the artifact, and asking again would be a stall.
  if (hasMaterial && skill === "general") return `${SKILL_INSTRUCTIONS.general}\n\n${MATERIAL_OFFER}`;
  return SKILL_INSTRUCTIONS[skill];
}
