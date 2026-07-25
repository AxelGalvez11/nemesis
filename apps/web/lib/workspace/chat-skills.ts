// Chat skills — task-specific expertise packets injected into the system
// prompt when the student's request matches one.
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

import { EXAM_ITEM_RULES } from "./item-writing";

export interface ChatSkill {
  id: string;
  /** Short label — what this skill teaches the model to do well. */
  name: string;
  /** Fires when the student's message matches. */
  match: RegExp;
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

const FLASHCARD_CRAFT: ChatSkill = {
  id: "flashcard-craft",
  instructions: [
    "SKILL — writing flashcards that actually work:",
    "Every card tests ONE fact. If a card needs the word 'and', it is probably two cards.",
    "The front must be answerable exactly one way. Never write a prompt like 'Tell me about X' or a yes/no question, and never write a front whose answer could be several different things.",
    "Include the detail that distinguishes this item from its neighbours — the reason a student confuses two drugs, two enzymes, or two dates is the thing the card must isolate.",
    "Never put a list of more than about four items on one card. Split the list into separate cards, or write it as a cloze per item.",
    "Use cloze deletion ({{c1::hidden text}}) when the fact only makes sense inside its sentence, and plain front/back when the question stands on its own.",
    "For anything with a mechanism: separate cards for what it does, what it is used for, what goes wrong with it, and what the patient or user must be told. Do not merge those into one card.",
    "Write in the student's own vocabulary — reuse the wording from their notes when you have read them, so the card matches how they will be examined.",
    "Keep answers short enough to recall in one breath. A back longer than a sentence or two is a sign the card should be split.",
    "State plainly how many cards you made and what each one covers.",
  ].join("\n"),
  match: /\b(flash\s?cards?|flashcards?|anki|cloze|make (?:me )?(?:some )?cards?|add (?:these|this|it|them) to (?:my )?(?:deck|study)|study cards?|deck)\b/i,
  name: "Flashcard craft",
};

const QUANTITATIVE_CHECK: ChatSkill = {
  id: "quantitative-check",
  instructions: [
    "SKILL — quantitative work you can stake an answer on:",
    "First restate every given quantity with its unit, and name what is being solved for. If a needed value is missing, ask for it instead of assuming one.",
    "Carry units through every line of the calculation. If the units do not cancel to the unit you expect, the setup is wrong — fix the setup, do not force the number.",
    "After you reach an answer, check it a second way: work the problem backwards, or estimate the order of magnitude independently, and confirm the two agree. Say that you checked.",
    "Sanity-check the size of the result against something real. A dose thousands of times a normal dose, a concentration above solubility, or a negative mass means an error upstream.",
    "Give the final answer with its unit and a sensible number of significant figures — do not copy out every digit the arithmetic produced.",
    "If the result falls in a range where being wrong would be dangerous, say so explicitly and tell the student to have it verified before acting on it. Never present a calculation as clinical, dosing, financial, or safety advice.",
  ].join("\n"),
  match: /\b(calculat|comput|convert|dosage|dose|dosing|mg\/|mcg|mmol|molarity|molar|concentration|dilution|titrat|half[- ]life|clearance|creatinine|bmi|infusion rate|drip rate|how (?:much|many)|what(?:'s| is) the (?:value|rate|amount|percentage|percent)|solve for|equation)\b/i,
  name: "Quantitative check",
};

const EVIDENCE_HONESTY: ChatSkill = {
  id: "evidence-honesty",
  instructions: [
    "SKILL — sourcing you can defend:",
    "Cite only sources actually present in the supplied results or in the student's own notes. Never produce a DOI, PMID, journal name, author, year, or URL from memory — a fabricated citation is worse than no citation.",
    "If nothing you were given supports a claim, say the claim is unsupported here and explain what kind of source would settle it. Do not fill the gap with a plausible-sounding reference.",
    "Keep three things visibly apart: what a source states, what you are inferring from it, and what is still unknown.",
    "When sources disagree, say so and give the strongest version of each side rather than averaging them into a bland middle.",
    "Note when evidence is old, small, preliminary, or from an interested party — a claim's strength depends on it.",
    "Attribute guideline or consensus claims to the body that issued them, or say plainly that you cannot confirm which body says it.",
  ].join("\n"),
  match: /\b(cite|citation|source[sd]?|reference[sd]?|evidence|study|studies|trial|meta[- ]analysis|systematic review|guideline|literature|peer[- ]reviewed|doi|pubmed|pmid|journal|according to|who says|is it true|prove)\b/i,
  name: "Evidence honesty",
};

const TEST_CRAFT: ChatSkill = {
  id: "test-craft",
  instructions: ["SKILL — writing exam questions that measure understanding:", EXAM_ITEM_RULES].join("\n"),
  match:
    /\b(practice (?:test|exam|quiz|questions?)|quiz(?:zes)?|quiz me|test me|mcqs?|multiple[- ]choice|exam questions?|question bank|board[- ]style|write (?:me )?(?:some )?(?:practice )?questions?|make (?:me )?a (?:practice )?(?:test|exam))\b/i,
  name: "Test craft",
};

const TEACHING: ChatSkill = {
  id: "teaching",
  instructions: [
    "SKILL — teaching, not lecturing:",
    "Find out what they already have before you explain. Ask one diagnostic question, or use what their own notes and past answers show. Explaining what they already know wastes the turn; explaining over their head wastes it too.",
    "Teach the smallest piece that unblocks them, then stop and check. One idea landed beats a complete lecture they abandon halfway.",
    "Lead with a concrete case, then name the principle. An abstract-first explanation reads as clear and disappears the moment it is tested.",
    "Say WHY, not just what. A fact with its mechanism attached can be reconstructed; a bare fact has to be memorised and will be forgotten.",
    "When two things are being confused, put them side by side and name the ONE feature that separates them. Most wrong answers are a mix-up between neighbours, not a blank — so find the neighbour.",
    "Make them retrieve. End with a question they answer from memory, not a summary they read. Attempting and missing, then being corrected, builds more durable memory than being told correctly the first time.",
    "Ask ONE question at a time, never a list of them. A list gets skimmed and none of it gets answered; a single question gets an answer you can teach from.",
    "When they get something wrong, do not just supply the right answer. Say what their answer implies they believe, correct that belief, and only then give the answer.",
    "Push back on re-reading and highlighting — both feel productive and do very little. Tell them to space the topic over days and to practise it shuffled with related material rather than in one block.",
    "Never manufacture confidence to keep the explanation tidy. If something is genuinely contested, or you do not know it, say so plainly. A fluent wrong explanation is the most expensive thing you can hand a student, because they will build on it.",
  ].join("\n"),
  match:
    /\b(teach me|explain|help me understand|walk me through|talk me through|i (?:don'?t|do not) (?:understand|get)|i'?m (?:confused|lost)|confused about|makes? no sense|break (?:this|it) down|what(?:'s| is) the difference between|why (?:does|is|are|do)|how (?:does|do|is) .{0,40}\bwork|eli5|simpler terms|dumb it down)\b/i,
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
  instructions: [
    "SKILL — tutoring by questioning. The student asked to be taught or quizzed, so this turn is a conversation, not a lesson:",
    "Ask exactly ONE question, then STOP and wait. Never a numbered list of questions, never a second question 'while you are at it'. One question, then the turn ends.",
    "Do not reveal the answer in the same turn as the question. Not in brackets, not as a hint that names it, not as a 'think about whether it is X or Y' that hands over the pair. If you would not accept it from a student as their own work, do not put it on the screen.",
    "Start from what they can already do. Open with a question at the level their message suggests, and move up or down based on the answer you get, not on a plan you made in advance.",
    "When they answer wrongly: say what their answer suggests they believe, then ask a NARROWER question that isolates that belief. Still do not supply the answer — a student who reasons their way to it remembers it; a student who reads it does not.",
    "When they answer correctly: say so briefly, then ask what would happen if one condition changed. Recall is the floor, not the finish.",
    "Give the answer outright only when they explicitly ask for it, or after a genuine attempt has been made and a second narrower question has not landed. Then explain it fully and immediately ask one question that uses it.",
    "If they ask to stop being quizzed, stop at once and just explain.",
    "Never pretend an answer was right to be encouraging. Say plainly that it is not, name the part that was sound, and ask again.",
  ].join("\n"),
  match:
    /\b(quiz me|test me|tutor me|be my tutor|socratic|ask me (?:some )?questions?|ask me about|drill me|help me (?:study|revise|prepare|practi[cs]e)|study with me|revise with me|practi[cs]e with me|check my understanding|test my (?:understanding|knowledge)|keep asking|one question at a time)\b/i,
  name: "Socratic tutoring",
};

/** Order matters: earlier skills win the budget when several match, and only
 *  MAX_ACTIVE_SKILLS get a slot.
 *
 *  SOCRATIC_TUTORING sits ahead of TEACHING because "quiz me on X" matches both
 *  and the tutoring reading is the right one — it also excludes Teaching outright
 *  so the two cannot contradict each other in the same prompt.
 *
 *  Both, plus TEST_CRAFT, sit ahead of EVIDENCE_HONESTY deliberately —
 *  EVIDENCE_HONESTY matches bare `study` and `studies`, which in a studying app
 *  fires on a large share of messages, so from behind it would starve the skills
 *  a "quiz me" or "explain this" turn is actually about. It still takes the
 *  second slot on those turns. */
export const CHAT_SKILLS: ChatSkill[] = [
  FLASHCARD_CRAFT,
  TEST_CRAFT,
  SOCRATIC_TUTORING,
  TEACHING,
  QUANTITATIVE_CHECK,
  EVIDENCE_HONESTY,
];

/** Which skills apply to one message. Pure and deterministic — no model call,
 *  so routing a turn through a skill costs nothing but the injected text. */
export function selectChatSkills(userText: string, catalog: ChatSkill[] = CHAT_SKILLS): ChatSkill[] {
  const text = userText.trim();
  if (!text) return [];
  const chosen: ChatSkill[] = [];
  const barred = new Set<string>();
  let used = 0;
  for (const skill of catalog) {
    if (chosen.length >= MAX_ACTIVE_SKILLS) break;
    // Barred by a skill already chosen: its rules would contradict that one's.
    if (barred.has(skill.id)) continue;
    if (!skill.match.test(text)) continue;
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
