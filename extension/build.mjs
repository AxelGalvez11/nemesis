// Bundles the extension into extension/dist/.
//
// Uses the esbuild already in the repo's root node_modules — the extension has
// no package.json and no dependencies of its own ON PURPOSE. `apps/*` and
// `packages/*` are pnpm workspace globs, and a new member with no importer in
// pnpm-lock.yaml makes `pnpm install --frozen-lockfile` fail; that exact
// asymmetry killed an EAS build once already. Living at the repo root, with
// nothing to install, the extension cannot repeat it.
//
// Run: node extension/build.mjs [--watch]

import { readFileSync, mkdirSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import * as esbuild from "esbuild";

const here = dirname(fileURLToPath(import.meta.url));
const outdir = join(here, "dist");
mkdirSync(outdir, { recursive: true });

/**
 * Content scripts and the popup are separate entry points: Chrome loads each as
 * its own file and they share no runtime state.
 *
 * Named as a MAP rather than a list so every output lands flat in dist/ with a
 * name we chose. With a plain list, esbuild mirrors the source tree and
 * src/popup/popup.ts emits to dist/popup/popup.js — while popup.html sits at
 * dist/popup.html asking for ./popup.js, and the popup silently opens blank.
 */
const entryPoints = {
  background: join(here, "src/background.ts"),
  "content-bridge": join(here, "src/content-bridge.ts"),
  "content-scan": join(here, "src/content-scan.ts"),
  popup: join(here, "src/popup/popup.ts"),
};

const options = {
  bundle: true,
  entryPoints,
  // Chrome 114+ covers every browser that supports Manifest V3 well enough to
  // matter, and lets the output stay readable for review.
  target: "chrome114",
  // A content script injected with chrome.scripting cannot be an ES module, so
  // everything is emitted as a classic script. The popup declares type=module
  // in its HTML, which an IIFE bundle satisfies fine.
  format: "iife",
  outdir,
  platform: "browser",
  logLevel: "info",
  // Kept on: a reviewer at the Chrome Web Store reads this code, and so will
  // anyone deciding whether to trust it with their school portal.
  minify: false,
  sourcemap: false,
};

copyFileSync(join(here, "src/popup/popup.html"), join(outdir, "popup.html"));

const manifest = JSON.parse(readFileSync(join(here, "manifest.json"), "utf8"));
process.stdout.write(`Building ${manifest.name} ${manifest.version}\n`);

if (process.argv.includes("--watch")) {
  const context = await esbuild.context(options);
  await context.watch();
  process.stdout.write("Watching. Reload the extension in chrome://extensions after each change.\n");
} else {
  await esbuild.build(options);
  process.stdout.write(`Built to ${outdir}\n`);
}
