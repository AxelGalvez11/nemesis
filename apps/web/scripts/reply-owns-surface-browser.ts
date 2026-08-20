/**
 * The owner's own repro, driven in a real browser.
 *
 * 🔴 A UNIT TEST CANNOT SEE TWO TURNS ON ONE SCREEN. `reply-owns-the-surface.test.ts` proves the
 * composition decides correctly and that the component reads that decision; what neither can prove
 * is that the teaching card actually LEAVES the page and comes back. That is React, layout, and the
 * live policy runtime, and it is where the reported defect lived.
 *
 * 🔴 IT ENTERS THE WAY HE DID — through the front door with a real instruction, and it waits for a
 * REAL teaching screen produced by the real controller. Seeding a canvas with a fake decision would
 * test the renderer against a state production may never produce.
 *
 * Usage, from apps/web, with the app built and served:
 *   NEXT_PUBLIC_SUPABASE_URL=… NEXT_PUBLIC_SUPABASE_ANON_KEY=… SUPABASE_SERVICE_KEY=… \
 *     APP_ORIGIN=http://localhost:3312 npx tsx scripts/reply-owns-surface-browser.ts
 */
import { randomUUID } from "node:crypto";
import { chromium, type Page } from "playwright";

const SB = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ORIGIN = process.env.APP_ORIGIN ?? "http://localhost:3312";
const REF = new URL(SB).hostname.split(".")[0]!;
const svc = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" };

