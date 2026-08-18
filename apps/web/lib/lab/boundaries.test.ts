import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

/**
 * 🔴 THE GUARD FOR THE ONE FAILURE LOCAL VERIFICATION CANNOT SEE.
 *
 * `lib/lab/turns.ts` imported `costUsd` from `supabase/functions/_shared/llm-cost.ts` — one line,
 * reaching across the repo into the Deno function directory. `tsc` followed it. Turbopack dev
 * resolved it. A local `pnpm build`, run from a full checkout, succeeded. Vercel builds from a
 * PRUNED workspace where `supabase/functions/` does not exist, so the deployment failed with
 * `module-not-found` and took the whole web app's build down with it.
 *
 * Nothing on a developer's machine can reproduce that, because the file is always there. So the
 * rule is asserted structurally instead: no Lab source file that the app can reach may import from
 * outside `apps/web`. Test files are exempt and are the ONLY exemption — they run from the full
 * checkout, never from a deployment, which is exactly what lets `cost.test.ts` compare the mirrored
 * price table against the canonical one.
 */
test("🔴 no Lab file the app bundles may import from outside apps/web", () => {
  const roots = ["lib/lab", "components/lab", "app/dev", "app/api/dev"];
  const offenders: string[] = [];

  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        walk(path);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(entry.name)) continue;
      // Tests are exempt: they never reach a deployment.
      if (entry.name.endsWith(".test.ts") || entry.name.endsWith(".test.tsx")) continue;
      const source = readFileSync(path, "utf8");
      for (const line of source.split("\n")) {
        // Only real import/export specifiers, so a path mentioned in a comment does not trip it.
        const match = /^\s*(?:import|export)\s[^'"]*from\s+["']([^"']+)["']/.exec(line);
        const specifier = match?.[1];
        if (!specifier) continue;
        // Three `..` segments is the shallowest hop that can leave apps/web from lib/ or app/.
        if (/(^|\/)\.\.\/\.\.\/\.\.\//.test(specifier)) offenders.push(`${path}: ${specifier}`);
      }
    }
  };

  for (const root of roots) walk(new URL(`../../${root}`, import.meta.url).pathname);

  assert.deepEqual(
    offenders,
    [],
    `these reach outside apps/web and will fail the deployed build, which prunes the workspace:\n  ${offenders.join("\n  ")}`,
  );
});
