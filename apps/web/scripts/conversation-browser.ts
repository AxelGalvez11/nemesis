/**
 * `hello`, typed into a real Nemesis in a real browser — and what happens to it.
 *
 * 🔴🔴🔴 THE DEFECT THIS PROVES FIXED. Typed text on a fresh canvas was read by a regex classifier
 * whose last rule was "not a question, so it is a topic to teach". `hello` therefore meant *teach
 * me the topic hello*: a lesson, a canvas re-titled `hello`, and no reply. Nothing errored, and
 * every unit test was green, because what was wrong was the WIRING between a reader and a model —
 * and the only instrument that sees wiring is a browser pressing the button.
 *
 * 🔴 IT ENTERS THE WAY THE OWNER DID. `hello` is not typed into an existing canvas: the script
 * navigates to `/learn?ask=hello`, which is where `canvas-home.tsx` sends whatever is typed on the
 * front door. The page mints the canvas and consumes the opening instruction through the same
 * `beginOrAnswer` the composer uses, latched by `askedOnce`. Everything after turn 1 is typed into
 * the composer of that same canvas, so both entries are exercised in one run.
 *
 * It answers the five questions the owner asked for, in order:
 *   1. the utterance reaches the model                     (the request is captured at the wire)
 *   2. the model gets the orchestration prompt             (the packet is read, not assumed)
 *   3. `hello` does not enter the teaching controller      (the canvas row is still untouched)
 *   4. the reply is rendered                               (read off the page the learner sees)
 *   5. the next turn still has the conversation            (turn 2's packet carries turn 1)
 * and then the other half: a genuine teaching request still reaches the teaching machinery.
 *
 * 🔴 REAL KEYSTROKES, NEVER `fill()`. Playwright's `fill()` sets the DOM value and dispatches one
 * synthetic `input`; a controlled React textarea can end up with the right value on the element and
 * an empty string in component state, so submit sends nothing and the harness reports a product
 * failure that does not exist. This cost a whole investigation once.
 *
 * 🔴 WHAT IS PRODUCTION HERE AND WHAT IS NOT. Everything below the browser is production: the real
 * Supabase project, the real row-level security, the real deployed valve, the real model. The PAGE
 * is this commit's production build (`next build` → `next start`) served on localhost, because
 * app.enternemesis.com sits behind Cloudflare Turnstile, which correctly refuses an automated
 * browser. The only difference from the deployed page is the absence of that bot check.
 *
 * Usage, from apps/web, with the app already built and served:
 *   NEXT_PUBLIC_SUPABASE_URL=… NEXT_PUBLIC_SUPABASE_ANON_KEY=… SUPABASE_SERVICE_KEY=… \
 *     APP_ORIGIN=http://localhost:3947 npx tsx scripts/conversation-browser.ts
 */

import { randomUUID } from "node:crypto";

import { chromium, type Page } from "playwright";

const SB = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ORIGIN = process.env.APP_ORIGIN ?? "http://localhost:3947";
const PROJECT_REF = new URL(SB).hostname.split(".")[0]!;
const HEADED = process.env.HEADED === "1";
/** Where to write what the learner saw. Off unless asked for: a proof nobody looks at is a cost. */
const SHOTS = process.env.SHOT_DIR ?? "";

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

interface WireMsg { role: string; content: string }
interface Turn { messages: WireMsg[]; reply: string | null }

const COMPOSER = "textarea";
// 🔴 EITHER LABEL, AND WHICH ONE IS ITSELF INFORMATION. The button says "Send" for a turn of
// conversation and "Submit answer" once Nemesis is visibly asking something — that is
// `composerIntent` on screen. A harness pinned to one of them reports the product as hung the
// moment the other is correct.
const SEND = 'button[aria-label="Send"], button[aria-label="Submit answer"]';

/** The semester set-up is painted `fixed inset-0 z-50` over a new learner's first canvas. */
async function dismissOnboarding(page: Page): Promise<void> {
  const skip = page.getByRole("button", { name: /^Skip setup$/ });
  if (await skip.count()) await skip.first().click();
}

