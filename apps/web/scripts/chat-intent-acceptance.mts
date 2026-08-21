// Does the model actually read these the way a student means them? Run it and find out.
//
// 🔴 WHY THIS EXISTS. Sessions chat used to decide what a turn was with about 700 lines of regex,
// and roughly a hundred assertions pinned the phrasings those regexes had to get right. Every one
// of them came from a real student hitting a real bug:
//
//   · "create a test on brand generic of top 100 drugs" wrote the whole test into the chat, because
//     SAVE_ARTIFACT knew "practice test" and nobody types that.
//   · "Add an exam called ... on 2026-09-15" answered "I can't add events to your calendar from
//     this environment", because every workspace rule matched a request to READ and none matched a
//     request to CREATE.
//   · "my class on Tuesday is cancelled" carried no workspace intent at all, because `classes?`
//     means "classe" plus an optional s and never matches the singular.
//   · a one-word "flashcards" answering our own offer went out tool-less and the model wrote
//     "[Calling tool: add_flashcards ...]" as prose, reporting 14 cards saved to a deck that does
//     not exist.
//
// The regexes are gone (see lib/workspace/chat-intent.ts). The phrasings are not: they are still
// the best evidence anyone has about what students type. But an assertion against a model is not a
// unit test — it needs the network, it costs money, and the model can reasonably disagree with a
// label a person wrote down. So they live here, and this reports rather than gates.
//
//   DEEPSEEK_API_KEY=... npx tsx scripts/chat-intent-acceptance.mts
//   pnpm --filter @nemesis/web chat-intent
//
// With no key it reports every case as SKIP and exits 0. This runs in environments that have no
// credential on purpose, and a red build there would teach people to ignore it.
//
// 🔴 IT EXITS NON-ZERO ONLY ON A **TOOLS** MISS. Getting `mode` wrong costs an answer some depth.
// Getting `workspace` wrong is the difference between saving a deck and lying about having saved
// one, which is the failure every incident above actually was. So a wrong workspace fails the run
// and a wrong mode is reported and counted.

import { intentMessages, readChatIntent, type ChatIntent, type IntentExchange } from "../lib/workspace/chat-intent";

const KEY = process.env.DEEPSEEK_API_KEY ?? "";
const BASE = process.env.DEEPSEEK_BASE ?? "https://api.deepseek.com";

interface Case {
  /** What the student typed. */
  ask: string;
  /** The conversation it lands in. Usually empty; the acceptance cases need it. */
  history?: IntentExchange[];
  /** Files on the turn, by name. */
  attachments?: string[];
  /** What must be true, or the run fails. Tools live or die on this. */
  workspace: ChatIntent["workspace"];
  /** What we expect, reported rather than enforced. */
  mode?: ChatIntent["mode"];
  needsWeb?: boolean;
  /** Skills that must be among those chosen. */
  skills?: string[];
  /** Why this case is in the file. */
  note: string;
}

