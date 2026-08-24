// Copies three.js's Draco decoder out of node_modules and into public/draco/ so the anatomy
// viewer can fetch it at runtime as plain same-origin files.
//
// The same contract as copy-pdf-worker.mjs: runs from `prebuild` and `predev`, so the copy can
// never drift behind a three upgrade — the decoder and the GLTFLoader that drives it always come
// from the same release. The anatomy meshes in public/anatomy/ are Draco-compressed (that is what
// makes a whole labelled skeleton 1.5 MB), and without these files they cannot be opened at all.

import { copyFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
// Resolved through a file the package's exports map actually exposes — `three/package.json` is
// not exported, so the root cannot be resolved directly.
const decoderDir = dirname(require.resolve("three/examples/jsm/libs/draco/gltf/draco_wasm_wrapper.js"));

const outDir = new URL("../public/draco/", import.meta.url);
await mkdir(outDir, { recursive: true });
for (const file of ["draco_decoder.js", "draco_decoder.wasm", "draco_wasm_wrapper.js"]) {
  await copyFile(join(decoderDir, file), new URL(file, outDir));
}

console.log("draco decoder -> public/draco/");
