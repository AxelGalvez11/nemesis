// Asserts the parse worker bundle is in the built function's file list.
//
// 🔴 THIS IS THE ONE PHASE 1 CHECK THAT CANNOT BE A UNIT TEST. Everything else
// about the worker — the heartbeat, the guards, the bundle actually containing a
// parser — is provable in `parse-run.test.ts`. Whether Next UPLOADS the bundle
// alongside the function is a property of the build, and the only artifact that
// answers it is the trace manifest webpack writes next to the route.
//
// It still is not proof the file LOADS in production. A trace entry says the
// bytes were shipped; only a real invocation says the runtime could spawn them.
// That check is queued in `docs/document-intelligence-handoff.md` §6.
//
// Usage:  npm run build && node scripts/check-worker-trace.mjs

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const webRoot = new URL("../", import.meta.url);
const manifestPath = fileURLToPath(
  new URL(".next/server/app/api/documents/parse/worker/route.js.nft.json", webRoot),
);

if (!existsSync(manifestPath)) {
  console.error(`No trace manifest at ${manifestPath}. Run \`npm run build\` first.`);
  process.exit(1);
}

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const files = manifest.files ?? [];
const traced = files.filter((file) => file.includes("workers/parse-thread.mjs"));

if (traced.length === 0) {
  console.error(
    "The parse worker bundle is NOT traced into the deployed function.\n" +
      "Every parse in production would answer \"the document worker is not installed\".\n" +
      "Check `outputFileTracingIncludes` in next.config.ts.",
  );
  process.exit(1);
}

console.log(`parse worker traced: ${traced[0]} (of ${files.length} files)`);
