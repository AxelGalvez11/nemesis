// The faces Nemesis wears, drawn the way the component draws them.
//
// 🔴 THE SAME CALLS, IN THE SAME ORDER, SO THIS IS A CHECK AND NOT AN ILLUSTRATION. The
// component turns `drawFace` and `eyeFrames` into DOM; this turns them into a file. If the
// spectacles sit wrong here they sit wrong on screen, and a 40px character in the corner of
// a workspace is the worst possible place to notice it.
//
//   pnpm --filter @pharmaorb/web character:faces <dir>

import { writeFileSync } from "node:fs";

import { DEFAULT_AVATAR, FACE_BY_ID, drawFace, eyeFrames, VIEW_SIZE } from "@/lib/avatar";
import {
  SIGMA_EYE,
  SMIRK,
  SPECS,
  capsulePath,
  inFace,
  raisedBrow,
  ringPath,
  type FeatureFace,
} from "@/lib/avatar/features";

const INK = "#3b5bdb";
const PAPER = "#f9f9f9";

/**
 * 🔴 A COUNTER, NOT A NAME BUILT FROM THE POSE. The first version keyed the mask on the
 * face and the turn — and stripped the punctuation to make it a legal id, which took the
 * minus sign off, so `y: -26` and `y: 26` became the same id. SVG takes the first
 * definition, so two cells silently shared one mask and half the sheet showed the wrong
 * eyes on the right glasses. It looked exactly like an engine bug and it was not.
 */
let masks = 0;

function character(faceId: FeatureFace | null, turn: { x: number; y: number }): string {
  const face = FACE_BY_ID.get("neutral")!;
  const opts = { turn };
  const f = drawFace(DEFAULT_AVATAR.surface, face, opts);
  const eyes = eyeFrames(DEFAULT_AVATAR.surface, face, opts);
  const m = (i: number) => {
    const e = eyes[i]!;
    return `matrix(${e.a.toFixed(4)},${e.b.toFixed(4)},${e.c.toFixed(4)},${e.d.toFixed(4)},${e.x.toFixed(2)},${e.y.toFixed(2)})`;
  };

  const holes = [f.left, f.right].map((d) => `<path d="${d}" fill="#000"/>`);
  const sigma = faceId === "sigma";
  if (sigma) {
    const brow = raisedBrow();
    holes.push(
      `<path d="${capsulePath(inFace(brow.w), inFace(brow.h))}" transform="${m(SIGMA_EYE)} translate(0,${inFace(brow.dy).toFixed(2)})" fill="#000"/>`,
      `<path d="${capsulePath(inFace(SMIRK.w), inFace(SMIRK.h))}" transform="${m(SIGMA_EYE)} translate(${inFace(SMIRK.dx).toFixed(2)},${inFace(SMIRK.dy).toFixed(2)}) rotate(${SMIRK.rot})" fill="#000"/>`,
    );
  }

  const specs: string[] = [];
  if (faceId === "reading") {
    for (let i = 0; i < 2; i += 1) {
      specs.push(
        `<path d="${ringPath(inFace(SPECS.r), inFace(SPECS.ring))}" fill-rule="evenodd" transform="${m(i)} translate(0,${inFace(SPECS.dy).toFixed(2)})"/>`,
        `<path d="${capsulePath(inFace(SPECS.arm.len), inFace(SPECS.ring))}" transform="${m(i)} translate(${inFace((i === 0 ? -1 : 1) * (SPECS.r + SPECS.arm.len / 2 + 0.02)).toFixed(2)},${inFace(SPECS.dy + SPECS.arm.dy).toFixed(2)})"/>`,
      );
    }
    specs.push(
      `<path d="${capsulePath(inFace(SPECS.bridge.w), inFace(SPECS.ring))}" transform="${m(0)} translate(${inFace(SPECS.bridge.dx).toFixed(2)},${inFace(SPECS.bridge.dy).toFixed(2)})"/>`,
    );
  }

  const id = `mask${masks++}`;
  const half = VIEW_SIZE / 2;
  return (
    `<defs><mask id="${id}" maskUnits="userSpaceOnUse" x="${-half}" y="${-half}" width="${VIEW_SIZE}" height="${VIEW_SIZE}">` +
    `<path d="${f.body}" fill="#fff"/>${holes.join("")}</mask></defs>` +
    `<path d="${f.body}" fill="${PAPER}"/>` +
    `<g mask="url(#${id})"><rect x="${-half}" y="${-half}" width="${VIEW_SIZE}" height="${VIEW_SIZE}" fill="${INK}"/></g>` +
    `<g fill="${PAPER}" stroke="${INK}" stroke-width="${inFace(SPECS.stroke)}" stroke-linejoin="round">${specs.join("")}</g>`
  );
}

const TURNS = [
  { x: 0, y: -26 },
  { x: 0, y: 0 },
  { x: 0, y: 26 },
  { x: -15, y: 14 },
];
const ROWS: (FeatureFace | null)[] = [null, "reading", "sigma"];

const cw = 300;
const body: string[] = [];
ROWS.forEach((faceId, r) => {
  const y = 40 + r * cw;
  body.push(
    `<text x="14" y="${y + cw / 2}" font-size="15" font-family="ui-sans-serif,system-ui,sans-serif" fill="#111">${faceId ?? "plain"}</text>`,
  );
  TURNS.forEach((turn, i) => {
    const k = (cw - 24) / VIEW_SIZE;
    body.push(
      `<g transform="translate(${120 + i * cw + cw / 2} ${y + cw / 2}) scale(${k})">${character(faceId, turn)}</g>`,
    );
  });
});

const W = 120 + TURNS.length * cw;
const H = 40 + ROWS.length * cw;
const out = process.argv[2] ?? ".";
writeFileSync(
  `${out}/character-faces.svg`,
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#fff"/><text x="14" y="26" font-size="17" font-weight="600" font-family="ui-sans-serif,system-ui,sans-serif" fill="#111">Nemesis's own faces, at four head turns</text>${body.join("")}</svg>`,
);
console.log("wrote character-faces.svg");
