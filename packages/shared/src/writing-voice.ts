// How Nemesis writes.
//
// Owner 2026-07-29: "it needs to sound natural, simple technical English."
//
// WHY THIS IS NOT A CHAT SKILL. The skill catalog (apps/web/lib/workspace/
// chat-skills.ts) is CONDITIONAL: a packet fires only when the student's message
// matches its regex, at most MAX_ACTIVE_SKILLS ride any turn, and an oversized
// one is dropped silently. Voice is not a topic — it applies to every sentence
// the product writes, including the turns where two domain skills already hold
// both slots. So it belongs in the system prompt, always on.
//
// WHY IT LIVES IN packages/shared. The web prompt and the phone prompt are two
// separate strings in two separate apps, and this session already shipped a fix
// for exactly that shape of bug — the phone and the browser reading one database
// two different ways. A voice rule that exists on one surface and not the other
// is the same failure wearing different clothes.
//
// SOURCE. The concrete tells come from Wikipedia's "Signs of AI writing"
// (en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing, read 2026-07-29), an
// editor-maintained list of what machine-written prose actually looks like in
// the wild. It is used here as a catalogue of habits to avoid, not as a style
// guide to imitate.
//
// KEEP IT SHORT. This rides EVERY turn on both surfaces, so every sentence added
// here is paid for on every message forever. Rules are stated as behaviour, not
// as explanation — the model does not need the reasoning, only the instruction.
// Bans are given with the replacement, because "avoid X" without "write Y
// instead" reliably produces a thesaurus swap rather than plainer prose.

/**
 * The always-on voice rules, appended to the system prompt on web and mobile.
 *
 * Written as one paragraph rather than a bulleted list on purpose: a bulleted
 * instruction block is itself one of the tells, and a model shown a list of
 * bullets tends to answer in bullets.
 */
export const WRITING_VOICE =
  "HOW TO WRITE. Use simple, direct technical English. Short sentences. Say the thing, then explain it. " +
  "Prefer the plain word: use, not utilize; help, not facilitate; about, not regarding; so, not thus; " +
  "start, not commence; enough, not sufficient. Say 'is' and 'are' — do not dodge into 'serves as', " +
  "'stands as', 'functions as', or 'represents'. " +
  // The vocabulary list is the single highest-signal item on the Wikipedia page:
  // these words cluster in machine-written text far more than in human prose.
  "Never use: delve, tapestry, testament, pivotal, crucial, intricate, meticulous, underscore, showcase, " +
  "boast, garner, bolster, vibrant, seamless, robust, leverage, foster, landscape, realm, embark, harness, " +
  "unlock, elevate, empower, groundbreaking, renowned, nestled, multifaceted, holistic, nuanced, " +
  "ever-evolving, rich history, plays a vital role, stands as a testament. " +
  // Sentence-shape tells. These survive a vocabulary swap, so they are named
  // separately from the word list.
  "Never write 'not just X, but Y', 'it's not X, it's Y', or 'not only X but also Y' — say what it is and stop. " +
  "Do not reach for three examples when one is right; a list of three is a habit, not a length. " +
  "Do not end a sentence with a trailing '-ing' clause that adds nothing ('highlighting its importance', " +
  "'underscoring the need for', 'reflecting a broader shift'). " +
  // Structure and punctuation tells.
  "Do not restate the question before answering it, and do not close with a paragraph that summarises what " +
  "you just said. Do not bold every key term — bold is for the one thing that matters, or nothing. " +
  "Write headings in sentence case, not Title Case. Use at most one dash per paragraph. Never use emoji. " +
  // Honesty tells, which matter more here than anywhere: this is a study tool.
  "Do not inflate significance — no 'marks a turning point', 'is essential to understanding', 'has become " +
  "increasingly important'. Never attribute a claim to 'experts', 'studies', or 'research' without naming " +
  "the actual source; if you cannot name it, say you are not sure. Say 'I don't know' in those words when " +
  "you do not know, and never pad a thin answer to make it look thorough. " +
  // The hedge-then-guess move. Named separately from "don't fabricate" because it
  // is not experienced as fabrication: the sentence admits a gap and then fills
  // it anyway, which is the hardest version for a student to catch.
  "Never hedge and then guess — no 'details are limited, but this likely...'. If you don't have it, stop there. " +
  // Chatbot furniture. Worth the characters because on a save turn this text ends
  // up inside a file the student keeps.
  "No 'Certainly', no 'Great question', no 'I hope this helps', no offering to expand. " +
  // Placeholders reaching a saved artifact are the one tell that is pure
  // embarrassment rather than a matter of taste.
  "Never leave a placeholder like '[insert date]' or 'XX' in anything you write.";

/** Rough character cost of carrying these rules on one turn, exported so a test
 *  can hold the ceiling: this text is paid for on EVERY message on BOTH
 *  surfaces, so it earns its length or it gets cut. */
export const WRITING_VOICE_MAX_CHARS = 2_200;
