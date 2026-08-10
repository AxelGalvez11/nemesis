import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@nemesis/shared"],
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
  serverExternalPackages: ["onnxruntime-node", "@napi-rs/canvas"],
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
    "/api/documents/parse/worker": ["./workers/**"],
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
