/**
 * The typed answer, proven in a real browser: question → keystrokes → judge → durable evidence
 * → learner model → a different next action.
 *
 * 🔴🔴🔴 WHY THIS SCRIPT EXISTS AND WHY IT IS NOT A UNIT TEST. A learner could read a real
 * question, type a real answer, press a button labelled `Submit answer`, and have the text routed
 * into `begin()` — no judge, no row, no error. Three thousand nine hundred unit tests were green
 * throughout, because every one of them tested a piece: the intent, the sink, the judge, the write.
 * What was broken was the WIRING between them, and the only instrument that can see wiring is a
 * browser pressing the button.
 *
 * 🔴 REAL KEYSTROKES, NEVER `fill()`. Playwright's `fill()` sets the DOM value and dispatches one
 * synthetic `input`; a controlled React textarea can end up with the right value on the element and
 * an empty string in component state, so submit sends nothing and the harness reports a product
 * failure that does not exist. `keyboard.type()` produces real key events. This was measured — it
 * cost a whole investigation once.
 *
 * 🔴 WHAT IS PRODUCTION HERE AND WHAT IS NOT. Everything below the browser is production: the real
 * Supabase project, the real row-level security, the real deployed edge functions, the real models,
 * a real parsed lecture. The PAGE is this commit's production build (`next build` → `next start`)
 * served on localhost, because app.enternemesis.com sits behind Cloudflare Turnstile, which
 * correctly refuses an automated browser. The only difference from the deployed page is the absence
 * of that bot check. It is stated here rather than glossed.
 *
 * Usage, from apps/web, with the app already built and served:
 *   NEXT_PUBLIC_SUPABASE_URL=… NEXT_PUBLIC_SUPABASE_ANON_KEY=… SUPABASE_SERVICE_KEY=… \
 *     APP_ORIGIN=http://localhost:3947 npx tsx scripts/typed-answer-browser.ts
 *
 * The service key seeds and then deletes one throwaway `@nemesis.test` learner and copies one of
 * the owner's already-parsed lectures onto it. Every learner-side write is made by the BROWSER,
 * under that learner's own JWT, through row-level security.
 */

import { randomUUID } from "node:crypto";

import { chromium, type Page } from "playwright";

import { extractKnowledgeObjects } from "@/lib/learn/knowledge-extraction";
import { objectivesForKnowledge } from "@/lib/learn/learning-objective";
import { baseQuestionFor } from "@/lib/learn/objective-task";
import { projectAll } from "@/lib/learn/learner-evidence";
import { evidenceFromRow, EVIDENCE_SELECT, knowledgeFromRow } from "@/lib/learn/learner-store";
import { sourceContextFromModel } from "@/lib/sources/source-context";

const SB = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_KEY!;
const ORIGIN = process.env.APP_ORIGIN ?? "http://localhost:3947";
/** The owner's real pharmacokinetics lecture, parsed by the production worker. */
const SOURCE_ID = process.env.ACCEPTANCE_SOURCE_ID ?? "5a60cf4a-7a4c-487b-bce6-ab7246364b59";
const PROJECT_REF = new URL(SB).hostname.split(".")[0]!;
const HEADED = process.env.HEADED === "1";

const svc = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" };

let failures = 0;
function check(id: string, pass: boolean, detail = ""): void {
  if (!pass) failures += 1;
  console.log(`${pass ? "PASS" : "FAIL"}  ${id}${detail ? ` — ${detail}` : ""}`);
}
function note(line: string): void {
  console.log(`      ${line}`);
}

