/**
 * Do the pills draw, and does a favicon actually arrive?
 *
 * 🔴 A REMOTE `<img>` IS THE ONE PART OF THIS NO UNIT TEST REACHES. `sourcePill` can resolve
 * perfectly and the pill can still show a broken-image glyph, or nothing, if the favicon host is
 * unreachable from the browser. `naturalWidth` is the only honest answer: it is 0 for an image that
 * failed and non-zero for one that decoded.
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
  const email = `pill+${randomUUID()}@nemesis.test`;
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
      document: {
        answers: [], blocks: [], concepts: [], correctedConceptIds: [], correctiveAttempts: {}, events: [],
        outputs: [], questions: [], recall: [], recallResults: [], responses: [], sources: [], weakConceptIds: [],
      },
      id: canvasId, level: null, state: "empty", title: "Chemistry", user_id: userId,
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
    JSON.stringify({
      access_token: token.access_token, expires_at: Math.floor(Date.now() / 1000) + 3600,
      expires_in: token.expires_in, refresh_token: token.refresh_token, token_type: "bearer", user: token.user,
    }),
    "nemesis.web.onboarding.v1", JSON.stringify({ at: new Date().toISOString(), outcome: "skipped" }),
  ] as const);

  await page.goto(`${ORIGIN}/learn?c=${canvasId}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("textarea", { timeout: 60_000 });
  await page.waitForTimeout(1_200);

  // A question that buys a web search, so the reply carries real citations.
  await page.locator("textarea").click();
  await page.keyboard.type("whats the latest news on ai?", { delay: 8 });
  await page.keyboard.press("Enter");

  const pill = await page
    .waitForFunction(() => {
      const images = [...document.querySelectorAll('img[src*="favicons"]')] as HTMLImageElement[];
      const drawn = images.find((i) => i.complete && i.naturalWidth > 0);
      if (!drawn) return null;
      const box = drawn.getBoundingClientRect();
      const radius = getComputedStyle(drawn).borderRadius;
      return { count: images.length, h: Math.round(box.height), radius, w: Math.round(box.width) };
    }, { polling: 200, timeout: 120_000 })
    .then((h) => h.jsonValue() as Promise<{ count: number; h: number; radius: string; w: number }>)
    .catch(() => null);

  check("P1-a-favicon-actually-decodes", pill !== null, pill ? `${pill.count} on screen, ${pill.w}x${pill.h}px` : "no favicon rendered or none decoded");
  // 🔴 A RADIUS OF AT LEAST HALF THE WIDTH IS WHAT "CIRCLE" MEANS. Matching the literal `9999px`
  // failed against a real circle: Tailwind's `rounded-full` is `calc(infinity * 1px)`, which the
  // browser resolves to 179982px. Pinning the spelling of a value the engine computes is how a
  // check reports a working thing as broken.
  const radiusPx = pill ? Number.parseFloat(pill.radius) : 0;
  check(
    "P2-it-is-a-circle",
    pill !== null && (radiusPx >= pill.w / 2 || pill.radius.includes("50%")),
    pill ? `radius ${pill.radius} on a ${pill.w}px box` : "",
  );
  check("P3-and-it-is-small", pill !== null && pill.w <= 16 && pill.w >= 10, pill ? `${pill.w}px` : "");

  // ── The inline [n] markers, which is what the owner actually asked for twice ──
  const inline = await page.evaluate(() => {
    const body = document.querySelector('[data-selectable-id="reply"]');
    const text = (body as HTMLElement | null)?.innerText ?? "";
    const pills = [...(body?.querySelectorAll('a[href^="http"]') ?? [])] as HTMLAnchorElement[];
    const dots = [...(body?.querySelectorAll('a img[src*="favicons"]') ?? [])] as HTMLImageElement[];
    const drawn = dots.filter((i) => i.complete && i.naturalWidth > 0);
    const first = pills[0];
    const spec = first
      ? (() => {
          const r = first.getBoundingClientRect();
          const st = getComputedStyle(first);
          return { fontSize: st.fontSize, h: Math.round(r.height), named: (first.textContent ?? "").trim().length > 0, radius: st.borderRadius, w: Math.round(r.width) };
        })()
      : null;
    return { bare: /\[\d{1,2}\]/.test(text), dots: dots.length, drawn: drawn.length, plus: /\+\d/.test(text), spec };
  });
  // 🔴 CONDITIONAL, BECAUSE WHETHER THE MODEL CITES AT ALL IS NOT THIS CHANGE'S TO GUARANTEE.
  // Measured across several runs: this model frequently answers from live search WITHOUT writing a
  // single [n], even though `formatWebSearchContext` asks it to. What is being checked here is the
  // rendering contract — if markers exist they must become favicon pills and none may be left as
  // literal text — not the model's citing habit, which is a separate and unfinished problem.
  if (inline.dots === 0 && !inline.bare) {
    console.log("SKIP  P4-inline-citations — the model wrote no [n] markers this run (see note)");
  } else {
    check(
      "P4-inline-citations-are-favicon-pills",
      inline.drawn > 0,
      `${inline.drawn}/${inline.dots} inline favicons decoded`,
    );
    // The reference: 62x18px, radius 12px, 9px name. Height and type are what matter; width is the
    // site's name and varies.
    check(
      "P4b-and-they-carry-the-site-name-at-the-reference-size",
      inline.spec !== null && inline.spec.named && inline.spec.h >= 16 && inline.spec.h <= 20,
      inline.spec ? `${inline.spec.w}x${inline.spec.h}px, ${inline.spec.fontSize}, radius ${inline.spec.radius}, named=${inline.spec.named}` : "no pill",
    );
  }
  check(
    "P5-and-no-bare-[n]-is-left-in-the-prose",
    !inline.bare,
    inline.bare ? "the answer still shows literal [1] markers" : "",
  );

  // ── The cards, measured against the reference ────────────────────────────
  const cards = await page.evaluate(() => {
    const headlines = [...document.querySelectorAll("a.line-clamp-3")] as HTMLAnchorElement[];
    if (headlines.length === 0) return null;
    const card = headlines[0]!.closest("div")!;
    const row = card.parentElement!;
    const r = card.getBoundingClientRect();
    return {
      count: headlines.length,
      distinctHeadlines: new Set(headlines.map((h) => (h.textContent ?? "").trim())).size,
      scrolls: getComputedStyle(row).overflowX,
      pageScrollsSideways: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      w: Math.round(r.width),
    };
  });
  check("C1-sources-render-as-cards", cards !== null && cards.count > 0, cards ? `${cards.count} cards, ${cards.w}px wide` : "no cards");
  check(
    "C2-each-card-shows-a-DIFFERENT-headline",
    cards !== null && cards.distinctHeadlines === cards.count,
    cards ? `${cards.distinctHeadlines} distinct of ${cards.count}` : "",
  );
  check("C3-the-row-scrolls-not-the-page", cards !== null && cards.scrolls === "auto" && !cards.pageScrollsSideways, cards?.scrolls ?? "");

  // ── One control under the answer, never two ──────────────────────────────
  const controls = await page.evaluate(() =>
    [...document.querySelectorAll("button")]
      .map((b) => (b.textContent ?? "").trim())
      .filter((t) => t === "Learn this" || t === "Back to the lesson"));
  check("P6-one-control-under-an-answer", controls.length <= 1, controls.join(" + ") || "none");

  await page.screenshot({ path: "/tmp/source-pills.png" });
  await browser.close();
  await fetch(`${SB}/auth/v1/admin/users/${userId}`, { headers: svc, method: "DELETE" });
  console.log(bad === 0 ? "\nALL CHECKS PASSED" : `\n${bad} CHECK(S) FAILED`);
  process.exit(bad === 0 ? 0 : 1);
}

void main();
