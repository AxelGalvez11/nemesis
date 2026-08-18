import { chromium } from "playwright";

const SB = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_KEY!;
const ORIGIN = process.env.APP_ORIGIN ?? "http://localhost:3947";
const REF = new URL(SB).hostname.split(".")[0]!;
const svc = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" };

async function main() {
  const email = process.env.LEARNER_EMAIL!;
  const canvasId = process.env.CANVAS_ID!;
  const users = await fetch(`${SB}/auth/v1/admin/users?per_page=200`, { headers: svc }).then((r) => r.json());
  const user = (users.users ?? []).find((u: { email: string }) => u.email === email);
  if (!user) throw new Error("no such learner");
  const password = `Pb!probe-${Date.now()}Aa1`;
  await fetch(`${SB}/auth/v1/admin/users/${user.id}`, { method: "PUT", headers: svc, body: JSON.stringify({ password }) });
  const token = await fetch(`${SB}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  }).then((r) => r.json());

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on("console", (m) => console.log(`  [console.${m.type()}] ${m.text().slice(0, 240)}`));
  page.on("pageerror", (e) => console.log(`  [pageerror] ${e.message.slice(0, 240)}`));
  page.on("requestfailed", (r) => console.log(`  [reqfail] ${r.url().slice(0, 150)} ${r.failure()?.errorText}`));
  page.on("response", async (r) => {
    const url = r.url();
    if (!url.includes("/rest/v1/") && !url.includes("/functions/v1/") && !url.includes("/storage/v1/")) return;
    let size = "?";
    try { size = String((await r.body()).length); } catch { /* consumed */ }
    console.log(`  [${r.status()}] ${r.request().method()} ${url.replace(SB, "").slice(0, 170)} · ${size}b`);
  });
  await page.addInitScript(([k, v, ok, ov]) => {
    window.localStorage.setItem(k as string, v as string);
    window.localStorage.setItem(ok as string, ov as string);
  }, [
    `sb-${REF}-auth-token`,
    JSON.stringify({ access_token: token.access_token, refresh_token: token.refresh_token, token_type: "bearer", expires_in: token.expires_in, expires_at: Math.floor(Date.now()/1000) + (token.expires_in ?? 3600), user: token.user }),
    "nemesis.web.onboarding.v1",
    JSON.stringify({ at: new Date().toISOString(), outcome: "skipped" }),
  ] as const);
  console.log(`OPEN ${ORIGIN}/learn?c=${canvasId}`);
  await page.goto(`${ORIGIN}/learn?c=${canvasId}`, { waitUntil: "domcontentloaded" });
  for (let i = 0; i < 5; i += 1) {
    await new Promise((r) => setTimeout(r, 20_000));
    const ph = await page.evaluate(() => document.querySelector("textarea")?.getAttribute("placeholder") ?? "(none)");
    const text = (await page.locator("body").innerText()).replace(/\n{2,}/g, " / ").slice(0, 900);
    const buttons = await page.evaluate(() =>
      [...document.querySelectorAll("button")].map((b) => `${(b.textContent ?? "").trim().slice(0, 30)}|${b.getAttribute("aria-label") ?? ""}`).filter(Boolean));
    console.log(`\n──── t+${(i + 1) * 20}s ── placeholder ${JSON.stringify(ph)}\n      ${text}\n      BUTTONS: ${JSON.stringify(buttons)}\n`);
  }
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
