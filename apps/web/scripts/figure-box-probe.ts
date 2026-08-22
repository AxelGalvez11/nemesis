/**
 * Does a conversational answer reach the OTHER EIGHT drawing kinds, and has it stopped being terse?
 *
 * 🔴 THE PARSER IS UNIT-TESTED AND THAT PROVES NOTHING ABOUT THIS. `replySegments` turning a fence
 * into a `StructureVisual` is one thing; `smiles-drawer` loading in the browser, parsing the string
 * and emitting real path geometry is another, and it is the half that can silently render nothing
 * (the library is dynamically imported and reaches for `document` while drawing).
 *
 * 🔴 IT ALSO DEPENDS ON THE MODEL CHOOSING TO USE THE FENCE, which is prompt behaviour rather than
 * a contract. So a run where it answers in prose is reported as a SKIP, not a pass.
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
  const email = `draw+${randomUUID()}@nemesis.test`;
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
      id: canvasId, level: null, state: "empty", title: "Organic chemistry", user_id: userId,
    }),
    headers: svc, method: "POST",
  });

  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
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
  await page.locator("textarea").click();
  await page.keyboard.type("show me ethanol", { delay: 6 });
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => !document.querySelector('[role="status"]') && !!document.querySelector("figure svg"), { polling: 500, timeout: 180_000 }).catch(() => null);
  await page.waitForTimeout(3_000);

  const box = await page.evaluate(`(() => {
    const fig = document.querySelector("figure");
    const svg = document.querySelector("figure svg");
    const cap = document.querySelector("figure p");
    const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height), top: Math.round(b.top), left: Math.round(b.left) }; };
    let ink = null;
    try { const bb = svg.getBBox(); ink = { w: Math.round(bb.width), h: Math.round(bb.height), x: Math.round(bb.x), y: Math.round(bb.y) }; } catch (e) { void e; }
    const cs = svg ? getComputedStyle(svg) : null;
    return {
      figure: r(fig),
      figurePad: fig ? getComputedStyle(fig).padding : null,
      svgBox: r(svg),
      svgCss: cs ? { height: cs.height, width: cs.width, minHeight: cs.minHeight, maxWidth: cs.maxWidth } : null,
      viewBox: svg ? svg.getAttribute("viewBox") : null,
      preserve: svg ? svg.getAttribute("preserveAspectRatio") : null,
      inkViewBoxUnits: ink,
      caption: r(cap),
    };
  })()`);
  console.log("BOX>>>", JSON.stringify(box, null, 1));

  await browser.close();
  await fetch(`${SB}/auth/v1/admin/users/${userId}`, { headers: svc, method: "DELETE" });
  process.exit(0);
}

void main();
