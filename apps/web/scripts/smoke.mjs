#!/usr/bin/env node

const baseUrl = (process.env.WEB_SMOKE_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "http://127.0.0.1:3100")
  .replace(/\/$/, "");

const checks = [];

function addCheck(name, fn) {
  checks.push({ name, fn });
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

async function read(path, init) {
  const res = await fetch(`${baseUrl}${path}`, {
    redirect: "manual",
    ...init,
    headers: {
      "cache-control": "no-cache",
      ...(init?.headers || {}),
    },
  });
  const body = await res.text();
  return { res, body };
}

function htmlCheck(path, markers) {
  addCheck(`GET ${path}`, async () => {
    const { res, body } = await read(path);
    expect(res.status === 200, `expected 200, got ${res.status}`);
    for (const marker of markers) {
      expect(body.includes(marker), `missing marker: ${marker}`);
    }
  });
}

function postStatusCheck(path, expectedStatus, body = "{}") {
  addCheck(`POST ${path}`, async () => {
    const { res, body: responseBody } = await read(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    expect(
      res.status === expectedStatus,
      `expected ${expectedStatus}, got ${res.status}; body: ${responseBody.slice(0, 240)}`,
    );
  });
}

htmlCheck("/sign-in", ["PharmaOrb", "Sign in"]);
htmlCheck("/sign-up", ["PharmaOrb", "Create account"]);
htmlCheck("/app/ask", ["PharmaOrb App", "Loading"]);
htmlCheck("/app/explore", ["PharmaOrb App", "Loading"]);
htmlCheck("/app/watchlist", ["PharmaOrb App", "Loading"]);
htmlCheck("/app/profile", ["PharmaOrb App", "Loading"]);
htmlCheck("/app/billing", ["PharmaOrb App", "Loading"]);
htmlCheck("/legal/privacy", ["Privacy Policy", "Service providers"]);
htmlCheck("/legal/terms", ["Terms of Use", "Subscriptions and billing"]);
htmlCheck("/legal/disclaimer", ["Medical Disclaimer", "Not medical advice"]);

postStatusCheck("/api/stripe/checkout", 401);
postStatusCheck("/api/stripe/portal", 401);
postStatusCheck("/api/stripe/webhook", 400);

let failed = 0;
console.log(`Web smoke target: ${baseUrl}`);

for (const check of checks) {
  try {
    await check.fn();
    console.log(`ok  ${check.name}`);
  } catch (error) {
    failed += 1;
    console.error(`not ok  ${check.name}`);
    console.error(`  ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (failed > 0) {
  console.error(`\n${failed} smoke check(s) failed.`);
  process.exit(1);
}

console.log(`\n${checks.length} smoke checks passed.`);
