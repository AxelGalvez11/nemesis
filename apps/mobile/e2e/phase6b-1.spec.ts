import { test, expect } from "@playwright/test";
import { readFileSync } from "fs";
import path from "path";

// Read the seed INSIDE the test (global-setup writes it before tests run, but after
// file collection — a top-level read would race the setup).
function loadSeed() {
  return JSON.parse(
    readFileSync(path.resolve(__dirname, ".auth", "seed.json"), "utf8"),
  ) as { email: string; password: string; drugId: string };
}

// The 6b-1 fidelity gate: the new surface Phase 6 must prove is the app rendering
// under react-native-web, signed in as a REAL authenticated user, reading the live
// §8 backend. The script gates already proved the backend.
test("6b-1: sign-in → 4-tab shell → authenticated get_drug render → sign-out", async ({
  page,
}) => {
  const seed = loadSeed();

  // Boot: "/" redirects an un-authenticated visitor to sign-in (cold Metro bundle).
  await page.goto("/", { timeout: 120_000 });
  await expect(page.getByTestId("signin-screen")).toBeVisible({ timeout: 120_000 });

  // Real UI sign-in as the seeded confirmed user → the 4-tab shell.
  await page.getByTestId("email").fill(seed.email);
  await page.getByTestId("password").fill(seed.password);
  await page.getByTestId("signin-submit").click();
  await expect(page.getByTestId("tab-ask")).toBeVisible({ timeout: 30_000 });

  // 4-tab bar paints under react-native-web.
  await expect(page.getByText("Explore", { exact: true })).toBeVisible();
  await expect(page.getByText("Watchlist", { exact: true })).toBeVisible();
  await expect(page.getByText("Profile", { exact: true })).toBeVisible();

  // Deep-link the data-bound drug screen → real get_drug under react-native-web.
  await page.goto(`/drug/${seed.drugId}`, { timeout: 60_000 });
  await expect(page.getByTestId("drug-screen")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("drug-name")).toContainText(/semaglutide/i);
  await expect(
    page.getByTestId("drug-evidence").or(page.getByTestId("drug-evidence-none")),
  ).toBeVisible();

  // Profile tab → sign out → back to sign-in (session was persisted across reloads).
  await page.goto("/profile");
  await expect(page.getByTestId("profile-email")).toHaveText(seed.email);
  await page.getByTestId("signout").click();
  await expect(page.getByTestId("signin-screen")).toBeVisible({ timeout: 30_000 });
});

// Guest = browse-only UI state (no session). Uses client-side nav only (the guest
// flag is in-memory for 6b-1; real anonymous reads + persistence land in 6b-2).
test("6b-1: guest UI state renders (browse-only, no session)", async ({ page }) => {
  await page.goto("/sign-in", { timeout: 120_000 });
  await expect(page.getByTestId("signin-screen")).toBeVisible({ timeout: 120_000 });
  await page.getByTestId("continue-guest").click();
  await expect(page.getByTestId("tab-ask")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("state-guest")).toBeVisible();
});
