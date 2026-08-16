/**
 * Canvas v1 acceptance, part two — the cognition criteria, on real production material.
 *
 * 🔴 WHAT THIS IS FOR. `canvas-loop-acceptance.ts` proves §A/§B/§C: a real parse becomes knowledge,
 * knowledge becomes objectives, an evidence row is written under RLS and read back, and the next
 * decision differs because of it. This script starts where that one stops and works the criteria it
 * left untouched — §D (rapid associative cognition), §E (a richer cognitive structure), §F
 * (multi-objective responses) and §M3 (a correction may not be the immediate next prompt).
 *
 * 🔴 IT USES THE APPLICATION'S OWN FUNCTIONS, NOT A REIMPLEMENTATION OF THEM. `saveKnowledge`,
 * `recordEvidence` and `loadEvidence` are the exact functions the browser runs; the shared client is
 * signed in as a throwaway learner with `supabase.auth.setSession`, so every write below is subject
 * to row-level security exactly as a student's would be. The judge is the real production judge —
 * `evaluateLearningResponse` mints a device key from the live edge function and calls the live model.
 *
 * WHAT IT CANNOT PROVE, AND DOES NOT CLAIM: pixels, tempo, and anything reached only through the
 * React hook. `use-policy-runtime.ts` cannot be executed from Node, so where a criterion lives in a
 * hook branch this script exercises the BOUNDARY that branch calls and says so in the output.
 *
 * Usage, from apps/web:
 *   NEXT_PUBLIC_SUPABASE_URL=… NEXT_PUBLIC_SUPABASE_ANON_KEY=… SUPABASE_SERVICE_KEY=… \
 *     ../../node_modules/.bin/tsx scripts/canvas-cognition-acceptance.ts
 *
 * 🔴 RUN IT AS `.ts`, NEVER `.mts`. The learn modules import circularly; under `.mts` resolution
 * `decideNext` comes back undefined and top-level await is refused.
 *
 * The service key seeds and confirms a throwaway `@nemesis.test` learner and reads the owner's
 * parsed documents. Every learner-side write goes through that learner's own JWT.
 */

import { randomUUID } from "node:crypto";

import { supabase } from "@/lib/supabase";
import { extractKnowledgeObjects } from "@/lib/learn/knowledge-extraction";
import { objectivesForKnowledge } from "@/lib/learn/learning-objective";
import { decideNext } from "@/lib/learn/policy-runtime";
import { runtimeCanStage } from "@/lib/learn/runtime-support";
import { evaluateLearningResponse } from "@/lib/learn/canvas-api";
import { isAdmissionOfNotKnowing } from "@/lib/learn/response-admission";
import { loadEvidence, recordEvidence, saveKnowledge, type StoredObjective } from "@/lib/learn/learner-store";
import { performancesIn, projectLearnerState, type LearnerEvidence } from "@/lib/learn/learner-evidence";
import {
  evidenceForSubmission,
  judgementOf,
  noJudgement,
  objectiveAsTask,
  outcomeFor,
  promptTargeting,
  retrievalPromptFor,
  targetFor,
  type SubmissionOutcome,
} from "@/lib/learn/objective-task";
import { interveningActs } from "@/lib/learn/working-memory";
import { sourceContextFromModel } from "@/lib/sources/source-context";
import type { KnowledgeObject } from "@/lib/learn/knowledge-types";

const SB = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_KEY!;
const svc = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" };

/**
 * The three real production sources this run reads, and why each one.
 *
 * 🔴 THE MATERIAL IS THE OWNER'S, PARSED BY THE PRODUCTION WORKER. Nothing here is a fixture. What
 * IS chosen by hand is which of the real objectives to put in front of the judge, and the wording of
 * the learner's answers — synthetic CONTENT over a real pipeline, which is the line the envelope
 * draws.
 */
const SOURCES = {
  /** The owner's four-fact acceptance canvas — losartan/Cozaar, valsartan/Diovan. §M3 needs a small
   *  set, and the envelope's own worked example uses exactly this material. */
  associative: "021f8c74-8a56-401d-b37b-2e9115f88735",
  /** Pharmacokinetics: the only production parse whose association pairs are real subject-matter
   *  terms on both sides, which is what a semantic-judging test needs. */
  semantic: "5a60cf4a-7a4c-487b-bce6-ab7246364b59",
  /** Diabetes screening: a genuine FIVE-STEP ordered procedure. The closest thing production has to
   *  §E's `A → B → C → D`, because no parsed document yields causal knowledge at all. */
  structure: "d00a28d9-633f-460d-8526-890162b1e9bb",
} as const;

