/**
 * The grainy gradient grounds for the landing page.
 *
 * Owner, 2026-09-06: he sent two grainy gradient references and asked for "orangish moving
 * gradients that are 'grainy'", then "redesign the landing page with these new gradients". The rule
 * he gave when asked whether orange was replacing the brand blue:
 *
 *   "nemesis can use any color for gradient, the main thing is to use them appropriately with the
 *    white and black backgrounds."
 *
 * So the hue is free and the GROUND is the constraint. This page is white top to bottom, so every
 * wash here is a white field with saturated colour pushed into one shoulder — the same job the blue
 * washes did, in a new family. A full-bleed orange-on-black ground would look like the reference and
 * make the page it sits under unreadable.
 *
 * 🔴 REPLACES scripts/art-wash.py, AND KEEPS ITS ONE RULE. That file was written for "integrate
 * some smooth gradients (not the grainy ones)" (2026-08-25). The grainy references the owner sent
 * on 2026-09-06 looked like a reversal and were not — asked directly, he said "dont do the grainy
 * gradient, just give me smooth gradient please". What changed is the HUE and the SHAPE: orange
 * rather than blue, and a domain-warped fold rather than composited radial blobs.
 *
 * 🔴 THE SAME MATHS AS THE LAUNCH FILM'S BACKDROP (nemesis-reel/landing.html): a domain-warped fbm
 * mapped through one palette ramp, plus per-pixel grain. Two generators drawing "the Nemesis
 * gradient" two different ways is how a brand stops looking like one thing, and the film and the
 * page it lives on are seen within a second of each other.
 *
 * Plain Node, no dependencies, deterministic from `seed`. Writes binary PPM; encode with the recipe
 * at the foot of this file.
 *
 *   node scripts/art-gradient.mjs <out-dir>
 */
import { writeFileSync } from "node:fs";

// ── value noise, fbm, and the domain warp ────────────────────────────────────
function hash2(x, y, seed) {
  const s = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return s - Math.floor(s);
}
function smoothstep(t) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t * t * (3 - 2 * t);
}
function noise(x, y, seed) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = smoothstep(x - ix), fy = smoothstep(y - iy);
  const a = hash2(ix, iy, seed), b = hash2(ix + 1, iy, seed);
  const c = hash2(ix, iy + 1, seed), d = hash2(ix + 1, iy + 1, seed);
  return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy;
}
function fbm(x, y, seed) {
  let v = 0, a = 0.5, px = x, py = y;
  for (let i = 0; i < 5; i++) {
    v += a * noise(px, py, seed);
    px *= 2.02; py *= 2.02; a *= 0.5;
  }
  return v;
}

// ── the palette: white through amber and ember into a deep ember core ────────
const WHITE = [255, 255, 255];
const CREAM = [255, 240, 224];
const AMBER = [255, 166, 61];
const EMBER = [255, 106, 26];
/**
 * 🔴 BURNT ORANGE AT THE BOTTOM OF THE RAMP, NOT CORAL. #FF4D3D is a red, and every part of these
 * grounds is a mix of the ramp with WHITE — so coral came back as salmon and the whole page read
 * pink rather than orange. The darkest tone has to stay on the orange side of the wheel for the
 * tints above it to.
 */
const BURNT = [226, 80, 10];
const VIOLET = [107, 75, 232];

const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/**
 * One ground.
 *
 * `heat` is how far up the ramp the brightest part of the field reaches: the hero can afford a
 * saturated core because nothing is set on top of it, a band's shoulder cannot.
 * `cx`/`cy` place that core, because the CSS mask only ever shows one edge of these images
 * (art.css pushes an ellipse off-frame), and a core in the middle would be a core nobody sees.
 */
