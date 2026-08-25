// Chat skills — task-specific expertise packets injected into the system
// prompt when the turn calls for one.
//
// 🔴 WHICH ONES RIDE IS DECIDED BY THE MODEL (chat-intent.ts), NOT BY A REGEX. Each skill used to
// carry its own `match: RegExp`, and selectChatSkills walked the catalog testing them against the
// student's message. That made a word list the author of Nemesis's personality: "explain" anywhere
// in a sentence handed over the entire Teaching packet, "quiz me" handed over Socratic tutoring,
// and "I have no clue, bruh" handed over nothing at all, because it contains none of the words a
// student in trouble is assumed to use. What remains here is the craft itself plus the limits
// (MAX_ACTIVE_SKILLS, SKILL_CHAR_BUDGET, `excludes`), which are facts about our prompt budget
// rather than readings of what somebody meant.
//
// Why: a frontier model carries this craft internally; a cheaper model has to
// be told. Spelling out the procedure is what closes most of the quality gap,
// and it costs nothing but prompt tokens.
//
// Cost discipline (the reason this is a matcher, not a bigger base prompt):
// universal rules live in CHAT_SYSTEM_PROMPT and ride every turn for free.
// Only these heavy domain packets are conditional, at most MAX_ACTIVE_SKILLS
// per turn and bounded by SKILL_CHAR_BUDGET, so a matched turn adds roughly a
// thousand tokens — never an open-ended prompt.


export interface ChatSkill {
  id: string;
  /** Short label — what this skill teaches the model to do well. */
  name: string;
  /**
   * When this skill applies, in one line, written for the model that chooses.
   *
   * 🔴 THIS REPLACED A RegExp, and the replacement is the point. A regex per skill meant a message
   * containing the word "explain" received the entire Teaching packet whether or not the student
   * wanted teaching, and a student who wrote "I have no clue, bruh" received nothing, because that
   * sentence contains none of the words. The regex was deciding which personality the model got.
   *
   * Written as a CONDITION, not as a keyword list: "the student wants something explained" holds
   * for a law student and a machinist alike, where any list of trigger words never will.
   */
  when: string;
  /** The procedure, written as instructions to the model. */
  instructions: string;
  /** Ids this skill must never share a turn with, because their instructions
   *  contradict each other. Two packets telling the model both to explain
   *  clearly and to withhold the answer produce whichever it prefers, which is
   *  the same as having neither rule. Only the EARLIER skill in the catalog gets
   *  to exclude — see selectChatSkills. */
  excludes?: string[];
}

/** Never stack more than this many packets on one turn. */
export const MAX_ACTIVE_SKILLS = 2;
/** Hard ceiling on injected characters, whatever matched.
 *
 *  Raised from 4,000 on 2026-07-24. The share below is what a single packet may
 *  occupy, and at 4,000 the exam item-writing rules had already reached it — so
 *  the next rule worth adding (answer positions must vary) pushed `test-craft`
 *  past its share, where selectChatSkills would drop it silently. The ceiling
 *  was forcing worse instructions rather than saving anything meaningful: 1,000
 *  extra characters is roughly 250 tokens on the turns that match at all, which
 *  is nothing against a turn already carrying the conversation and often several
 *  thousand characters of the student's own notes. */
export const SKILL_CHAR_BUDGET = 5_000;
/** The share one packet may occupy. selectChatSkills SKIPS an oversized packet
 *  silently (`continue`, not a throw), so a skill written past this ceiling
 *  would vanish whenever it matched alongside another one — a bug that looks
 *  like "the model ignored the instruction". Held by a test over the catalog. */
export const SKILL_CHAR_SHARE = SKILL_CHAR_BUDGET / MAX_ACTIVE_SKILLS;

