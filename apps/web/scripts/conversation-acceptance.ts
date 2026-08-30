/**
 * Does Nemesis understand ordinary language? Measured against the real model, through the real
 * valve, on the real plan meter.
 *
 * 🔴🔴 WHY THIS IS A SCRIPT AND NOT A UNIT TEST. What changed is that a MODEL now decides what an
 * utterance means. A unit test asserting `hello → conversation` would either need a live call or
 * would be testing a pure function that no longer decides anything — a guard that passes whatever
 * the product does. So the semantic claim is measured here, against
 * `${SB}/functions/v1/nemesis-llm/v1/chat/completions` with a real device key, and reported as a
 * per-category pass RATE rather than a green tick. 27 of 30 is 27 of 30 and prints that way.
 *
 * 🔴 IT SENDS THE PRODUCT'S OWN PACKET. `turnRouterMessages` and `decisionOrReply` are imported
 * from the app rather than restated, so a prompt edit that breaks understanding shows up here. The
 * only thing this script owns is the list of utterances and what a person would expect back.
 *
 * 🔴 WHAT IT DOES NOT PROVE is that the answer reaches the screen. That is wiring, and wiring needs
 * a browser: see `scripts/conversation-browser.ts`.
 *
 * Usage, from apps/web:
 *   npm run conversation-acceptance
 *
 * It prints as it goes AND writes the whole run to `$TMPDIR/nemesis-conversation-acceptance.txt`,
 * so there is no pipeline to get right in order to keep the report.
 *
 * That reads `apps/web/.env.local`, which is gitignored — copy `.env.example` and fill in
 * `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`. 🔴 A FILE RATHER THAN A COMMAND
 * PREFIX, because a service role key typed on a command line lands in shell history, and this is a
 * key that can read and write every learner's rows.
 *
 * Passing them inline still works and is unchanged:
 *   NEXT_PUBLIC_SUPABASE_URL=… NEXT_PUBLIC_SUPABASE_ANON_KEY=… SUPABASE_SERVICE_KEY=… \
 *     npx tsx scripts/conversation-acceptance.ts
 */

import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { extractJson } from "@/lib/learn/canvas-parse";
import { readClarifyQuestion, type UserQuestion } from "@/lib/learn/clarify-question";
import {
  decisionOrReply,
  turnRouterMessages,
  type TurnAction,
  type TurnContext,
  type TurnExchange,
} from "@/lib/learn/turn-router";

const SB = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY!;
const LLM = `${SB}/functions/v1/nemesis-llm`;

const svc = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" };

/**
 * The run is written to a file as well as printed, and the script does it itself.
 *
 * 🔴 BECAUSE THE SHELL PLUMBING IS A REAL FAILURE MODE, NOT A HYPOTHETICAL ONE. Asking for
 * `… 2>&1 | tee somewhere` to capture a run produced 783MB of the letter "y" on 2026-08-22 — the
 * `yes` command, piped into the file the report was supposed to be in. A report that only exists
 * if the reader gets a pipeline right is a report that goes missing exactly when somebody is tired
 * enough to need it written down.
 *
 * 🔴 IT STILL PRINTS. This is a copy, not a redirect: watching a live run is most of the value, and
 * a script that silently swallowed its own output to be tidy would be worse than the pipeline.
 */
const REPORT = join(tmpdir(), "nemesis-conversation-acceptance.txt");
const transcript: string[] = [];
const say = (line = "") => {
  transcript.push(line);
  console.log(line);
  flush();
};
/** Written after every line, so a run that dies halfway still leaves everything up to the failure. */
function flush(): void {
  try {
    writeFileSync(REPORT, `${transcript.join("\n")}\n`);
  } catch {
    // A report we cannot write is not a reason to lose the run that is still printing.
  }
}

/** A canvas nobody has done anything with — the state the owner's own repro starts from. */
const FRESH: TurnContext = {
  canvasTitle: "",
  clarified: [],
  demonstrated: 0,
  history: [],
  courseRequested: false,
  lessonInProgress: false,
  materialContext: "",
  memory: "",
  projectInstructions: "",
  objectives: 0,
  passages: 0,
  searchesLeft: 0,
  sources: 0,
  pinnedComments: "",
  stagedPassage: "",
  toolCatalogue: "",
  toolContext: "",
  toolRoundsLeft: 0,
  today: new Date().toLocaleDateString(undefined, { day: "numeric", month: "long", weekday: "long", year: "numeric" }),
  webContext: "",
};

