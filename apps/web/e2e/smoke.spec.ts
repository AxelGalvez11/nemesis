import { expect, test } from "@playwright/test";

test.describe("Auth gate", () => {
  test("unauthenticated user is redirected to sign-in", async ({ browser }) => {
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();
    await page.goto("/app/ask");
    await expect(page).toHaveURL(/sign-in/);
    await context.close();
  });

  test("seeded user reaches app home", async ({ page }) => {
    await page.goto("/app");
    await expect(page).not.toHaveURL(/sign-in/);
    await expect(page.getByText("Evidence workspace")).toBeVisible();
  });
});

test.describe("Ask flow", () => {
  test("user can submit a drug question and see citations", async ({ page }) => {
    await page.goto("/app/ask");
    const input = page.getByPlaceholder("Ask about a drug, label, trial, safety signal, or evidence question...");
    await input.fill("What are semaglutide contraindications?");
    await input.press("Enter");

    await expect(page.getByTestId("ask-response")).toBeVisible({ timeout: 45_000 });
    await expect(page.getByTestId("citation").first()).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("Stripe auth guards", () => {
  test("checkout without auth returns 401", async ({ browser }) => {
    const context = await browser.newContext({ storageState: undefined });
    const response = await context.request.post("/api/stripe/checkout");
    expect(response.status()).toBe(401);
    await context.close();
  });

  test("checkout with auth is not rejected by auth guard", async ({ page }) => {
    await page.goto("/app");
    const accessToken = await page.evaluate(() => {
      for (const [key, value] of Object.entries(window.localStorage)) {
        if (!key.includes("auth-token") || typeof value !== "string") continue;
        try {
          const parsed = JSON.parse(value) as { access_token?: string; currentSession?: { access_token?: string } };
          const token = parsed.access_token ?? parsed.currentSession?.access_token;
          if (token) return token;
        } catch {
          // Continue scanning other localStorage keys.
        }
      }
      return null;
    });
    expect(accessToken).toBeTruthy();

    const response = await page.request.post("/api/stripe/checkout", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(response.status()).not.toBe(401);
  });
});
