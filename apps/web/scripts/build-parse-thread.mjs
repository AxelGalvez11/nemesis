// Bundles the parse worker-thread entry into a standalone file the deployed
// function can spawn by path.
//
// 🔴 THE PROBLEM THIS SOLVES. A `worker_thread` starts a fresh module loader.
// It does not inherit Next's bundle, its aliases (`@/...`), its transpilation of
// `@nemesis/shared`, or any TypeScript loader — so `new Worker("lib/notebooks/
// parse-thread.ts")` cannot work in production no matter how well it works under
// `tsx`. esbuild flattens the entry and everything it imports into one plain
// ESM file with no loader requirement and no path aliases left in it.
//
// Runs from `prebuild` and `predev`, exactly like `copy-pdf-worker.mjs`, so the
// bundle cannot drift behind the source that produced it.
//
// EXTERNALS ARE THE INTERESTING PART. pdf.js and unpdf ship their own worker
// files and conditional native bits; bundling them here would either inline a
// second copy of pdf.js or break its worker resolution. They stay external and
// are resolved from `node_modules` at runtime — which is why the tracing entry
// in `next.config.ts` names the bundle, and why that config comment points back
// at this one.

import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import * as esbuild from "esbuild";

const webRoot = new URL("../", import.meta.url);
const outFile = fileURLToPath(new URL("workers/parse-thread.mjs", webRoot));

await mkdir(new URL("workers/", webRoot), { recursive: true });

const result = await esbuild.build({
  bundle: true,
  entryPoints: [fileURLToPath(new URL("lib/notebooks/parse-thread.ts", webRoot))],
  external: ["pdfjs-dist", "unpdf", "fflate", "node:*"],
  format: "esm",
  // The Vercel Node runtime. Matches `engines` and the runtime the route
  // declares; a lower target would down-level `await` at the top level.
  target: "node20",
  metafile: true,
  outfile: outFile,
  platform: "node",
  // Not minified: this ships inside a serverless function, never to a browser,
  // so the only reader is whoever is debugging a stack trace at 2 a.m. An inline
  // source map would triple the size of a file the platform has to cold-start.
  minify: false,
  sourcemap: false,
});

// 🔴 A BUNDLE THAT SILENTLY LOST THE PARSER WOULD STILL "BUILD". The entry only
// calls `parseDocument`; if an import failed to resolve to the real module the
// output would be a few hundred bytes and every parse would return nothing.
// Assert the shape here, where the failure is one line, rather than discovering
// it as an empty document in production.
const bytes = result.metafile.outputs[
  Object.keys(result.metafile.outputs).find((key) => key.endsWith("parse-thread.mjs"))
]?.bytes ?? 0;
const MIN_PLAUSIBLE_BYTES = 20_000;
if (bytes < MIN_PLAUSIBLE_BYTES) {
  throw new Error(
    `parse-thread bundle is ${bytes} bytes, below the ${MIN_PLAUSIBLE_BYTES} floor. ` +
      "That means the parser did not make it in — check for a newly-external import.",
  );
}

// Recorded next to the bundle so a deployed function can report which build it
// is running without reading the bundle itself.
await writeFile(
  new URL("workers/build.json", webRoot),
  `${JSON.stringify({ bytes, entry: "lib/notebooks/parse-thread.ts" }, null, 2)}\n`,
);

console.log(`parse thread -> apps/web/workers/parse-thread.mjs (${bytes} bytes)`);
