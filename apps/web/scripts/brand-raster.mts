/**
 * The Nemesis mark, for the few places that cannot take an SVG.
 *
 * 🔴 SVG IS THE DEFAULT AND THE PRODUCT USES NOTHING ELSE (owner 2026-08-20: "use svg"). In the
 * app the mark is DRAWN — `components/nemesis-mark.tsx`, `app/icon.svg`, `app/apple-icon.tsx` —
 * so it scales, follows `currentColor`, and cannot go stale. This script exists only for
 * third-party uploads that reject SVG outright; Stripe's Checkout and customer-portal branding
 * accepts PNG or JPG and nothing else, which is the case that forced it.
 *
 * 🔴 GENERATED FROM THE GEOMETRY, NEVER EXPORTED BY HAND. A PNG of a logo is a second copy of
 * the mark, and the first person to nudge a bead leaves it stale — which is exactly how this app
 * ended up serving the previous logo from three places long after the mark had changed. The
 * ellipses below are the SAME numbers as app/icon.svg and app/apple-icon.tsx. Re-run this when
 * the mark moves; do not open the output in an image editor.
 *
 *   pnpm brand:raster
 *
 * Rasters exist for the places that cannot take an SVG: iOS home screens, Android/PWA manifests,
 * Open Graph cards, and third-party dashboards that accept an upload — Stripe's Checkout and
 * customer-portal branding being the one that prompted this.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

/** Identical to app/icon.svg. Three beads on one diagonal, tilted -36°. */
const VIEW = { x: -66, y: -10, w: 232, h: 232 } as const;
const BEADS = [40, 106, 172] as const;
const BEAD = { cx: 50, rx: 62, ry: 20, tilt: -36 } as const;

const markSvg = (fill: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}">` +
  `<g fill="${fill}">` +
  BEADS.map(
    (cy) =>
      `<ellipse cx="${BEAD.cx}" cy="${cy}" rx="${BEAD.rx}" ry="${BEAD.ry}" transform="rotate(${BEAD.tilt} ${BEAD.cx} ${cy})"/>`,
  ).join("") +
  `</g></svg>`;



const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "public", "nemesis");
mkdirSync(out, { recursive: true });

const written: string[] = [];

async function emit(name: string, fill: string, px: number, background?: string) {
  let pipeline = sharp(Buffer.from(markSvg(fill)), { density: 384 }).resize(px, px, {
    fit: "contain",
    // Transparent by default: the mark has to sit on a dark portal and a light card alike, and
    // a baked-in white plate is what forces a second file to exist for the other case.
    background: background ?? { r: 0, g: 0, b: 0, alpha: 0 },
  });
  if (background) pipeline = pipeline.flatten({ background });
  const buffer = await pipeline.png({ compressionLevel: 9 }).toBuffer();
  writeFileSync(join(out, name), buffer);
  written.push(`${name} — ${buffer.length.toLocaleString()} bytes`);
}

// 🔴 THE TWO HISTORICAL NAMES ARE REGENERATED, NOT LEFT BEHIND. Anything still linking
// /nemesis/logo.png — a bookmark, an email template, a third party — gets the CURRENT mark
// rather than the retired one. Keeping the filename and changing the contents is the only way
// to fix a link you do not control.
await emit("logo.png", "#0a0a0c", 512);
await emit("logo-white.png", "#ffffff", 512);

// Stripe's branding upload wants an opaque square: it composites the icon on its own surfaces
// and a transparent PNG picks up whatever is behind it.
await emit("stripe-branding-512.png", "#0a0a0c", 512, "#ffffff");

console.log(`wrote ${written.length} files to public/nemesis/`);
for (const line of written) console.log(`  ${line}`);
