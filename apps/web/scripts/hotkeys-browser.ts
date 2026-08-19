/**
 * The two hotkeys, pressed by a real browser on a real build.
 *
 * 🔴 A UNIT TEST CANNOT PRESS A KEY. Everything about these shortcuts that can fail silently is
 * wiring: a listener never attached, a default never prevented, a guard reading the wrong focus, a
 * microphone opened over somebody's typing. The decisions are covered in
 * `lib/learn/canvas-hotkeys.test.ts`; this is the half that needs a keyboard.
 *
 * 🔴 THE SPEECH ENGINE IS FAKED, AND ONLY THE ENGINE. Headless Chromium has no Web Speech API, so
 * `speechRecognitionSupported()` is false and the whole path is inert — a run against it would
 * prove nothing and look like a pass. A stub constructor is installed before the page loads, which
 * makes everything real except the transcription itself: the same hook, the same guards, the same
 * start and stop calls. What this therefore does NOT prove is that speech recognition works; that
 * is the browser's own engine and this change does not touch it.
 *
 * Usage, from apps/web, with the app built and served:
 *   NEXT_PUBLIC_SUPABASE_URL=… NEXT_PUBLIC_SUPABASE_ANON_KEY=… SUPABASE_SERVICE_KEY=… \
 *     APP_ORIGIN=http://localhost:3947 npx tsx scripts/hotkeys-browser.ts
 */

import { randomUUID } from "node:crypto";

import { chromium } from "playwright";

const SB = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ORIGIN = process.env.APP_ORIGIN ?? "http://localhost:3947";
const PROJECT_REF = new URL(SB).hostname.split(".")[0]!;

const svc = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" };

let failures = 0;
function check(id: string, pass: boolean, detail = ""): void {
  if (!pass) failures += 1;
  console.log(`${pass ? "PASS" : "FAIL"}  ${id}${detail ? ` — ${detail}` : ""}`);
}

