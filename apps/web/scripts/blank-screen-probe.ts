/**
 * What does the learner actually SEE, second by second, after they press send?
 *
 * Written to chase a production report of a blank screen after sending a prompt. It samples the
 * page 2x a second and prints a timeline of what was on it, so "blank" can be told apart from
 * "thinking with no caption" and from "the app crashed".
 *
 * Usage, from apps/web, with the app built and served:
 *   NEXT_PUBLIC_SUPABASE_URL=… NEXT_PUBLIC_SUPABASE_ANON_KEY=… SUPABASE_SERVICE_KEY=… \
 *     APP_ORIGIN=http://localhost:3947 PROMPT="teach me pharmacokinetics" npx tsx scripts/blank-screen-probe.ts
 */

import { randomUUID } from "node:crypto";

import { chromium } from "playwright";

const SB = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ORIGIN = process.env.APP_ORIGIN ?? "http://localhost:3947";
const PROJECT_REF = new URL(SB).hostname.split(".")[0]!;
const PROMPT = process.env.PROMPT ?? "hello";
const WATCH_MS = Number(process.env.WATCH_MS ?? 150_000);

const svc = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" };

async function main(): Promise<void> {
  const email = `probe+${randomUUID()}@nemesis.test`;
  const password = `Pb!${randomUUID()}Aa1`;
  const created = await fetch(`${SB}/auth/v1/admin/users`, {
    body: JSON.stringify({ email, password, email_confirm: true }),
    headers: svc,
    method: "POST",
  }).then((r) => r.json());
  const userId: string = created?.id ?? created?.user?.id;
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

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 300)); });
  page.on("pageerror", (e) => errors.push(`PAGEERROR ${e.message.slice(0, 300)}`));
  const net: { at: number; what: string; ms: number }[] = [];
  const t0 = Date.now();
  page.on("requestfinished", (r) => {
    const url = r.url();
    const timing = r.timing();
    const what = url.includes("/rest/v1/") ? `rest ${url.split("/rest/v1/")[1]!.split("?")[0]}`
      : url.includes("/functions/v1/") ? `fn ${url.split("/functions/v1/")[1]!.split("?")[0]}`
      : url.includes("/auth/v1/") ? "auth"
      : null;
    if (what) net.push({ at: Date.now() - t0, ms: Math.round(timing.responseEnd - timing.requestStart), what });
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

  console.log(`prompt: ${JSON.stringify(PROMPT)}\n`);
  const started = Date.now();
  await page.goto(`${ORIGIN}/learn?ask=${encodeURIComponent(PROMPT)}`, { waitUntil: "domcontentloaded" });

  let last = "";
  for (;;) {
    const at = Date.now() - started;
    if (at > WATCH_MS) break;
    const seen = await page
      .evaluate(() => {
        const main = document.querySelector("main") ?? document.body;
        const text = (main as HTMLElement).innerText.replace(/\s+/g, " ").trim();
        const box = document.querySelector("textarea") as HTMLTextAreaElement | null;
        return {
          composer: box ? box.placeholder.slice(0, 28) : "GONE",
          text: text.slice(0, 110),
          chars: text.length,
        };
      })
      .catch(() => null);
    if (seen) {
      const line = `${seen.chars}|${seen.composer}|${seen.text}`;
      if (line !== last) {
        console.log(`${String(Math.round(at / 100) / 10).padStart(6)}s  chars=${String(seen.chars).padStart(4)}  composer=${seen.composer.padEnd(28)}  ${seen.text}`);
        last = line;
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  const row = (await fetch(`${SB}/rest/v1/learning_canvases?user_id=eq.${userId}&select=state,title`, { headers: svc }).then((r) => r.json()))[0];
  console.log(`\ncanvas row: ${JSON.stringify(row ?? null)}`);
  console.log("\nnetwork during the watch (>150ms or notable):");
  for (const r of net.filter((r) => r.ms > 150 || r.what.startsWith("fn"))) {
    console.log(`  ${String(Math.round(r.at / 100) / 10).padStart(6)}s  ${String(r.ms).padStart(6)}ms  ${r.what}`);
  }
  console.log(errors.length ? `\nCONSOLE ERRORS:\n${errors.slice(0, 8).map((e) => `  ${e}`).join("\n")}` : "\nno console errors");

  await browser.close();
  await fetch(`${SB}/auth/v1/admin/users/${userId}`, { headers: svc, method: "DELETE" });
}

void main();