/** Type it the way a person does, then press the button they see. */
async function say(page: Page, text: string, waitMs = 30_000): Promise<string> {
  // 🔴 THE COMPOSER IS NOT ALWAYS MOUNTED. While a canvas resolves its knowledge, `learning-canvas`
  // returns early with no composer at all — correctly, since painting the previous runtime would
  // start generating a lesson for a canvas the policy is about to own. A harness that types
  // immediately reports the product as broken when it is thinking.
  await page.waitForSelector(COMPOSER, { timeout: waitMs });
  const placeholder = await page.evaluate(
    () => (document.querySelector("textarea") as HTMLTextAreaElement | null)?.placeholder ?? "",
  );
  await page.locator(COMPOSER).click();
  await page.keyboard.type(text, { delay: 12 });
  const inState = await page.locator(COMPOSER).inputValue();
  if (inState !== text) throw new Error(`the composer did not receive the keystrokes: ${JSON.stringify(inState)}`);
  await page.locator(SEND).first().click();
  return placeholder;
}

async function waitFor<T>(what: string, read: () => Promise<T | null>, timeoutMs = 90_000): Promise<T | null> {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const value = await read();
    if (value !== null) return value;
    if (Date.now() > until) {
      console.log(`      (timed out after ${Math.round(timeoutMs / 1000)}s waiting for ${what})`);
      return null;
    }
    await new Promise((r) => setTimeout(r, 750));
  }
}

