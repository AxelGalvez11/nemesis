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
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
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
const REGIONS: readonly { slug: string; title: string }[] = [
  { slug: "overview-skeleton", title: "Skeleton" },
  { slug: "vertebrae", title: "Typical vertebrae" },
  { slug: "overview-colored-skull", title: "Skull" },
  { slug: "exploded-view-skull", title: "Skull, exploded" },
  { slug: "colored-skull-base", title: "Skull base" },
  { slug: "upper-limb", title: "Upper limb" },
  { slug: "hand", title: "Hand" },
  { slug: "lower-limb", title: "Lower limb" },
];

/**
 * The body systems exported from Z-Anatomy's own Blender file, by the slug the export writes.
 *
 * 🔴 THE SECOND SOURCE EXISTS BECAUSE THE FIRST ONE IS STILL A SKELETON. The university project
 * has retopologised bones, limbs and skulls beautifully and says plainly that its organs are
 * unfinished — so an atlas built only from it is bones and limbs, which is exactly what the owner
 * ruled out ("I don't just want bones"). Z-Anatomy upstream carries the whole body: viscera,
 * cardiovascular, nervous, lymphoid, muscular, joints. Both are CC BY-SA 4.0, and each region
 * records which one it came from so the credit line under the viewer is the right one.
 */
const SYSTEMS: readonly { slug: string; title: string }[] = [
  { slug: "muscular-system", title: "Muscular system" },
  { slug: "cardiovascular-system", title: "Cardiovascular system" },
  { slug: "nervous-system", title: "Nervous system and sense organs" },
  { slug: "visceral-systems", title: "Internal organs" },
  { slug: "lymphoid-organs", title: "Lymphoid organs" },
  { slug: "joints", title: "Joints" },
];

/**
 * Where the Z-Anatomy Blender file is, and how to get one.
 *
 * 🔴 REQUIRED RATHER THAN OPTIONAL, so a regenerated registry is never silently half an atlas. The
 * file is 306 MB and is not committed; the download is one command, recorded here so the next
 * person does not have to find it again.
 */
const BLEND = process.env.ANATOMY_BLEND ?? "";
const BLENDER = process.env.BLENDER_BIN ?? "/Applications/Blender.app/Contents/MacOS/Blender";
const BLEND_HELP = `Set ANATOMY_BLEND to Z-Anatomy's Startup.blend. To fetch it:
  curl -L -o Z-Anatomy.zip https://raw.githubusercontent.com/Z-Anatomy/Models-of-human-anatomy/master/Z-Anatomy.zip
  unzip Z-Anatomy.zip           # → Z-Anatomy/Startup.blend
Blender is needed only for this step; set BLENDER_BIN if it is not in /Applications.`;

/** Who made each region, and under what terms. Keyed by the `source` every registry row carries. */
const SOURCES = {
  "open3dmodel": {
    attribution: "Open3DModel (AnatomyTOOL), revised from Z-Anatomy / BodyParts3D",
    licence: "CC-BY-SA-4.0",
    source: "Open3DModel",
    url: "https://anatomytool.org/open3dmodel-about",
  },
  "z-anatomy": {
    attribution: "Z-Anatomy, derived from BodyParts3D",
    licence: "CC-BY-SA-4.0",
    source: "Z-Anatomy",
    url: "https://www.z-anatomy.com/",
  },
} as const;

