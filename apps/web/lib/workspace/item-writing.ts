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
// 🔴 FIELD-NEUTRAL, AND THAT IS A CORRECTNESS REQUIREMENT, NOT A STYLE NOTE.
// Until 2026-08-07 these rules told the model to build a stem from "a patient, a
// case, a lab result", to keep options homogeneous as "all drugs, or all
// diagnoses, or all mechanisms", and never to invent "a lab value, dose, or
// clinical detail". Nemesis is a field-agnostic academic OS: a law student sits
// exams made of fact patterns and a mechanical engineering student sits exams
// made of loaded beams, and both were being handed a prompt that told the model
// to write medicine. The craft below is unchanged — it is the NBME's, and it
// generalises — but every example is now structural. Where a concrete instance
// is needed, it comes from the STUDENT'S OWN MATERIAL, which is field-correct by
// construction and needs no list of subjects to be maintained.
//
// Pure data. No imports, no dependencies — safe for any lane to pull in.

/** The rules themselves, written as instructions to a model. Kept compact on
 *  purpose: this rides inside a chat skill that has a per-turn char budget
 *  (see chat-skills.ts SKILL_CHAR_BUDGET) as well as inside a generation
 *  prompt that already carries up to 9,000 characters of source material. */
export const EXAM_ITEM_RULES = [
  "Write one-best-answer questions only. Never true/false, never 'select all that apply', never 'Which of the following statements is correct?' — those measure test-taking, not knowledge.",
  "Build the stem as a short concrete situation from the material's own subject and ask what it implies. A question answerable by reciting a definition tests recall; the point is application.",
  "The stem must be answerable BEFORE the options are read: cover them, and if the question becomes unanswerable the stem is missing something. Ask one closed, specific question.",
  "Keep every option in the same category — all naming the same KIND of thing, whatever kind the material deals in — and about the same length. The longest, most hedged option must not be the correct one; that is the most common giveaway in real exams.",
  "Build wrong options from mistakes students actually make: what this is routinely confused with, a step out of order, a quantity off by a factor or a unit, the answer to a neighbouring question. Never permutations of the correct answer, never an option nobody would pick.",
  "Never use 'all of the above', 'none of the above', a negative stem ('which is NOT', 'all EXCEPT'), absolutes ('always', 'never'), vague quantifiers ('usually', 'often') in options, or options that overlap.",
  "Vary which position holds the correct answer, never in a cycle. Refer to options by their TEXT, never by letter — the app re-seats them, so 'option B' would become wrong.",
  // 🔴 THE ONE CRITERION THE OWNER ASKED FOR THAT WAS GENUINELY ABSENT (2026-09-03: questions must
  // "vary in difficulty"). Everything above makes each item sound; nothing said the SET has to
  // spread. A paper of nine equally pitched items measures one point on the scale and tells the
  // student nothing about where they actually stand.
  //
  // 🔴 STATED AS THE SHAPE OF AN ITEM, NEVER AS A LABEL ON IT. "Write three easy, four medium and
  // two hard" invites a model to write nine identical items and sort them into three piles. What
  // actually moves difficulty is structural: how many steps sit between the stem and the answer,
  // and how close the nearest wrong option sits to the right one. Both hold for a statute, a
  // loaded beam and an irregular verb alike.
  //
  // 🔴 AND THE LAST SENTENCE IS THE GUARD RAIL, because the easiest way to obey this rule is to
  // cheat it. Vagueness, length and a buried question all make an item harder to ANSWER without
  // making it harder to KNOW, which is precisely the flaw the rules above exist to prevent — it
  // penalises the student who read carefully and rewards the one who guesses.
  "Spread the difficulty across the paper, and make an item hard by its STRUCTURE rather than by its wording: more steps between the stem and the answer, or a nearest wrong option that is a near miss rather than an obvious error. Some items should be answerable by anyone who has read the material once, some should separate a student who can apply it from one who only recognises it, and at least one should make a strong student stop and think. Mix them through the paper rather than climbing from easiest to hardest. Never make an item harder by making it vaguer, longer, or by burying what is being asked.",
  "Give the correct answer and name the specific misunderstanding each wrong option represents, so a miss teaches something.",
  "Never invent a specific to make a situation work — a measurement, a quantity, a date, a named authority. Take every specific from the student's own material, or write the stem so it needs none: an invented specific is indistinguishable from a real one to the student revising from it.",
].join("\n");

/** One-line version for prompts that only have room for a pointer. */
export const EXAM_ITEM_RULES_SHORT =
  "One-best-answer only; a short scenario stem answerable before the options are read; options homogeneous and of similar length with the correct one never the longest; distractors drawn from real student confusions; difficulty spread across the paper and earned by structure, never by vaguer wording; no 'all/none of the above', no negative stems, no absolutes; refer to options by text, never by letter.";
