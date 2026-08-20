/**
 * What the owner reported, checked on a real build in a real browser.
 *
 * 🔴 A UNIT TEST CANNOT SEE A GRADIENT. Every item here is something that looked fine in source and
 * wrong on screen: how many glyphs are in the header row, whether a band of colour sits on top of
 * the first line of text, how big the question actually paints. So this reads computed style and
 * painted pixels, not class names.
 */
import { randomUUID } from "node:crypto";
import { chromium } from "playwright";

const SB = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ORIGIN = process.env.APP_ORIGIN ?? "http://localhost:3311";
const REF = new URL(SB).hostname.split(".")[0]!;
const svc = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" };

let bad = 0;
const check = (id: string, ok: boolean, detail = "") => {
  if (!ok) bad += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${id}${detail ? ` — ${detail}` : ""}`);
};

async function main() {
  const email = `chrome+${randomUUID()}@nemesis.test`;
  const password = `Pb!${randomUUID()}Aa1`;
  const made = await fetch(`${SB}/auth/v1/admin/users`, {
    body: JSON.stringify({ email, password, email_confirm: true }),
    headers: svc, method: "POST",
  }).then((r) => r.json());
  const userId: string = made?.id ?? made?.user?.id;
  if (!userId) throw new Error(`no learner: ${JSON.stringify(made).slice(0, 200)}`);
  await fetch(`${SB}/rest/v1/subscriptions`, {
    body: JSON.stringify({ billing_provider: "stripe", plan: "pro", status: "active", user_id: userId }),
    headers: svc, method: "POST",
  });
  const token = await fetch(`${SB}/auth/v1/token?grant_type=password`, {
    body: JSON.stringify({ email, password }),
    headers: { apikey: ANON, "Content-Type": "application/json" }, method: "POST",
  }).then((r) => r.json());

  const canvasId = randomUUID();
  const block = (id: string, content: string) => ({ content, id, type: "paragraph" as const });
  await fetch(`${SB}/rest/v1/learning_canvases`, {
    body: JSON.stringify({
      active_ms: 0, created_at: new Date().toISOString(),
      document: {
        answers: [],
        blocks: [
          block("b1", "A functional group is the part of a molecule that decides how it reacts."),
          block("b2", "The hydroxyl group is what makes an alcohol an alcohol."),
        ],
        concepts: [], correctedConceptIds: [], correctiveAttempts: {}, events: [], outputs: [],
        questions: [], recall: [], recallResults: [], responses: [], sources: [], weakConceptIds: [],
      },
      id: canvasId, level: null, state: "learn", title: "Organic chemistry", user_id: userId,
    }),
    headers: svc, method: "POST",
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
      expires_in: token.expires_in, refresh_token: token.refresh_token,
      token_type: "bearer", user: token.user,
    }),
    "nemesis.web.onboarding.v1",
    JSON.stringify({ at: new Date().toISOString(), outcome: "skipped" }),
  ] as const);

  await page.goto(`${ORIGIN}/learn?c=${canvasId}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("textarea", { timeout: 60_000 });
  await page.waitForTimeout(2_500);

  // ── 1. The header row ─────────────────────────────────────────────────────
  const controls = await page.evaluate(() => {
    const row = document.querySelector("header");
    if (!row) return null;
    return [...row.querySelectorAll("button")].map((b) => b.getAttribute("aria-label") ?? "?");
  });
  // 🔴 THE `\u00d7` IS IN THIS ROW AND IS COUNTED. It is rendered by canvas-surface.tsx rather than
  // canvas-header.tsx, but it paints in the same strip, and the owner's list starts with it ("x on
  // left"). An assertion that excluded it would be checking a boundary in the source rather than
  // what a learner sees, and the first version of this file failed for exactly that reason.
  check("H1-four-controls", !!controls && controls.length === 4, controls ? controls.join(" / ") : "no header row");
  check("H2-the-right-four",
    JSON.stringify(controls) === JSON.stringify(["Leave the canvas", "Sources and outputs", "Progress", "Options"]),
    controls ? controls.join(" / ") : "");

  // ── 2. The masthead is solid, and clears the resting content ──────────────
  const band = await page.evaluate(() => {
    const el = [...document.querySelectorAll("div")].find((d) => {
      const r = d.getBoundingClientRect();
      const s = getComputedStyle(d);
      return r.top === 0 && r.width > window.innerWidth * 0.9 && r.height > 0 && r.height < 200
        && s.position === "absolute" && s.pointerEvents === "none";
    });
    if (!el) return null;
    const s = getComputedStyle(el);
    const col = document.querySelector<HTMLElement>(".overflow-y-auto");
    return {
      height: Math.round(el.getBoundingClientRect().height),
      image: s.backgroundImage,
      restingTop: col ? Math.round(parseFloat(getComputedStyle(col).paddingTop)) : null,
    };
  });
  // ── The header, measured against ChatGPT (2026-08-20) ────────────────────
  //
  // 🔴 THE REFERENCE, MEASURED IN THE OWNER'S OWN BROWSER: 36×36 button, radius 8px, glyph 20×20.
  // Source guards pin the class names; only a browser can say what those classes PAINT, and the
  // whole reason this row was wrong is that `rounded-lg` computes to half the box at 28px.
  const icons = await page.evaluate(() => {
    const row = document.querySelector("main[data-selectable-text] header");
    if (!row) return null;
    return [...row.querySelectorAll("button")].map((b) => {
      const r = b.getBoundingClientRect();
      const g = b.querySelector("svg, i");
      const gr = g?.getBoundingClientRect();
      return {
        box: `${Math.round(r.width)}x${Math.round(r.height)}`,
        glyph: gr ? Math.round(Math.max(gr.width, gr.height)) : 0,
        radius: Math.round(Number.parseFloat(getComputedStyle(b).borderRadius)),
      };
    });
  });
  check(
    "I1-header-buttons-are-36x36",
    !!icons && icons.length > 0 && icons.every((i) => i.box === "36x36"),
    icons ? icons.map((i) => i.box).join(" ") : "no header",
  );
  check(
    "I2-glyphs-are-20px",
    !!icons && icons.every((i) => i.glyph >= 19 && i.glyph <= 21),
    icons ? icons.map((i) => `${i.glyph}px`).join(" ") : "",
  );
  check(
    "I3-radius-is-a-rounded-square-not-a-pill",
    !!icons && icons.every((i) => i.radius === 8),
    icons ? icons.map((i) => `${i.radius}px`).join(" ") : "",
  );

  check("M1-masthead-is-solid", !!band && band.image === "none", band ? band.image.slice(0, 60) : "no band found");
  check("M2-clears-the-column", !!band && band.restingTop !== null && band.height < band.restingTop,
    band ? `band ${band.height}px vs column ${band.restingTop}px` : "");

  // ── 3. The options menu carries voice ─────────────────────────────────────
  await page.getByRole("button", { name: "Options" }).click();
  await page.waitForTimeout(500);
  const menu = await page.evaluate(() =>
    [...document.querySelectorAll('[role="menuitemcheckbox"], button')]
      .map((b) => (b.textContent ?? "").trim()).filter((t) => t.length > 0 && t.length < 60));
  check("O1-read-out-loud", menu.some((t) => /Read questions out loud/i.test(t)), menu.slice(0, 6).join(" | "));
  check("O2-auto-dictation", menu.some((t) => /Open the mic after each question/i.test(t)));
  check("O3-objectives-and-record",
    menu.some((t) => /^Objectives$/.test(t)) && menu.some((t) => /^Session record$/.test(t)));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  // ── 4. An answer reads as an answer ───────────────────────────────────────
  await page.locator("textarea").click();
  await page.keyboard.type("hello", { delay: 10 });
  await page.keyboard.press("Enter");
  const replied = await page.waitForFunction(
    () => /\S/.test(document.querySelector(".canvas-swap")?.textContent ?? ""),
    { timeout: 60_000 },
  ).then(() => true).catch(() => false);
  check("A1-an-answer-arrives", replied);
  if (replied) {
    const answer = await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>(".canvas-swap");
      if (!el) return null;
      const s = getComputedStyle(el);
      return {
        fontSize: s.fontSize, lineHeight: s.lineHeight, borderLeftWidth: s.borderLeftWidth,
        hasDismiss: /(^|\s)Dismiss(\s|$)/.test(el.textContent ?? ""),
        color: s.color, opacity: s.opacity, text: (el.textContent ?? "").slice(0, 40),
      };
    });
    check("A2-chatgpt-body-size", answer?.fontSize === "16px" && answer?.lineHeight === "26px",
      answer ? `${answer.fontSize}/${answer.lineHeight}` : "");
    check("A3-no-quote-rule", answer?.borderLeftWidth === "0px", answer?.borderLeftWidth ?? "");
    check("A4-no-dismiss", answer?.hasDismiss === false);
    // 🔴 THE PAINTED COLOUR, NOT THE CLASS. `text-(--ui-text-primary)` is what the source says; what
    // the learner sees is whatever that token resolves to after theme and any inherited opacity.
    // 🔴 TWO FORMATS, AND ONLY ONE OF THEM IS `rgb()`. These tokens are built with `color-mix`, so
    // Chrome reports them as `color(srgb 0.05 0.05 0.05)` — 0-1 channels, no commas. A parser that
    // only knew `rgb()` fell through to its "assume white" default and reported near-black text as
    // too light, which is a guard failing on correct code.
    const srgb = /color\(srgb\s+([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)/.exec(answer?.color ?? "");
    const rgb = /rgba?\(([0-9.]+),\s*([0-9.]+),\s*([0-9.]+)/.exec(answer?.color ?? "");
    const lum = srgb
      ? ((Number(srgb[1]) + Number(srgb[2]) + Number(srgb[3])) / 3) * 255
      : rgb
        ? (Number(rgb[1]) + Number(rgb[2]) + Number(rgb[3])) / 3
        : 255;
    check("A5-answer-is-full-strength-colour", lum < 90, `${answer?.color}`);

    // 🔴 SAMPLED, NOT READ ONCE. A single opacity reading cannot tell a 140ms fade that is still
    // running from an element being REMOUNTED every render, which would restart the fade forever and
    // paint the answer permanently half-transparent. The first reading here was 0.36; that number is
    // consistent with both, and only the shape over time separates them.
    const trace: number[] = [];
    for (let i = 0; i < 12; i += 1) {
      trace.push(await page.evaluate(() => Number(getComputedStyle(document.querySelector(".canvas-swap")!).opacity)));
      await page.waitForTimeout(150);
    }
    const settled = trace.slice(4);
    check("A6-the-fade-finishes", settled.every((o) => o === 1),
      `opacity over 1.8s: ${trace.map((o) => o.toFixed(2)).join(" ")}`);
  }

  // ── the send control exists before there is anything to send ──────────────
  await page.locator("body").click({ position: { x: 40, y: 400 } });
  const sendWhenEmpty = await page.evaluate(() => {
    const send = [...document.querySelectorAll("button")].find((b) =>
      ["Send", "Start", "Submit answer"].includes(b.getAttribute("aria-label") ?? ""));
    if (!send) return null;
    const r = send.getBoundingClientRect();
    return { disabled: send.hasAttribute("disabled"), h: Math.round(r.height), w: Math.round(r.width) };
  });
  check("K1-send-always-present", sendWhenEmpty !== null,
    sendWhenEmpty ? `${sendWhenEmpty.w}x${sendWhenEmpty.h}, disabled=${sendWhenEmpty.disabled}` : "no send control on an empty composer");
  check("K2-send-is-dimmed-not-absent", sendWhenEmpty?.disabled === true, sendWhenEmpty?.disabled ? "dimmed, not removed" : "an empty composer offered a live send");

  // ── text is selectable ────────────────────────────────────────────────────
  //
  // 🔴 COMPUTED STYLE, NOT A CONSTRUCTED Range. A `Range` built in JS reads back correctly even when
  // no drag on the page selects anything, so the obvious check passes while the feature is dead.
  const selectable = await page.evaluate(() => {
    const text = [...document.querySelectorAll("p, h1, h2, li")]
      .find((el) => (el.textContent ?? "").trim().length > 20);
    if (!text) return null;
    return { tag: text.tagName, userSelect: getComputedStyle(text).userSelect };
  });
  check("S1-canvas-text-is-selectable", selectable?.userSelect === "text",
    selectable ? `${selectable.tag} userSelect=${selectable.userSelect}` : "no text found to check");

  // ── content fades OUT and back IN, not just in ────────────────────────────
  //
  // 🔴 SAMPLED THROUGH A REAL CONTENT CHANGE. The fade-out is the half that did not exist, and it is
  // invisible to every unit test: it needs the outgoing subtree to survive unmount, which only
  // happens in a running React tree.
  const fadeTrace: number[] = [];
  const sampling = (async () => {
    for (let i = 0; i < 40; i += 1) {
      // 🔴 NULL-SAFE. The wrapper is briefly absent while the canvas swaps regions, and
      // `getComputedStyle(null)` throws rather than returning anything — which killed the run at the
      // exact moment the thing being measured was happening.
      fadeTrace.push(await page.evaluate(() => {
        const el = document.querySelector('[style*="opacity"]');
        return el instanceof HTMLElement ? Number(getComputedStyle(el).opacity) : 1;
      }));
      await page.waitForTimeout(40);
    }
  })();
  await page.locator("textarea").click();
  await page.keyboard.type("what is a hydroxyl group", { delay: 5 });
  await page.keyboard.press("Enter");
  await sampling;
  const dipped = fadeTrace.some((o) => o < 0.9 && o > 0);
  check("F1-content-fades-rather-than-popping", dipped,
    `opacity samples: ${fadeTrace.filter((o) => o < 1).map((o) => o.toFixed(2)).join(" ") || "never left 1.00"}`);

  await page.screenshot({ path: "/tmp/canvas-verify-light.png" });
  await browser.close();
  await fetch(`${SB}/auth/v1/admin/users/${userId}`, { headers: svc, method: "DELETE" });
  console.log(bad === 0 ? "\nALL CHECKS PASSED" : `\n${bad} CHECK(S) FAILED`);
  process.exit(bad === 0 ? 0 : 1);
}
void main();