async function main(): Promise<void> {
  // ── A real learner, entitled the way a paying one is ──────────────────────
  const email = `talk+${randomUUID()}@nemesis.test`;
  const password = `Pb!${randomUUID()}Aa1`;
  const created = await fetch(`${SB}/auth/v1/admin/users`, {
    body: JSON.stringify({ email, password, email_confirm: true }),
    headers: svc,
    method: "POST",
  }).then((r) => r.json());
  const userId: string = created?.id ?? created?.user?.id;
  if (!userId) throw new Error(`could not seed a learner: ${JSON.stringify(created).slice(0, 300)}`);
  await rest("subscriptions", {
    body: JSON.stringify({ billing_provider: "stripe", plan: "pro", status: "active", user_id: userId }),
    method: "POST",
  });
  const token = await fetch(`${SB}/auth/v1/token?grant_type=password`, {
    body: JSON.stringify({ email, password }),
    headers: { apikey: ANON, "Content-Type": "application/json" },
    method: "POST",
  }).then((r) => r.json());
  if (!token?.access_token) throw new Error(`could not sign in: ${JSON.stringify(token).slice(0, 300)}`);
  check("AUTH", true, `learner ${userId.slice(0, 8)}… signed in, plan pro`);

  // ── The browser ──────────────────────────────────────────────────────────
  const browser = await chromium.launch({ headless: !HEADED });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  // 🔴 CAPTURED AT THE WIRE, NOT INFERRED. What was sent and what came back are read off the actual
  // HTTP exchange with the deployed valve, so "the utterance reached the model" is an observation
  // rather than a belief about the code path.
  const turns: Turn[] = [];
  page.on("response", (response) => {
    if (!response.url().includes("/nemesis-llm/v1/chat/completions")) return;
    const body = response.request().postData();
    if (!body) return;
    const sent = JSON.parse(body) as { messages: WireMsg[] };
    const turn: Turn = { messages: sent.messages, reply: null };
    turns.push(turn);
    void response
      .json()
      .then((json: { choices?: { message?: { content?: string } }[] }) => {
        turn.reply = json?.choices?.[0]?.message?.content ?? null;
      })
      .catch(() => undefined);
  });

  await page.addInitScript(
    ([key, session, onboardingKey, onboarding]) => {
      window.localStorage.setItem(key as string, session as string);
      window.localStorage.setItem(onboardingKey as string, onboarding as string);
    },
    [
      `sb-${PROJECT_REF}-auth-token`,
      JSON.stringify({
        access_token: token.access_token,
        expires_at: Math.floor(Date.now() / 1000) + (token.expires_in ?? 3600),
        expires_in: token.expires_in,
        refresh_token: token.refresh_token,
        token_type: "bearer",
        user: token.user,
      }),
      "nemesis.web.onboarding.v1",
      JSON.stringify({ at: new Date().toISOString(), outcome: "skipped" }),
    ] as const,
  );

  // 🔴 THE OWNER'S OWN ENTRY. `canvas-home.tsx` pushes `/learn?ask=<what they typed>`; the page
  // mints a canvas and hands the text to `beginOrAnswer`. This IS the repro, not a stand-in for it.
  await page.goto(`${ORIGIN}/learn?ask=${encodeURIComponent("hello")}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(COMPOSER, { timeout: 60_000 });
  await dismissOnboarding(page);

  /** The transient conversational answer, as the learner reads it. */
  const replyOnScreen = async (): Promise<string | null> => {
    const found = await page.evaluate(() => {
      const node = document.querySelector(".canvas-swap");
      const text = node?.textContent?.trim() ?? "";
      return text.length > 0 ? text : null;
    });
    return found;
  };

  /** The one canvas this learner has. Minted by the page, not by this script. */
  const canvasRow = async () =>
    (await rest(`learning_canvases?user_id=eq.${userId}&select=state,title,document&order=created_at.asc`).then((r) => r.json()))[0] as
      { state: string; title: string; document: { blocks: unknown[]; sources: unknown[] } } | undefined;

  // ── 1. `hello`, typed on the front door ───────────────────────────────────
  console.log("\n── the learner types `hello` on the front door and lands in a fresh canvas");
  const answered = await waitFor("a reply on screen", replyOnScreen, 120_000);
  check("H1-reaches-model", turns.length > 0, turns.length ? `${turns.length} call to the valve` : "nothing was sent to the model");

  const first = turns[0];
  if (first) {
    const system = first.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n");
    const last = first.messages.at(-1);
    check(
      "H2-orchestration-prompt",
      /You are Nemesis, an academic operating system/.test(system)
      && /NEMESIS STATE/.test(system)
      && /"then": "reply" \| "study"/.test(last?.content ?? ""),
      "identity + canvas state + the action vocabulary",
    );
    check(
      "H2-utterance-verbatim",
      (last?.content ?? "").startsWith("hello"),
      `last user message begins ${JSON.stringify((last?.content ?? "").slice(0, 24))}`,
    );
    await waitFor("the first reply body", async () => first.reply, 15_000);
    note(`model decided: ${JSON.stringify((first.reply ?? "").replace(/\s+/g, " ").slice(0, 200))}`);
  } else {
    check("H2-orchestration-prompt", false, "no request captured");
  }

  check("H4-rendered", Boolean(answered), answered ? JSON.stringify(answered.slice(0, 120)) : "nothing was shown to the learner");
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/1-hello.png` });

  // 🔴 AND NOTHING IS OFFERED TO LEARN. A greeting has no subject, so the "Learn this" button
  // beside the answer has nothing to start. It used to appear on every reply.
  check(
    "H4-no-empty-offer",
    !(answered ?? "").includes("Learn this"),
    (answered ?? "").includes("Learn this") ? "a greeting is being offered as a topic to learn" : "no offer under a greeting",
  );

  // 🔴 THE ROW, NOT THE SCREEN. "It did not start a lesson" is a claim about durable state, and the
  // page could be mid-transition. The canvas the learner owns is the only place that settles it.
  // 🔴 NO ROW AT ALL IS THE STRONGEST FORM OF "NO LESSON". A canvas is persisted when something
  // happens to it; a greeting is not something happening to it. Both shapes are a pass, and the
  // detail says which was seen rather than flattening them.
  const afterHello = await canvasRow();
  check(
    "H3-no-lesson",
    !afterHello || (afterHello.state === "empty" && afterHello.document.blocks.length === 0),
    afterHello
      ? `state=${afterHello.state} blocks=${afterHello.document.blocks.length} title=${JSON.stringify(afterHello.title)}`
      : "nothing was even written: a greeting changed no durable state",
  );
  check(
    "H3-not-retitled",
    (afterHello?.title ?? "").toLowerCase() !== "hello",
    afterHello?.title ? `title is ${JSON.stringify(afterHello.title)}` : "the canvas is still untitled",
  );

  // ── 2. the conversation continues ─────────────────────────────────────────
  console.log("\n── and keeps talking");
  await say(page, "I'm studying pharmacology");
  const second = await waitFor("the second turn to reach the model", async () => (turns.length > 1 ? turns[1]! : null));
  if (second) {
    const conversational = second.messages.filter((m) => m.role === "user" || m.role === "assistant");
    check(
      "H5-continuity",
      conversational.some((m) => m.role === "user" && m.content === "hello")
      && conversational.some((m) => m.role === "assistant" && m.content.trim().length > 0),
      `turn 2 carries ${conversational.length - 1} earlier message(s) as real turns`,
    );
    await waitFor("the second reply", async () => {
      const text = await replyOnScreen();
      return text && text !== answered ? text : null;
    });
    await waitFor("the second reply body", async () => second.reply, 15_000);
    note(`model decided: ${JSON.stringify((second.reply ?? "").replace(/\s+/g, " ").slice(0, 200))}`);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/2-continues.png` });
  } else {
    check("H5-continuity", false, "the second turn never reached the model");
  }

  const afterTwo = await canvasRow();
  check(
    "H3-still-no-lesson",
    !afterTwo || afterTwo.state === "empty",
    `${afterTwo ? `state=${afterTwo.state}` : "still no row"} after two conversational turns`,
  );

  // ── 2b. a real question DOES get the offer ────────────────────────────────
  console.log("\n── asks a real question, which does have something to learn");
  await say(page, "what is first-pass metabolism?");
  const offered = await waitFor("an answer carrying an offer", async () => {
    const text = await replyOnScreen();
    return text && text.includes("Learn this") ? text : null;
  });
  check("H6-offer-when-there-is-a-subject", Boolean(offered), offered ? JSON.stringify(offered.slice(0, 100)) : "no Learn this beside an answer about a real subject");

  // ── 3. the same Nemesis, asked to teach ───────────────────────────────────
  console.log("\n── then asks to be taught, in the same canvas, without switching anything");
  const before = turns.length;
  await say(page, "teach me pharmacokinetics");
  const third = await waitFor("the teaching turn", async () => (turns.length > before ? turns[before]! : null));
  if (third) await waitFor("the teaching decision body", async () => third.reply, 15_000);
  const decided = third?.reply ?? "";
  check("T1-reached-model", Boolean(third), "the request went through the same one call");
  check(
    "T2-chose-study",
    /"then"\s*:\s*"study"/.test(decided),
    decided ? JSON.stringify(decided.replace(/\s+/g, " ").slice(0, 160)) : "no decision came back",
  );

  // 🔴 THE ROW AGAIN. Choosing `study` is a decision; the lesson actually starting is the product.
  // 🔴 `learn`, NOT `sources_attached`. Grounding a bare topic attaches a web page on the way in,
  // so "a source appeared" is true seconds before any lesson exists — and `sources_attached` is the
  // exact sticky state this product has died in before. `openCanvas()` is the only writer of
  // `learn` and it runs at the END of `begin()`, so that is the state that means it began.
  const begun = await waitFor(
    "the canvas to reach `learn`",
    async () => {
      const row = await canvasRow();
      return row && (row.state === "learn" || row.document.blocks.length > 0) ? row : null;
    },
    180_000,
  );
  check(
    "T3-teaching-began",
    Boolean(begun),
    begun
      ? `state=${begun.state} sources=${begun.document.sources.length} blocks=${begun.document.blocks.length} title=${JSON.stringify(begun.title)}`
      : `the canvas never reached \`learn\` (last seen ${(await canvasRow())?.state})`,
  );

  // ── 4. and a question mid-lesson still gets an answer ─────────────────────
  //
  // 🔴 WHICHEVER WAY THIS LANDS IS A RESULT. Once a lesson is running the composer may be the
  // ANSWER surface — and if it is, that is the deterministic invariant working exactly as it must,
  // not a miss. The placeholder says which, so the run reports what it actually met.
  console.log("\n── asks something mid-lesson");
  const composerBack = await waitFor(
    "the composer to come back after the lesson opened",
    async () => ((await page.locator(COMPOSER).count()) > 0 ? true : null),
    180_000,
  );
  check("M0-composer-returns", Boolean(composerBack), composerBack ? "the learner can type again" : "no composer 180s after the lesson opened");
  const placeholder = composerBack
    ? await page.evaluate(() => (document.querySelector("textarea") as HTMLTextAreaElement | null)?.placeholder ?? "")
    : "";
  if (!composerBack) {
    // Nothing more can be observed from here; the checks above already stand.
  } else if (placeholder.startsWith("Type your answer")) {
    check("M1-answer-invariant", true, "a question is on screen, so the composer is the answer surface (composerIntent, no model involved)");
  } else {
    const beforeAsk = turns.length;
    await say(page, "wait, what does bioavailability mean?");
    const asked = await waitFor("the mid-lesson turn", async () => (turns.length > beforeAsk ? turns[beforeAsk]! : null));
    if (asked) await waitFor("its decision body", async () => asked.reply, 15_000);
    check("M1-mid-lesson-question", Boolean(asked), asked ? `answered without a second reading of the learner` : "the question never reached the model");
    const after = await canvasRow();
    check("M2-lesson-survived", after?.state === begun?.state, `state=${after?.state}`);
  }

  if (SHOTS) await page.screenshot({ path: `${SHOTS}/3-teaching.png` });
  const shown = (await page.locator("body").innerText()).replace(/\n{2,}/g, " / ").slice(0, 300);
  note(`on screen: ${shown}`);

  await browser.close();

  // ── Leave nothing behind ─────────────────────────────────────────────────
  await fetch(`${SB}/auth/v1/admin/users/${userId}`, { headers: svc, method: "DELETE" });
  console.log(`\ncleaned up learner ${userId.slice(0, 8)}…`);
  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