interface Case {
  utterance: string;
  /** What a person would expect. Null when both readings are defensible and we only report. */
  expect: TurnAction | null;
  /**
   * Whether this turn should pause for a decision from the learner. Absent when it is not what
   * this case is measuring.
   *
   * 🔴 SEPARATE FROM `expect`, BECAUSE THEY ARE SEPARATE FACTS AND THE PRODUCT TREATS THEM THAT
   * WAY. `then` says what the turn does; a question says whether it happens now or after one
   * answer. A case can pin either, both, or neither.
   */
  asks?: boolean;
  context?: Partial<TurnContext>;
}

const CATEGORIES: { name: string; note?: string; cases: Case[] }[] = [
  {
    name: "Ordinary conversation",
    note: "none of these may start a learning session",
    cases: [
      "hello", "hey", "yo", "good morning", "thanks", "okay", "alright", "lol", "interesting",
      "that makes sense", "this is annoying", "I hate this class", "I'm tired", "this sucks",
      "wait", "what?", "what are you doing?", "who are you?", "can we talk about something else",
    ].map((utterance) => ({ expect: "reply" as const, utterance })),
  },
  {
    name: "Normal questions",
    note: "answered, not turned into a course",
    cases: ["what is a dollar?", "what is incretin?", "why is the sky blue?", "what day is it?"]
      .map((utterance) => ({ expect: "reply" as const, utterance })),
  },
  {
    // 🔴 "THIS" NEEDS SOMETHING TO POINT AT. Measured on a bare canvas, "quiz me on this" came back
    // as "you haven't given me anything to quiz you on yet" — which is not a failure, it is the
    // honest answer to a question with no referent. The two that name their own subject are asked
    // on an empty canvas; the two that say "this" are asked where a "this" exists.
    name: "Explicit learning",
    note: "a request to be taught must reach the learning system",
    cases: [
      { expect: "study" as const, utterance: "teach me innate immunity" },
      { expect: "study" as const, utterance: "I want to learn glycolysis" },
      {
        context: { canvasTitle: "Pharmacokinetics", passages: 12, sources: 1 },
        expect: "study" as const,
        utterance: "quiz me on this",
      },
      {
        context: { canvasTitle: "Pharmacokinetics", passages: 12, sources: 1 },
        expect: "study" as const,
        utterance: "help me understand this",
      },
    ],
  },
  {
    // 🔴🔴 REPORTED 2026-08-20, AND IT IS THE MOST EXPENSIVE WRONG ANSWER THIS ROUTER CAN GIVE.
    // "show me functional groups" started a LESSON: the canvas was retitled "foundational
    // functional groups", searched the web, ingested four pages, and sat on "Reading that page…"
    // while the owner waited for a list he could have read in ten seconds. Choosing "reply" wrongly
    // costs one sentence; choosing "study" wrongly costs minutes and takes the screen.
    //
    // 🔴 THE PAIR IS THE FINDING. "show me X" and "teach me X" are one word apart and mean opposite
    // things to the page, so the second column has to keep passing or the fix is just a thumb on
    // the scale.
    name: "Show me, versus teach me",
    note: "one word apart, opposite effects on the page",
    cases: [
      ...[
        "show me functional groups",
        "what are the functional groups",
        "list the functional groups",
        "give me the common functional groups",
        "show me the structures for alcohols and ketones",
      ].map((utterance) => ({ expect: "reply" as const, utterance })),
      ...[
        "teach me the functional groups",
        "walk me through the functional groups",
        "quiz me on functional groups",
      ].map((utterance) => ({ expect: "study" as const, utterance })),
    ],
  },
  {
    // 🔴 THE DISCRIMINATING TEST IN THIS FILE. The deleted classifier's last rule was "not a
    // question, so teach it", which made these four unconditional lessons. Read semantically the
    // SAME four words mean something else when Nemesis just asked what the learner is studying. If
    // both columns come back identical, the rule is still a rule — it has only moved.
    name: "Bare topics, read in context",
    note: "same words, two situations — the pair is the finding, not either column",
    cases: [
      ...["innate immunity", "glycolysis", "contract law", "pharmacokinetics"]
        .map((utterance) => ({ expect: null, utterance })),
      ...["innate immunity", "glycolysis", "contract law", "pharmacokinetics"].map((utterance) => ({
        context: { history: [{ replied: "hey. what are you working on?", said: "hello" }] as TurnExchange[] },
        expect: "reply" as const,
        utterance,
      })),
    ],
  },
  {
    // 🔴 THE PHRASINGS `asksForRewrite` USED TO OWN. That function was a list of instruction phrases
    // (simpler, simplify, rephrase, reword, rewrite, plain english, break this down), a second list
    // of confusion phrasings (don't understand, don't get, don't follow, lost, confused), and an
    // interrogative guard wedged between them to stop the two colliding. Its own comments recorded
    // two it got wrong: "can you rephrase that" is an instruction wearing a question's clothes and
    // the guard refused it, and "how do I understand this" would have rewritten the page.
    //
    // A rewrite is only meaningful with material on screen, so every case here is asked on a canvas
    // that has some. §11 keeps the old wording and offers to put it back, so a wrong rewrite costs
    // the learner a click; stacking another explanation under a passage they already could not read
    // is the behaviour §11 exists to forbid.
    name: "The material failed them",
    note: "these rewrite the passage in place, they do not add another explanation under it",
    cases: [
      "make this simpler",
      "simplify this",
      "can you rephrase that",
      "explain this differently",
      "put it in plain english",
      "break this down",
      "I still don't understand this",
      "I'm lost",
      "this is way too dense",
      "you've lost me completely",
      "this is written for someone who already knows it",
    ].map((utterance) => ({
      context: { canvasTitle: "Pharmacokinetics", passages: 12, sources: 1 },
      expect: "rewrite" as const,
      utterance,
    })),
  },
  {
    // 🔴 THE OTHER HALF, WHICH THE OLD GUARD GOT RIGHT AND MUST NOT BE LOST. A question with a
    // subject is answered beside the passage and changes nothing on the page. Rewriting a paragraph
    // because somebody asked what a word in it means is the silent-edit failure in the other
    // direction.
    name: "A question about the material",
    note: "answered beside the passage; nothing on the page may change",
    cases: [
      "what does osmolarity mean",
      "how do I understand this",
      "where did this come from",
      "which source is this from",
      "is this the same as what we did last week?",
      "why does that follow?",
    ].map((utterance) => ({
      context: { canvasTitle: "Pharmacokinetics", passages: 12, sources: 1 },
      expect: "reply" as const,
      utterance,
    })),
  },
  {
    // 🔴🔴 REPORTED 2026-08-21, WITH TWO SCREENSHOTS, AND ONE ROUTING MISTAKE CAUSED ALL OF IT.
    // *"i asked it can you teach me a new language and it did an unneccesary web search and then it
    // started fadeing between the two screens i attached."*
    //
    // The model chose "study" with the topic "new language learning". So the canvas was retitled,
    // `needsGrounding` searched the web for that phrase, and what a search for that phrase returns
    // is advertising — two marketing pages for a language app were ingested as the learner's study
    // material and the lesson built from them was a pricing page's list of languages. It also asked
    // WHICH language, so the learner ended up with a lesson it had started and a question it had
    // asked on one surface, with one composer pointing at both.
    //
    // 🔴 THE SECOND COLUMN IS THE FINDING, NOT THE FIRST. "Teach me a language" and "teach me
    // Spanish" are one word apart. A fix that made the first column pass by making the model timid
    // about teaching would break the second, and would be strictly worse than the bug.
    //
    // 🔴 AND THE CATEGORIES SPAN FIELDS ON PURPOSE. If this only held for languages it would be a
    // keyword list with extra steps.
    name: "A category is not a subject",
    note: "naming a category means asking which one; naming a subject means teaching it",
    cases: [
      ...[
        "can you teach me a new language",
        "teach me a language",
        "I want to learn a programming language",
        "help me learn a musical instrument",
        "teach me about a supreme court case",
        "walk me through a manufacturing process",
        "quiz me on a period of history",
      ].map((utterance) => ({ expect: "reply" as const, utterance })),
      ...[
        "can you teach me Spanish",
        "teach me Rust",
        "help me learn the cello",
        "teach me about Brown v. Board of Education",
        "walk me through injection moulding",
        "quiz me on the Meiji Restoration",
      ].map((utterance) => ({ expect: "study" as const, utterance })),
    ],
  },
  {
    // 🔴🔴 THE GATE IS THE COST OF GUESSING WRONG, NOT HOW VAGUE THE LEARNER WAS — owner, 2026-08-22:
    // *"it should ask when the result is a course structure etc. ... it shouldnt always ask for
    // things like throwaway questions for a websearch."* People are vague, and that is fine. A
    // reply produces a sentence, and a sentence guessed wrong costs one more turn. A study turn
    // builds something the learner has to throw away to escape.
    //
    // 🔴 BOTH COLUMNS ARE THE FINDING, EXACTLY AS IN "Show me, versus teach me". A model that never
    // asks passes the second half and fails the first; a model that always asks does the reverse.
    // Either alone would let a prompt edit look like an improvement while breaking the other side.
    //
    // 🔴 AND THE SECOND COLUMN IS MEASURED ON THE MODEL'S RAW REPLY, NOT ON THE PRODUCT'S. The
    // product drops a question on a "reply" turn, so scoring the parsed decision would score the
    // guard and report 100% however the model behaved. What is being measured here is whether the
    // MODEL asked — because when it does on a reply turn, its lead-in ("One thing first.") still
    // reaches the learner with no card underneath it, which reads as a broken turn.
    name: "When to pause for a decision",
    note: "ask when a wrong guess costs days, never when it costs a sentence",
    cases: [
      ...[
        "teach me biology",
        "create a course on biology",
        "teach me Python",
        "build me a course on machine learning",
        "teach me history",
      ].map((utterance) => ({ asks: true, expect: "study" as const, utterance })),
      // Named material, a named goal, or a subject narrow enough that there is only one course in
      // it. Asking here is the insult the gate exists to prevent.
      ...[
        "teach me my cardiovascular lectures for the exam on Friday",
        "teach me innate immunity",
        "quiz me on the Krebs cycle",
      ].map((utterance) => ({ asks: false, expect: "study" as const, utterance })),
      // Throwaway. Getting these wrong costs one more sentence, so a card in front of them is pure
      // delay — and the lead-in sentence arrives with nothing behind it.
      ...[
        "what is the half-life of caffeine",
        "what does osmolarity mean",
        "whats the latest news on ai",
        "show me the functional groups",
      ].map((utterance) => ({ asks: false, expect: "reply" as const, utterance })),
    ],
  },
];

