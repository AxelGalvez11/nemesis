// Everything the model is asked during a research run, in one file so the shapes we promise and
// the parsers that read them cannot drift apart.
//
// 🔴 NOT ONE SUBJECT-MATTER WORD ANYWHERE IN HERE, and that is a rule rather than an accident. The
// engine this replaces told the model it was "a conservative, educational medical-information"
// service and asked it to search "MeSH-style biomedical terminology". Every instruction below is
// about the SHAPE of good research — decompose, search, quote, check — because the same run has to
// serve a question about tort law, one about heat exchangers and one about the Gracchi.
//
// The em-dash rule applies for the same reason it applies on the canvas: a report is Nemesis
// writing, and the owner's rule holds wherever Nemesis appears to be speaking.

const NO_EM_DASH =
  "Never use an em dash. That punctuation mark must not appear anywhere in your output. " +
  "Use a comma, a colon, or a new sentence instead.";

const RESEARCHER =
  "You are Nemesis, researching a question for one learner. The learner may be in any discipline: " +
  "law, engineering, history, nursing, a trade, anything. Never assume a field, and never steer the " +
  "research toward one. Your entire output is the JSON payload requested: no greeting, no commentary. " +
  NO_EM_DASH;

export const planMessages = (question: string) => [
  { content: RESEARCHER, role: "system" as const },
  {
    content:
      `Break this question into the 3 to 5 separate things somebody would have to find out to answer it well.\n\n` +
      `QUESTION: ${question}\n\n` +
      "Each sub-question must be answerable by searching, and the set must not overlap: two sub-questions " +
      "that would return the same pages are one sub-question. Together they should cover the question, " +
      "including the part a careless answer would skip. Write them as plain questions a person would type.\n\n" +
      'Return JSON: {"subQuestions":["…","…","…"]}',
    role: "user" as const,
  },
];

export const queryMessages = (subQuestion: string, count: number) => [
  { content: RESEARCHER, role: "system" as const },
  {
    content:
      `Write ${count} web search queries that would find the best evidence for this:\n\n${subQuestion}\n\n` +
      "Write them the way an expert types into a search engine: the terms of art the field itself uses, " +
      "not a sentence. Make them different from each other, so they reach different pages rather than " +
      "the same page twice. Do not add site: filters or quotation marks.\n\n" +
      'Return JSON: {"queries":["…","…"]}',
    role: "user" as const,
  },
];

/**
 * Pull the facts out of ONE source.
 *
 * 🔴 ONE SOURCE AT A TIME, ON PURPOSE, and it is the difference between a report that can be
 * checked and one that cannot. Handed ten pages at once, a model writes a fact that is true of the
 * batch and traceable to none of them. Handed one page, every fact it writes has exactly one place
 * it could have come from, and that is the page whose text is stored beside it.
 *
 * 🔴 BUT AGAINST THE WHOLE BRIEF, NOT THE ONE SUB-QUESTION THAT FOUND IT. A page is read once and
 * then skipped for the rest of the run, so if it were extracted against only the sub-question whose
 * search happened to surface it first, everything else it knows is thrown away. Measured on a real
 * run: six good pages on heatsinks and natural convection yielded FIVE facts, because the heat-sink
 * article was read only against "what is the convection coefficient" and had little to say about
 * that specifically. Showing it every part of the brief costs nothing extra, since it is the same
 * single call, and it is the difference between a thin report and a usable one.
 */
