import { defineConfig } from "@playwright/test";
import path from "path";

const PORT = 8081;

// 6b-1 gate config. webServer = `expo start --web` (NOT a static export): it reads
// EXPO_PUBLIC_* at start, serves /drug/[id] deep-links without an SPA-fallback 404,
// and CI=1 keeps it non-interactive (no hang). Metro's first bundle is slow → big
// timeouts. Secrets (SERVICE_KEY/ANON_KEY/SB_URL) reach global-setup via process.env
// (source supabase/functions/.env before running); the app gets EXPO_PUBLIC_* from
// apps/mobile/.env.
export default defineConfig({
  testDir: __dirname,
  testMatch: "**/*.spec.ts",
  globalSetup: path.resolve(__dirname, "global-setup.ts"),
  globalTeardown: path.resolve(__dirname, "global-teardown.ts"),
  timeout: 120_000,
  expect: { timeout: 30_000 },
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  webServer: {
    command: `CI=1 npx expo start --web --port ${PORT}`,
    cwd: path.resolve(__dirname, ".."),
    url: `http://localhost:${PORT}`,
    timeout: 180_000,
    reuseExistingServer: false,
  },
});
