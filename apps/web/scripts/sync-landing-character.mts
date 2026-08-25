/**
 * Copies the character engine into the marketing site.
 *
 * 🔴 A COPY, AND IT HAS TO BE (see landing/pnpm-workspace.yaml). The site is its own
 * workspace with its own Turbopack root, and Vercel builds `landing/` on its own — it
 * cannot import from `apps/web`, and making it able to would mean deploying the whole
 * application to serve a home page.
 *
 * 🔴 SO THE COPY IS MADE BY A SCRIPT RATHER THAN BY HAND. Two hand-kept copies of an engine
 * diverge the first time someone fixes a bug in one of them, and the symptom is a character
 * that behaves differently on the front page from inside the product — which is precisely
 * what the one-engine rule exists to prevent. Run this after touching `lib/avatar` or the
 * component:
 *
 *   pnpm --filter @pharmaorb/web character:sync
 *
 * Nothing here is edited by hand on the landing side. If a file needs to differ, that is a
 * sign it belongs in the engine as an option rather than as a local change.
 */

import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, "..");
const landing = join(web, "..", "..", "landing");

const NOTE = `// 🔴 COPIED FROM apps/web — DO NOT EDIT HERE. Run \`pnpm --filter @pharmaorb/web character:sync\`.\n`;

const from = join(web, "lib", "avatar");
const to = join(landing, "lib", "avatar");
mkdirSync(to, { recursive: true });

let copied = 0;
const carry = (dir: string, into: string, stamp: boolean) => {
  mkdirSync(into, { recursive: true });
  for (const name of readdirSync(dir)) {
    if (name === "vendor") {
      // 🔴 THE VENDORED TABLES AND THEIR LICENCE, WHICH IS NOT OPTIONAL. MIT permits the copy
      // and requires the notice, and the marketing site is a separate deployment — so the
      // notice has to be in it too, not only in the app it was copied into first.
      carry(join(dir, name), join(into, name), false);
      continue;
    }
    if (name.endsWith(".test.ts")) continue;
    if (!name.endsWith(".ts") && name !== "LICENSE.bloub") continue;
    const body = readFileSync(join(dir, name), "utf8");
    writeFileSync(join(into, name), stamp && name.endsWith(".ts") ? NOTE + body : body);
    copied++;
  }
};
carry(from, to, true);

const component = join(landing, "components", "character", "NemesisAvatar.tsx");
mkdirSync(dirname(component), { recursive: true });
writeFileSync(component, NOTE + readFileSync(join(web, "components", "avatar", "nemesis-avatar.tsx"), "utf8"));

// The accent table too: the character wears the learner's accent, and a site that resolved
// a colour differently from the app would put two different characters side by side in the
// same screenshot.
copyFileSync(join(web, "lib", "accent.ts"), join(landing, "lib", "accent.ts"));

console.log(`synced ${copied} engine files, the component and the accents into landing/`);
