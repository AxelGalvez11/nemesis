// Harvesting the anatomy atlas: named regions in, licence-clean meshes and a registry out.
//
// Usage:  pnpm tsx scripts/anatomy-harvest.mts
//
// 🔴 THE SAME SHAPE AS `reference-shelf-harvest.mts`, ONE MEDIUM OVER: a NAMED list of sources
// (never a crawl), a per-run licence discipline, and a generated registry file the app imports.
// The sources are the Open3DModel project's own GLB exports — Dutch/Belgian university revisions
// of Z-Anatomy, which itself descends from BodyParts3D. The MESHES are CC BY-SA 4.0.
//
// 🔴🔴 THE TEXTURES ARE STRIPPED, AND THAT IS A LICENCE ACT BEFORE IT IS A SIZE ONE. Open3DModel's
// own download page licenses the 3D models CC BY-SA 4.0 and the TEXTURES CC BY-NC-SA — and NC is
// refused across this codebase by design (the reference shelf holds the same line). Removing every
// texture, image and UV channel at harvest time means nothing NC ever reaches the repo, the
// deploy, or a learner. The bones render in a material of our own instead, which an anatomy
// atlas's line-drawing tradition says is the more readable choice anyway.
//
// 🔴 STRUCTURE NAMES COME FROM THE MODEL'S OWN NODES. "Atlas (C1)", "Frontal bone", "Sacrum" —
// the atlas authors named every node, and those names ARE the registry: what a model may ask for
// by name, and what the viewer can highlight. Nothing here invents an anatomical vocabulary.

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { NodeIO } from "@gltf-transform/core";
import { KHRDracoMeshCompression } from "@gltf-transform/extensions";
import { dedup, draco, prune } from "@gltf-transform/functions";
import draco3d from "draco3dgltf";

/**
 * Every region harvested, by the Open3DModel project's own slug.
 *
 * 🔴 A NAMED LIST, DELIBERATELY. Adding a region is adding one line and re-running; nothing walks
 * the site. `title` is what a lesson calls the region; the slug is the download address.
 */
const REGIONS: readonly { slug: string; file: string; title: string }[] = [
  { file: "overview-skeleton", slug: "overview-skeleton", title: "Skeleton" },
];

const LICENCE = {
  attribution: "Open3DModel (AnatomyTOOL), revised from Z-Anatomy / BodyParts3D",
  licence: "CC-BY-SA-4.0",
  source: "Open3DModel",
  url: "https://anatomytool.org/open3dmodel-about",
} as const;

const OUT_DIR = new URL("../public/anatomy/", import.meta.url).pathname;
const REGISTRY = new URL("../lib/learn/anatomy-atlas.ts", import.meta.url).pathname;

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  const io = new NodeIO()
    .registerExtensions([KHRDracoMeshCompression])
    .registerDependencies({
      "draco3d.decoder": await draco3d.createDecoderModule(),
      "draco3d.encoder": await draco3d.createEncoderModule(),
    });

  const regions: Array<{
    region: string;
    title: string;
    assetPath: string;
    bytes: number;
    structures: string[];
  }> = [];

  for (const region of REGIONS) {
    const url = `https://caskanatomy.info/open3dmodelfiles/${region.slug}/${region.slug}-glb.zip`;
    const scratch = join(tmpdir(), `anatomy-${region.slug}`);
    rmSync(scratch, { force: true, recursive: true });
    mkdirSync(scratch, { recursive: true });
    const zipPath = join(scratch, "region.zip");
    console.log(`↓ ${url}`);
    execFileSync("curl", ["-sL", "-o", zipPath, url]);
    execFileSync("unzip", ["-o", "-q", zipPath, "-d", scratch]);

    const document = await io.read(join(scratch, `${region.file}.glb`));
    const root = document.getRoot();

    // The licence act: no texture, no image, no UV channel survives the harvest.
    for (const texture of root.listTextures()) texture.dispose();
    for (const material of root.listMaterials()) material.dispose();
    for (const mesh of root.listMeshes()) {
      for (const primitive of mesh.listPrimitives()) {
        primitive.setMaterial(null);
        for (const semantic of primitive.listSemantics()) {
          if (semantic.startsWith("TEXCOORD")) primitive.setAttribute(semantic, null);
        }
      }
    }

    // 🔴 NAMES BEFORE PRUNING, so the registry records what the atlas's authors named, even if a
    // later optimisation pass were ever to merge geometry. Leaf nodes with meshes are structures;
    // grouping nodes ("Bones") are containers a learner never asks for by name.
    const structures = root
      .listNodes()
      .filter((node) => node.getMesh() !== null && (node.getName() ?? "").trim())
      .map((node) => node.getName().trim())
      .sort((a, b) => a.localeCompare(b));

    await document.transform(prune(), dedup(), draco());
    const outPath = join(OUT_DIR, `${region.slug}.glb`);
    const binary = await io.writeBinary(document);
    writeFileSync(outPath, binary);
    console.log(`✓ ${region.slug}: ${structures.length} structures, ${(binary.byteLength / 1024).toFixed(0)} KB`);

    regions.push({
      assetPath: `/anatomy/${region.slug}.glb`,
      bytes: binary.byteLength,
      region: region.slug,
      structures,
      title: region.title,
    });
  }

  const total = regions.reduce((sum, region) => sum + region.bytes, 0);
  const stamp = new Date().toISOString().slice(0, 10);
  const body = `// GENERATED by scripts/anatomy-harvest.mts — do not edit by hand. Re-run the script instead.
//
// ${regions.length} region(s), ${regions.reduce((sum, region) => sum + region.structures.length, 0)} named structures, ${(total / 1024).toFixed(0)} KB of meshes, harvested ${stamp}.
//
// 🔴 MESHES ONLY, CC BY-SA 4.0. Textures were CC BY-NC-SA and were stripped at harvest — see the
// harvest script's header. The structure names are the atlas's own node names, verbatim.

export interface AnatomyRegion {
  /** The Open3DModel slug, and the file name under /public/anatomy/. */
  readonly region: string;
  /** What a lesson calls this region. */
  readonly title: string;
  /** Same-origin path the viewer loads. */
  readonly assetPath: string;
  /** Every named structure in the model, verbatim from its nodes. */
  readonly structures: readonly string[];
}

export const ANATOMY_LICENCE = ${JSON.stringify(LICENCE, null, 2)} as const;

export const ANATOMY_ATLAS: readonly AnatomyRegion[] = ${JSON.stringify(
    regions.map(({ bytes: _bytes, ...region }) => region),
    null,
    2,
  )};
`;
  writeFileSync(REGISTRY, body);
  console.log(`✓ registry → ${REGISTRY}`);
}

await main();
