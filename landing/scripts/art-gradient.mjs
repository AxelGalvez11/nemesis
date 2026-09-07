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
/**
 * 🔴 THREE OCTAVES, NOT FIVE, AND THAT IS THE DIFFERENCE BETWEEN "SMOOTH" AND "NO GRAIN".
 *
 * Taking the grain out was only half of what the owner asked for. His reference is one enormous
 * soft shape with a falloff that spans the whole frame — no wisps, no flame edges, nothing at a
 * small scale at all. Five octaves put detail at 1/16th of the frame, which reads as smoke however
 * clean each pixel is, and that is what he was still looking at when he said "i told you to make
 * smooth and slow gradient like this".
 *
 * The top two octaves are where all of that lived. Three octaves at a low base frequency give an
 * undulation measured in half-frames, which is the scale the reference works at.
 */
function fbm(x, y, seed) {
  let v = 0, a = 0.5, px = x, py = y;
  for (let i = 0; i < 3; i++) {
    v += a * noise(px, py, seed);
    px *= 2.02; py *= 2.02; a *= 0.5;
  }
  return v / 0.875;
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
/* The front mass. Deep enough to sit clearly IN FRONT of everything behind it, still orange rather
   than brown, so the lit rim where it meets the ground reads as light and not as a stain. */
const SHADOW = [138, 40, 6];
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
/**
 * One ground: full-bleed colour with a form standing in it.
 *
 * 🔴 STACKED MASSES, NOT A RAMP, AND THAT IS WHERE THE DEPTH COMES FROM. Owner, 2026-09-07, sending
 * two references: *"i want gradients like this, do you see the style? theres like depth"*. Look at
 * what is actually in them: a dark mass clearly in FRONT, a lighter ground behind it, and a lit rim
 * along the edge where the two meet. Light falls AROUND a shape. Every earlier pass here was one
 * field ramping in one direction, and a single ramp can only ever be a wash — smooth, correct, flat.
 *
 * 🔴 AND IT NO LONGER FADES TO WHITE INSIDE THE IMAGE. The references are colour to every edge. The
 * page's own mask decides where the gradient stops and the white page begins (art.css), so an image
 * that also faded out was fading twice — which is exactly the "the landing page seems to blur them"
 * in the same message. One job each: this file makes a surface, the mask places it.
 */
function render(w, h, { seed, base, back, front, violet = 0, grain = 0.018 }) {
  const buf = Buffer.alloc(w * h * 3);
  const ar = w / h;
  // a soft mass: a large ellipse whose edge is pushed about by the field, so it is a form and not
  // a circle. `soft` is how much of its own radius the falloff takes.
  const lobe = (u, v, m, warp) => {
    const du = (u - m.cx * ar) / m.rx, dv = (v - m.cy) / m.ry;
    const d = Math.sqrt(du * du + dv * dv) + warp * m.wob;
    return smoothstep((1 - d) / m.soft);
  };
  for (let j = 0; j < h; j++) {
    const v = (j + 0.5) / h;
    for (let i = 0; i < w; i++) {
      const u = ((i + 0.5) / w) * ar;
      // ONE gentle warp at half a cycle across the frame, so every edge below bends
      const qx = fbm(u * 0.55, v * 0.55, seed), qy = fbm(u * 0.55 + 3.1, v * 0.55 + 3.1, seed);
      const f = fbm(u * 0.55 + 1.35 * qx, v * 0.55 + 1.35 * qy, seed) - 0.5;

      let col = base;
      // the ground behind: broad, lighter, no edge of its own
      col = mix(col, back.col, lobe(u, v, back, f) * back.amt);
      // the form in front, and the light along its shoulder. The rim is drawn from the DIFFERENCE
      // between the mass and a slightly larger copy of itself — which is what an edge lit from
      // behind actually is, and the one detail that makes the whole thing read as depth.
      const mFront = lobe(u, v, front, f);
      const mHalo = lobe(u, v, { ...front, rx: front.rx * 1.05, ry: front.ry * 1.05 }, f);
      col = mix(col, front.rim, Math.max(0, mHalo - mFront) * front.rimAmt);
      col = mix(col, front.col, mFront * front.amt);
      if (violet > 0) col = mix(col, VIOLET, smoothstep((f + 0.24) / 0.4) * violet);

      /**
       * 🔴 THE GRAIN IS BACK, AND SMALLER. "dont do the grainy gradient" was about the last one:
       * coarse, and scaled by brightness so it disappeared in the pale areas and piled up in the
       * dark ones — which reads as dirt. The references carry an even, very fine speckle across
       * the WHOLE frame including the flat parts, at the scale of a print screen. Uniform, ±4 or
       * so, no brightness term. It is what makes these look like a material rather than a fill.
       */
      const g = (hash2(i * 1.7, j * 1.3, seed + 9.1) - 0.5) * grain * 255;
      const k = (j * w + i) * 3;
      buf[k] = Math.max(0, Math.min(255, col[0] + g));
      buf[k + 1] = Math.max(0, Math.min(255, col[1] + g));
      buf[k + 2] = Math.max(0, Math.min(255, col[2] + g));
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
 * Which edge each ground shows is dictated by art.css, not by taste: every one is masked to its own
 * half of the band, so the FORM has to sit on that half or the page shows the empty part of it.
 *   hero            the mask sits right of centre
 *   see-wash        band[data-side="right"] -> right half
 *   evidence-wash   band[data-art="right"]  -> right half
 *   learn           band[data-art="left"]   -> left half
 *   close-wash      no side mask; the form sits low, under the closing line
 */
const mass = (cx, cy, rx, ry, soft, wob) => ({ cx, cy, rx, ry, soft, wob });

/**
 * 🔴 EVERY MASS IS BIGGER THAN THE FRAME AND CENTRED OFF IT. A form small enough to fit is a blob,
 * and a blob is what the first pass produced: a dark disc floating in orange. In the reference the
 * mass has no centre on screen at all — only its EDGE crosses, as one long gentle arc, which is why
 * it reads as something large and close rather than an object in the middle.
 *
 * 🔴 AND ITS EDGE IS DEFINED, NOT DISSOLVED. `soft` is the falloff as a fraction of the mass's own
 * radius: at 0.7 the boundary spans the frame and the mass melts back into a plain ramp. The
 * reference's dark form has a clear soft boundary about a tenth of the frame wide — near 0.18 here.
 * Big shape, short edge.
 *
 * 🔴 THE ARC RUNS VERTICALLY, THROUGH THE MIDDLE, AND THAT IS A LAYOUT FACT NOT A TASTE. `.band-art`
 * is `object-fit: cover` at `scale: 1.28`, and these are square images in a band twice as wide as it
 * is tall. So the page shows a horizontal SLICE through the centre and throws both corners away —
 * which is where the first version put every mass, and why the depth was in the file and not on the
 * screen. Centres sit off the left or right edge at mid-height, so the edge crossing the frame is a
 * near-vertical arc that survives any vertical crop.
 */
writePPM(`${out}/hero.ppm`, render(1200, 686, {
  seed: 3.1, base: EMBER,
  back: { ...mass(-0.35, 0.42, 1.35, 1.5, 0.55, 0.5), col: CREAM, amt: 0.95 },
  front: { ...mass(1.62, 0.60, 1.20, 1.45, 0.17, 0.42), col: SHADOW, amt: 0.9, rim: AMBER, rimAmt: 0.6 },
  violet: 0.14,
}));
writePPM(`${out}/learn.ppm`, render(550, 550, {
  seed: 7.4, base: EMBER,
  back: { ...mass(1.35, 0.5, 1.25, 1.4, 0.6, 0.5), col: CREAM, amt: 0.85 },
  front: { ...mass(-0.58, 0.46, 1.18, 1.4, 0.18, 0.42), col: BURNT, amt: 0.9, rim: AMBER, rimAmt: 0.58 },
}));
writePPM(`${out}/see-wash.ppm`, render(550, 550, {
  seed: 12.9, base: EMBER,
  back: { ...mass(-0.35, 0.5, 1.25, 1.4, 0.6, 0.5), col: CREAM, amt: 0.85 },
  front: { ...mass(1.58, 0.54, 1.18, 1.4, 0.18, 0.42), col: SHADOW, amt: 0.88, rim: AMBER, rimAmt: 0.6 },
}));
writePPM(`${out}/evidence-wash.ppm`, render(550, 550, {
  seed: 21.3, base: EMBER,
  back: { ...mass(-0.35, 0.46, 1.25, 1.4, 0.6, 0.5), col: CREAM, amt: 0.85 },
  front: { ...mass(1.55, 0.44, 1.18, 1.4, 0.18, 0.42), col: BURNT, amt: 0.9, rim: AMBER, rimAmt: 0.55 },
  violet: 0.12,
}));
writePPM(`${out}/close-wash.ppm`, render(1000, 550, {
  seed: 33.8, base: EMBER,
  back: { ...mass(0.25, -0.45, 1.6, 1.35, 0.6, 0.45), col: CREAM, amt: 0.85 },
  front: { ...mass(0.72, 1.72, 1.5, 1.25, 0.18, 0.4), col: SHADOW, amt: 0.88, rim: AMBER, rimAmt: 0.6 },
  violet: 0.12,
}));
writePPM(`${out}/pricing.ppm`, render(550, 550, {
  seed: 41.2, base: EMBER,
  back: { ...mass(-0.35, 0.55, 1.25, 1.4, 0.6, 0.5), col: CREAM, amt: 0.85 },
  front: { ...mass(1.55, 0.48, 1.18, 1.4, 0.18, 0.42), col: BURNT, amt: 0.88, rim: AMBER, rimAmt: 0.5 },
}));

// Encode (from this directory, writing into public/nemesis/art):
//   node scripts/art-gradient.mjs .
//   magick hero.ppm          -resize 2400x1372! -define webp:method=6 -quality 92 ../public/nemesis/art/hero.webp
//   magick learn.ppm         -resize 1100x1100! -define webp:method=6 -quality 92 ../public/nemesis/art/learn.webp
//   magick see-wash.ppm      -resize 1100x1100! -define webp:method=6 -quality 92 ../public/nemesis/art/see-wash.webp
//   magick evidence-wash.ppm -resize 1100x1100! -define webp:method=6 -quality 92 ../public/nemesis/art/evidence-wash.webp
//   magick close-wash.ppm    -resize 2000x1100! -define webp:method=6 -quality 92 ../public/nemesis/art/close-wash.webp
//   magick pricing.ppm       -resize 1100x1100! -define webp:method=6 -quality 92 ../public/nemesis/art/pricing.webp
// then the 40px blurs, and base64 them into components/home/art-blur.ts.
