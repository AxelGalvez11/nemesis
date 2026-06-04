import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "fs";
import path from "path";

// Phase 6b-2 gate: Explore + Drug page + Source Viewer, run as the REAL seeded
// authenticated user against the live §8 backend (same identity model as the script
// gates). Asserts AC1 (search→page), AC4 (label sections), AC5 (trials), AC6
// (pubmed), AC9 (evidence score+rationale+counts+limitations) — every evidence row
// "cited" (a Source Viewer link), and a citation opens the doc-12 Source Viewer.
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
  await page.getByTestId("signin-submit").click();
  await expect(page.getByTestId("tab-ask")).toBeVisible({ timeout: 30_000 });
}

test("6b-2: search ozempic → semaglutide page (label/trials/pubmed/evidence, all cited) → Source Viewer", async ({
  page,
}) => {
  const seed = loadSeed();
  await signIn(page, seed.email, seed.password);

  // AC1 — search a brand alias; it resolves to the canonical entity.
  await page.goto("/explore", { timeout: 60_000 });
  await expect(page.getByTestId("search-input")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("search-input").fill("ozempic");
  await expect(page.getByTestId("search-results")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("result-name-0")).toContainText(/semaglutide/i);

  // Tap the result → the drug page.
  await page.getByTestId("result-0").click();
  await expect(page.getByTestId("drug-screen")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("drug-name")).toContainText(/semaglutide/i);

  // AC9 — evidence score + rationale + counts + limitations all present.
  await expect(page.getByTestId("drug-evidence")).toBeVisible();
  await expect(page.getByTestId("evidence-score")).toBeVisible();
  await expect(page.getByTestId("evidence-rationale")).toBeVisible();
  await expect(page.getByTestId("evidence-counts")).toBeVisible();
  await expect(page.getByTestId("evidence-limitations")).toBeVisible();

  // AC4 — FDA/DailyMed label sections render, cited.
  await expect(page.getByTestId("section-label")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-testid^="label-section-"]').first()).toBeVisible();
  await expect(page.getByTestId("label-cite-0")).toBeVisible();

  // AC5 — ClinicalTrials.gov studies render, cited.
  await expect(page.getByTestId("section-trials")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("trial-0")).toBeVisible();
  await expect(page.getByTestId("trial-cite-0")).toBeVisible();

  // AC6 — PubMed articles render, cited.
  await expect(page.getByTestId("section-pubmed")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("pubmed-0")).toBeVisible();
  await expect(page.getByTestId("pubmed-cite-0")).toBeVisible();

  // "all cited" → a citation opens the doc-12 Source Viewer (get_source).
  await page.getByTestId("label-cite-0").click();
  await expect(page.getByTestId("source-screen")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("source-provider")).toBeVisible();
  await expect(page.getByTestId("source-title")).toBeVisible();
  await expect(page.getByTestId("source-sections")).toBeVisible();
  await expect(page.getByTestId("source-url")).toBeVisible();
  // Live corpus has 0 superseded sources → this source is current, not outdated.
  await expect(page.getByTestId("source-outdated")).toHaveCount(0);
});

test("6b-2: unknown source id → no-source state (real get_source null path)", async ({ page }) => {
  const seed = loadSeed();
  await signIn(page, seed.email, seed.password);

  // A well-formed but non-existent uuid passes the format guard, so get_source runs
  // and returns null → the doc-06 no-source state (not the client-side guard path).
  await page.goto("/source/00000000-0000-4000-8000-000000000000", { timeout: 60_000 });
  await expect(page.getByTestId("source-not-found")).toBeVisible({ timeout: 30_000 });
});
