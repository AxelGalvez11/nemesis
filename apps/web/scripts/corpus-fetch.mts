/**
 * Fetch the openly-licensed evaluation corpus.
 *
 * 🔴 THE CORPUS IS PINNED, NOT VENDORED. `scripts/corpus/sources.json` names four public
 * repositories and the exact commit of each. Cloning at a pinned commit gives a byte-identical
 * corpus on any machine without checking a gigabyte of other people's licensed material into this
 * repository — and without this project taking on redistribution obligations it has no need to.
 *
 * 🔴 IT IS NOT THE OWNER'S OWN COURSE FILES, AND THAT IS A LIMITATION TO STATE RATHER THAN HIDE.
 * `docs/document-benchmark.md` measures against 120 real course PDFs that live on the owner's
 * machine and have never been in this repository. This corpus does not replace them; it is the part
 * of the evidence that anyone can reproduce, and it exists so that a routing decision rests on
 * something other than eight fixtures a model generated to have the defects it already knew how to
 * find.
 *
 * Run from apps/web:
 *   npx tsx scripts/corpus-fetch.mts [--dir <path>]
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

interface Source {
  readonly id: string;
  readonly url: string;
  readonly commit: string;
  readonly license: string;
  readonly paths: readonly string[];
  readonly why: string;
}

/** Default outside the repository tree: this material is not ours and must never be committed. */
export const DEFAULT_CORPUS_DIR = "/workspace/nemesis-corpus";

function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(name);
  return at >= 0 ? (process.argv[at + 1] ?? fallback) : fallback;
}

function run(command: string, args: readonly string[], cwd?: string): void {
  execFileSync(command, args, { cwd, stdio: "inherit" });
}

function fetchSource(source: Source, root: string): void {
  const dir = join(root, source.id);
  if (existsSync(join(dir, ".git"))) {
    const head = execFileSync("git", ["-C", dir, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    if (head === source.commit) {
      console.info(`${source.id}: already at ${source.commit.slice(0, 8)}`);
      return;
    }
  }

  mkdirSync(dir, { recursive: true });
  run("git", ["init", "-q"], dir);
  try {
    run("git", ["remote", "add", "origin", source.url], dir);
  } catch {
    run("git", ["remote", "set-url", "origin", source.url], dir);
  }

  // Only the paths that carry documents. `format-corpus` and `docling` are large repositories and
  // most of what they hold is code.
  if (!(source.paths.length === 1 && source.paths[0] === ".")) {
    run("git", ["config", "core.sparseCheckout", "true"], dir);
    run("git", ["sparse-checkout", "set", ...source.paths], dir);
  }

  // 🔴 LFS SMUDGE OFF: the anonymous read lane does not serve LFS objects, and an unprefixed clone
  // ABORTS at the smudge filter rather than degrading. Pointer stubs are fine here — a stub is
  // simply a file the corpus does not contain, which the measurement reports as unreadable.
  const env = { ...process.env, GIT_LFS_SKIP_SMUDGE: "1" };
  execFileSync("git", ["fetch", "--depth", "1", "origin", source.commit], { cwd: dir, env, stdio: "inherit" });
  run("git", ["checkout", "-q", "FETCH_HEAD"], dir);
  console.info(`${source.id}: ${source.commit.slice(0, 8)} (${source.license})`);
}

const root = arg("--dir", DEFAULT_CORPUS_DIR);
mkdirSync(root, { recursive: true });

const manifest = JSON.parse(
  readFileSync(new URL("./corpus/sources.json", import.meta.url), "utf8"),
) as { sources: Source[] };

for (const source of manifest.sources) fetchSource(source, root);

console.info(`\ncorpus at ${root}`);
console.info("licences:");
for (const source of manifest.sources) console.info(`  ${source.id.padEnd(28)} ${source.license}`);