const CASES: Case[] = [
  // ── saves: the tools must ride, or the student is told a lie ───────────────
  { ask: "make me flashcards on beta blockers", note: "the canonical save", workspace: "write" },
  {
    ask: "create a test on brand generic of top 100 drugs",
    note: "owner 2026-07-28: dumped into chat, because SAVE_ARTIFACT only knew 'practice test'",
    workspace: "write",
  },
  { ask: "create a quiz on the krebs cycle", note: "a bare quiz is still a save", workspace: "write" },
  { ask: "build an exam for pharmacology", note: "a bare exam is still a save", workspace: "write" },
  { ask: "turn this into a mind map", note: "the artifact is named, the verb is a transform", workspace: "write" },
  { ask: "add these to my deck", note: "no artifact noun at all, only their deck", workspace: "write" },
  { ask: "save this as a note", note: "ambiguous noun, anchored to their Library", workspace: "write" },
  {
    ask: "Add an exam called Pharmacology Final on 2026-09-15 from 13:30 to 14:30.",
    note: "owner 2026-08-05: answered 'I can't add events to your calendar from this environment'",
    workspace: "write",
  },
  { ask: "schedule a lab for Friday at 2pm", note: "same shape, different verb", workspace: "write" },
  { ask: "rename this note", note: "a change to something of theirs is a write", workspace: "write" },

  // ── reads: same tools, same consequence ────────────────────────────────────
  { ask: "what's due this week", mode: "conversation", note: "the plainest calendar read", workspace: "read" },
  { ask: "what do I have tomorrow", note: "no possessive, no product noun", workspace: "read" },
  {
    ask: "my class on Tuesday is cancelled",
    note: "found in production: `classes?` never matches the singular 'class'",
    workspace: "read",
  },
  { ask: "Show me what I need to study.", note: "owner acceptance case 7: answered with lecture text instead", workspace: "read" },
  { ask: "organize my library", note: "a tidy verb aimed at a container of theirs", workspace: "read" },
  { ask: "show me recent lectures", note: "lost its tools to the news word 'recent'", workspace: "read" },
  { ask: "get me ready for Exam 2", note: "planning against a real dated thing", workspace: "read" },
  { ask: "am I behind on anything", note: "no workspace noun whatsoever", workspace: "read" },
  { ask: "what did I upload last week", note: "a Library read phrased as memory", workspace: "read" },

  // ── the ones that must NOT steal the tools ─────────────────────────────────
  { ask: "explain how beta blockers work", mode: "learning", note: "ordinary teaching", skills: ["teaching"], workspace: "none" },
  { ask: "help me prepare for my test", note: "studying FOR a test is not creating one", workspace: "none" },
  { ask: "quiz me on the top 100 drugs", note: "a request to BE quizzed, not for a saved artifact", skills: ["socratic-tutoring"], workspace: "none" },
  { ask: "write a test for this function", mode: "learning", note: "the programming sense of test", workspace: "none" },
  { ask: "generate unit tests for the parser", mode: "learning", note: "same, and a create verb walks straight into it", workspace: "none" },
  { ask: "how do I make good flashcards?", note: "a question ABOUT the artifact, not a request FOR one", workspace: "none" },
  { ask: "make a table comparing ACE inhibitors and ARBs", note: "writing, not filing", workspace: "none" },
  { ask: "create a mnemonic for the cranial nerves", note: "writing, not filing", workspace: "none" },

  // ── accepting an offer Nemesis itself made ─────────────────────────────────
  {
    ask: "all three",
    history: [{ replied: "Want me to turn this into notes, flashcards, a practice test, or all three?", said: "here's my lecture" }],
    note: "observed live 2026-07-27: went out tool-less and reported 14 cards saved to a deck that does not exist",
    workspace: "write",
  },
  {
    ask: "flashcards",
    history: [{ replied: "Want me to turn this into notes, flashcards, a practice test, or all three?", said: "here's my lecture" }],
    note: "one word, no save verb, meaningless without the turn before it",
    workspace: "write",
  },
  {
    ask: "yeah do that",
    history: [{ replied: "Here are the 22 dated items I found. Want me to add these to your calendar?", said: "here's my syllabus" }],
    note: "the phrasing no ACCEPTANCE regex ever had",
    workspace: "write",
  },
  {
    ask: "what is the difference between notes and flashcards?",
    history: [{ replied: "Want me to turn this into notes, flashcards, a practice test, or all three?", said: "here's my lecture" }],
    note: "a question after an offer is not an acceptance",
    workspace: "none",
  },

  // ── the phrasings no word list could ever hold ─────────────────────────────
  { ask: "I have no clue, bruh", mode: "learning", note: "stuck, in words containing no teaching keyword", skills: ["teaching"], workspace: "none" },
  { ask: "can you run through those drugs with me again?", note: "tutoring without teach|explain|study|quiz", workspace: "none" },
  { ask: "this makes zero sense to me", mode: "learning", note: "frustration is a request to be taught differently", skills: ["teaching"], workspace: "none" },
  { ask: "wait what", mode: "conversation", note: "confusion with nothing to anchor it", workspace: "none" },
  { ask: "explícame la fotosíntesis", mode: "learning", note: "the word lists were English-only", workspace: "none" },
  { ask: "¿qué tengo pendiente esta semana?", note: "a calendar read in Spanish, which never matched anything", workspace: "read" },

  // ── the web ────────────────────────────────────────────────────────────────
  { ask: "Did they change that guideline?", needsWeb: true, note: "contains no current-events vocabulary at all", workspace: "none" },
  { ask: "has the EU signed off on that rule yet", needsWeb: true, note: "the header of chat-web-need's own example", workspace: "none" },
  { ask: "What causes hypertension?", mode: "learning", needsWeb: false, note: "settled knowledge; the old rule sent it to conversation", workspace: "none" },
  { ask: "what is the latest FDA guidance on GLP-1 agonists", needsWeb: true, note: "the easy case, which must not regress", workspace: "none" },
  {
    ask: "put my exam on my calendar for May 4 2026",
    needsWeb: false,
    note: "a year inside a save is a DATE; this used to buy a paid search",
    workspace: "write",
  },
  {
    ask: "summarise this deck for me",
    attachments: ["week3-pharmacokinetics.pptx"],
    needsWeb: false,
    note: "a slide citing 'Smith et al., 2024' used to buy a search on every upload",
    skills: ["lecture-intake"],
    workspace: "none",
  },
  {
    ask: "here are my syllabuses, put them into the calendar",
    attachments: ["Fall-2026-PHCY-2105-01.pdf"],
    note: "a filename that says nothing; the old gate sent these to the generic text path",
    skills: ["syllabus-intake"],
    workspace: "write",
  },

  // ── small talk, which must stay cheap ──────────────────────────────────────
  { ask: "hi", mode: "conversation", needsWeb: false, note: "must cost nothing", workspace: "none" },
  { ask: "who are you", mode: "conversation", needsWeb: false, note: "only Nemesis can answer it; never a search", workspace: "none" },
  { ask: "thanks, that helped", mode: "conversation", needsWeb: false, note: "no skill, no search, no tools", workspace: "none" },
];