export const extractMessages = (
  question: string,
  subQuestions: readonly string[],
  title: string,
  url: string,
  passage: string,
  max: number,
) => [
  { content: RESEARCHER, role: "system" as const },
  {
    content:
      `We are researching: ${question}\n\n` +
      `It was broken into these parts:\n${subQuestions.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n\n` +
      `Here is ONE source. Pull out at most ${max} facts from it that genuinely bear on ANY of those parts.\n\n` +
      `TITLE: ${title}\nURL: ${url}\nTEXT:\n${passage}\n\n` +
      "Rules. Take facts only from the TEXT above: if the text does not say it, you do not know it, and " +
      "you must not fill the gap from your own knowledge. Keep every number, name, date and unit exactly " +
      "as the text gives them. Write each fact so it stands alone without the question next to it. " +
      "Prefer the concrete over the general: a number, a name, a mechanism or a condition beats a sentence " +
      "saying the topic is important. If this source genuinely has nothing bearing on any part, return an " +
      "empty list, which is a normal and useful answer.\n\n" +
      'Also suggest up to 2 follow-up questions this source opened up, or an empty list if it opened none.\n\n' +
      'Return JSON: {"facts":["…"],"followUps":["…"]}',
    role: "user" as const,
  },
];

/**
 * Write the report from the pool.
 *
 * The model may only use the numbered facts. It cites by NUMBER, never by naming a source, for the
 * same reason the deck picks figures by number: a citation the model composes itself is a citation
 * nobody minted, and it will look exactly as real as one we did.
 */
export const writeMessages = (question: string, subQuestions: readonly string[], numbered: string) => [
  { content: RESEARCHER, role: "system" as const },
  {
    content:
      `Write the report answering: ${question}\n\n` +
      `It was researched in these parts:\n${subQuestions.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n\n` +
      "Below are the facts that were found. Each has a NUMBER. You may use nothing else: no background " +
      "knowledge, no filling in, no reasonable assumptions.\n\n" +
      `FACTS:\n${numbered}\n\n` +
      "Write:\n" +
      '- "summary": the plain answer to the question, in 2 to 4 sentences, first, before any structure. ' +
      "Answer it directly. If the facts do not settle it, say that plainly instead of implying they do.\n" +
      '- "sections": themed sections, each with a heading and a list of points. Every point cites the fact ' +
      'numbers it was built from in "support". A point with no support is not allowed: if you want to say ' +
      "something the facts do not carry, leave it out.\n" +
      // 🔴 SELF-CONTAINED, BECAUSE POINTS ARE DELETED AFTER THIS IS WRITTEN. Each one is checked
      // against its own sources and removed if it overreaches, so a point opening "Those
      // assumptions…" can lose the sentence it was pointing at and be left dangling in the saved
      // report. Observed on a real run before this line existed.
      "  Each point must make sense on its own, without the point above it: never open with \"this\", " +
      '"those", "it" or "also" referring to a neighbouring point, because any neighbour may be removed ' +
      "before the report is saved.\n" +
      '- "gaps": where the evidence ran out, where sources disagreed, and what somebody would have to look ' +
      "up next. Never leave this empty. A report with no stated gaps reads as more certain than any " +
      "research ever is.\n\n" +
      'Return JSON: {"summary":"…","sections":[{"heading":"…","points":[{"text":"…","support":[1,4]}]}],"gaps":["…"]}',
    role: "user" as const,
  },
];

/**
 * The gate: does this sentence's cited passage actually say it?
 *
 * 🔴 THE QUESTION IS SUPPORT, NOT TRUTH, and the difference is worth being exact about. A page can
 * assert something false in its own prose and a claim quoting it faithfully will pass here. What
 * this catches is the failure that matters more and happens more: a sentence that drifted away from
 * its evidence while being written, which is where a confident, wrong, well-cited report comes from.
 */
export const checkMessages = (point: string, passages: string) => [
  { content: RESEARCHER, role: "system" as const },
  {
    content:
      "Below is a sentence from a report, and the source passages it was built from.\n\n" +
      `SENTENCE: ${point}\n\nPASSAGES:\n${passages}\n\n` +
      "Does the sentence say only what these passages support? Answer no if it states a number, a name, " +
      "a date or a certainty the passages do not carry, if it generalises past what they say, or if it " +
      "joins two passages into a claim neither one makes. Do not use your own knowledge of the subject: " +
      "a true sentence the passages do not support is still a no.\n\n" +
      'Return JSON: {"supported":true,"why":"…"}',
    role: "user" as const,
  },
];
