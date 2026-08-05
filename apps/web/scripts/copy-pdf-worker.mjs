// Copies pdf.js's worker out of node_modules and into public/pdf/ so it can be
// fetched at runtime as a plain same-origin file.
//
// Runs from `prebuild` and `predev`, so the copy can never drift behind a
// pdfjs-dist upgrade: bump the dependency, the next build re-copies. The
// version is written alongside it and checked at runtime — a mismatch between
// worker and main thread is one of pdf.js's least legible failures, so it is
// better to detect it than to debug it.

import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const pdfjsRoot = dirname(require.resolve("pdfjs-dist/package.json"));
const { version } = JSON.parse(await readFile(join(pdfjsRoot, "package.json"), "utf8"));

const outDir = new URL("../public/pdf/", import.meta.url);
await mkdir(outDir, { recursive: true });
await copyFile(join(pdfjsRoot, "build", "pdf.worker.min.mjs"), new URL("pdf.worker.min.mjs", outDir));
await writeFile(new URL("version.json", outDir), `${JSON.stringify({ version })}\n`);

console.log(`pdf.js worker ${version} -> public/pdf/pdf.worker.min.mjs`);
