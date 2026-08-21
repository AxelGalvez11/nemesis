/**
 * Does the Canvas actually accept an image?
 *
 * 🔴 REPORTED 2026-08-20: *"nemesis does not accept any images unfortunately."* The picker's accept
 * list HAS `.png/.jpg/.webp/.heic`, and `chat-attachments.ts` routes images to their own bucket and
 * a vision reader — so on paper it works, and reading the source further would only produce more
 * paper. This drives a real file through the real input and reports what the learner would see.
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
  const email = `img+${randomUUID()}@nemesis.test`;
  const password = `Pb!${randomUUID()}Aa1`;
  const made = await fetch(`${SB}/auth/v1/admin/users`, {
    body: JSON.stringify({ email, email_confirm: true, password }), headers: svc, method: "POST",
  }).then((r) => r.json());
  const userId: string = made?.id ?? made?.user?.id;
  if (!userId) throw new Error("no learner");
  await fetch(`${SB}/rest/v1/subscriptions`, {
    body: JSON.stringify({ billing_provider: "stripe", plan: "pro", status: "active", user_id: userId }),
    headers: svc, method: "POST",
  });
  const token = await fetch(`${SB}/auth/v1/token?grant_type=password`, {
    body: JSON.stringify({ email, password }), headers: { apikey: ANON, "Content-Type": "application/json" }, method: "POST",
  }).then((r) => r.json());

  const canvasId = randomUUID();
  await fetch(`${SB}/rest/v1/learning_canvases`, {
    body: JSON.stringify({
      active_ms: 0, created_at: new Date().toISOString(),
      document: { answers: [], blocks: [], concepts: [], correctedConceptIds: [], correctiveAttempts: {}, events: [], outputs: [], questions: [], recall: [], recallResults: [], responses: [], sources: [], weakConceptIds: [] },
      id: canvasId, level: null, state: "empty", title: "Image test", user_id: userId,
    }),
    headers: svc, method: "POST",
  });

  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const failures: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") failures.push(m.text().slice(0, 200)); });
  page.on("requestfailed", (r) => failures.push(`REQFAIL ${r.url().slice(0, 90)}`));
  const bad4xx: string[] = [];
  page.on("response", (r) => { if (r.status() >= 400) bad4xx.push(`${r.status()} ${r.url().slice(0, 110)}`); });

  await page.addInitScript(([k, v, ok, ov]) => {
    window.localStorage.setItem(k as string, v as string);
    window.localStorage.setItem(ok as string, ov as string);
  }, [
    `sb-${REF}-auth-token`,
    JSON.stringify({ access_token: token.access_token, expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: token.expires_in, refresh_token: token.refresh_token, token_type: "bearer", user: token.user }),
    "nemesis.web.onboarding.v1", JSON.stringify({ at: new Date().toISOString(), outcome: "skipped" }),
  ] as const);

  await page.goto(`${ORIGIN}/learn?c=${canvasId}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("textarea", { timeout: 60_000 });
  await page.waitForTimeout(1_200);

  // 🔴 THE ACCEPT LIST IS WHAT THE OS DIALOG WOULD FILTER ON, so a learner whose picker greys out
  // every photo never gets as far as an upload. Checked first because it is a different failure.
  const accept = await page.evaluate(() => document.querySelector<HTMLInputElement>('input[type="file"]')?.accept ?? "");
  check("G1-the-picker-offers-images", /\.png/.test(accept) && /\.jpe?g/.test(accept), accept);
  check("G2-and-heic-AND-heif", /\.heic/.test(accept) && /\.heif/.test(accept), accept);

  await page.setInputFiles('input[type="file"]', "/tmp/note.png");

  // A chip means the canvas took it. An error strip means it refused and said so.
  const outcome = await page
    .waitForFunction(() => {
      const text = (document.querySelector("main[data-selectable-text]") as HTMLElement | null)?.innerText ?? "";
      const chip = [...document.querySelectorAll("span,a")].some((e) => /note\.png|note/i.test(e.textContent ?? ""));
      if (chip) return "attached";
      if (/could not|unsupported|failed|couldn't/i.test(text)) return "refused";
      return false;
    }, { polling: 500, timeout: 120_000 })
    .then((h) => h.jsonValue() as Promise<string>)
    .catch(() => null);

  check("G3-the-image-is-accepted", outcome === "attached", outcome ?? "nothing happened in 2 minutes");
  const body = (await page.locator("main[data-selectable-text]").innerText()).replace(/\s+/g, " ").slice(0, 220);
  console.log("      on screen:", body || "(empty)");
  if (bad4xx.length) console.log("      HTTP >=400:", [...new Set(bad4xx)].slice(0, 5).join(" | "));
  if (failures.length) console.log("      console/network errors:", [...new Set(failures)].slice(0, 5).join(" | "));

  await page.screenshot({ path: "/tmp/image-upload.png" });
  await browser.close();
  await fetch(`${SB}/auth/v1/admin/users/${userId}`, { headers: svc, method: "DELETE" });
  console.log(bad === 0 ? "\nALL CHECKS PASSED" : `\n${bad} CHECK(S) FAILED`);
  process.exit(bad === 0 ? 0 : 1);
}

void main();