async function rest(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${SB}/rest/v1/${path}`, { ...init, headers: { ...svc, ...(init?.headers ?? {}) } });
}

/** A stub Web Speech engine, installed before any script runs. */
const FAKE_SPEECH = `
  window.__speech = { starts: 0, stops: 0 };
  class FakeRecognition {
    constructor() { this.continuous = false; this.interimResults = false; this.lang = ""; this.onresult = null; this.onerror = null; this.onend = null; }
    start() { window.__speech.starts += 1; }
    stop() { window.__speech.stops += 1; if (this.onend) this.onend(); }
    abort() { if (this.onend) this.onend(); }
  }
  window.SpeechRecognition = FakeRecognition;
  window.webkitSpeechRecognition = FakeRecognition;
`;

async function main(): Promise<void> {
  const email = `keys+${randomUUID()}@nemesis.test`;
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

  // 🔴 A CANVAS THAT ALREADY HAS SOMETHING TO READ. `continueOwner` gives the document the Continue
  // when `unreadChunk(blocks).length > 0`, so seeding unread blocks reaches the state under test in
  // a second rather than by sitting through a real lesson being generated.
  const canvasId = randomUUID();
  const block = (id: string, content: string) => ({ content, id, type: "paragraph" as const });
  await rest("learning_canvases", {
    body: JSON.stringify({
      active_ms: 0,
      created_at: new Date().toISOString(),
      document: {
        answers: [],
        blocks: [block("b1", "Clearance is the volume of plasma cleared of drug per unit time."), block("b2", "Half-life follows from clearance and volume of distribution.")],
        concepts: [], correctedConceptIds: [], correctiveAttempts: {}, events: [], outputs: [],
        questions: [], recall: [], recallResults: [], responses: [], sources: [], weakConceptIds: [],
      },
      id: canvasId,
      level: null,
      state: "learn",
      title: "Pharmacokinetics",
      user_id: userId,
    }),
    method: "POST",
  });

  const browser = await chromium.launch({
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
    headless: true,
  });
  const context = await browser.newContext({ permissions: ["microphone"], viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.addInitScript(FAKE_SPEECH);
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

  await page.goto(`${ORIGIN}/learn?c=${canvasId}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("textarea", { timeout: 60_000 });

  const speech = async () => page.evaluate(() => (window as unknown as { __speech: { starts: number; stops: number } }).__speech);
  const continueButton = () => page.getByRole("button", { name: /^Continue$/ });

  // ── Command-Enter presses the Continue that is on screen ──────────────────
  const appeared = await continueButton().count().then((n) => n > 0)
    || await continueButton().first().waitFor({ state: "visible", timeout: 30_000 }).then(() => true).catch(() => false);
  check("C0-continue-on-screen", appeared, appeared ? "a Continue is showing under the reading" : "no Continue rendered — nothing to press");

  if (appeared) {
    // 🔴 CLICK THE PAGE FIRST, so focus is not in the composer. That is the ordinary state after
    // reading, and it is where the shortcut is meant to work.
    await page.locator("body").click({ position: { x: 40, y: 400 } });
    await page.keyboard.press("Meta+Enter");
    const advanced = await continueButton()
      .first()
      .waitFor({ state: "detached", timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    check("C1-cmd-enter-advances", advanced, advanced ? "the Continue was pressed and the reading moved on" : "the canvas did not advance");
  }

  // ── ...and stands down inside the composer, where Enter already means something ──
  await page.locator("textarea").click();
  await page.keyboard.type("what is clearance", { delay: 8 });
  const beforeSubmit = await page.locator("textarea").inputValue();
  await page.keyboard.press("Meta+Enter");
  await page.waitForTimeout(1_200);
  const afterSubmit = await page.locator("textarea").inputValue();
  check(
    "C2-composer-keeps-enter",
    beforeSubmit === "what is clearance" && afterSubmit === "",
    afterSubmit === "" ? "command-enter still submits from inside the composer" : `composer still holds ${JSON.stringify(afterSubmit)}`,
  );

  // ── Hold space to talk ────────────────────────────────────────────────────
  //
  // 🔴 BLUR THE COMPOSER FIRST. With focus in the box, space is a space — which is the next check.
  await page.locator("body").click({ position: { x: 40, y: 400 } });
  await page.waitForTimeout(400);
  const before = await speech();
  await page.keyboard.down("Space");
  await page.waitForTimeout(600);
  const held = await speech();
  check("S1-hold-opens-mic", held.starts === before.starts + 1, `start() called ${held.starts - before.starts}x while held`);

  await page.keyboard.up("Space");
  await page.waitForTimeout(400);
  const released = await speech();
  check("S2-release-closes-mic", released.stops === before.stops + 1, `stop() called ${released.stops - before.stops}x on release`);

  // ── ...and never over somebody's typing ───────────────────────────────────
  await page.locator("textarea").click();
  await page.keyboard.type("half", { delay: 8 });
  const typingBefore = await speech();
  await page.keyboard.down("Space");
  await page.waitForTimeout(400);
  await page.keyboard.up("Space");
  const typingAfter = await speech();
  const typed = await page.locator("textarea").inputValue();
  check(
    "S3-typing-is-never-interrupted",
    typingAfter.starts === typingBefore.starts,
    typingAfter.starts === typingBefore.starts ? "no microphone opened while typing" : "the microphone opened over an answer being typed",
  );
  check("S4-space-still-types-a-space", typed === "half ", `composer holds ${JSON.stringify(typed)}`);

  // ── A hold that loses the window still closes the microphone ──────────────
  await page.locator("body").click({ position: { x: 40, y: 400 } });
  await page.waitForTimeout(300);
  const leakBefore = await speech();
  await page.keyboard.down("Space");
  await page.waitForTimeout(400);
  // Losing the window mid-hold is the case where keyup never arrives.
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page.waitForTimeout(400);
  const leakAfter = await speech();
  check(
    "S5-no-open-mic-after-blur",
    leakAfter.stops > leakBefore.stops,
    leakAfter.stops > leakBefore.stops ? "the microphone closed when the window lost focus" : "the microphone was left open",
  );
  await page.keyboard.up("Space");

  await browser.close();
  await fetch(`${SB}/auth/v1/admin/users/${userId}`, { headers: svc, method: "DELETE" });
  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
