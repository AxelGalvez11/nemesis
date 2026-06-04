import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "fs";
import path from "path";

// Phase 6b-3 gate: the Ask flow, run as the REAL seeded authenticated user against the
// live `ask` edge function (DeepSeek-backed). Asserts AC2 (a structured answer), AC3
// (≥1 cited source where one exists, each opening the Source Viewer), and the
// deterministic emergency-safety routing. The no_source/unsupported-refusal path is
// non-deterministic against this corpus (a made-up compound still pulls neighbors), so
// it stays gated at the Phase-3 script level + is rendered by the same AnswerView
// refusal branch — not asserted via a flaky live LLM call here.
function loadSeed() {
  return JSON.parse(
    readFileSync(path.resolve(__dirname, ".auth", "seed.json"), "utf8"),
  ) as { email: string; password: string; drugId: string };
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/", { timeout: 120_000 });
  await expect(page.getByTestId("signin-screen")).toBeVisible({ timeout: 120_000 });
  await page.getByTestId("email").fill(email);
  await page.getByTestId("password").fill(password);
  await page.getByTestId("age-ack").click();
  await page.getByTestId("signin-submit").click();
  await expect(page.getByTestId("tab-ask")).toBeVisible({ timeout: 30_000 });
}

test("6b-3: ask a medication question → cited structured answer → Source Viewer (AC2/AC3)", async ({
  page,
}) => {
  const seed = loadSeed();
  await signIn(page, seed.email, seed.password); // lands on the Ask tab

  await page.getByTestId("ask-input").fill("What are the common side effects of semaglutide?");
  await page.getByTestId("ask-submit").click();

  // The real ask pipeline (classify → retrieve → generate → cite) takes several
  // seconds; allow generous time for the structured answer to render.
  await expect(page.getByTestId("answer-view")).toBeVisible({ timeout: 60_000 });
  // AC2 — a structured answer: bottom line + a "what we know" section.
  await expect(page.getByTestId("answer-bottom-line")).toBeVisible();
  await expect(page.getByTestId("answer-section-what_we_know")).toBeVisible();
  // AC3 — ≥1 cited source, each opening the doc-12 Source Viewer.
  await expect(page.getByTestId("answer-citations")).toBeVisible();
  await expect(page.getByTestId("answer-citation-0")).toBeVisible();
  await expect(page.getByTestId("answer-cite-0")).toBeVisible();

  await page.getByTestId("answer-cite-0").click();
  await expect(page.getByTestId("source-screen")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("source-title")).toBeVisible();
});

test("6b-3: emergency phrasing → deterministic urgent-care routing (safety)", async ({ page }) => {
  const seed = loadSeed();
  await signIn(page, seed.email, seed.password);

  await page.getByTestId("ask-input").fill("I think I took too much insulin and feel faint, help");
  await page.getByTestId("ask-submit").click();

  // Deterministic pre-screen short-circuit (no LLM) → the urgent-care banner with the
  // backend call-emergency/poison-control copy.
  await expect(page.getByTestId("answer-safety")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("answer-safety")).toContainText(/emergency services|poison|911/i);
});