function render(w, h, { seed, heat, ox, oy, dir, span = 1.0, violet = 0 }) {
  const buf = Buffer.alloc(w * h * 3);
  const ar = w / h;
  for (let j = 0; j < h; j++) {
    const v = (j + 0.5) / h;
    for (let i = 0; i < w; i++) {
      const u = ((i + 0.5) / w) * ar;
      // two warp layers, so the colour reads as light moving through silk rather than a ramp
      const qx = fbm(u * 1.35, v * 1.35, seed), qy = fbm(u * 1.35 + 3.1, v * 1.35 + 3.1, seed);
      const rx = fbm(u * 1.35 + 2.1 * qx + 1.7, v * 1.35 + 2.1 * qy + 1.7, seed);
      const ry = fbm(u * 1.35 + 2.1 * qx + 8.3, v * 1.35 + 2.1 * qy + 8.3, seed);
      const f = fbm(u * 1.35 + 2.3 * rx, v * 1.35 + 2.3 * ry, seed);
      /**
       * 🔴 `dir` POINTS FROM COLD TO HOT, AND GETTING THAT BACKWARDS COST A ROUND. The first two
       * cuts measured distance from a point: one produced a fireball with a dark bruise in it, the
       * next produced a sweep whose hot side landed on the OPPOSITE edge to the one the CSS shows.
       * art.css masks each ground to an ellipse pushed off-frame (`at 104%` / `at -4%`), so exactly
       * one edge of every image is ever on screen. Colour anywhere else is colour nobody sees, and
       * the page came out pale.
       */
      const along = (u - ox * ar) * dir[0] + (v - oy) * dir[1] + (f - 0.5) * 0.9;
      /**
       * 🔴 THE GAMMA LIFT IS NOT A TWEAK, IT IS THE MASK'S DOING. Every ground is multiplied by a
       * soft radial mask before anyone sees it, and a mask takes the SHOULDER of the ramp, never
       * the core — so a linear ramp that looked saturated as a flat image arrived on the page as
       * pale peach. Raising t to a power below 1 spends the range on the shoulder, which is the
       * only part that survives.
       */
      const raw = Math.max(0, Math.min(1, smoothstep((along + 0.55) / span) * heat));
      const t = Math.pow(raw, 0.55);
      let col = WHITE;
      /**
       * 🔴 THE RAMP REACHES REAL COLOUR EARLY, BECAUSE THE MASK ONLY EVER SHOWS ITS FOOT. Two
       * passes came back reading pink rather than orange, and neither was the palette's fault: a
       * ramp that spends its first third going white -> cream is a ramp whose visible part is a
       * tint of white, and a warm tint of white is peach. Amber by t = 0.28 is what puts actual
       * orange in the part of the image the page renders.
       */
      col = mix(col, CREAM, smoothstep(t / 0.06));
      col = mix(col, AMBER, smoothstep((t - 0.02) / 0.14));
      col = mix(col, EMBER, smoothstep((t - 0.16) / 0.22));
      // 🔴 CORAL IS AS DARK AS IT GOES. The deep ember that used to sit under it collapsed into a
      // near-black core that read as a hole punched in the page.
      col = mix(col, BURNT, smoothstep((t - 0.46) / 0.32) * 0.9);
      if (violet > 0) {
        // one cool edge, so the warmth has something to be warm against
        col = mix(col, VIOLET, smoothstep((along - 0.45) / 0.5) * violet);
      }
      /**
       * 🔴 NO GRAIN. Owner, 2026-09-06: "dont do the grainy gradient, just give me smooth gradient
       * please". This is the second time the answer has been smooth — `scripts/art-wash.py` carried
       * "integrate some smooth gradients (not the grainy ones)" from 2026-08-25, and the grainy
       * references he sent this morning looked like a reversal. They were not: he wanted the shape
       * and the colour of them, not the noise.
       *
       * The fold and the flow still come from the domain-warped fbm above, which is what keeps this
       * from being a two-stop CSS ramp. Nothing is added per pixel.
       */
      const k = (j * w + i) * 3;
      buf[k] = Math.max(0, Math.min(255, col[0]));
      buf[k + 1] = Math.max(0, Math.min(255, col[1]));
      buf[k + 2] = Math.max(0, Math.min(255, col[2]));
    }
  }
  return { buf, w, h };
}

function writePPM(path, { buf, w, h }) {
  writeFileSync(path, Buffer.concat([Buffer.from(`P6\n${w} ${h}\n255\n`), buf]));
  console.log("wrote", path, `${w}x${h}`);
}

const out = process.argv[2] ?? ".";
// The hero is the only one seen whole and with nothing set over it, so it gets the most heat and
// the violet edge from the reference. The rest are shoulders under a white page.
/**
 * Which edge each ground is hot on is dictated by art.css, not by taste:
 *   hero            the ellipse sits at 68% across, so the heat goes right and a little up
 *   see-wash        band[data-side="right"]  -> mask at 104% -> hot right
 *   evidence-wash   band[data-art="right"]   -> mask at 104% -> hot right
 *   learn           band[data-art="left"]    -> mask at  -4% -> hot left
 *   close-wash      no ellipse, object-position center bottom -> hot along the bottom
 */
writePPM(`${out}/hero.ppm`, render(1200, 686, { seed: 3.1, heat: 1.0, ox: 0.34, oy: 0.56, dir: [1.0, -0.38], span: 1.05, violet: 0.28 }));
writePPM(`${out}/learn.ppm`, render(550, 550, { seed: 7.4, heat: 1.0, ox: 0.66, oy: 0.5, dir: [-1.0, -0.22], span: 1.0 }));
writePPM(`${out}/see-wash.ppm`, render(550, 550, { seed: 12.9, heat: 1.05, ox: 0.34, oy: 0.5, dir: [1.0, -0.24], span: 1.0 }));
writePPM(`${out}/evidence-wash.ppm`, render(550, 550, { seed: 21.3, heat: 1.05, ox: 0.34, oy: 0.5, dir: [1.0, 0.26], span: 1.0, violet: 0.2 }));
writePPM(`${out}/close-wash.ppm`, render(1000, 550, { seed: 33.8, heat: 1.0, ox: 0.5, oy: 0.32, dir: [0.18, 1.0], span: 1.0, violet: 0.22 }));
writePPM(`${out}/pricing.ppm`, render(550, 550, { seed: 41.2, heat: 0.92, ox: 0.36, oy: 0.56, dir: [1.0, -0.42], span: 1.0 }));

// Encode (from this directory, writing into public/nemesis/art):
//   node scripts/art-gradient.mjs .
//   magick hero.ppm          -resize 2400x1372! -define webp:method=6 -quality 92 ../public/nemesis/art/hero.webp
//   magick learn.ppm         -resize 1100x1100! -define webp:method=6 -quality 92 ../public/nemesis/art/learn.webp
//   magick see-wash.ppm      -resize 1100x1100! -define webp:method=6 -quality 92 ../public/nemesis/art/see-wash.webp
//   magick evidence-wash.ppm -resize 1100x1100! -define webp:method=6 -quality 92 ../public/nemesis/art/evidence-wash.webp
//   magick close-wash.ppm    -resize 2000x1100! -define webp:method=6 -quality 92 ../public/nemesis/art/close-wash.webp
//   magick pricing.ppm       -resize 1100x1100! -define webp:method=6 -quality 92 ../public/nemesis/art/pricing.webp
// then the 40px blurs, and base64 them into components/home/art-blur.ts.
