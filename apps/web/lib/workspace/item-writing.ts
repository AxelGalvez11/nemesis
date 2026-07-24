// Exam item-writing rules — the craft of writing a multiple-choice question
// that measures whether a student understands something, rather than whether
// they are good at multiple-choice questions.
//
// Why this is its own leaf module: TWO lanes in this app produce tests, and
// they must not drift apart.
//   1. The Study tab's generator (study-artifact-content.ts buildTestGenMessages)
//   2. Chat, when the student asks for practice questions (chat-skills.ts)
// Both import this constant, so improving the craft improves both at once and
// neither lane can quietly fall behind the other.
//
// Source: the rules distilled here follow the NBME Item-Writing Guide
// ("Constructing Written Test Questions for the Health Sciences", Oct 2024) —
// its five basic rules for one-best-answer items plus its catalogue of
// technical flaws. Those flaws are not stylistic preferences: the measured
// effect is that flawed items let test-wise students score above their actual
// knowledge, and penalise students who know the material but read carefully.
//
// Pure data. No imports, no dependencies — safe for any lane to pull in.

/** The rules themselves, written as instructions to a model. Kept compact on
 *  purpose: this rides inside a chat skill that has a per-turn char budget
 *  (see chat-skills.ts SKILL_CHAR_BUDGET) as well as inside a generation
 *  prompt that already carries up to 9,000 characters of source material. */
export const EXAM_ITEM_RULES = [
  "Write one-best-answer questions only. Never true/false, never 'select all that apply', and never a stem like 'Which of the following statements is correct?' — those measure test-taking, not knowledge.",
  "Build the stem as a short concrete situation — a patient, a case, a lab result, a scenario — and ask what it implies. A question answerable by reciting a definition tests recall; the point is application.",
  "The stem must be answerable BEFORE the options are read. Cover the options: if the question becomes unanswerable, the stem is missing something. Ask one closed, specific question.",
  "Keep every option in the same category (all drugs, or all diagnoses, or all mechanisms) and about the same length. The longest, most hedged, most detailed option must not be the correct one — that is the single most common giveaway in real exams.",
  "Build wrong options from mistakes students actually make: the drug this one gets confused with, a step of the mechanism out of order, a value off by a factor, the right answer to a neighbouring question. Never write permutations of the correct answer, and never an option nobody would pick.",
  "Never use: 'all of the above', 'none of the above', a negative stem ('which is NOT', 'all EXCEPT'), absolutes ('always', 'never'), vague quantifiers ('usually', 'may', 'often') inside the options, or options that overlap or contain one another.",
  "Give the correct answer and explain what makes each wrong option wrong — name the specific misunderstanding it represents, so a miss teaches something.",
  "Never invent a lab value, dose, or clinical detail to make a case work. Take the specifics from the student's own material, or write the stem so it does not need them.",
].join("\n");

/** One-line version for prompts that only have room for a pointer. */
export const EXAM_ITEM_RULES_SHORT =
  "One-best-answer only; a short scenario stem answerable before the options are read; options homogeneous and of similar length with the correct one never the longest; distractors drawn from real student confusions; no 'all/none of the above', no negative stems, no absolutes.";