const QUANTITATIVE_CHECK: ChatSkill = {
  id: "quantitative-check",
  when: "the turn contains a calculation, a conversion, a dose, a rate, or any number that has to come out right",
  instructions: [
    "SKILL: quantitative work you can stake an answer on:",
    "First restate every given quantity with its unit, and name what is being solved for. If a needed value is missing, ask for it instead of assuming one.",
    "Carry units through every line of the calculation. If the units do not cancel to the unit you expect, the setup is wrong, fix the setup, do not force the number.",
    "After you reach an answer, check it a second way: work the problem backwards, or estimate the order of magnitude independently, and confirm the two agree. Say that you checked.",
    "Sanity-check the size of the result against something real. A dose thousands of times a normal dose, a concentration above solubility, or a negative mass means an error upstream.",
    "Give the final answer with its unit and a sensible number of significant figures, do not copy out every digit the arithmetic produced.",
    "If the result falls in a range where being wrong would be dangerous, say so explicitly and tell the student to have it verified before acting on it. Never present a calculation as clinical, dosing, financial, or safety advice.",
  ].join("\n"),
  name: "Quantitative check",
};

const EVIDENCE_HONESTY: ChatSkill = {
  id: "evidence-honesty",
  when: "the answer will rest on sources, studies, guidelines or citations, and getting the attribution right matters",
  instructions: [
    "SKILL: sourcing you can defend:",
    "Cite only sources actually present in the supplied results or in the student's own notes. Never produce a DOI, PMID, journal name, author, year, or URL from memory, a fabricated citation is worse than no citation.",
    "If nothing you were given supports a claim, say the claim is unsupported here and explain what kind of source would settle it. Do not fill the gap with a plausible-sounding reference.",
    "Keep three things visibly apart: what a source states, what you are inferring from it, and what is still unknown.",
    "When sources disagree, say so and give the strongest version of each side rather than averaging them into a bland middle.",
    "Note when evidence is old, small, preliminary, or from an interested party, a claim's strength depends on it.",
    "Attribute guideline or consensus claims to the body that issued them, or say plainly that you cannot confirm which body says it.",
  ].join("\n"),
  name: "Evidence honesty",
};

const TEACHING: ChatSkill = {
  id: "teaching",
  when: "the student wants something explained, or has said in any words that they do not follow it, including frustration, giving up, or saying it makes no sense",
  instructions: [
    "SKILL: teaching, not lecturing:",
    "Find out what they already have before you explain. Ask one diagnostic question, or use what their own notes and past answers show. Explaining what they already know wastes the turn; explaining over their head wastes it too.",
    "Teach the smallest piece that unblocks them, then stop and check. One idea landed beats a complete lecture they abandon halfway.",
    "Lead with a concrete case, then name the principle. An abstract-first explanation reads as clear and disappears the moment it is tested.",
    "Say WHY, not just what. A fact with its mechanism attached can be reconstructed; a bare fact has to be memorised and will be forgotten.",
    "When two things are being confused, put them side by side and name the ONE feature that separates them. Most wrong answers are a mix-up between neighbours, not a blank, so find the neighbour.",
    "Make them retrieve. End with a question they answer from memory, not a summary they read. Attempting and missing, then being corrected, builds more durable memory than being told correctly the first time.",
    "Ask ONE question at a time, never a list of them. A list gets skimmed and none of it gets answered; a single question gets an answer you can teach from.",
    "When they get something wrong, do not just supply the right answer. Say what their answer implies they believe, correct that belief, and only then give the answer.",
    "Push back on re-reading and highlighting, both feel productive and do very little. Tell them to space the topic over days and to practise it shuffled with related material rather than in one block.",
    "Never manufacture confidence to keep the explanation tidy. If something is genuinely contested, or you do not know it, say so plainly. A fluent wrong explanation is the most expensive thing you can hand a student, because they will build on it.",
  ].join("\n"),
  name: "Teaching",
};