let bad = 0;
const check = (id: string, ok: boolean, detail = "") => {
  if (!ok) bad += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${id}${detail ? ` — ${detail}` : ""}`);
};

/**
 * The two shapes a policy screen comes in, and how to tell them apart from outside.
 *
 * 🔴 "IS THERE A CONTINUE" IS NOT THE SAME QUESTION AS "IS THE POLICY ON SCREEN", AND THE FIRST
 * VERSION OF THIS HARNESS CONFLATED THEM. `continueOwner` WITHHOLDS the button while an answer is
 * owed (its N3 guard: a control that moves the learner on past an unanswered question is a way to
 * skip it), so a retrieval screen has no Continue and looked, from here, exactly like no policy at
 * all. The composer's send label is the other half: it reads "Submit answer" only when something is
 * being asked.
 *
 * Both matter, because the two get OPPOSITE treatment and the run cannot choose which it gets: a
 * claim being taught is displaced by a reply, and an owed question must never be.
 */
const teachingOnScreen = (page: Page) => page.getByRole("button", { name: /^Continue$/ }).count();
const questionOnScreen = (page: Page) => page.getByRole("button", { name: /^Submit answer$/ }).count();
const backToLesson = (page: Page) => page.getByRole("button", { name: /^Back to the lesson$/ }).count();

async function main(): Promise<void> {
  const email = `reply+${randomUUID()}@nemesis.test`;
  const password = `Pb!${randomUUID()}Aa1`;
  const made = await fetch(`${SB}/auth/v1/admin/users`, {
    body: JSON.stringify({ email, email_confirm: true, password }),
    headers: svc,
    method: "POST",
  }).then((r) => r.json());
  const userId: string = made?.id ?? made?.user?.id;
  if (!userId) throw new Error(`no learner: ${JSON.stringify(made).slice(0, 200)}`);
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

  // 🔴 A SEEDED CANVAS, ENTERED AT `?c=`, BECAUSE A COLD `/learn` REDIRECTS TO SIGN-IN HERE. The
  // session is injected into localStorage and the front door's guard runs before it is read, so a
  // harness entering there sits on the sign-in form and every later wait times out looking like a
  // product failure. `canvas-chrome-verify.ts` has always entered this way; this follows it.
  //
  // 🔴 THE CANVAS IS `empty`, NOT PRE-BUILT WITH A LESSON. The teaching screen this checks has to be
  // one the real controller produced from a real instruction; seeding a decision would test the
  // renderer against a state production may never reach.
  const canvasId = randomUUID();
  await fetch(`${SB}/rest/v1/learning_canvases`, {
    body: JSON.stringify({
      active_ms: 0,
      created_at: new Date().toISOString(),
      document: {
        answers: [], blocks: [], concepts: [], correctedConceptIds: [], correctiveAttempts: {},
        events: [], outputs: [], questions: [], recall: [], recallResults: [], responses: [],
        sources: [], weakConceptIds: [],
      },
      id: canvasId, level: null, state: "empty", title: "Organic chemistry", user_id: userId,
    }),
    headers: svc,
    method: "POST",
  });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.addInitScript(([k, v, ok, ov]) => {
    window.localStorage.setItem(k as string, v as string);
    window.localStorage.setItem(ok as string, ov as string);
  }, [
    `sb-${REF}-auth-token`,
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
  ] as const);

  // ── Reach a real teaching screen, the way the owner did ───────────────────
  await page.goto(`${ORIGIN}/learn?c=${canvasId}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("textarea", { timeout: 60_000 });
  await page.waitForTimeout(1_500);

  await page.locator("textarea").click();
  await page.keyboard.type("Teach me the hydroxyl functional group.", { delay: 8 });
  await page.keyboard.press("Enter");

  // 🔴 WAIT FOR EITHER SHAPE. Which one the controller picks is its decision, not the harness's, and
  // a run that demanded one of them would report the other as a product failure.
  const policyScreen = (timeout: number) =>
    page
      .waitForFunction(() => {
        const labelled = [...document.querySelectorAll("button")].map((b) =>
          ((b.textContent ?? "").trim() || (b.getAttribute("aria-label") ?? "")).trim());
        if (labelled.includes("Continue")) return "teaching";
        if (labelled.includes("Submit answer")) return "question";
        return false;
      }, { polling: 2_000, timeout })
      .then((h) => h.jsonValue() as Promise<"teaching" | "question">)
      .catch(() => null);

  // 🔴 AND IF NOTHING COMES, REOPEN THE CANVAS BEFORE GIVING UP. Knowledge is resolved when a canvas
  // MOUNTS — `canvas-presence.ts` records that leaving and reopening from the Library is how this was
  // originally stumbled into — so objectives extracted DURING this sitting are not necessarily
  // resolved into it. Measured here: the first sitting ends with a conversational answer and a list
  // of source titles while `learning_objectives` already holds a hundred rows for the learner.
  let onScreen = await policyScreen(150_000);
  if (!onScreen) {
    console.log("      (nothing in the first sitting — reopening the canvas, which is when knowledge resolves)");
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("textarea", { timeout: 60_000 });
    onScreen = await policyScreen(540_000);
  }
  check("R2-a-real-policy-screen", onScreen !== null, onScreen ?? "nothing from the controller in 8 minutes");
  if (!onScreen) {
    // 🔴 SAY WHAT WAS THERE INSTEAD. A harness that reports only "not found" cannot tell a slow
    // lesson from a broken page.
    console.log("ON SCREEN:", (await page.locator("main[data-selectable-text]").innerText()).replace(/\s+/g, " ").slice(0, 400));
    await browser.close();
    console.log(`\n${bad} CHECK(S) FAILED`);
    process.exit(1);
  }
  console.log(`      (the controller chose a ${onScreen} screen this run)`);

  const before = (await page.locator("main[data-selectable-text]").innerText()).replace(/\s+/g, " ");

  // ── Ask it something else entirely ────────────────────────────────────────
  await page.locator("textarea").click();
  await page.keyboard.type("what can you do?", { delay: 8 });
  await page.keyboard.press("Enter");

  const answered = await page
    .waitForFunction((was) => {
      const body = document.querySelector('main[data-selectable-text]');
      const text = (body as HTMLElement | null)?.innerText?.replace(/\s+/g, " ") ?? "";
      return text.length > 0 && text !== was;
    }, before, { polling: 1_000, timeout: 180_000 })
    .then(() => true)
    .catch(() => false);
  check("R3-the-answer-arrives", answered, answered ? "" : "the surface never changed after asking");
  await page.waitForTimeout(1_200);

  const bodyNow = (await page.locator("main[data-selectable-text]").innerText()).replace(/\s+/g, " ");
  const quiet = /hasn't found anything to ask you about/i.test(bodyNow);
  check("R4-nothing-calls-the-canvas-empty", !quiet, quiet ? "the quiet stand-in was painted over a live answer" : "");

  if (onScreen === "teaching") {
    // THE REPORTED DEFECT, exactly: a claim being taught, an unrelated question, both on one page.
    const stillTeaching = await teachingOnScreen(page);
    check(
      "R5-the-teaching-screen-STEPPED-ASIDE",
      stillTeaching === 0,
      stillTeaching === 0 ? "one turn on screen" : `the Continue is still there (${stillTeaching}) — two turns on one page`,
    );
    // 🔴 WAITED FOR, NOT SAMPLED ONCE. `CanvasFade` holds the OUTGOING subtree through the fade, so
    // for ~200ms after the swap the DOM still shows the screen that is leaving and not the one
    // arriving. A single `count()` here read 0 and reported a missing control that was on screen a
    // beat later — the same stale-read hazard the browser-pane notes in this repo already record.
    const offered = await page
      .getByRole("button", { name: /^Back to the lesson$/ })
      .waitFor({ state: "visible", timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    check("R6-a-way-back-is-offered", offered, offered ? "" : "a displaced lesson with no way back is a dead end");

    await page.getByRole("button", { name: /^Back to the lesson$/ }).click();
    const back = await page
      .getByRole("button", { name: /^Continue$/ })
      .first()
      .waitFor({ state: "visible", timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    check("R7-the-lesson-comes-back", back, back ? "the claim and its Continue are back" : "the lesson did not return");
    check("R8-and-the-reply-is-gone", (await backToLesson(page)) === 0, "the reply is still standing in front of it");
  } else {
    // THE OTHER HALF, AND IT IS THE INVARIANT RATHER THAN THE BUG: an owed question is never
    // displaced, so the ask stays put and the answer appears with it. A run that landed here proves
    // the guard that protects the learner's answer, which is the more expensive one to get wrong.
    check(
      "R5-an-OWED-QUESTION-was-not-displaced",
      (await questionOnScreen(page)) > 0,
      "the question the learner owes an answer to was taken off screen",
    );
    check(
      "R6-and-no-way-back-is-offered-because-nothing-was-displaced",
      (await backToLesson(page)) === 0,
      "a control offering to restore something that never left",
    );
  }

  // ── Record a lecture is not offered by either composer ────────────────────
  //
  // 🔴 PRESSED, NOT READ OFF THE MARKUP. The source guard already checks the strings are gone; what
  // this adds is that pressing `+` opens no menu at all, which is the behaviour the composer's own
  // rule promises when there is nothing to choose between.
  await page.getByRole("button", { name: /Add material/ }).first().click();
  await page.waitForTimeout(500);
  const canvasMenu = await page.locator('[role="menu"]').count();
  const canvasRecord = await page.getByText("Record a lecture").count();
  check("R9-canvas-composer-has-no-record", canvasMenu === 0 && canvasRecord === 0, `menus=${canvasMenu} record=${canvasRecord}`);

  // The front door is a SEPARATE component with its own copy of the menu, so it is checked
  // separately. Navigated to last, once this context has a session the guard can already see.
  await page.goto(`${ORIGIN}/learn`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('input[placeholder="Ask Nemesis…"]', { timeout: 60_000 });
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: /Upload material/ }).first().click();
  await page.waitForTimeout(500);
  const homeMenu = await page.locator('[role="menu"]').count();
  const homeRecord = await page.getByText("Record a lecture").count();
  check("R10-front-door-has-no-record", homeMenu === 0 && homeRecord === 0, `menus=${homeMenu} record=${homeRecord}`);

  await browser.close();
  await fetch(`${SB}/auth/v1/admin/users/${userId}`, { headers: svc, method: "DELETE" });
  console.log(bad === 0 ? "\nALL CHECKS PASSED" : `\n${bad} CHECK(S) FAILED`);
  process.exit(bad === 0 ? 0 : 1);
}

void main();