async function rest(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${SB}/rest/v1/${path}`, { ...init, headers: { ...svc, ...(init?.headers ?? {}) } });
}

/**
 * Evidence as the learner's own rows, read back with the service key so the harness sees exactly
 * what is durable rather than what the page believes.
 *
 * 🔴 MAPPED BY `evidenceFromRow`, THE APP'S OWN READER, NOT BY HAND. The first version of this
 * passed the raw snake_case rows straight into `projectAll`, which reads `demonstrationObtained`
 * and `objectiveIdentityKey` — so every row arrived as `undefined` and every objective projected
 * as `not_demonstrated`. The check still went green, and its output was decorative. A model check
 * that cannot tell a demonstration from a blank is not checking the model.
 */
async function evidenceFor(userId: string) {
  const rows = (await rest(
    `learner_evidence?user_id=eq.${userId}&select=${EVIDENCE_SELECT},learning_objectives(identity_key)&order=occurred_at.asc`,
  ).then((r) => r.json())) as (Record<string, unknown> & { learning_objectives?: { identity_key?: string } })[];
  return rows.map((row) => evidenceFromRow(row, row.learning_objectives?.identity_key ?? ""));
}

interface Row {
  readonly id: string;
  readonly verdict: string | null;
  readonly response_modality: string | null;
  readonly response_text: string | null;
  readonly demonstration_obtained: boolean;
  readonly error_type: string | null;
  readonly confidence: number | null;
  readonly objective_id: string;
  readonly scaffold_rung: string | null;
  readonly teaching_strategy: string | null;
  readonly learning_objectives: { identity_key: string; capability: string } | null;
}

// ── The surface, addressed the way a learner meets it ────────────────────────

/** The composer's textarea. Its placeholder is the proof of the intent: `Type your answer…` only
 *  appears when the runtime has decided this submission IS an answer. */
const COMPOSER = "textarea";
const SUBMIT = 'button[aria-label="Submit answer"]';

/**
 * 🔴 THE FIRST THING A NEW LEARNER MEETS IS THE SEMESTER SET-UP, AND IT COVERS THE CANVAS. Three
 * steps — courses, syllabus, coursework — painted over everything. A harness that does not dismiss
 * it waits for a question behind a wizard and reports the product as hung; measured exactly that
 * way before this existed, twice. It is checked on every poll rather than once after load, because
 * it does not necessarily render before the first paint.
 */
async function dismissOnboarding(page: Page): Promise<boolean> {
  const skip = page.getByRole("button", { name: /^Skip setup$/ });
  if (!(await skip.count())) return false;
  await skip.first().click();
  return true;
}

async function waitForQuestion(page: Page, timeoutMs = 180_000, differentFrom: string | null = null): Promise<string> {
  // 🔴 THE PLACEHOLDER, NOT THE PRESENCE OF A HEADING. A heading is on screen for a lesson, a
  // correction and a verdict too; the placeholder is the composer saying what a press would mean.
  // It is also the intent, visible: "Type your answer…" appears only when `composerIntent` has
  // resolved to `answer`, so waiting on it is waiting on the thing under test.
  //
  // 🔴 AND IT PRESSES ON THROUGH TEACHING, BECAUSE THE POLICY OFTEN TEACHES FIRST. Measured: this
  // learner's opening action was `show_correction` — *"Here's the one to fix. Constant → Amount
  // removed/time"* — with the composer reading "Ask Nemesis or change how you're learning…". A
  // harness that only waits reports the product as hung when it is working exactly as designed.
  const until = Date.now() + timeoutMs;
  for (;;) {
    if (await dismissOnboarding(page)) console.log("      (semester set-up dismissed the way a learner would)");
    const ready = await page.evaluate(() => {
      const box = document.querySelector("textarea");
      return Boolean(box && (box as HTMLTextAreaElement).placeholder.startsWith("Type your answer"));
    });
    // 🔴 THE SWAP IS NOT INSTANT, AND SAMPLING THROUGH IT READS THE PREVIOUS QUESTION. The composer
    // keeps its answering placeholder across the transition, so "is a question up?" is true before
    // the NEW one has painted. Measured: an answer judged `strong` looked like the policy re-staging
    // the same objective, which would have been reported as a defect in the policy rather than in
    // the instrument. Waiting for the text to actually change separates the two.
    if (ready && (differentFrom === null || (await page.locator("h2").first().innerText()).trim() !== differentFrom)) break;
    if (Date.now() > until) {
      const seen = (await page.locator("body").innerText()).replace(/\n{2,}/g, " / ").slice(0, 400);
      throw new Error(`no answerable question after ${Math.round(timeoutMs / 1000)}s. On screen: ${seen}`);
    }
    await advance(page);
    await new Promise((r) => setTimeout(r, 1_500));
  }
  return (await page.locator("h2").first().innerText()).trim();
}

/** Type it the way a person does, then press the button they see. */
async function answer(page: Page, text: string): Promise<void> {
  await page.locator(COMPOSER).click();
  await page.keyboard.type(text, { delay: 12 });
  const inState = await page.locator(COMPOSER).inputValue();
  if (inState !== text) throw new Error(`the composer did not receive the keystrokes: ${JSON.stringify(inState)}`);
  await page.locator(SUBMIT).click();
}

/** The verdict is on screen and the answer has settled into a row. */
async function waitForRow(userId: string, atLeast: number, timeoutMs = 180_000): Promise<Row[]> {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const rows = (await rest(
      `learner_evidence?user_id=eq.${userId}&select=id,verdict,response_modality,response_text,demonstration_obtained,error_type,confidence,objective_id,scaffold_rung,teaching_strategy,learning_objectives(identity_key,capability)&order=occurred_at.asc`,
    ).then((r) => r.json())) as Row[];
    if (rows.length >= atLeast) return rows;
    if (Date.now() > until) return rows;
    await new Promise((r) => setTimeout(r, 2_000));
  }
}

/** Press on to whatever the policy chose next. */
async function advance(page: Page): Promise<void> {
  const button = page.getByRole("button", { name: /^Continue$/ });
  if (await button.count()) await button.first().click();
}

async function main(): Promise<void> {
  // ── A real learner, entitled the way a paying one is ──────────────────────
  const email = `typed+${randomUUID()}@nemesis.test`;
  const password = `Pb!${randomUUID()}Aa1`;
  const created = await fetch(`${SB}/auth/v1/admin/users`, {
    method: "POST",
    headers: svc,
    body: JSON.stringify({ email, password, email_confirm: true }),
  }).then((r) => r.json());
  const userId: string = created?.id ?? created?.user?.id;
  if (!userId) throw new Error(`could not seed a learner: ${JSON.stringify(created).slice(0, 300)}`);

  // 🔴 A PAID ROW, NOT A RAISED FREE TIER. The free plan's 75,000 daily `nemesis_llm` tokens are a
  // real product limit; a run that exhausted them once looked exactly like the product failing, and
  // the fix is to make the throwaway learner a paying one, not to move everyone's ceiling.
  await rest("subscriptions", {
    method: "POST",
    body: JSON.stringify({ user_id: userId, plan: "pro", status: "active", billing_provider: "stripe" }),
  });

  const token = await fetch(`${SB}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  }).then((r) => r.json());
  if (!token?.access_token) throw new Error(`could not sign in: ${JSON.stringify(token).slice(0, 300)}`);
  check("AUTH", true, `learner ${userId.slice(0, 8)}… signed in, plan pro`);

  // ── The learner's own copy of a real parsed lecture ───────────────────────
  //
  // 🔴 COPIED, NOT SHARED. `library_sources` and `parsed_documents` are both row-level-security
  // scoped to their owner, so pointing a throwaway learner at the owner's row would read nothing and
  // the canvas would be empty for a reason that has nothing to do with what is being tested. The
  // PARSE is the owner's real one, produced by the production worker; only the ownership is new.
  const [src] = await rest(`library_sources?id=eq.${SOURCE_ID}&select=*`).then((r) => r.json());
  if (!src?.parsed_document_id) throw new Error(`source ${SOURCE_ID} has no parse`);
  const [parsed] = await rest(`parsed_documents?id=eq.${src.parsed_document_id}&select=*`).then((r) => r.json());
  if (!parsed?.structure?.model) throw new Error("the stored parse carries no document model");

  const parsedId = randomUUID();
  const sourceId = randomUUID();
  const pdWrite = await rest("parsed_documents", {
    method: "POST",
    body: JSON.stringify({ ...parsed, id: parsedId, user_id: userId, created_at: undefined, updated_at: undefined }),
  });
  const lsWrite = await rest("library_sources", {
    method: "POST",
    body: JSON.stringify({
      ...src,
      id: sourceId,
      user_id: userId,
      parsed_document_id: parsedId,
      created_at: undefined,
      parse_lease_owner: null,
      parse_lease_token: null,
    }),
  });
  check(
    "SOURCE",
    pdWrite.ok && lsWrite.ok,
    pdWrite.ok && lsWrite.ok
      ? `${src.file_name} · ${parsed.unit_count} units, owned by the learner`
      : `${pdWrite.status}/${lsWrite.status} ${(await lsWrite.text()).slice(0, 200)}`,
  );
  if (!pdWrite.ok || !lsWrite.ok) process.exit(1);

  // ── What the runtime will ask, worked out the same way it works it out ────
  //
  // Only so the harness knows a CORRECT answer to type. The page derives its own question; this
  // never reaches the browser.
  const context = sourceContextFromModel({
    sourceId,
    sourceKind: parsed.doc_kind ?? "pdf",
    model: parsed.structure.model,
  });
  const knowledge = [...extractKnowledgeObjects(context).objects];
  const expected = new Map<string, { answer: string; identityKey: string; label: string }>();
  for (const k of knowledge) {
    for (const objective of objectivesForKnowledge(k)) {
      expected.set(baseQuestionFor({ knowledge: k, objective }).trim(), {
        answer: objective.answer,
        identityKey: objective.identityKey,
        label: objective.label,
      });
    }
  }

  /**
   * Find the objective a rendered question belongs to.
   *
   * 🔴 CONTAINMENT, NOT EQUALITY, AND THAT IS NOT SLOPPINESS. The screen shows the SCAFFOLDED
   * prompt: `retrievalPromptFor` wraps the base sentence per rung, so an `explain` objective renders
   * as *"Explain this relationship in your own words: 1o determine the outcome of 2o parameters"* —
   * the base question with a lead in front of it. An exact match reports "the harness cannot answer
   * this" on a question the product asked perfectly well.
   */
  /**
   * Add whatever the BROWSER has minted since, read from the learner's own durable rows.
   *
   * 🔴 THE DETERMINISTIC LANE IS NOT ALL THE KNOWLEDGE THERE IS. `extractKnowledgeObjects` is the
   * grid lane — model-free and reproducible here — but `ensureKnowledgeForCanvas` also runs
   * `mechanismsFor`, which is a MODEL CALL. Its causal objects cannot be precomputed, so a
   * `predict` question like *"What follows from enzyme limited state, and why?"* was reported as
   * one the harness could not answer when the product had asked it perfectly well. The answers are
   * durable the moment the page writes them, so they are read back rather than guessed.
   */
  const refreshExpected = async (): Promise<void> => {
    // 🔴 `knowledgeFromRow`, NOT `row.payload`. `saveKnowledge` splits a knowledge object across
    // real columns (`type`, `statement`, `identity_key`) and a `payload` jsonb; reading the payload
    // alone hands `objectivesForKnowledge` an object with no type and gets nothing back — which
    // looked exactly like "the harness cannot answer this question" on every model-minted causal
    // objective. The app's own reader is the only thing that knows how the row was taken apart.
    const rows = (await rest(
      `knowledge_objects?user_id=eq.${userId}&select=type,statement,relation_kind,identity_key,extraction_version,payload`,
    ).then((r) => r.json())) as Parameters<typeof knowledgeFromRow>[0][];
    for (const row of rows) {
      if (!row?.type) continue;
      const knowledgeObject = knowledgeFromRow(row);
      for (const objective of objectivesForKnowledge(knowledgeObject)) {
        expected.set(baseQuestionFor({ knowledge: knowledgeObject, objective }).trim(), {
          answer: objective.answer,
          identityKey: objective.identityKey,
          label: objective.label,
        });
      }
    }
  };

  /**
   * 🔴 IT RETURNS EVERY OBJECTIVE THE SENTENCE COULD BE, BECAUSE THE SENTENCE IS NOT UNIQUE.
   * Measured: both directions of the pair `Constant ↔ Fraction removed/time` render as *"What is the
   * characteristic for Constant?"*, so the text on screen identifies the objective only up to that
   * ambiguity — and answering it can satisfy at most one of them, which is why the judge came back
   * `partial` on the source's own answer. Picking one and asserting equality reports a routing
   * failure for a wording problem. (The wording itself is Brain's, and is worth their attention: a
   * learner cannot tell which of the two they are being asked.)
   */
  const lookUp = (asked: string): { answer: string; identityKeys: string[]; label: string } | null => {
    const flat = (text: string) => text.replace(/\s+/g, " ").trim().toLowerCase();
    const target = flat(asked);
    const hits = [...expected.entries()].filter(([question]) => {
      const base = flat(question);
      return target === base || target.includes(base) || base.includes(target);
    });
    if (hits.length === 0) return null;
    const longest = hits.reduce((a, b) => (b[0].length > a[0].length ? b : a));
    return {
      answer: longest[1].answer,
      identityKeys: hits.map(([, entry]) => entry.identityKey),
      label: longest[1].label,
    };
  };
  check("KNOWLEDGE", expected.size > 0, `${knowledge.length} knowledge objects · ${expected.size} answerable questions`);

  // ── A canvas in the exact state the defect lived in ───────────────────────
  //
  // 🔴 `sources_attached`, WHICH IS THE POINT. That is what a canvas is after material is attached
  // and before anyone presses send — the state `preContent` read as "this has not begun" while the
  // policy had a question on screen. Every typed answer here used to go to `begin()`.
  const canvasId = randomUUID();
  const canvasWrite = await rest("learning_canvases", {
    method: "POST",
    body: JSON.stringify({
      id: canvasId,
      user_id: userId,
      title: src.file_name.replace(/\.[a-z]+$/i, "").replace(/_/g, " "),
      state: "sources_attached",
      level: null,
      active_ms: 0,
      created_at: new Date().toISOString(),
      document: {
        sources: [
          {
            id: "s1",
            title: src.file_name,
            kind: parsed.doc_kind ?? "pdf",
            excerpts: [],
            durability: "durable",
            librarySourceId: sourceId,
          },
        ],
        blocks: [], concepts: [], recall: [], recallResults: [], questions: [],
        answers: [], responses: [], correctiveAttempts: {}, events: [], outputs: [],
        weakConceptIds: [], correctedConceptIds: [],
      },
    }),
  });
  check("CANVAS", canvasWrite.ok, canvasWrite.ok ? `canvas ${canvasId.slice(0, 8)}… at sources_attached` : `${canvasWrite.status} ${(await canvasWrite.text()).slice(0, 200)}`);
  if (!canvasWrite.ok) process.exit(1);

  // ── The browser ──────────────────────────────────────────────────────────
  const browser = await chromium.launch({ headless: !HEADED });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const consoleErrors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200)); });
  // 🔴 COUNTED AT THE WIRE, NOT INFERRED FROM LOGS. One production submission was observed making
  // roughly 133 canvas writes in 70 seconds; this is the instrument that says whether that is still
  // true and how it splits, per phase, without anybody having to guess from a log line.
  const canvasWrites: { at: number; method: string }[] = [];
  const otherWrites = new Map<string, number>();
  page.on("request", (r) => {
    const url = r.url();
    if (!url.includes("/rest/v1/")) return;
    if (r.method() === "GET") return;
    const table = url.split("/rest/v1/")[1]!.split("?")[0]!;
    if (table === "learning_canvases") canvasWrites.push({ at: Date.now(), method: r.method() });
    else otherWrites.set(table, (otherWrites.get(table) ?? 0) + 1);
  });
  const writesSince = (from: number) => canvasWrites.filter((w) => w.at >= from).length;

  // 🔴 THE SEMESTER SET-UP IS MARKED DONE THE WAY A RETURNING LEARNER'S BROWSER MARKS IT. A brand
  // new account is met by a three-step wizard painted `fixed inset-0 z-50` over everything, and its
  // "Skip setup" only sets `setShow(false)` plus this same localStorage marker — measured: clicking
  // it dismissed the wizard and it came back on the next remount, so a harness that clicks is
  // racing a modal instead of testing the canvas. Onboarding is not what is under test here.
  await page.addInitScript(
    ([key, session, onboardingKey, onboarding]) => {
      window.localStorage.setItem(key as string, session as string);
      window.localStorage.setItem(onboardingKey as string, onboarding as string);
    },
    [
      `sb-${PROJECT_REF}-auth-token`,
      JSON.stringify({
        access_token: token.access_token,
        refresh_token: token.refresh_token,
        token_type: "bearer",
        expires_in: token.expires_in,
        expires_at: Math.floor(Date.now() / 1000) + (token.expires_in ?? 3600),
        user: token.user,
      }),
      "nemesis.web.onboarding.v1",
      JSON.stringify({ at: new Date().toISOString(), outcome: "skipped" }),
    ] as const,
  );

  await page.goto(`${ORIGIN}/learn?c=${canvasId}`, { waitUntil: "domcontentloaded" });


  const results: { label: string; asked: string; typed: string }[] = [];

  // ── A. a CORRECT typed answer ─────────────────────────────────────────────
  const askedA = await waitForQuestion(page);
  await refreshExpected();
  const knownA = lookUp(askedA);
  check("A-question", Boolean(askedA), `“${askedA.slice(0, 90)}”`);
  check("A-answer-surface", Boolean(knownA), knownA ? `expected answer known: “${knownA.answer.slice(0, 60)}”` : "the rendered question is not one this harness can answer");
  if (!knownA) { await browser.close(); process.exit(1); }
  const beforeA = Date.now();
  await answer(page, knownA.answer);
  results.push({ label: "A correct", asked: askedA, typed: knownA.answer });
  let rows = await waitForRow(userId, 1);
  note(`canvas writes across submitting one answer: ${writesSince(beforeA)}`);
  check("A-row", rows.length >= 1, rows.length ? `${rows.length} durable row(s)` : "NO ROW — the answer never reached the judge");
  if (!rows.length) { await browser.close(); process.exit(1); }
  const a = rows[0]!;
  check("A-modality", a.response_modality === "typed", `response_modality=${a.response_modality}`);
  check("A-verbatim", a.response_text === knownA.answer, `response_text=${JSON.stringify((a.response_text ?? "").slice(0, 60))}`);
  check("A-judged", a.verdict !== null, `verdict=${a.verdict} · confidence=${a.confidence} · demonstration=${a.demonstration_obtained}`);
  // 🔴 "NOT JUDGED WRONG", NOT "JUDGED `strong`". The source's own recorded answer is what a correct
  // learner types, and the judge is free to read it as `partial` — measured: *"What is the
  // characteristic for Constant?"* answered `Fraction removed/time` came back `partial` at 0.6 on a
  // direction-sensitive glossary pair. That is a judge-quality observation worth reporting, not a
  // routing failure, and asserting `strong` here would make this harness fail on the product being
  // honest. What must never happen is the right answer recorded as WRONG.
  check(
    "A-demonstrated",
    a.demonstration_obtained === true && a.verdict !== "incorrect" && a.verdict !== "misconception",
    `the source's own answer read as ${a.verdict}`,
  );
  check("A-one-objective", rows.length === 1, `exactly one objective was credited, not every objective the question touched`);
  // 🔴 THE MANDATE'S REAL CLAIM: attached to the objective ACTUALLY on screen, by identity.
  check(
    "A-right-objective",
    knownA.identityKeys.includes(a.learning_objectives?.identity_key ?? ""),
    `${a.learning_objectives?.identity_key?.slice(0, 30)}… is one of the ${knownA.identityKeys.length} objective(s) that sentence can name`,
  );
  note(`objective ${a.learning_objectives?.identity_key?.slice(0, 52)}… · capability ${a.learning_objectives?.capability} · rung ${a.scaffold_rung} · arm ${a.teaching_strategy}`);

  // ── the next action responds ─────────────────────────────────────────────
  await advance(page);
  // 🔴 A BOUNDED WAIT FOR A DIFFERENT QUESTION, THEN AN HONEST FALLBACK. If the policy genuinely
  // re-stages the same objective — which is correct after an unresolved attempt — this times out and
  // we read whatever is there, rather than failing the product for adapting.
  let askedB = await waitForQuestion(page, 45_000, askedA).catch(() => null);
  const restaged = askedB === null;
  if (askedB === null) askedB = await waitForQuestion(page);
  // 🔴 EVIDENCE-RESPONSIVE, NOT "ALWAYS SOMETHING NEW". A full demonstration must move the policy on;
  // an unresolved one may legitimately be re-staged, and measured it is — a `partial` put the SAME
  // objective back, which is the adaptive behaviour, not a stuck screen. Demanding a different
  // question would have failed the product for doing the right thing.
  const settled = a.verdict === "strong" || a.verdict === "understood";
  check(
    "A-next-action",
    settled ? !restaged : true,
    restaged
      ? `the policy re-staged the same objective after ${a.verdict}`
      : `the policy moved on after ${a.verdict}: “${askedB.slice(0, 70)}”`,
  );

  // ── B. an INCORRECT typed answer ─────────────────────────────────────────
  await refreshExpected();
  const knownB = lookUp(askedB);
  check("B-question", Boolean(knownB), knownB ? "known question" : "unknown question — cannot construct a wrong answer for it");
  if (!knownB) { await browser.close(); process.exit(1); }
  // A confident, plausible, wrong answer — not gibberish, which the runtime would file as a
  // non-attempt before the judge ever saw it.
  const wrong = "It stays exactly the same, because that value is fixed for every patient.";
  await answer(page, wrong);
  results.push({ label: "B incorrect", asked: askedB, typed: wrong });
  rows = await waitForRow(userId, 2);
  check("B-row", rows.length >= 2, `${rows.length} durable rows`);
  const b = rows[1];
  if (b) {
    check("B-modality", b.response_modality === "typed", `response_modality=${b.response_modality}`);
    check("B-judged-wrong", b.verdict === "incorrect" || b.verdict === "misconception" || b.verdict === "partial", `verdict=${b.verdict}`);
    check("B-diagnosis-survives", b.error_type !== null || b.verdict === "misconception", `error_type=${b.error_type}`);
    check(
      "B-right-objective",
      knownB.identityKeys.includes(b.learning_objectives?.identity_key ?? ""),
      `evidence is attached to an objective the question on screen actually names`,
    );
  }

  // ── C. a PARTIAL answer must not establish the whole objective ───────────
  await advance(page);
  const askedC = await waitForQuestion(page);
  await refreshExpected();
  const knownC = lookUp(askedC);
  check("C-question", Boolean(knownC), knownC ? "known question" : "unknown question");
  if (knownC) {
    // The first clause of a real answer and nothing else — a genuine half.
    const half = knownC.answer.split(/[,;]| and | because /i)[0]!.trim();
    const partial = half.length > 3 && half !== knownC.answer ? half : knownC.answer.split(/\s+/).slice(0, Math.max(1, Math.ceil(knownC.answer.split(/\s+/).length / 2))).join(" ");
    await answer(page, partial);
    results.push({ label: "C partial", asked: askedC, typed: partial });
    rows = await waitForRow(userId, 3);
    check("C-row", rows.length >= 3, `${rows.length} durable rows`);
    const c = rows[2];
    if (c) {
      check("C-modality", c.response_modality === "typed", `response_modality=${c.response_modality}`);
      check(
        "C-not-full-credit",
        !(c.demonstration_obtained === true && c.verdict === "strong"),
        `a half answer read as ${c.verdict} (demonstration=${c.demonstration_obtained}) — full credit would be a false claim`,
      );
    }
  }

  // ── The learner model reads what the browser wrote ───────────────────────
  const evidence = await evidenceFor(userId);
  const state = projectAll(evidence);
  const known = [...state.values()];
  check("MODEL", known.length > 0, `${known.length} objective(s): ${known.map((s) => `${s.status}×${s.evidenceCount}`).join(", ")}`);
  // 🔴 THE MODEL MUST HAVE READ THE VERDICTS, NOT MERELY COUNTED THE ROWS. Three typed answers —
  // one right, one wrong, one half — must project as three DIFFERENT things, or the projection is
  // seeing rows it cannot interpret.
  const statuses = new Set(known.map((s) => s.status));
  check(
    "MODEL-reads-verdicts",
    known.every((s) => s.status !== "unknown") && statuses.size > 1,
    `distinct statuses: ${[...statuses].join(", ")}`,
  );
  // 🔴 EVERY ANSWER MUST HAVE REACHED THE MODEL. Counting rows is not enough — the projection has to
  // have understood them, which is what `demonstrationCount` reports.
  const seen = known.reduce((total, one) => total + one.evidenceCount, 0);
  check("MODEL-every-answer", seen === rows.length, `${seen} of ${rows.length} durable rows reached the learner model`);

  console.log("");
  note(`canvas writes over the whole run: ${canvasWrites.length}`);
  for (const [table, n] of [...otherWrites.entries()].sort((a, b) => b[1] - a[1])) note(`  ${table}: ${n}`);
  for (const r of results) note(`${r.label}: “${r.asked.slice(0, 70)}” ← “${r.typed.slice(0, 60)}”`);
  if (consoleErrors.length) { console.log(""); note(`browser console errors: ${consoleErrors.slice(0, 4).join(" | ")}`); }

  await browser.close();

  // ── Cleanup ──────────────────────────────────────────────────────────────
  if (process.env.KEEP_LEARNER !== "1") {
    await fetch(`${SB}/auth/v1/admin/users/${userId}`, { method: "DELETE", headers: svc });
    const [left] = await rest(`learner_evidence?user_id=eq.${userId}&select=id`).then((r) => r.json());
    check("CLEANUP", !left, left ? "rows survived the learner" : "throwaway learner and everything of theirs removed");
  } else {
    note(`KEEP_LEARNER=1 — learner ${userId} and canvas ${canvasId} left in place`);
  }

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