// TUTORING, as distinct from explaining (owner 2026-07-24: teach better by
// "asking one question at a time and not showing the answer").
//
// Why this is its own skill and not more rules inside TEACHING. The two are
// genuinely different jobs, and running them together would be worse than either
// alone. "Explain how ACE inhibitors work" deserves an explanation — a model that
// answered that with a question would be infuriating, and TEACHING is right to
// explain. But "quiz me on ACE inhibitors" is a request to be TESTED, and there
// the answer has to be withheld or the whole exercise collapses: reading the
// answer feels like learning and produces almost none, which is the single
// best-established finding in the study-skills literature.
//
// So this fires only on an explicit ask to be tutored or quizzed, and when it
// does it EXCLUDES Teaching (see `excludes`) — otherwise the model would receive
// "explain it clearly" and "do not reveal the answer" in the same breath and pick
// whichever it liked.
//
// Kept deliberately short. A packet over SKILL_CHAR_SHARE is silently dropped
// when it pairs with another skill, which reads as the model ignoring the
// instruction — pinned by the catalog test.
const SOCRATIC_TUTORING: ChatSkill = {
  excludes: ["teaching"],
  id: "socratic-tutoring",
  when: "the student asked to be quizzed, drilled or tutored, meaning they want to be asked questions rather than told answers",
  instructions: [
    "SKILL: tutoring by questioning. The student asked to be taught or quizzed, so this turn is a conversation, not a lesson:",
    "Ask exactly ONE question, then STOP and wait. Never a numbered list of questions, never a second question 'while you are at it'. One question, then the turn ends.",
    "Do not reveal the answer in the same turn as the question. Not in brackets, not as a hint that names it, not as a 'think about whether it is X or Y' that hands over the pair. If you would not accept it from a student as their own work, do not put it on the screen.",
    "Start from what they can already do. Open with a question at the level their message suggests, and move up or down based on the answer you get, not on a plan you made in advance.",
    "When they answer wrongly: say what their answer suggests they believe, then ask a NARROWER question that isolates that belief. Still do not supply the answer, a student who reasons their way to it remembers it; a student who reads it does not.",
    "When they answer correctly: say so briefly, then ask what would happen if one condition changed. Recall is the floor, not the finish.",
    "Give the answer outright only when they explicitly ask for it, or after a genuine attempt has been made and a second narrower question has not landed. Then explain it fully and immediately ask one question that uses it.",
    "If they ask to stop being quizzed, stop at once and just explain.",
    "Never pretend an answer was right to be encouraging. Say plainly that it is not, name the part that was sound, and ask again.",
  ].join("\n"),
  name: "Socratic tutoring",
};

/** A syllabus is not a lecture: its value is its DATES, not its concepts, so it
 *  excludes LECTURE_INTAKE outright rather than letting both packets argue over
 *  whether to mine concepts or offer a calendar import. */
const SYLLABUS_INTAKE: ChatSkill = {
  id: "syllabus-intake",
  when: "a syllabus or course schedule is in play and its DATES are the point",
  instructions: [
    "SKILL: a syllabus or course schedule the student uploaded:",
    "What matters in this document is its DATES. Read every dated item: exams, quizzes, assignment and project deadlines, presentations, rotations, and recurring class meetings.",
    "Do NOT list the dates in your reply, not as a table, not as bullets (owner 2026-07-28). Say only how many dated items you found and the range they span, e.g. 'I found 14 dated items, from Aug 26 to Dec 12.'",
    "Take every date from the document itself. Never guess a year, if it says a bare 'Oct 14', use the year the surrounding schedule implies and say which year you assumed.",
    "THEN ask, in these words: 'Want me to add these to your calendar?' Stop and wait. Write nothing until they say yes. Asking first is what stops thirty events appearing unannounced; it is the count they are approving, not a list.",
    "When they agree, call add_calendar_event for every item, issuing the calls together in one round rather than one date per reply. Put the line each date came from in that event's note, so the student can check it against their own copy IN THE CALENDAR rather than in the chat.",
    "Classify each one: exam for tests, assignment for anything due, rotation for placements, class for recurring meetings, other for the rest.",
    "Afterwards write ONE short line, 'I've put the events into your calendar.': plus a second line only if something could not be added.",
  ].join("\n"),
  name: "Syllabus intake",
  excludes: ["lecture-intake"],
};

/** Reading uploaded course material.
 *
 *  This one matches on the ATTACHMENT BLOCK rather than on anything the student
 *  typed, which works because prepareChatAttachments' wireText — headers and all
 *  — is what reaches selectChatSkills. So it fires on a bare upload with no
 *  message, which is exactly how students attach a deck.
 *
 *  It sits BEHIND the builder skills on purpose: if the student already said
 *  "make flashcards from this", that instruction should win the first slot and
 *  this packet must not ask them again — hence the last line. */
