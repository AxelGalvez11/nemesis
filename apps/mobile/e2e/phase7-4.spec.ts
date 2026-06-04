import { test, expect } from "@playwright/test";

// Phase 7-4 — compliance closeout UI gate. No /ask, no cloud writes, no seeded user: the
// doc-18 age gate + legal screens are static / pre-auth, so this gate is DeepSeek-cost-free
// and fast. It proves (1) the entry-screen 18+/Terms+Privacy attestation BLOCKS both entry
// actions until acknowledged (and opens on check), and (2) the doc-18-required privacy
// sections + the terms age clause + the educational disclaimer render.

test("7-4: entry-screen 18+/ToS age gate blocks both actions until acknowledged, then opens", async ({
  page,
}) => {
  await page.goto("/sign-in", { timeout: 120_000 });
  await expect(page.getByTestId("signin-screen")).toBeVisible({ timeout: 120_000 });

  // Gate closed: both entry actions are disabled before the attestation. react-native-web
  // renders a disabled Pressable as <div aria-disabled="true"> (not a native <button
  // disabled>), which Playwright's toBeDisabled() does NOT treat as disabled — assert the
  // emitted attribute directly.
  await expect(page.getByTestId("signin-submit")).toHaveAttribute("aria-disabled", "true");
  await expect(page.getByTestId("continue-guest")).toHaveAttribute("aria-disabled", "true");
  // The Terms / Privacy the user is attesting to are present + reachable from the gate.
  await expect(page.getByTestId("link-terms")).toBeVisible();
  await expect(page.getByTestId("link-privacy")).toBeVisible();

  // Acknowledge 18+ / Terms & Privacy → both actions enable.
  await page.getByTestId("age-ack").click();
  await expect(page.getByTestId("signin-submit")).not.toHaveAttribute("aria-disabled", "true");
  await expect(page.getByTestId("continue-guest")).not.toHaveAttribute("aria-disabled", "true");

  // Gate opens: guest entry now reaches the app shell.
  await page.getByTestId("continue-guest").click();
  await expect(page.getByTestId("tab-ask")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("state-guest")).toBeVisible();
});

test("7-4: privacy screen renders the doc-18-required sections (breach / minors / state rights)", async ({
  page,
}) => {
  await page.goto("/profile/legal?doc=privacy", { timeout: 120_000 });
  await expect(page.getByTestId("legal-privacy")).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText("Breach notification", { exact: true })).toBeVisible();
  await expect(page.getByText("Children & minors", { exact: true })).toBeVisible();
  await expect(page.getByText("Your state privacy rights", { exact: true })).toBeVisible();
});

test("7-4: terms carries the age & eligibility clause; educational disclaimer renders", async ({
  page,
}) => {
  await page.goto("/profile/legal?doc=terms", { timeout: 120_000 });
  await expect(page.getByTestId("legal-terms")).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText("Age & eligibility", { exact: true })).toBeVisible();

  await page.goto("/profile/legal?doc=disclaimer", { timeout: 60_000 });
  await expect(page.getByTestId("disclaimer-body")).toBeVisible({ timeout: 30_000 });
});