let failures = 0;
const results: { id: string; pass: boolean; detail: string }[] = [];
function check(id: string, pass: boolean, detail = ""): void {
  if (!pass) failures += 1;
  results.push({ detail, id, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${id}${detail ? ` — ${detail}` : ""}`);
}
function note(id: string, detail: string): void {
  results.push({ detail, id, pass: true });
  console.log(`NOTE  ${id} — ${detail}`);
}

/** A canvas shell the judge needs and nothing else uses. It declares no concepts, so the judge may
 *  not name one — `alsoWeakConceptIds` has nothing to attach to, which is the honest state for an
 *  objective that belongs to no canvas. */
const JUDGE_CANVAS = {
  answers: [],
  blocks: [],
  concepts: [],
  correctiveAttempts: {},
  events: [],
  id: "",
  level: null,
  questions: [],
  recall: [],
  recallResults: [],
  responses: [],
  sources: [],
  state: "ready",
  title: "integration cognition acceptance",
} as never;

// ─────────────────────────────────────────────────────────── real production material

interface Extracted {
  knowledge: KnowledgeObject[];
  fileName: string;
}

async function extractFrom(sourceId: string): Promise<Extracted> {
  const [row] = (await fetch(
    `${SB}/rest/v1/library_sources?id=eq.${sourceId}&select=file_name,parsed_document_id`,
    { headers: svc },
  ).then((r) => r.json())) as { file_name: string; parsed_document_id: string | null }[];
  if (!row?.parsed_document_id) throw new Error(`source ${sourceId} has no parse`);
  const [parsed] = (await fetch(
    `${SB}/rest/v1/parsed_documents?id=eq.${row.parsed_document_id}&select=structure,doc_kind`,
    { headers: svc },
  ).then((r) => r.json())) as { structure?: { model?: unknown }; doc_kind?: string }[];
  const model = parsed?.structure?.model;
  if (!model) throw new Error(`source ${sourceId} carries no document model`);
  const context = sourceContextFromModel({
    model,
    sourceId,
    sourceKind: parsed.doc_kind ?? "pdf",
  } as never);
  return { fileName: row.file_name, knowledge: [...extractKnowledgeObjects(context).objects] };
}

/** Every objective the runtime can actually stage, paired with the knowledge it came from. */
function stageable(knowledge: readonly KnowledgeObject[]): { knowledge: KnowledgeObject; identityKey: string }[] {
  return knowledge.flatMap((k) =>
    objectivesForKnowledge(k)
      .filter((o) => runtimeCanStage(k.type, o.capability))
      .map((o) => ({ identityKey: o.identityKey, knowledge: k })),
  );
}

async function main(): Promise<void> {
  // ── Provenance ───────────────────────────────────────────────────────────
  //
  // 🔴 THE SERVING DEPLOYMENT IS PASSED IN, NOT GUESSED. A run that cannot name which deployment
  // holds the production alias has proven something about a codebase, not about the product. Resolve
  // it with `vercel inspect https://app.enternemesis.com`, confirm containment with
  // `git merge-base --is-ancestor <sha> <serving-sha>`, and hand both in.
  console.log(`production   ${SB}`);
  console.log(`alias        https://app.enternemesis.com`);
  console.log(`serving dpl  ${process.env.SERVING_DEPLOYMENT ?? "UNRESOLVED — vercel inspect https://app.enternemesis.com"}`);
  console.log(`serving sha  ${process.env.SERVING_COMMIT ?? "UNRESOLVED"}`);
  console.log(`harness sha  ${process.env.HARNESS_COMMIT ?? "UNRESOLVED"}`);
  console.log(`run started  ${new Date().toISOString()}\n`);

  // ── A real learner, and the app's own client signed in as them ───────────
  const marker = `cognition-${randomUUID().slice(0, 8)}`;
  const email = `${marker}@nemesis.test`;
  const password = `Pb!${randomUUID()}Aa1`;
  const created = (await fetch(`${SB}/auth/v1/admin/users`, {
    body: JSON.stringify({ email, email_confirm: true, password }),
    headers: svc,
    method: "POST",
  }).then((r) => r.json())) as { id?: string; user?: { id?: string } };
  const userId = created?.id ?? created?.user?.id;
  if (!userId) throw new Error(`could not seed a learner: ${JSON.stringify(created).slice(0, 300)}`);

  /**
   * Put the APPLICATION'S OWN client in this learner's session.
   *
   * 🔴 THIS IS WHAT MAKES EVERY WRITE BELOW THE REAL ONE. `saveKnowledge`/`recordEvidence` use the
   * shared client; signing it in as the learner means RLS is the gate, not a bearer header this
   * script chose.
   *
   * 🔴 A FRESH GRANT EVERY TIME, NEVER A REPLAYED TOKEN PAIR. `signOut()` revokes the refresh token
   * server-side, so re-attaching the old pair leaves the client silently unauthenticated and every
   * later write fails RLS — measured, not assumed.
   */
  const signIn = async (): Promise<void> => {
    const token = (await fetch(`${SB}/auth/v1/token?grant_type=password`, {
      body: JSON.stringify({ email, password }),
      headers: { apikey: ANON, "Content-Type": "application/json" },
      method: "POST",
    }).then((r) => r.json())) as { access_token?: string; refresh_token?: string };
    if (!token.access_token || !token.refresh_token) {
      throw new Error(`could not sign in: ${JSON.stringify(token).slice(0, 300)}`);
    }
    const { error } = await supabase.auth.setSession({
      access_token: token.access_token,
      refresh_token: token.refresh_token,
    });
    if (error) throw new Error(`could not attach the session: ${error.message}`);
    const session = await supabase.auth.getSession();
    if (session.data.session?.user.id !== userId) throw new Error("the client is not this learner");
  };
  await signIn();
  check("AUTH", true, `learner ${userId.slice(0, 8)}… (${marker}) signed in on the app's own client`);

  // ── Real parses → real knowledge → real, persisted objectives ────────────
  const associative = await extractFrom(SOURCES.associative);
  const semantic = await extractFrom(SOURCES.semantic);
  const structure = await extractFrom(SOURCES.structure);
  console.log(
    `\nmaterial     ${associative.fileName} (${associative.knowledge.length} k) · ` +
      `${semantic.fileName.slice(0, 34)} (${semantic.knowledge.length} k) · ` +
      `${structure.fileName.slice(0, 34)} (${structure.knowledge.length} k)\n`,
  );

  /** Persist one real knowledge object through the real path and return its objectives. */
  const persist = async (k: KnowledgeObject): Promise<StoredObjective[]> => saveKnowledge(userId, k);

  // ═══════════════════════════════════════════════ §D2 — semantic judging, and its calibration
  //
  // 🔴 TWO CALLS, NOT ONE, AND THE SECOND IS THE POINT. A judge that accepted a paraphrase would
  // also pass a judge that accepts anything. So the same prompt is answered a second time with a
  // response that is LEXICALLY CLOSER to the reference and semantically opposite — the first-order
  // answer to a zero-order question. A pass requires the paraphrase in and the near-miss out.
  const zeroOrder = semantic.knowledge.find((k) =>
    objectivesForKnowledge(k).some((o) => o.identityKey === "recall:v1:65b6851922138ef1"),
  );
  if (!zeroOrder) {
    check("D2", false, "the zero-order/when-it-occurs objective is no longer extracted from the real parse");
  } else {
    const stored = await persist(zeroOrder);
    const objective = stored.find((o) => o.identityKey === "recall:v1:65b6851922138ef1");
    if (!objective) {
      check("D2", false, "the objective did not persist under RLS");
    } else {
      const prompt = retrievalPromptFor({ knowledge: zeroOrder, objective }, randomUUID());
      const paraphrase =
        "it happens once the enzymes doing the metabolising are all occupied — they are working flat out and cannot go faster";
      const nearMiss = "enzymes not saturated";
      const same = await evaluateLearningResponse(
        userId,
        JUDGE_CANVAS,
        objectiveAsTask(objective, prompt, { text: paraphrase, via: "typed" } as never),
      );
      const other = await evaluateLearningResponse(
        userId,
        JUDGE_CANVAS,
        objectiveAsTask(objective, prompt, { text: nearMiss, via: "typed" } as never),
      );
      const accepted = same.value?.verdict;
      const rejected = other.value?.verdict;
      const overlap = (a: string, b: string): boolean =>
        a.trim().toLowerCase() === b.trim().toLowerCase() ||
        a.toLowerCase().includes(b.trim().toLowerCase());
      check(
        "D2",
        (accepted === "strong" || accepted === "understood") &&
          rejected !== undefined &&
          rejected !== "strong" &&
          rejected !== "understood" &&
          !overlap(paraphrase, String(objective.answer)),
        `prompt="${prompt.prompt}" reference="${objective.answer}" · paraphrase(no lexical overlap)→${accepted} · ` +
          `lexically-nearer wrong answer "${nearMiss}"→${rejected}`,
      );
      note(
        "D2-detail",
        `paraphrase feedback: ${JSON.stringify(same.value?.feedback ?? same.error).slice(0, 160)} · ` +
          `near-miss feedback: ${JSON.stringify(other.value?.feedback ?? other.error).slice(0, 160)}`,
      );

      // ═══════════════════════════════════════ §F4 / §F5 — a real judge failure writes nothing
      //
      // 🔴 THE FAILURE IS INDUCED IN THE NETWORK, NOT SIMULATED DOWNSTREAM. The judge request to the
      // live edge function is made to fail the way an outage makes it fail; every line of
      // application code below that runs unmodified, takes its own `catch`, and returns
      // `{value: null}` — the exact condition the hook branches on at use-policy-runtime.ts:930.
      //
      // 🔴 NOT AN ABORT. `postChatCompletion` RETHROWS `AbortError` on purpose (chat-api.ts:602):
      // a cancelled request is the learner changing their mind, not a judge that failed, and the
      // two must not be conflated. Measured here first, then corrected — an aborted signal escapes
      // the function entirely rather than producing the null this criterion is about.
      const realFetch = globalThis.fetch;
      const judgeEndpoint = "/functions/v1/nemesis-llm/v1/chat/completions";
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        if (url.includes(judgeEndpoint)) throw new TypeError("fetch failed");
        return realFetch(input, init);
      }) as typeof fetch;
      const outage = await evaluateLearningResponse(
        userId,
        JUDGE_CANVAS,
        objectiveAsTask(objective, prompt, { text: paraphrase, via: "typed" } as never),
      );
      globalThis.fetch = realFetch;
      const outagePrompt = retrievalPromptFor({ knowledge: zeroOrder, objective }, randomUUID());
      const outageRows = evidenceForSubmission({
        canvasId: null,
        judgement: outage.value ? judgementOf([outcomeFor(objective, outage.value)]) : noJudgement(),
        occurredAt: new Date().toISOString(),
        prompt: outagePrompt,
        responseText: paraphrase,
        teachingStrategy: null,
      });
      for (const row of outageRows) await recordEvidence(userId, row);
      const outageInProduction = (await fetch(
        `${SB}/rest/v1/learner_evidence?response_id=eq.${outagePrompt.id}&select=id`,
        { headers: svc },
      ).then((r) => r.json())) as unknown[];
      check(
        "F4",
        outage.value === null && outageRows.length === 0 && outageInProduction.length === 0,
        `induced judge failure ("${String(outage.error).slice(0, 60)}") → noJudgement() → ` +
          `${outageRows.length} rows built, ${outageInProduction.length} rows in production for that response id`,
      );

      // 🔴 A SECOND, INDEPENDENT FAILURE MODE, BECAUSE ONE PROVES THE PATH AND TWO PROVE THE RULE.
      // Signing the client out makes `deviceKey()` return null, so the judge is never reached for a
      // completely different reason — authorisation rather than the network. A learner claim written
      // from either one would be a claim authored by our own failure.
      await supabase.auth.signOut();
      const unauthorised = await evaluateLearningResponse(
        userId,
        JUDGE_CANVAS,
        objectiveAsTask(objective, prompt, { text: paraphrase, via: "typed" } as never),
      );
      await signIn();
      const unauthorisedPrompt = retrievalPromptFor({ knowledge: zeroOrder, objective }, randomUUID());
      const unauthorisedRows = evidenceForSubmission({
        canvasId: null,
        judgement: unauthorised.value ? judgementOf([outcomeFor(objective, unauthorised.value)]) : noJudgement(),
        occurredAt: new Date().toISOString(),
        prompt: unauthorisedPrompt,
        responseText: paraphrase,
        teachingStrategy: null,
      });
      for (const row of unauthorisedRows) await recordEvidence(userId, row);
      const unauthorisedInProduction = (await fetch(
        `${SB}/rest/v1/learner_evidence?response_id=eq.${unauthorisedPrompt.id}&select=id`,
        { headers: svc },
      ).then((r) => r.json())) as unknown[];
      check(
        "F4-second-mode",
        unauthorised.value === null && unauthorisedRows.length === 0 && unauthorisedInProduction.length === 0,
        `unreachable-for-authorisation ("${String(unauthorised.error).slice(0, 60)}") → ` +
          `${unauthorisedRows.length} rows built, ${unauthorisedInProduction.length} rows in production`,
      );

      // `judgementOf([])` is the OTHER emptiness and it must write one row per target.
      const nothingPrompt = retrievalPromptFor({ knowledge: zeroOrder, objective }, randomUUID());
      const nothingRows = evidenceForSubmission({
        canvasId: null,
        judgement: judgementOf([]),
        occurredAt: new Date().toISOString(),
        prompt: nothingPrompt,
        responseText: "I don't know",
        teachingStrategy: null,
      });
      check(
        "F5",
        nothingRows.length === 1 &&
          nothingRows[0]!.verdict === null &&
          nothingRows[0]!.demonstrationObtained === false &&
          nothingRows[0]!.objectiveEvidence === "nothing_produced" &&
          outageRows.length === 0,
        `judgementOf([]) → ${nothingRows.length} row (objectiveEvidence=${nothingRows[0]?.objectiveEvidence}, verdict=${String(nothingRows[0]?.verdict)}) · ` +
          `noJudgement() → ${outageRows.length} rows. Two emptinesses, two values.`,
      );
    }
  }

  // ═════════════════════════════════════════════ §D4 — "I don't know" is not a wrong answer
  const assocStage = stageable(associative.knowledge);
  const assocKnowledge = [...new Map(assocStage.map((s) => [s.knowledge.identityKey, s.knowledge])).values()];
  const assocObjectives: { knowledge: KnowledgeObject; objective: StoredObjective }[] = [];
  for (const k of assocKnowledge) {
    for (const objective of await persist(k)) {
      if (runtimeCanStage(k.type, objective.capability)) assocObjectives.push({ knowledge: k, objective });
    }
  }
  check(
    "SETUP-associative",
    assocObjectives.length >= 4,
    `${assocObjectives.length} objectives persisted under RLS from ${associative.fileName}: ` +
      assocObjectives.map((o) => o.objective.label).join(" · "),
  );
  if (assocObjectives.length === 0) {
    console.log("\nnothing persisted; §D and §M cannot be exercised. Stopping rather than reporting a pass.");
    process.exit(1);
  }

  const first = assocObjectives[0]!;
  const admission = "I don't know";
  const admissionPrompt = retrievalPromptFor(first, randomUUID());
  // 🔴 THE SAME STRUCTURAL TEST THE SURFACE RUNS BEFORE THE JUDGE IS EVER CALLED.
  const recognisedAsAdmission = isAdmissionOfNotKnowing(admission);
  const admissionRows = evidenceForSubmission({
    canvasId: null,
    judgement: judgementOf([]),
    occurredAt: new Date().toISOString(),
    prompt: admissionPrompt,
    responseText: admission,
    teachingStrategy: null,
    tookMs: 3100,
  });
  for (const row of admissionRows) await recordEvidence(userId, row);
  const afterAdmission = await loadEvidence(userId, assocObjectives.map((o) => o.objective));
  const admissionRow = afterAdmission.find((e) => e.responseId === admissionPrompt.id);
  check(
    "D4",
    recognisedAsAdmission &&
      admissionRow != null &&
      admissionRow.demonstrationObtained === false &&
      admissionRow.verdict === null,
    admissionRow
      ? `read back from production: demonstrationObtained=${admissionRow.demonstrationObtained} verdict=${String(admissionRow.verdict)} ` +
        `objectiveEvidence=${String(admissionRow.objectiveEvidence)} operation=${String(admissionRow.operation)} latency=${String(admissionRow.responseLatencyMs)}ms`
      : "no row read back",
  );
  const admissionState = projectLearnerState(first.objective.identityKey, afterAdmission);
  check(
    "D4-state",
    admissionState.status === "not_demonstrated",
    `projected status="${admissionState.status}" (never "incorrect"), demonstrationCount=${admissionState.demonstrationCount}`,
  );

  // ═══════════════════════════ §E1 / §E2 / §F1 / §F2 / §F3 — one answer across several links
  //
  // 🔴 THE STRUCTURE IS A REAL FIVE-STEP PROCEDURE FROM A REAL PARSE, NOT A CAUSAL CHAIN, BECAUSE
  // NO PARSED DOCUMENT IN PRODUCTION YIELDS CAUSAL KNOWLEDGE AT ALL. Substitution named on purpose:
  // §E's table says "causal knowledge is the current candidate", and its E1/E2 criteria are about
  // per-LINK outcomes rather than about causality specifically. A procedure's steps are its links.
  const procedure = structure.knowledge.find((k) => k.type === "procedure");
  if (!procedure) {
    check("E1", false, "no procedure knowledge extracted from the structural source");
  } else {
    const steps = (await persist(procedure)).filter((o) => runtimeCanStage("procedure", o.capability));
    check("SETUP-structure", steps.length >= 3, `${steps.length} sequence objectives persisted from one procedure`);
    const targeted = steps.slice(0, 3);

    // ONE prompt, THREE targets. 🔴 `promptTargeting` accepts a set; no shipped caller passes one.
    const multi = promptTargeting({
      expectedAnswer: targeted.map((o) => o.answer).join(" → "),
      id: randomUUID(),
      operation: "sequence",
      prompt: `Walk through ${procedure.statement} in order.`,
      targets: targeted.map(targetFor),
      task: "reconstruct",
    });
    // The judge names TWO of the three links: one demonstrated, one contradicted, one never mentioned.
    const outcomes: SubmissionOutcome[] = [
      { objectiveIdentityKey: targeted[0]!.identityKey, verdict: "strong" },
      { objectiveIdentityKey: targeted[1]!.identityKey, verdict: "incorrect" },
    ];
    const rows = evidenceForSubmission({
      canvasId: null,
      judgement: judgementOf(outcomes),
      occurredAt: new Date().toISOString(),
      prompt: multi,
      responseText: "You start with the prediabetes group yearly, then everyone else at 35 — I am not sure about the rest.",
      teachingStrategy: null,
      tookMs: 41_200,
    });
    let allWritten = true;
    for (const row of rows) if (!(await recordEvidence(userId, row))) allWritten = false;
    const back = (await loadEvidence(userId, steps)).filter((e) => e.responseId === multi.id);

    const byKey = new Map(back.map((e) => [e.objectiveIdentityKey, e]));
    const a = byKey.get(targeted[0]!.identityKey);
    const b = byKey.get(targeted[1]!.identityKey);
    const c = byKey.get(targeted[2]!.identityKey);
    check(
      "E1",
      allWritten &&
        back.length === 3 &&
        a?.verdict === "strong" &&
        b?.verdict === "incorrect" &&
        c?.verdict === null,
      `three links of one answer, read back from production: ` +
        `link1 verdict=${String(a?.verdict)}/${String(a?.objectiveEvidence)} · ` +
        `link2 verdict=${String(b?.verdict)}/${String(b?.objectiveEvidence)} · ` +
        `link3 verdict=${String(c?.verdict)}/${String(c?.objectiveEvidence)} — not one overall verdict`,
    );
    check(
      "E2",
      c != null && c.verdict === null && c.objectiveEvidence === "not_addressed" && c.demonstrationObtained === false,
      c
        ? `the unaddressed link stores objectiveEvidence="${String(c.objectiveEvidence)}", verdict=${String(c.verdict)}, ` +
          `demonstrationObtained=${c.demonstrationObtained} — never "incorrect"`
        : "the unaddressed link has no row",
    );
    check(
      "F1",
      back.length === 3 && new Set(back.map((e) => e.responseId)).size === 1,
      `one submission → one prompt → responseId ${multi.id.slice(0, 8)}… → ${back.length} objective-level rows`,
    );
    check(
      "F2",
      performancesIn(back).size === 1,
      `performancesIn(log).size === ${performancesIn(back).size} for that submission`,
    );
    const latencies = [...new Set(back.map((e) => e.responseLatencyMs))];
    check(
      "F3",
      latencies.length === 1 && latencies[0] === 41_200,
      `responseLatencyMs on every row: ${JSON.stringify(latencies)} — the whole measured duration, never divided`,
    );
    note(
      "F1-reachability",
      "PROVEN AT THE BOUNDARY, NOT REACHABLE BY A LEARNER. The only shipped prompt construction site is " +
        "use-policy-runtime.ts:763 → retrievalPromptFor, which hardcodes `targets: [targetFor(objective)]`. " +
        "No deployed path can produce a multi-target prompt.",
    );

    // §E2's sibling fact: the projection reads the unaddressed row as absence, not as failure.
    const unaddressedState = projectLearnerState(targeted[2]!.identityKey, back);
    check(
      "E2-projection",
      unaddressedState.status === "unknown",
      `the link the answer never mentioned projects to "${unaddressedState.status}" — an unasked question, not a failed one`,
    );
  }

  // ═════════════════════════════ §D5 / §D6 / §M3 — a correction, and what may follow it
  //
  // A REAL judged wrong answer on the four-fact acceptance canvas, then the policy replayed.
  const resolved = assocObjectives.map(({ knowledge, objective }) => ({ knowledge, objective })) as never[];
  const now = new Date();

  const target = assocObjectives.find((o) => o.objective.identityKey !== first.objective.identityKey) ?? first;
  const wrongPrompt = retrievalPromptFor(target, randomUUID());
  const wrongAnswer = "Diovan";
  const judged = await evaluateLearningResponse(
    userId,
    JUDGE_CANVAS,
    objectiveAsTask(target.objective, wrongPrompt, { text: wrongAnswer, tookMs: 5200, via: "typed" } as never),
  );
  check(
    "D6-judge",
    judged.value != null && judged.value.verdict !== "strong" && judged.value.verdict !== "understood",
    `real judge on "${wrongPrompt.prompt}" answered "${wrongAnswer}": verdict=${String(judged.value?.verdict)} ` +
      `confidence=${String(judged.value?.confidence)}${judged.error ? ` error=${judged.error}` : ""}`,
  );
  if (judged.value) {
    const rows = evidenceForSubmission({
      canvasId: null,
      judgement: judgementOf([outcomeFor(target.objective, judged.value)]),
      occurredAt: now.toISOString(),
      prompt: wrongPrompt,
      responseText: wrongAnswer,
      teachingStrategy: null,
      tookMs: 5200,
    });
    for (const row of rows) await recordEvidence(userId, row);
  }

  const beforeCorrection = await loadEvidence(userId, assocObjectives.map((o) => o.objective));
  const correctedKey = target.objective.identityKey;

  // 🔴 §D5 — RECEIVING A CORRECTION CREATES NO MASTERY EVIDENCE. The correction is shown and then
  // acknowledged. Both are session state, and the durable record must not move across either.
  const shown = decideNext({
    actedOn: [],
    correctionsShown: new Set<string>(),
    evidence: beforeCorrection,
    now,
    objectives: resolved,
  } as never);
  const afterShown = decideNext({
    actedOn: [],
    correctionsShown: new Set([correctedKey]),
    evidence: beforeCorrection,
    now,
    objectives: resolved,
  } as never);
  const acknowledged = decideNext({
    actedOn: [correctedKey],
    correctionsShown: new Set([correctedKey]),
    evidence: beforeCorrection,
    now,
    objectives: resolved,
  } as never);
  const afterAll = await loadEvidence(userId, assocObjectives.map((o) => o.objective));
  // 🔴 THE METRIC IS MASTERY, NOT ROW COUNT ALONE. `demonstrationObtained` is true whenever the
  // judge SPOKE about an objective, including to say `incorrect` — so counting it would report the
  // wrong-answer row as a mastery claim. What D5 forbids is a correction producing a verdict that
  // says the learner knows this: `strong` or `understood`.
  const mastery = (log: readonly LearnerEvidence[]): number =>
    log.filter((e) => e.verdict === "strong" || e.verdict === "understood").length;
  check(
    "D5",
    afterAll.length === beforeCorrection.length && mastery(afterAll) === mastery(beforeCorrection),
    `showing the correction and acknowledging it moved the durable record by ` +
      `${afterAll.length - beforeCorrection.length} rows (${beforeCorrection.length} → ${afterAll.length}); ` +
      `rows carrying a mastery verdict: ${mastery(beforeCorrection)} → ${mastery(afterAll)}`,
  );
  note(
    "D5-scope",
    "The acknowledge() function itself lives in use-policy-runtime.ts and cannot be executed from Node. " +
      "What is executed here is every durable write path it can reach, and the production row count across the sequence.",
  );

  const keyOf = (d: unknown): string | null =>
    (d as { objective?: { identityKey?: string } } | null)?.objective?.identityKey ?? null;

  // 🔴 §M3 — AFTER A CORRECTION, THE SAME OBJECTIVE MAY NOT BE THE IMMEDIATE NEXT PROMPT.
  check(
    "M3",
    keyOf(acknowledged) !== correctedKey,
    `corrected objective ${correctedKey.slice(0, 26)}… · next prompt is ` +
      `${String(keyOf(acknowledged)).slice(0, 26)}… (must differ) · shown=${String(keyOf(shown)).slice(0, 20)} ` +
      `afterShown=${String(keyOf(afterShown)).slice(0, 20)}`,
  );

  // 🔴 THE SMALL-SET CASE THE ENVELOPE SINGLES OUT: with ONE objective there is no "back of the
  // queue". This is where reordering cannot help and an eligibility constraint has to.
  const alone = [resolved[assocObjectives.findIndex((o) => o.objective.identityKey === correctedKey)]!] as never[];
  const aloneNext = decideNext({
    actedOn: [correctedKey],
    correctionsShown: new Set([correctedKey]),
    evidence: beforeCorrection,
    now,
    objectives: alone,
  } as never);
  const aloneAction = String((aloneNext as { action?: { type?: string } } | null)?.action?.type ?? "null");
  check(
    "M3-small-set",
    aloneAction !== "retrieve",
    `with ONE objective in the set there is no back of the queue. decideNext returns action="${aloneAction}" ` +
      `(interveningActs=${interveningActs(correctedKey, [correctedKey])}) — reordering cannot solve this, so a pass ` +
      `requires an eligibility constraint rather than a re-ask`,
  );

  // 🔴 §D6 — THE OBJECTIVE COMES BACK. A correction must not retire an objective; it must be asked
  // again after independent work. This walks the session the way a learner would: decide, act, feed
  // the act back, decide again. 🔴 IT IS NOT "IS IT NEXT AFTER N ACTS" — the policy legitimately
  // prefers never-established objectives first, and a test demanding an immediate return would fail
  // a system behaving exactly as the envelope's own priority heuristic says it should.
  // 🔴 THE WALK ANSWERS. Holding evidence constant and only growing `actedOn` is not a session — it
  // is the same question re-offered for ever, and `decideNext` is pure, so it correctly returns the
  // same objective every time. Measured before this was written: twelve identical turns. A session
  // that proves anything about re-demonstration has to WRITE what the learner did, re-read it, and
  // decide from that. Every verdict below comes from the real production judge; nothing is invented.
  const walk: { key: string; action: string; verdict: string }[] = [];
  let actedSoFar: string[] = [correctedKey];
  let log = beforeCorrection;
  let returned = -1;
  for (let turn = 0; turn < 8; turn += 1) {
    const step = decideNext({
      actedOn: actedSoFar,
      correctionsShown: new Set([correctedKey]),
      evidence: log,
      now,
      objectives: resolved,
    } as never);
    const chosen = keyOf(step);
    const action = String((step as { action?: { type?: string } } | null)?.action?.type ?? "null");
    if (!chosen) break;
    if (chosen === correctedKey && action === "retrieve") {
      returned = turn + 1;
      walk.push({ action, key: chosen, verdict: "—" });
      break;
    }
    let verdict = "—";
    if (action === "retrieve") {
      // A genuinely correct answer to a real question, read by the real judge.
      const entry = assocObjectives.find((o) => o.objective.identityKey === chosen)!;
      const turnPrompt = retrievalPromptFor(entry, randomUUID());
      const answered = await evaluateLearningResponse(
        userId,
        JUDGE_CANVAS,
        objectiveAsTask(entry.objective, turnPrompt, {
          text: String(entry.objective.answer),
          tookMs: 2600,
          via: "typed",
        } as never),
      );
      verdict = String(answered.value?.verdict ?? `unjudged(${answered.error ?? ""})`);
      if (answered.value) {
        for (const row of evidenceForSubmission({
          canvasId: null,
          judgement: judgementOf([outcomeFor(entry.objective, answered.value)]),
          occurredAt: new Date().toISOString(),
          prompt: turnPrompt,
          responseText: String(entry.objective.answer),
          teachingStrategy: null,
          tookMs: 2600,
        })) {
          await recordEvidence(userId, row);
        }
        log = await loadEvidence(userId, assocObjectives.map((o) => o.objective));
      }
    }
    walk.push({ action, key: chosen, verdict });
    actedSoFar = [...actedSoFar, chosen];
  }
  const trace = walk.map((w) => `${w.key.slice(11, 19)}:${w.action}${w.verdict === "—" ? "" : `/${w.verdict}`}`).join(" → ");
  check(
    "D6",
    returned > 0,
    returned > 0
      ? `the corrected objective is asked again at turn ${returned} of a real session walk over the four-objective ` +
        `acceptance canvas — never retired. Corrected=${correctedKey.slice(11, 19)}. Trace: ${trace}`
      : `the corrected objective did NOT return within ${walk.length} answered turns. Trace: ${trace}`,
  );

  // 🔴 THE NEGATIVE CONTROL THE ENVELOPE REQUIRES. The same non-evidence interactions, no new
  // evidence: if the decision moves on its own, every comparison above is void.
  const controlA = decideNext({ actedOn: [], evidence: beforeCorrection, now, objectives: resolved } as never);
  const controlB = decideNext({ actedOn: [], evidence: beforeCorrection, now, objectives: resolved } as never);
  check(
    "NEGATIVE-CONTROL",
    keyOf(controlA) === keyOf(controlB),
    `two calls, identical inputs, no submission between them → ${String(keyOf(controlA)).slice(0, 26)}… twice`,
  );

  // ── Summary ──────────────────────────────────────────────────────────────
  //
  // 🔴 THE LEARNER AND ITS MARKER ARE PRINTED SO A LATER CLEANUP HAS POSITIVE PROVENANCE. Rows are
  // NOT deleted here: they are the evidence for every claim above, and a run that erases its own
  // proof leaves a report nobody can check. Delete on this `user_id` plus a `created_at` inside the
  // window below — never on a time range alone, and never on `updated_at`.
  console.log(`\nlearner      ${userId}`);
  console.log(`marker       ${email}`);
  console.log(`window       ${new Date().toISOString()} (run end)`);
  console.log(`\n${results.filter((r) => r.pass).length}/${results.length} checks recorded, ${failures} failed`);
  console.log(`${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exit(1);
});