/** A conversation run turn by turn, each turn seeing the ones before it. */
const SEQUENCES: {
  name: string;
  turns: {
    said: string;
    expect: TurnAction | null;
    /** Decisions already settled, as the canvas would carry them. See `clarify-question.ts`. */
    clarified?: string[];
    /** Whether this turn should pause for a decision. Absent when it is not what is measured. */
    asks?: boolean;
  }[];
}[] = [
  {
    name: "small talk into a subject",
    turns: [
      { expect: "reply", said: "hello" },
      { expect: "reply", said: "I'm studying pharmacology" },
      { expect: "reply", said: "it sucks" },
      { expect: "reply", said: "mostly kinetics" },
      { expect: null, said: "I don't understand clearance" },
      { expect: null, said: "why?" },
    ],
  },
  {
    // 🔴🔴 THE LOOP THIS CLOSES IS THE ONE THAT WOULD BE WORST TO SHIP. A model that asks, is
    // answered, and asks again has made the learner do all the work and produced nothing. The
    // product already blocks the second ask on the resumed turn (`mayAsk`), so what this measures
    // is whether the model NEEDS blocking — a run where it asks again every time means the contract
    // sentence is not landing, and the guard is carrying the feature on its own.
    name: "a vague course, answered",
    turns: [
      { asks: true, expect: "study", said: "teach me biology" },
      {
        asks: false,
        clarified: ['The learner answered your question "Which kind of biology?"\nbiology-scope = cell'],
        expect: "study",
        said: "teach me biology",
      },
    ],
  },
  {
    name: "a question that becomes learning",
    turns: [
      { expect: "reply", said: "what is incretin?" },
      { expect: "reply", said: "why does it matter?" },
      { expect: null, said: "I still don't get it" },
      { expect: null, said: "show me" },
      { expect: "study", said: "quiz me" },
    ],
  },
];

