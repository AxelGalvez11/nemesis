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
 *   NEXT_PUBLIC_SUPABASE_URL=… NEXT_PUBLIC_SUPABASE_ANON_KEY=… SUPABASE_SERVICE_KEY=… \
 *     npx tsx scripts/conversation-acceptance.ts
 */

import { randomUUID } from "node:crypto";

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

/** A canvas nobody has done anything with — the state the owner's own repro starts from. */
const FRESH: TurnContext = {
  canvasTitle: "",
  demonstrated: 0,
  history: [],
  lessonInProgress: false,
  materialContext: "",
  objectives: 0,
  passages: 0,
  sources: 0,
  today: new Date().toLocaleDateString(undefined, { day: "numeric", month: "long", weekday: "long", year: "numeric" }),
  webContext: "",
};

interface Case {
  utterance: string;
  /** What a person would expect. Null when both readings are defensible and we only report. */
  expect: TurnAction | null;
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
];

/** A conversation run turn by turn, each turn seeing the ones before it. */
const SEQUENCES: { name: string; turns: { said: string; expect: TurnAction | null }[] }[] = [
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
  return decisionOrReply(text);
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
  console.log(`learner ${userId.slice(0, 8)}… · plan pro · key ${key.slice(0, 8)}…\n`);

  let total = 0;
  let passed = 0;
  const bare: { utterance: string; alone: TurnAction; afterGreeting: TurnAction }[] = [];

  for (const category of CATEGORIES) {
    console.log(`── ${category.name}${category.note ? `  (${category.note})` : ""}`);
    let hit = 0;
    let judged = 0;
    for (const item of category.cases) {
      const context = { ...FRESH, ...item.context };
      let decision;
      try {
        decision = await ask(key, item.utterance, context);
      } catch (error) {
        console.log(`   ERR  ${item.utterance} — ${(error as Error).message}`);
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
      const mark = item.expect === null ? "   ·" : ok ? "   ok" : "  FAIL";
      // 🔴 `topic` IS PRINTED BECAUSE IT IS LOAD-BEARING NOW, NOT DECORATION. It decides whether
      // the "Learn this" button appears beside a plain answer, so a null on a real question is a
      // missing offer and a value under "hello" is an offer to learn a greeting.
      const topic = decision?.topic ?? null;
      console.log(`${mark}  ${JSON.stringify(item.utterance)} → ${then} · topic=${topic === null ? "—" : JSON.stringify(topic)}   "${(decision?.say ?? "").slice(0, 56)}"`);
      if (category.name.startsWith("Bare topics")) {
        const seen = bare.find((b) => b.utterance === item.utterance);
        if (seen) seen.afterGreeting = then;
        else bare.push({ afterGreeting: then, alone: then, utterance: item.utterance });
      }
    }
    if (judged) console.log(`   ${hit}/${judged}\n`);
    else console.log("");
  }

  // 🔴 THE PAIR IS THE MEASUREMENT. Four words that read one way alone and another way as an answer
  // to a question is the difference between understanding and a rule.
  console.log("── Bare topics: does context change the reading?");
  const moved = bare.filter((b) => b.alone !== b.afterGreeting).length;
  for (const b of bare) console.log(`   ${b.utterance.padEnd(18)} alone → ${b.alone.padEnd(6)} after a greeting → ${b.afterGreeting}`);
  console.log(`   ${moved}/${bare.length} read differently in context\n`);

  for (const sequence of SEQUENCES) {
    console.log(`── Sequence: ${sequence.name}`);
    const history: TurnExchange[] = [];
    for (const turn of sequence.turns) {
      let decision;
      try {
        decision = await ask(key, turn.said, { ...FRESH, history: [...history] });
      } catch (error) {
        console.log(`   ERR  ${turn.said} — ${(error as Error).message}`);
        break;
      }
      const then = decision?.then ?? "reply";
      const ok = turn.expect === null || then === turn.expect;
      if (turn.expect !== null) {
        total += 1;
        if (ok) passed += 1;
      }
      const mark = turn.expect === null ? "   ·" : ok ? "   ok" : "  FAIL";
      console.log(`${mark}  ${JSON.stringify(turn.said)} → ${then}`);
      console.log(`         "${(decision?.say ?? "").replace(/\n+/g, " ").slice(0, 140)}"`);
      history.push({ replied: decision?.say ?? "", said: turn.said });
    }
    console.log("");
  }

  console.log(`TOTAL ${passed}/${total} judged utterances behaved as a person would expect`);

  // Leave nothing behind. Cleanup is not optional: throwaway learners accumulated once already.
  await fetch(`${SB}/auth/v1/admin/users/${userId}`, { headers: svc, method: "DELETE" });
  console.log(`cleaned up learner ${userId.slice(0, 8)}…`);
  process.exit(passed === total ? 0 : 1);
}

void main();
