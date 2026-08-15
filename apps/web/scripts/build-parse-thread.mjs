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
//
// 🔴 NATIVE ADDONS MUST BE EXTERNAL HERE TOO, AND FORGETTING IT BREAKS THE
// DEPLOY WHILE PASSING LOCALLY. `onnxruntime-node` and `@napi-rs/canvas` ship
// `.node` binaries, and esbuild has no loader for those:
//
//     node_modules/onnxruntime-node/dist/binding.js:11:8: ERROR:
//     No loader is configured for ".node" files
//
// It is easy to miss because `build` is only `next build` — the bundling
// happens in `prebuild`, so running `next build` by hand proves nothing about
// this file. Only `pnpm run build` exercises it, which is what Vercel runs and
// what caught this.
//
// Being external is also correct rather than merely expedient: the binary is
// platform-specific, resolved at runtime from
// `bin/napi-v6/${platform}/${arch}/`, and inlining it would freeze one
// platform's binary into a bundle that runs on another.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import * as esbuild from "esbuild";

const webRoot = new URL("../", import.meta.url);
const outFile = fileURLToPath(new URL("workers/parse-thread.mjs", webRoot));

await mkdir(new URL("workers/", webRoot), { recursive: true });

/**
 * Packages the bundle is allowed to still import at runtime.
 *
 * 🔴 EVERY NAME HERE IS A PROMISE THAT VERCEL WILL UPLOAD IT, AND ONE OF THEM WAS A LIE
 * FOR THE WHOLE LIFE OF THIS FILE. `fflate` sat in `external` beside pdfjs-dist and the
 * native addons, but it belongs to neither category that justifies them — it is pure
 * JavaScript with no sibling worker file and no `.node` binary. Nothing in the traced
 * Next graph imports it either, because the only importers are inside THIS bundle, and
 * Vercel's tracer does not read the emitted `.mjs` for its imports. So the deployed
 * function shipped a bundle whose very first `unzipSync` threw:
 *
 *     Cannot find package 'fflate' imported from /var/task/apps/web/workers/parse-thread.mjs
 *
 * It was invisible for nine days because the worker had never once been triggered in
 * production — the Vault secrets that let pg_cron call it were never set. The first real
 * document ever handed to this worker failed on it in five seconds.
 *
 * The lesson is not "add fflate to tracing". It is that `external` and `outputFile
 * TracingIncludes` are two lists that must agree and had no mechanism forcing them to.
 * The assertion below is that mechanism.
 */
const TRACED_EXTERNALS = new Set([
  // Ships its own worker file, resolved by dynamic import that no bundler can follow.
  "pdfjs-dist",
  // Wraps pdfjs-dist and inherits the same constraint.
  "unpdf",
  // `.node` binaries: platform-specific, chosen at runtime, and esbuild has no loader.
  "onnxruntime-node",
  "@napi-rs/canvas",
]);

const result = await esbuild.build({
  bundle: true,
  entryPoints: [fileURLToPath(new URL("lib/notebooks/parse-thread.ts", webRoot))],
  external: [...TRACED_EXTERNALS, "node:*"],
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

/**
 * 🔴 EVERY RUNTIME IMPORT LEFT IN THE BUNDLE MUST BE ONE WE PROMISED TO UPLOAD.
 *
 * This is the guard that would have caught `fflate` before it ever deployed. It reads the
 * EMITTED FILE rather than the esbuild config, because the config states an intention and
 * the file states the fact — an import can survive for reasons the `external` list does
 * not mention, and it is the file that gets deployed.
 *
 * Node builtins are always available and are not uploaded by anyone. They are recognised
 * by `builtinModules`, NOT by a `node:` prefix check — esbuild emits `from "module"` for
 * `createRequire`, with no prefix, and a prefix check reports that as a missing package.
 */
const emitted = await readFile(outFile, "utf8");
const { builtinModules } = await import("node:module");
const builtins = new Set(builtinModules);
const imported = new Set(
  [...emitted.matchAll(/(?:^|\n)\s*import\s[^;]*?from\s*["']([^"']+)["']/g)]
    .map((match) => match[1])
    .filter(
      (specifier) =>
        !specifier.startsWith("node:") &&
        !builtins.has(specifier) &&
        !specifier.startsWith(".") &&
        !specifier.startsWith("/"),
    )
    // "pdfjs-dist/legacy/build/pdf.mjs" is the pdfjs-dist promise being kept.
    .map((specifier) => (specifier.startsWith("@") ? specifier.split("/").slice(0, 2).join("/") : specifier.split("/")[0])),
);
const unpromised = [...imported].filter((name) => !TRACED_EXTERNALS.has(name));
if (unpromised.length > 0) {
  throw new Error(
    `parse-thread bundle imports ${unpromised.join(", ")} at runtime, which nothing promises to upload.\n` +
      "Either bundle it (drop it from the esbuild `external` list) or add it to TRACED_EXTERNALS here " +
      "AND to outputFileTracingIncludes in next.config.ts. Two lists that must agree is exactly how " +
      "fflate shipped broken for nine days.",
  );
}

// Recorded next to the bundle so a deployed function can report which build it
// is running without reading the bundle itself.
await writeFile(
  new URL("workers/build.json", webRoot),
  `${JSON.stringify({ bytes, entry: "lib/notebooks/parse-thread.ts" }, null, 2)}\n`,
);

console.log(`parse thread -> apps/web/workers/parse-thread.mjs (${bytes} bytes)`);