type SourceId = keyof typeof SOURCES;

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
    landmarks: string[];
    source: SourceId;
    structures: string[];
  }> = [];

  /** One mesh file in, one licence-cleaned mesh file and a list of names out. */
  const process = async (
    inputPath: string,
    slug: string,
    title: string,
    source: SourceId,
  ): Promise<void> => {
    const document = await io.read(inputPath);
    const root = document.getRoot();

    // 🔴 THE LICENCE ACT: no texture, no image, no UV channel survives the harvest. Open3DModel's
    // textures are CC BY-NC-SA and NC is refused across this codebase by design, so nothing
    // non-commercial ever reaches the repo, the deploy, or a learner. The bones and organs render
    // in a material of our own instead.
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

    // 🔴🔴 A GROUPING NODE IS A STRUCTURE TOO, AND ASSUMING OTHERWISE LOST THE ORGANS. The first
    // version recorded only nodes that carried a mesh, which is right for the skeleton — every
    // bone is its own mesh — and quietly wrong for everything soft. Measured on the exported
    // cardiovascular system: 22 of 60 nodes hold a mesh, and the other 38 are exactly the names a
    // learner would say — "Aorta", "Apex of heart", "Pulmonary arteries", "Systemic veins". The
    // parts are meshes; the ORGAN is their parent. So any named node with geometry anywhere
    // beneath it is askable, and the viewer highlights a parent by lighting its whole subtree.
    const hasGeometry = (node: ReturnType<typeof root.listNodes>[number]): boolean =>
      node.getMesh() !== null || node.listChildren().some((child) => hasGeometry(child));
    const named = root.listNodes().filter((node) => (node.getName() ?? "").trim());
    const structures = [
      ...new Set(named.filter((node) => hasGeometry(node)).map((node) => node.getName().trim())),
    ].sort((a, b) => a.localeCompare(b));

    // 🔴🔴 THE ATLAS NAMES THINGS IT CANNOT OUTLINE, AND THEY ARE STILL WORTH ANSWERING. A third
    // of the cardiovascular model's nodes are zero-geometry label anchors — "Apex of heart",
    // "Coronary sulcus", "Anterior interventricular sulcus" — the landmarks a textbook points at
    // on a surface it does not separate out. Refusing them outright reported the HEART as absent
    // from a model that is almost entirely heart, which is the worst of both answers: no picture,
    // and a false claim about coverage. Recorded separately, they resolve to the region's own view
    // — "here is the model this landmark is on" — and the highlight stays honest, because the
    // matcher will never outline something with no geometry behind it.
    const landmarks = [
      ...new Set(named.filter((node) => !hasGeometry(node)).map((node) => node.getName().trim())),
    ]
      .filter((name) => !structures.includes(name))
      .sort((a, b) => a.localeCompare(b));

    await document.transform(prune(), dedup(), draco());
    const binary = await io.writeBinary(document);
    writeFileSync(join(OUT_DIR, `${slug}.glb`), binary);
    console.log(
      `✓ ${slug}: ${structures.length} structures + ${landmarks.length} landmarks, ${(binary.byteLength / 1024 / 1024).toFixed(1)} MB`,
    );

    regions.push({
      assetPath: `/anatomy/${slug}.glb`,
      bytes: binary.byteLength,
      landmarks,
      region: slug,
      source,
      structures,
      title,
    });
  };

  for (const region of REGIONS) {
    const url = `https://caskanatomy.info/open3dmodelfiles/${region.slug}/${region.slug}-glb.zip`;
    const scratch = join(tmpdir(), `anatomy-${region.slug}`);
    rmSync(scratch, { force: true, recursive: true });
    mkdirSync(scratch, { recursive: true });
    const zipPath = join(scratch, "region.zip");
    console.log(`↓ ${url}`);
    execFileSync("curl", ["-sL", "-o", zipPath, url]);
    execFileSync("unzip", ["-o", "-q", zipPath, "-d", scratch]);

    // 🔴 THE MESH FILE IS DISCOVERED, NOT ASSUMED. `exploded-view-skull.zip` contains
    // `exploded-skull.glb` — the slug and the file name genuinely differ for some regions, and a
    // second hand-maintained name column is one more thing to be wrong about.
    const found = readdirSync(scratch, { recursive: true, withFileTypes: true }).find(
      (entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".glb"),
    );
    if (!found) throw new Error(`${region.slug}: the archive contains no .glb`);
    await process(join(found.parentPath ?? scratch, found.name), region.slug, region.title, "open3dmodel");
  }

  // ── the whole body, out of Z-Anatomy's own Blender file ──────────────────────────────────────
  if (!BLEND || !existsSync(BLEND)) throw new Error(`ANATOMY_BLEND is not a file.\n${BLEND_HELP}`);
  if (!existsSync(BLENDER)) throw new Error(`Blender is not at ${BLENDER}.\n${BLEND_HELP}`);

  const exported = join(tmpdir(), "anatomy-systems");
  rmSync(exported, { force: true, recursive: true });
  mkdirSync(exported, { recursive: true });
  console.log(`↓ exporting body systems from ${BLEND}`);
  execFileSync(
    BLENDER,
    ["--background", BLEND, "--python", new URL("./anatomy-export-systems.py", import.meta.url).pathname, "--", exported],
    { stdio: ["ignore", "ignore", "inherit"] },
  );
  for (const system of SYSTEMS) {
    const path = join(exported, `${system.slug}.glb`);
    if (!existsSync(path)) throw new Error(`${system.slug}: Blender exported no mesh file`);
    await process(path, system.slug, system.title, "z-anatomy");
  }

  const total = regions.reduce((sum, region) => sum + region.bytes, 0);
  const named = regions.reduce((sum, region) => sum + region.structures.length, 0);
  const stamp = new Date().toISOString().slice(0, 10);
  const body = `// GENERATED by scripts/anatomy-harvest.mts — do not edit by hand. Re-run the script instead.
//
// ${regions.length} regions, ${named} named structures, ${(total / 1024 / 1024).toFixed(1)} MB of meshes, harvested ${stamp}.
//
// 🔴 SERVER-SIDE ONLY. This list is tens of thousands of structure names and grows with every
// region; a learner reading a history lesson must not download it to discover their answer names
// no anatomy. \`app/api/learn/anatomy/route.ts\` owns it, \`anatomy-resolve.ts\` never imports it,
// and a guard in \`visualization-roadmap.test.ts\` fails the build if a client component does.
//
// 🔴 MESHES ONLY, CC BY-SA 4.0, FROM TWO NAMED SOURCES. Textures were CC BY-NC-SA and were
// stripped at harvest — see the harvest script's header. The structure names are the atlases' own
// node names, verbatim.

/** Which atlas a region came from. The credit line is looked up from this in \`anatomy-licence.ts\`. */
export type AnatomySource = ${Object.keys(SOURCES).map((id) => JSON.stringify(id)).join(" | ")};

export interface AnatomyRegion {
  /** The region slug, and the file name under /public/anatomy/. */
  readonly region: string;
  /** What a lesson calls this region. */
  readonly title: string;
  /** Same-origin path the viewer loads. */
  readonly assetPath: string;
  /** Which atlas this region was harvested from. */
  readonly source: AnatomySource;
  /** Every named structure the model can outline, verbatim from its nodes. */
  readonly structures: readonly string[];
  /**
   * Named landmarks the atlas marks but does not give geometry — a surface, a sulcus, a border.
   *
   * Asking for one answers with this region's own view rather than a dead end. They are never
   * highlighted, because there is nothing behind them to light up.
   */
  readonly landmarks: readonly string[];
}

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