async function decide(kase: Case): Promise<ChatIntent | null> {
  const messages = intentMessages({
    ask: kase.ask,
    context: {
      attachments: kase.attachments ?? [],
      awaitingStudyPreference: null,
      history: kase.history ?? [],
      today: "Thursday, 20 August 2026",
    },
  });
  const response = await fetch(`${BASE}/chat/completions`, {
    body: JSON.stringify({ messages, model: "deepseek-chat", temperature: 0 }),
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    method: "POST",
  });
  if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
  const body = await response.json() as { choices?: { message?: { content?: string } }[] };
  return readChatIntent(body.choices?.[0]?.message?.content ?? "");
}

if (!KEY) {
  console.log("No DEEPSEEK_API_KEY in this environment, so nothing was asked of the model.\n");
  for (const kase of CASES) console.log(`SKIP  ${kase.ask}`);
  console.log(`\n0 passed, 0 failed, ${CASES.length} skipped.`);
  process.exit(0);
}

let toolsWrong = 0;
let softWrong = 0;
let right = 0;

for (const kase of CASES) {
  let intent: ChatIntent | null = null;
  try {
    intent = await decide(kase);
  } catch (error) {
    toolsWrong += 1;
    console.log(`ERROR ${kase.ask}`);
    console.log(`      ${error instanceof Error ? error.message : String(error)}`);
    continue;
  }
  if (!intent) {
    // Unreadable is a tools miss by consequence: the caller falls back to workspace "none".
    toolsWrong += 1;
    console.log(`FAIL  ${kase.ask}`);
    console.log("      the model returned nothing readable, so this turn would run with no tools");
    continue;
  }

  const notes: string[] = [];
  const toolsMiss = intent.workspace !== kase.workspace;
  if (toolsMiss) notes.push(`workspace ${intent.workspace}, expected ${kase.workspace}`);
  if (kase.mode && intent.mode !== kase.mode) notes.push(`mode ${intent.mode}, expected ${kase.mode}`);
  if (kase.needsWeb !== undefined && intent.needsWeb !== kase.needsWeb) {
    notes.push(`needsWeb ${intent.needsWeb}, expected ${kase.needsWeb}`);
  }
  for (const skill of kase.skills ?? []) {
    if (!intent.skills.includes(skill)) notes.push(`no ${skill} (got ${intent.skills.join(", ") || "none"})`);
  }

  if (toolsMiss) toolsWrong += 1;
  else if (notes.length > 0) softWrong += 1;
  else right += 1;

  const label = toolsMiss ? "FAIL " : notes.length > 0 ? "SOFT " : "PASS ";
  console.log(`${label} ${kase.ask}`);
  if (notes.length > 0) console.log(`      ${notes.join("; ")}`);
  if (toolsMiss) console.log(`      ${kase.note}`);
}

console.log(`\n${right} exact, ${softWrong} off on a soft field, ${toolsWrong} wrong about tools.`);
if (toolsWrong > 0) {
  console.log("A wrong `workspace` means the turn runs without the tools that touch the student's data:");
  console.log("it cannot save what it says it saved, and it cannot see what it says it cannot see.");
}
process.exit(toolsWrong > 0 ? 1 : 0);
