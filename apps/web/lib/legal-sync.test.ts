import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// 🔴 THE LANDING SITE CANNOT IMPORT @nemesis/shared. It is its own pnpm workspace (see
// landing/pnpm-workspace.yaml) and deploys from its own root, so its copy of the Terms and the
// Privacy Policy is GENERATED from packages/shared/src/legal and checked in. Two hand-kept copies
// are how the words drifted the first time (the app sold "Paid Plus" while the site sold nothing
// by name). This is the guard: if the shared source changes and the script was not re-run, CI fails
// here and says which command to run.

test("landing/lib/legal-content.ts matches packages/shared/src/legal", async () => {
  // A plain .mjs script with no declaration file; the two exports are typed here by hand.
  const script = (await import(
    // @ts-expect-error the sync script is untyped JavaScript on purpose (it runs with bare node)
    "../../../packages/shared/scripts/sync-legal-to-landing.mjs"
  )) as { renderLandingLegal: () => string; LANDING_LEGAL_FILE: string };
  const { renderLandingLegal, LANDING_LEGAL_FILE } = script;
  const expected = renderLandingLegal();
  const actual = readFileSync(LANDING_LEGAL_FILE, "utf8");
  assert.equal(
    actual,
    expected,
    "landing/lib/legal-content.ts is out of date. Run: node packages/shared/scripts/sync-legal-to-landing.mjs",
  );
  assert.match(actual, /^\/\/ generated from packages\/shared\/src\/legal, do not edit by hand/);
});
