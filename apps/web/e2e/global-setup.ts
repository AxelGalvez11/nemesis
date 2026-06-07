import { mkdir } from "node:fs/promises";
import { chromium, type FullConfig } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TEST_EMAIL = process.env.PLAYWRIGHT_TEST_EMAIL ?? "playwright-smoke@test.pharmabro.internal";
const TEST_PASSWORD = process.env.PLAYWRIGHT_TEST_PASSWORD ?? "Smoke!Test!2026";

export default async function globalSetup(_config: FullConfig) {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error("Playwright setup requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }

  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      apikey: SERVICE_ROLE_KEY,
    },
    body: JSON.stringify({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      email_confirm: true,
    }),
  });

  if (!res.ok && res.status !== 422) {
    throw new Error(`Failed to seed test user: ${res.status} ${(await res.text()).slice(0, 400)}`);
  }

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(`${BASE_URL}/sign-in`);
  await page.fill('input[type="email"]', TEST_EMAIL);
  await page.fill('input[type="password"]', TEST_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/app(?:\/|\?|$)/, { timeout: 30_000 });

  await mkdir(".auth", { recursive: true });
  await context.storageState({ path: ".auth/seed.json" });
  await browser.close();
}
