/**
 * The two things a unit test cannot see: whether the mascot actually DRAWS, and whether the
 * composer actually MOVES.
 *
 * 🔴 A VENDORED SVG ENGINE CAN RENDER NOTHING AND FAIL SILENTLY. `lib/bloub/` is 3,000 lines of
 * someone else's geometry. Every guard in `send-is-acknowledged.test.ts` would pass against a
 * `<path d="">`: the component mounts, the state is right, the licence is there, and the screen is
 * blank. Only measuring a real path length in a real browser answers it.
 *
 * 🔴 AND A TRANSFORM THAT NEVER RUNS LOOKS EXACTLY LIKE ONE THAT RUNS INSTANTLY. So the travel is
 * SAMPLED over its duration rather than checked once at the end.
 */
import { randomUUID } from "node:crypto";
import { chromium } from "playwright";

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

async function main(): Promise<void> {
  const email = `send+${randomUUID()}@nemesis.test`;
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
      id: canvasId, level: null, state: "empty", title: "Chemistry", user_id: userId,
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

  // ── The mascot draws, on a canvas, during a real turn ─────────────────────
  await page.goto(`${ORIGIN}/learn?c=${canvasId}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("textarea", { timeout: 60_000 });
  await page.waitForTimeout(1_200);

  await page.locator("textarea").click();
  await page.keyboard.type("what is a covalent bond?", { delay: 8 });
  await page.keyboard.press("Enter");

  // 🔴 SAMPLED WHILE THE TURN IS IN FLIGHT. The mascot is on screen only until the answer lands,
  // which for a plain question is a few seconds.
  const drawn = await page
    .waitForFunction(() => {
      // 🔴 EXCLUDE `<defs>`. The body path appears TWICE: once inside the mask (never laid out,
      // so its rect is 0x0) and once in the drawn tree. Document order puts the mask first, so the
      // obvious selector measures the invisible one and reports a real shape as 0x0 — which is
      // exactly what the first run of this harness did.
      const paths = [...document.querySelectorAll("svg path")].filter((p) => !p.closest("defs"));
      const body = paths.find((p) => (p.getAttribute("d") ?? "").length > 120);
      if (!body) return null;
      const box = (body as SVGPathElement).getBoundingClientRect();
      return { d: (body.getAttribute("d") ?? "").length, h: Math.round(box.height), w: Math.round(box.width) };
    }, { polling: 100, timeout: 30_000 })
    .then((h) => h.jsonValue() as Promise<{ d: number; h: number; w: number }>)
    .catch(() => null);
  check(
    "B1-the-mascot-draws-a-real-shape",
    drawn !== null && drawn.w > 20 && drawn.h > 20,
    drawn ? `${drawn.w}x${drawn.h}px, path d=${drawn.d} chars` : "no path with real geometry appeared",
  );

  // 🔴 IT MOVES. A frozen engine renders a shape and would pass the check above.
  const frames: string[] = [];
  for (let i = 0; i < 6; i += 1) {
    const d = await page.evaluate(() => {
      const paths = [...document.querySelectorAll("svg path")].filter((p) => !p.closest("defs"));
      const body = paths.find((p) => (p.getAttribute("d") ?? "").length > 120);
      return body?.getAttribute("d") ?? "";
    });
    if (d) frames.push(d);
    await page.waitForTimeout(90);
  }
  check(
    "B2-and-it-animates",
    new Set(frames).size > 1,
    frames.length > 0 ? `${new Set(frames).size} distinct shapes across ${frames.length} samples` : "no samples",
  );

  await page.screenshot({ path: "/tmp/bloub-thinking.png" });

  // ── The composer travels on the front door ────────────────────────────────
  await page.goto(`${ORIGIN}/learn`, { waitUntil: "domcontentloaded" });
  const arrived = await page
    .waitForSelector('input[placeholder="Ask Nemesis…"]', { timeout: 60_000 })
    .then(() => true)
    .catch(() => false);
  check("D0-the-front-door-loads", arrived);

  if (arrived) {
    await page.locator('input[placeholder="Ask Nemesis…"]').click();
    await page.keyboard.type("teach me about ionic bonds", { delay: 8 });

    const before = await page.evaluate(() => {
      const box = document.querySelector('input[placeholder="Ask Nemesis…"]');
      return box ? Math.round(box.getBoundingClientRect().top) : null;
    });

    await page.keyboard.press("Enter");
    // Sample DURING the move, not after: a transform that never ran and one that finished instantly
    // look identical at the end.
    const tops: number[] = [];
    for (let i = 0; i < 8; i += 1) {
      const top = await page.evaluate(() => {
        const box = document.querySelector('input[placeholder="Ask Nemesis…"]');
        return box ? Math.round(box.getBoundingClientRect().top) : null;
      });
      if (typeof top === "number") tops.push(top);
      await page.waitForTimeout(45);
    }
    const moved = tops.length > 1 && Math.max(...tops) - Math.min(...tops) > 40;
    check(
      "D1-the-composer-travels-downward",
      moved && typeof before === "number" && tops[tops.length - 1]! > before,
      `from ${before} through ${tops.join(" → ")}`,
    );
    check(
      "D2-and-it-is-a-glide-not-a-jump",
      new Set(tops).size >= 3,
      `${new Set(tops).size} distinct positions sampled during the move`,
    );
  }

  await browser.close();
  await fetch(`${SB}/auth/v1/admin/users/${userId}`, { headers: svc, method: "DELETE" });
  console.log(bad === 0 ? "\nALL CHECKS PASSED" : `\n${bad} CHECK(S) FAILED`);
  process.exit(bad === 0 ? 0 : 1);
}

void main();
