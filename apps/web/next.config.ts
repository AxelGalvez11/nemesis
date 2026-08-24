import type { NextConfig } from "next";

/**
 * pdf.js's worker, which every PDF parse needs and no tracer can find.
 *
 * Both spellings are listed because the package layout is a runtime detail we do
 * not control: pnpm may hoist `pdfjs-dist` to the workspace root or keep it
 * under `apps/web`, and a tracing entry that names only one of them ships
 * nothing at all on the other layout — silently, since the failure is a caught
 * exception rather than a build error.
 */
const PDF_WORKER_FILES = [
  "../../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
  "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
];

const nextConfig: NextConfig = {
  // 🔴🔴 `molstar` IS TRANSPILED BECAUSE THE VIEWER DIED SILENTLY WITHOUT IT. Measured 2026-08-24:
  // asking for haemoglobin mounted the frame, drew nothing, and never even requested the
  // coordinates. In production the chunk threw `Cannot read properties of undefined (reading
  // 'create')` from inside Mol*'s own task runner; locally the init promise simply never settled.
  // Both are one shape — a module resolving to `undefined` under this bundler's interop — and the
  // viewer's try/catch could not report either, because a promise that never resolves throws
  // nothing. That is why this failure looked like an empty box rather than a refusal.
  transpilePackages: ["@nemesis/shared", "molstar"],
  /**
   * 🔴 NATIVE ADDONS MUST NOT BE BUNDLED — THIS IS A BUILD-BREAKER, NOT A
   * PREFERENCE. Both ship `.node` binaries, and pulling one into a route's
   * module graph fails the whole production build:
   *
   *     ./node_modules/@napi-rs/canvas/js-binding.js
   *     non-ecmascript placeable asset — not placeable in ESM chunks
   *
   * Naming them here leaves them as ordinary runtime requires. Both are ALSO
   * imported dynamically at their use sites (`rasterize.ts`, `layout-onnx.ts`),
   * because the two protections cover different failures: this one stops the
   * bundler touching them, the dynamic import keeps them off the static graph
   * so a missing or unloadable binary disables one lane instead of the app.
   *
   * `onnxruntime-node` resolves its binary with a fully interpolated
   * `require(../bin/napi-v6/${platform}/${arch}/…)` — unresolvable by static
   * analysis, and 258 MB across all platforms if a tracer gives up and takes
   * the lot. Only linux/x64 (37 MB) is ever needed on the deployment target.
   */
  /**
   * 🔴 `pdfjs-dist` IS HERE BECAUSE BUNDLING IT SILENTLY KILLED PDF STRUCTURE IN
   * PRODUCTION, ON EVERY DOCUMENT, FOR AS LONG AS THE FEATURE HAS EXISTED.
   *
   * pdf.js loads its worker with a dynamic import resolved RELATIVE TO ITSELF.
   * Bundled into a Next server chunk it looks for a sibling that the bundler
   * never emitted, and throws before a single page is read:
   *
   *     Setting up fake worker failed: "Cannot find module
   *     '/var/task/apps/web/.next/server/chunks/pdf.worker.mjs' imported from
   *     .../node_modules_pdfjs-dist_legacy_build_pdf_mjs_1wr0y6b._.js"
   *
   * `parsePdf` caught that and fell back to unpdf, so every PDF still produced
   * TEXT and every request still logged `state: "complete"` — while the model,
   * and with it every table, heading, rect and locator, was gone. Four of four
   * parses in production were stored `text-only`; the source indexer had nothing
   * it could ever consume; Canvas got the string path. Local `tsx` resolves the
   * worker from real node_modules, so it works on a laptop and nowhere else.
   *
   * 🔴 THE SAME FILE THAT BUNDLES THE PARSE WORKER ALREADY KNEW THIS. See
   * `scripts/build-parse-thread.mjs`: pdfjs-dist is external there, with a
   * comment saying bundling it "would break its worker resolution". That lesson
   * was applied to the esbuild bundle and never to this one. If a package needs
   * to be external for one bundler here, check the other.
   */
  serverExternalPackages: ["onnxruntime-node", "@napi-rs/canvas", "pdfjs-dist", "unpdf"],
  /**
   * 🔴 THE PARSE WORKER IS SPAWNED BY PATH, SO NOTHING TRACES IT AUTOMATICALLY.
   *
   * `runParseOnThread` computes `workers/parse-thread.mjs` at runtime and hands
   * it to `new Worker(...)`. Next traces files it can see *referenced* in the
   * module graph; a path built from `process.cwd()` is invisible to that
   * analysis, so without this entry the bundle simply would not be uploaded and
   * every parse in production would return "the document worker is not
   * installed on this deployment".
   *
   * The bundle is produced by `scripts/build-parse-thread.mjs` (wired into
   * `prebuild`), which also asserts it is large enough to actually contain the
   * parser — a bundle that silently lost its imports would still be a file, and
   * would still be traced.
   */
  outputFileTracingIncludes: {
    "/api/documents/parse/worker": [
      "./workers/**",
      ...PDF_WORKER_FILES,
    ],
    /**
     * 🔴 EXTERNALISING pdfjs-dist WAS NECESSARY AND NOT SUFFICIENT — THE WORKER
     * FILE STILL HAS TO BE UPLOADED. With `serverExternalPackages` alone the
     * error only MOVED, from a missing bundled chunk to a missing sibling in
     * node_modules:
     *
     *     Cannot find module '/var/task/node_modules/pdfjs-dist/legacy/build/
     *     pdf.worker.mjs' imported from .../legacy/build/pdf.mjs
     *
     * pdf.js reaches its worker through a dynamic import that no static analysis
     * can follow, so the tracer ships `pdf.mjs` and leaves `pdf.worker.mjs`
     * behind. Naming it here is the same mechanism the parse-thread bundle above
     * already relies on, for the same reason: a path the tracer cannot SEE must
     * be declared, or it is silently absent in production and perfectly present
     * on a laptop.
     */
    "/api/notebooks/extract/file": PDF_WORKER_FILES,
  },
  // /app was the old pre-Nemesis shell and no longer exists; the workspace at "/"
  // (→ /sessions) replaced it. Redirect instead of 404 so stale links keep working.
  async redirects() {
    return [
      { source: "/app", destination: "/", permanent: false },
      { source: "/app/:path*", destination: "/", permanent: false },
    ];
  },
};

export default nextConfig;
