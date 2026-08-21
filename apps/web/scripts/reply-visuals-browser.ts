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

  const ask = async (question: string) => {
    await page.goto(`${ORIGIN}/learn?c=${canvasId}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("textarea", { timeout: 60_000 });
    await page.waitForTimeout(1_200);
    await page.locator("textarea").click();
    await page.keyboard.type(question, { delay: 6 });
    await page.keyboard.press("Enter");
    return page
      .waitForFunction(() => {
        // 🔴🔴 WAIT FOR THE TURN TO FINISH BEFORE CLASSIFYING IT. A previous harness of mine read
        // the page while the thinking screen was up and called an unfinished turn "prose-only",
        // because the mascot's aria-live caption passes a length check. Two runs then reported a
        // capability as missing when the model simply had not answered yet.
        if (document.querySelector('[role="status"]')) return false;
        const reply = document.querySelector('[data-selectable-id^="reply"]') as HTMLElement | null;
        if (!reply) return false;
        const body = reply.innerText ?? "";
        if (body.length < 20) return false;
        const figures = [...document.querySelectorAll("figure")];
        const painted = figures
          .flatMap((f) => [...f.querySelectorAll("svg path, svg line, svg polyline, svg rect, svg circle")])
          .filter((p) => { const r = p.getBoundingClientRect(); return r.width > 2 || r.height > 2; });
        return {
          body: body.slice(0, 400),
          chars: body.length,
          figures: figures.length,
          learnThis: /Learn this/.test(document.body.innerText),
          painted: painted.length,
          rawMarker: /\[figure\s*\d|\[smiles:/i.test(body),
          tables: document.querySelectorAll("figure table").length,
          taughtInstead: !!document.querySelector('[data-region="policy"], [data-selectable-id="claim-heading"]'),
        };
      }, { polling: 600, timeout: 180_000 })
      .then((h) => h.jsonValue() as Promise<{ body: string; chars: number; figures: number; learnThis: boolean; painted: number; rawMarker: boolean; tables: number; taughtInstead: boolean }>)
      .catch(() => null);
  };

  // 1 — a PLOT. The reported case: "i thought we integrated the new ... math plot abilities".
  const plot = await ask("plot y = x squared for x from 0 to 5");
  console.log("  plot run:", JSON.stringify(plot));
  if (plot) {
    check("V1-a-reply-draws-a-plot", plot.figures > 0 && plot.painted > 3, `${plot.figures} figures, ${plot.painted} painted marks`);
    check("V2-no-raw-figure-marker-on-screen", !plot.rawMarker, plot.rawMarker ? "a [figure n] token is visible" : "");
  } else check("V1-a-reply-draws-a-plot", false, "the turn never finished");

  // 2 — WORKING, not just the answer. The reported case: "it only gave me the answer not a step by
  // step solution". Measured as length, because the old prompt's whole effect was on length.
  const steps = await ask("integrate x^2 dx");
  console.log("  integrate run:", JSON.stringify(steps));
  if (steps) {
    check("V3-an-integral-gets-more-than-its-answer", steps.chars > 220, `${steps.chars} characters`);
  } else check("V3-an-integral-gets-more-than-its-answer", false, "the turn never finished");

  // 3 — the offer is gone everywhere, not only on the turn that reported it.
  const greet = await ask("what is a mole in chemistry");
  console.log("  offer run:", JSON.stringify(greet));
  if (greet) check("V4-no-Learn-this-under-any-answer", !greet.learnThis, greet.learnThis ? "the offer is back" : "");

  await page.screenshot({ path: "/tmp/reply-visuals.png", fullPage: true });
  await browser.close();
  await fetch(`${SB}/auth/v1/admin/users/${userId}`, { headers: svc, method: "DELETE" });
  console.log(bad === 0 ? "\nALL CHECKS PASSED" : `\n${bad} CHECK(S) FAILED`);
  process.exit(bad === 0 ? 0 : 1);
}

void main();
