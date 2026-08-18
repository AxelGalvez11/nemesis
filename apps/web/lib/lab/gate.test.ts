import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

import { labEnabled, labRouteRefusal } from "./gate";

test("the Lab runs in development", () => {
  assert.equal(labEnabled({ NODE_ENV: "development" } as NodeJS.ProcessEnv), true);
  assert.equal(labRouteRefusal({ NODE_ENV: "development" } as NodeJS.ProcessEnv), null);
});

test("🔴 the Lab is off in production, and its routes 404 rather than answering", async () => {
  const prod = { NODE_ENV: "production" } as NodeJS.ProcessEnv;
  assert.equal(labEnabled(prod), false);
  const refusal = labRouteRefusal(prod);
  assert.ok(refusal, "a production route must be refused");
  assert.equal(refusal.status, 404);
  assert.deepEqual(await refusal.json(), { error: "Not found" });
});

test("an unset NODE_ENV is treated as development, never as production", () => {
  // A missing variable must not silently open the Lab's parse endpoint in a deployed environment,
  // and must not silently shut it during an ordinary `next dev`. Node sets NODE_ENV for both of the
  // paths that matter; the ONLY way to reach here with it unset is a bare script, which is local.
  assert.equal(labEnabled({} as NodeJS.ProcessEnv), true);
});

/**
 * 🔴 THE GUARD THAT MADE THE OTHERS WORTH HAVING. A gate that is correct and UNCALLED is the
 * failure this file exists to prevent — the whole reason `gate.ts` is one helper rather than a
 * `notFound()` in a layout. This walks the Lab's own API directory and asserts every route file
 * actually calls it. Adding a route and forgetting the gate fails here, loudly, with the path.
 */
test("🔴 every Lab API route calls the gate", () => {
  const root = new URL("../../app/api/dev/lab/", import.meta.url).pathname;
  const routes: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = `${dir}${entry.name}${entry.isDirectory() ? "/" : ""}`;
      if (entry.isDirectory()) walk(path);
      else if (entry.name === "route.ts") routes.push(path);
    }
  };
  walk(root);
  assert.ok(routes.length > 0, "expected at least one Lab API route to exist");
  for (const route of routes) {
    const source = readFileSync(route, "utf8");
    assert.match(source, /labRouteRefusal\(/, `${route} does not call labRouteRefusal`);
  }
});
