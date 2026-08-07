import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@nemesis/shared"],
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
