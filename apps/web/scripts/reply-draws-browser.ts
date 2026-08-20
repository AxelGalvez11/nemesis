/**
 * Does a conversational answer actually DRAW a molecule now?
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
  await page.keyboard.type("show me the structure of ethanol and of acetic acid", { delay: 8 });
  await page.keyboard.press("Enter");

  const drawn = await page
    .waitForFunction(() => {
      const figures = [...document.querySelectorAll("figure")];
      const paths = figures.flatMap((f) => [...f.querySelectorAll("svg path, svg line")]);
      const painted = paths.filter((p) => p.getBoundingClientRect().width > 2 || p.getBoundingClientRect().height > 2);
      // 🔴🔴 WAIT FOR THE TURN TO FINISH BEFORE CLASSIFYING IT. The first version of this harness
      // read the page while the THINKING SCREEN was still up and called it "prose-only" — the
      // mascot's own `aria-live` caption is long enough to pass a length check — so two runs
      // reported "the model never draws" when the model had not yet answered. A measurement that
      // cannot tell "still working" from "answered without a drawing" is worse than none.
      if (document.querySelector('[role="status"]')) return false;
      const reply = document.querySelector('[data-selectable-id^="reply"]') as HTMLElement | null;
      if (!reply) return false;
      const body = reply.innerText ?? "";
      if (painted.length > 0) return { figures: figures.length, marks: painted.length, state: "drawn" };
      if (/```|\[smiles:/i.test(body)) return { figures: 0, marks: 0, state: "marker-left-raw" };
      if (body.length > 80) return { figures: 0, marks: 0, state: "prose-only" };
      return false;
    }, { polling: 500, timeout: 150_000 })
    .then((h) => h.jsonValue() as Promise<{ figures: number; marks: number; state: string }>)
    .catch(() => null);

  if (drawn?.state === "prose-only") {
    console.log("SKIP  D1-a-reply-draws — the model answered in prose this run; the marker is its choice, not a contract");
  } else {
    check("D1-a-reply-draws-a-real-structure", drawn?.state === "drawn", drawn ? `${drawn.figures} figures, ${drawn.marks} painted marks` : "nothing appeared");
    check("D2-no-raw-fence-is-left-on-screen", drawn?.state !== "marker-left-raw", drawn?.state ?? "");
  }

  await page.screenshot({ path: "/tmp/reply-draws.png" });
  await browser.close();
  await fetch(`${SB}/auth/v1/admin/users/${userId}`, { headers: svc, method: "DELETE" });
  console.log(bad === 0 ? "\nALL CHECKS PASSED" : `\n${bad} CHECK(S) FAILED`);
  process.exit(bad === 0 ? 0 : 1);
}

void main();
