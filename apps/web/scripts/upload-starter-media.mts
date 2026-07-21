// One-time ops helper: upload a starter deck's media folder to the public
// starter-deck-media bucket with correct image content types (the supabase
// CLI uploads everything as octet-stream, which the bucket's image-only
// allowlist rejects). Reads the service key from the environment — never
// hardcode or print it.
//
// Usage:
//   SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/upload-starter-media.mts \
//     --dir /path/to/captain-hook --prefix captain-hook --ref qyjmivntajbigjswhahb

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

function arg(name: string): string {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0 || index + 1 >= process.argv.length) throw new Error(`Missing --${name}`);
  return process.argv[index + 1];
}

const dir = arg("dir");
const prefix = arg("prefix");
const ref = arg("ref");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!key) throw new Error("Set SUPABASE_SERVICE_ROLE_KEY in the environment.");

const TYPES: Record<string, string> = {
  ".avif": "image/avif",
  ".bmp": "image/bmp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

const files = readdirSync(dir).filter((name) => TYPES[name.slice(name.lastIndexOf(".")).toLowerCase()]);
console.log(`Uploading ${files.length} files from ${dir}`);

let done = 0;
let failed = 0;
const failures: string[] = [];

async function upload(name: string): Promise<void> {
  const type = TYPES[name.slice(name.lastIndexOf(".")).toLowerCase()];
  const body = readFileSync(join(dir, name));
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(`https://${ref}.supabase.co/storage/v1/object/starter-deck-media/${prefix}/${name}`, {
      body: new Uint8Array(body),
      headers: { Authorization: `Bearer ${key}`, "Content-Type": type, "x-upsert": "true" },
      method: "POST",
    });
    if (response.ok) {
      done += 1;
      if (done % 250 === 0) console.log(`  ${done}/${files.length}`);
      return;
    }
    if (attempt === 2) {
      failed += 1;
      failures.push(`${name}: ${response.status} ${(await response.text()).slice(0, 120)}`);
    } else {
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
}

const CONCURRENCY = 12;
const queue = [...files];
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    for (let name = queue.shift(); name; name = queue.shift()) await upload(name);
  }),
);

console.log(`Done: ${done} uploaded, ${failed} failed`);
for (const failure of failures.slice(0, 10)) console.log(`  ${failure}`);
if (failed > 0) process.exit(1);