async function ask(key: string, utterance: string, context: TurnContext) {
  const res = await fetch(`${LLM}/v1/chat/completions`, {
    body: JSON.stringify({
      messages: turnRouterMessages({ context, utterance }),
      model: "deepseek-chat",
    }),
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "x-nemesis-client": "web" },
    method: "POST",
  });
  const body = (await res.json().catch(() => null)) as { choices?: { message?: { content?: string } }[] } | null;
  const text = body?.choices?.[0]?.message?.content ?? "";
  if (!res.ok) throw new Error(`valve ${res.status}: ${JSON.stringify(body).slice(0, 200)}`);
  // 🔴🔴 THE MODEL'S OWN ASK, BEFORE THE PRODUCT'S GATE, AND THAT IS THE ONLY HONEST WAY TO MEASURE
  // IT. `readTurnDecision` drops a question on a "reply" turn, so a run scored on the parsed
  // decision would report "never asks on a reply turn" no matter how the model behaved — it would
  // be measuring the guard, which a unit test already proves. This reads the raw envelope, so the
  // two columns are "what the model wanted" and "what the learner got".
  const asked = readClarifyQuestion(extractJson(text)?.question);
  return { asked, decision: decisionOrReply(text) };
}

async function main(): Promise<void> {
  const email = `talk+${randomUUID()}@nemesis.test`;
  const password = `Pb!${randomUUID()}Aa1`;
  const created = await fetch(`${SB}/auth/v1/admin/users`, {
    body: JSON.stringify({ email, password, email_confirm: true }),
    headers: svc,
    method: "POST",
  }).then((r) => r.json());
  const userId: string = created?.id ?? created?.user?.id;
  if (!userId) throw new Error(`could not seed a learner: ${JSON.stringify(created).slice(0, 300)}`);
  // A paid row, so a run cannot exhaust the free tier and look like the product failing.
  await fetch(`${SB}/rest/v1/subscriptions`, {
    body: JSON.stringify({ billing_provider: "stripe", plan: "pro", status: "active", user_id: userId }),
    headers: svc,
    method: "POST",
  });
  const token = await fetch(`${SB}/auth/v1/token?grant_type=password`, {
    body: JSON.stringify({ email, password }),
    headers: { apikey: ANON, "Content-Type": "application/json" },
    method: "POST",
  }).then((r) => r.json());
  const minted = await fetch(`${LLM}/device-key`, {
    body: JSON.stringify({ label: "Nemesis Web" }),
    headers: { Authorization: `Bearer ${token.access_token}`, "Content-Type": "application/json" },
    method: "POST",
  }).then((r) => r.json());
  const key: string = minted?.key;
  if (!key) throw new Error(`could not mint a device key: ${JSON.stringify(minted).slice(0, 200)}`);
  say(`learner ${userId.slice(0, 8)}… · plan pro · key ${key.slice(0, 8)}…\n`);

  let total = 0;
  let passed = 0;
  const bare: { utterance: string; alone: TurnAction; afterGreeting: TurnAction }[] = [];

  for (const category of CATEGORIES) {
    say(`── ${category.name}${category.note ? `  (${category.note})` : ""}`);
    let hit = 0;
    let judged = 0;
    for (const item of category.cases) {
      const context = { ...FRESH, ...item.context };
      let decision;
      let asked: UserQuestion | null = null;
      try {
        const reply = await ask(key, item.utterance, context);
        decision = reply.decision;
        asked = reply.asked;
      } catch (error) {
        say(`   ERR  ${item.utterance} — ${(error as Error).message}`);
        continue;
      }
      const then = decision?.then ?? "reply";
      const ok = item.expect === null || then === item.expect;
      if (item.expect !== null) {
        judged += 1;
        total += 1;
        if (ok) {
          hit += 1;
          passed += 1;
        }
      }
      // 🔴 SCORED SEPARATELY FROM `expect`, AND BOTH COUNT. A turn can route correctly and still
      // stop the learner for no reason, or route correctly and build the wrong course silently.
      // Folding them into one tick would hide whichever half was wrong.
      if (item.asks !== undefined) {
        judged += 1;
        total += 1;
        const askOk = item.asks ? decision?.question != null : asked === null;
        if (askOk) {
          hit += 1;
          passed += 1;
        }
        const askMark = askOk ? "   ok" : "  FAIL";
        const shape = asked
          ? `asked ${asked.options.length} options${decision?.question ? "" : " (DROPPED: not a study turn)"}`
          : "did not ask";
        say(`${askMark}  ${JSON.stringify(item.utterance)} · expected ${item.asks ? "a question" : "no question"} → ${shape}`);
        if (asked) say(`         "${asked.prompt}" — ${asked.options.map((o) => o.label).join(" / ")}`);
      }
      const mark = item.expect === null ? "   ·" : ok ? "   ok" : "  FAIL";
      // 🔴 `topic` IS PRINTED BECAUSE IT IS LOAD-BEARING NOW, NOT DECORATION. It decides whether
      // the "Learn this" button appears beside a plain answer, so a null on a real question is a
      // missing offer and a value under "hello" is an offer to learn a greeting.
      const topic = decision?.topic ?? null;
      say(`${mark}  ${JSON.stringify(item.utterance)} → ${then} · topic=${topic === null ? "—" : JSON.stringify(topic)}   "${(decision?.say ?? "").slice(0, 56)}"`);
      if (category.name.startsWith("Bare topics")) {
        const seen = bare.find((b) => b.utterance === item.utterance);
        if (seen) seen.afterGreeting = then;
        else bare.push({ afterGreeting: then, alone: then, utterance: item.utterance });
      }
    }
    if (judged) say(`   ${hit}/${judged}\n`);
    else say("");
  }

  // 🔴 THE PAIR IS THE MEASUREMENT. Four words that read one way alone and another way as an answer
  // to a question is the difference between understanding and a rule.
  say("── Bare topics: does context change the reading?");
  const moved = bare.filter((b) => b.alone !== b.afterGreeting).length;
  for (const b of bare) say(`   ${b.utterance.padEnd(18)} alone → ${b.alone.padEnd(6)} after a greeting → ${b.afterGreeting}`);
  say(`   ${moved}/${bare.length} read differently in context\n`);

  for (const sequence of SEQUENCES) {
    say(`── Sequence: ${sequence.name}`);
    const history: TurnExchange[] = [];
    for (const turn of sequence.turns) {
      let decision;
      let asked: UserQuestion | null = null;
      try {
        const reply = await ask(key, turn.said, {
          ...FRESH,
          clarified: turn.clarified ?? [],
          history: [...history],
        });
        decision = reply.decision;
        asked = reply.asked;
      } catch (error) {
        say(`   ERR  ${turn.said} — ${(error as Error).message}`);
        break;
      }
      const then = decision?.then ?? "reply";
      const ok = turn.expect === null || then === turn.expect;
      if (turn.expect !== null) {
        total += 1;
        if (ok) passed += 1;
      }
      if (turn.asks !== undefined) {
        total += 1;
        const askOk = turn.asks ? decision?.question != null : asked === null;
        if (askOk) passed += 1;
        say(`${askOk ? "   ok" : "  FAIL"}  ${JSON.stringify(turn.said)} · expected ${turn.asks ? "a question" : "no question"} → ${asked ? `asked "${asked.prompt}"` : "did not ask"}`);
      }
      const mark = turn.expect === null ? "   ·" : ok ? "   ok" : "  FAIL";
      say(`${mark}  ${JSON.stringify(turn.said)} → ${then}`);
      say(`         "${(decision?.say ?? "").replace(/\n+/g, " ").slice(0, 140)}"`);
      history.push({ replied: decision?.say ?? "", said: turn.said });
    }
    say("");
  }

  say(`TOTAL ${passed}/${total} judged utterances behaved as a person would expect`);
  say(`report written to ${REPORT}`);

  // Leave nothing behind. Cleanup is not optional: throwaway learners accumulated once already.
  await fetch(`${SB}/auth/v1/admin/users/${userId}`, { headers: svc, method: "DELETE" });
  say(`cleaned up learner ${userId.slice(0, 8)}…`);
  process.exit(passed === total ? 0 : 1);
}

void main().catch((error: unknown) => {
  // 🔴 A CRASH IS A RESULT. Missing keys, a valve refusal, a network drop: whoever reads the report
  // needs to see why nothing was measured, and the console alone scrolls away.
  say("");
  say(`RUN FAILED — ${(error as Error).message}`);
  say(`report written to ${REPORT}`);
  process.exit(1);
});
