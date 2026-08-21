// Renders the whole mascot vocabulary to one SVG contact sheet, in both themes.
//
// WHY THIS CAN EXIST AT ALL: `sample(t)` is a pure function of time with no DOM in it,
// so the same engine the browser runs can be asked for a frame here, in Node, with no
// browser anywhere. That is the practical payoff of the purity rule — a sheet that is
// the real thing rather than a mock-up of it, checkable into a diff and comparable
// between iterations.
//
//   pnpm --filter @nemesis/web mascot:board
//
// Writes tmp/mascot-board.svg relative to the repo's apps/web.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import {
  EXPRESSIONS,
  EXPRESSION_ORDER,
  SATELLITES,
  UNIT_BLOB,
  UNIT_ROUND,
  VIEW,
  sampleState,
  type ExpressionId,
  type MascotMode,
} from "../lib/mascot/index.ts";
import { STATES, STATE_ORDER, stillTime } from "../lib/mascot/states.ts";

const COLS = 5;
const CELL = 150;
const LABEL = 26;
const THEMES = [
  { name: "light", page: "#fafafa", ink: "#0b0b0d", eye: "#fbfbfb", text: "#5a5e68" },
  { name: "dark", page: "#000000", ink: "#f2f2f4", eye: "#0a0a0c", text: "#9a9a9a" },
] as const;

function cell(
  mode: MascotMode,
  theme: (typeof THEMES)[number],
  expression?: ExpressionId,
  size = CELL,
): string {
  const f = sampleState(mode, stillTime(mode), { clock: 0, expression });
  const uid = `${theme.name}-${mode}-${expression ?? "default"}`;
  const place = `translate(${f.body.cx} ${f.body.cy}) rotate(${f.body.tilt})`;
  const sats = f.satellites
    .slice(0, SATELLITES)
    .map(
      (s) =>
        `<path d="${UNIT_BLOB}" fill="${theme.ink}" opacity="${s.alpha.toFixed(3)}" transform="translate(${s.cx.toFixed(2)} ${s.cy.toFixed(2)}) rotate(${s.tilt.toFixed(2)}) scale(${s.rx.toFixed(2)} ${s.ry.toFixed(2)})"/>`,
    )
    .join("");
  const eyes = f.eyes
    .map(
      (e) =>
        `<path d="${UNIT_BLOB}" fill="${theme.eye}" transform="translate(${e.cx.toFixed(2)} ${e.cy.toFixed(2)}) rotate(${e.tilt.toFixed(2)}) scale(${e.rx.toFixed(2)} ${e.ry.toFixed(2)})"/>`,
    )
    .join("");
  const lids = f.eyes
    .map(
      (e) =>
        `<path d="${UNIT_ROUND}" fill="${theme.ink}" transform="translate(${e.cx.toFixed(2)} ${e.cy.toFixed(2)}) rotate(${e.tilt.toFixed(2)}) translate(0 ${e.lidCy.toFixed(2)}) scale(${e.lidRx.toFixed(2)} ${e.lidRy.toFixed(2)})"/>`,
    )
    .join("");
  // Mirrors nemesis-mascot.tsx exactly, including the clip living on an UNTRANSFORMED
  // group inside the body's frame — so what this sheet shows is what the browser draws,
  // not a second implementation that can drift from it.
  return `<svg x="0" y="0" width="${size}" height="${size}" viewBox="${VIEW.box}">
  <defs><clipPath id="c-${uid}"><path d="${f.body.d}"/></clipPath></defs>
  ${sats}
  <g transform="${place}">
    <path d="${f.body.d}" fill="${theme.ink}" opacity="${(f.glow * 0.24).toFixed(3)}" transform="scale(${(1 + 0.17 * f.glow).toFixed(3)})"/>
    <path d="${f.body.d}" fill="${theme.ink}"/>
    <g clip-path="url(#c-${uid})">${eyes}${lids}</g>
  </g>
</svg>`;
}

function sheet(theme: (typeof THEMES)[number], originX: number): string {
  const rows = Math.ceil(STATE_ORDER.length / COLS);
  const w = COLS * CELL;
  const h = rows * (CELL + LABEL);
  const cells = STATE_ORDER.map((mode, i) => {
    const x = (i % COLS) * CELL;
    const y = Math.floor(i / COLS) * (CELL + LABEL);
    return `<g transform="translate(${x} ${y})">
      ${cell(mode, theme)}
      <text x="${CELL / 2}" y="${CELL + 15}" fill="${theme.text}" font-family="ui-sans-serif, system-ui, sans-serif" font-size="11" text-anchor="middle">${STATES[mode].label}</text>
    </g>`;
  }).join("");
  return `<g transform="translate(${originX} 0)">
    <rect x="0" y="0" width="${w}" height="${h}" fill="${theme.page}"/>
    ${cells}
  </g>`;
}

const rows = Math.ceil(STATE_ORDER.length / COLS);
const sheetW = COLS * CELL;
const sheetH = rows * (CELL + LABEL);
const out = `<svg xmlns="http://www.w3.org/2000/svg" width="${sheetW * 2}" height="${sheetH}" viewBox="0 0 ${sheetW * 2} ${sheetH}">
${THEMES.map((t, i) => sheet(t, i * sheetW)).join("\n")}
</svg>`;

const dest = resolve(import.meta.dirname, "../tmp/mascot-board.svg");
mkdirSync(dirname(dest), { recursive: true });
writeFileSync(dest, out);
console.log(`wrote ${dest} — ${STATE_ORDER.length} states x ${THEMES.length} themes`);

// ── A second sheet: every expression, on one state ──────────────────────────────
//
// The state board answers "are these different things"; this answers the other half,
// "does the face have a range". Held on `teaching`, the state the character spends most
// of its life in and the one whose face people will actually read.

const FACE_CELL = 190;
const FACE_HELD: MascotMode = "teaching";

function faceSheet(theme: (typeof THEMES)[number], originY: number): string {
  const w = EXPRESSION_ORDER.length * FACE_CELL;
  const cells = EXPRESSION_ORDER.map((id, i) => `<g transform="translate(${i * FACE_CELL} 0)">
      ${cell(FACE_HELD, theme, id, FACE_CELL)}
      <text x="${FACE_CELL / 2}" y="${FACE_CELL + 16}" fill="${theme.text}" font-family="ui-sans-serif, system-ui, sans-serif" font-size="12" text-anchor="middle">${EXPRESSIONS[id].label}</text>
    </g>`).join("");
  return `<g transform="translate(0 ${originY})">
    <rect x="0" y="0" width="${w}" height="${FACE_CELL + LABEL}" fill="${theme.page}"/>
    ${cells}
  </g>`;
}

const faceW = EXPRESSION_ORDER.length * FACE_CELL;
const faceH = FACE_CELL + LABEL;
const faces = `<svg xmlns="http://www.w3.org/2000/svg" width="${faceW}" height="${faceH * 2}" viewBox="0 0 ${faceW} ${faceH * 2}">
${THEMES.map((t, i) => faceSheet(t, i * faceH)).join("\n")}
</svg>`;

const faceDest = resolve(import.meta.dirname, "../tmp/mascot-faces.svg");
writeFileSync(faceDest, faces);
console.log(`wrote ${faceDest} — ${EXPRESSION_ORDER.length} expressions x ${THEMES.length} themes`);