const LECTURE_INTAKE: ChatSkill = {
  id: "lecture-intake",
  when: "the student attached course material such as slides, a lecture or a reading, and wants it read and mined for what matters",
  instructions: [
    "SKILL: reading uploaded course material, and what to do next:",
    "The student attached course material. Do NOT summarise it slide by slide and do not narrate what each page contains. Mine it for what is worth learning.",
    "Lead with the learning objectives. If the material states them, quote them as given. If it does not, infer what the student should be able to DO after this material and say plainly that you inferred them.",
    "Then pull only what is examinable: definitions, mechanisms, classifications, numbers with their units, named entities with the detail that distinguishes them from the ones they get confused with, decision rules, and worked examples.",
    "Drop the fluff: title and outline pages, 'any questions', acknowledgements, course admin, reference lists, and any page that only restates another.",
    "Call out the figures, diagrams, and tables the student must be able to read, and say what each one is FOR. If a figure was described to you rather than shown, say so rather than inventing its contents.",
    "If a truncation notice says part of the file did not reach you, say so plainly. Never imply you read all of it.",
    // 🔴 THE CLOSING OFFER IS GONE, AND ITS ABSENCE IS THE FIX. It ended every upload with "Want me
    // to turn this into notes, flashcards, a practice test, or all three?" — three things the chat
    // can no longer make, because Study and Library-as-files are surfaces the product does not have.
    // An offer the model cannot keep is worse than no offer: the student says "all three" and gets
    // an apology, or worse, a claim that something was saved.
    "Do NOT end by offering to turn this into notes, flashcards or a practice test. Finish on the material itself: what it is for, and what is worth doing with it next.",
  ].join("\n"),
  name: "Lecture intake",
};

/** Order breaks ties, and only ties: a model that asks for three skills gets the first
 *  MAX_ACTIVE_SKILLS of them in this order, and something has to decide which two.
 *
 *  SOCRATIC_TUTORING sits ahead of TEACHING because a turn that is genuinely both is a tutoring
 *  turn, and it excludes Teaching outright so the two cannot contradict each other in one prompt.
 *  EVIDENCE_HONESTY sits last because it is the widest packet here: it improves almost any answer
 *  slightly, and from the front it would crowd out the skill a turn is actually about. */
export const CHAT_SKILLS: ChatSkill[] = [
  SYLLABUS_INTAKE,
  LECTURE_INTAKE,
  SOCRATIC_TUTORING,
  TEACHING,
  QUANTITATIVE_CHECK,
  EVIDENCE_HONESTY,
];

/**
 * Which of the skills the model asked for actually ride this turn.
 *
 * 🔴 THE MODEL CHOOSES, THIS FUNCTION ENFORCES. It picks by meaning (see chat-intent.ts); the
 * limits below are facts about our prompt budget and about which packets contradict each other,
 * which is not something a model reading one message can know. An id that is not in the catalog is
 * dropped silently: a model naming a skill that does not exist costs the turn some craft, and
 * failing the turn over it would cost the answer.
 *
 * Catalog ORDER still breaks ties, exactly as before, because only MAX_ACTIVE_SKILLS get a slot
 * and something has to decide which. It no longer decides WHETHER a skill is relevant.
 */
export function selectChatSkills(requested: readonly string[], catalog: ChatSkill[] = CHAT_SKILLS): ChatSkill[] {
  const wanted = new Set(requested);
  if (wanted.size === 0) return [];
  const chosen: ChatSkill[] = [];
  const barred = new Set<string>();
  let used = 0;
  for (const skill of catalog) {
    if (chosen.length >= MAX_ACTIVE_SKILLS) break;
    // Barred by a skill already chosen: its rules would contradict that one's.
    if (barred.has(skill.id)) continue;
    if (!wanted.has(skill.id)) continue;
    const cost = skill.instructions.length;
    if (used + cost > SKILL_CHAR_BUDGET) continue;
    chosen.push(skill);
    used += cost;
    for (const excluded of skill.excludes ?? []) barred.add(excluded);
  }
  return chosen;
}

/** The single system message carrying the matched skills, or "" for none. */
export function buildSkillMessage(skills: ChatSkill[]): string {
  if (skills.length === 0) return "";
  return skills.map((skill) => skill.instructions).join("\n\n");
}
