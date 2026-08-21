/**
 * A contact sheet of the vendored bloub engine, rendered in plain Node.
 *
 * WHY THIS EXISTS BEFORE ANY INTEGRATION. The engine was vendored whole from an
 * upstream Vue project. Before a single line of canvas code depends on it, this
 * proves the claim the vendoring rests on: that `src/bot/*.ts` is self-contained
 * and produces real frames with no Vue, no DOM and no bundler. If `alert`,
 * `orbit`, `burst` and `comet` come out recognisable here, the engine is intact.
 *
 * It mirrors `BloubBot.vue`'s SVG structure exactly — same layer order, same
 * mask, same gradients. A divergence here would be a rendering bug that the app
 * would inherit silently.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { NOTIF_BLUE } from "@nemesis/shared/bloub/decor";
import { BotEngine, type BotFrame } from "@nemesis/shared/bloub/engine";
import { DEMI_VIEWBOX, RAYON } from "@nemesis/shared/bloub/repere";
import { COLORS, SHAPES, SHAPE_BY_ID, mixHex } from "@nemesis/shared/bloub/skins";
import { POSES, SEQUENCE, type StateId } from "@nemesis/shared/bloub/states";

const VB = DEMI_VIEWBOX;
const BOX = `${-VB} ${-VB} ${VB * 2} ${VB * 2}`;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

/** One frame → the same layer stack BloubBot.vue draws, as a string. */
function renderFrame(frame: BotFrame, uid: string, ink: string, paper: string): string {
  const parts: string[] = [];

  const eyes = frame.eyes
    .map((e) => `<path d="${e.d}" transform="${e.matrix}" opacity="${e.alpha}" fill="#000"/>`)
    .join("");
  const notch = frame.notch
    ? `<circle cx="${frame.notch.x}" cy="${frame.notch.y}" r="${frame.notch.r}" fill="#000"/>`
    : "";

  const grads = frame.arcs
    .map(
      (a) =>
        `<linearGradient id="${uid}-${a.id}" gradientUnits="userSpaceOnUse" x1="${a.grad.x1}" y1="${a.grad.y1}" x2="${a.grad.x2}" y2="${a.grad.y2}">` +
        a.grad.stops
          .map(
            (c, i) =>
              `<stop offset="${a.grad.stops.length > 1 ? i / (a.grad.stops.length - 1) : 0}" stop-color="${c}"/>`,
          )
          .join("") +
        `</linearGradient>`,
    )
    .join("");

  parts.push(
    `<defs><mask id="${uid}-m" maskUnits="userSpaceOnUse" x="${-VB}" y="${-VB}" width="${VB * 2}" height="${VB * 2}">` +
      `<path d="${frame.bodyPath}" fill="#fff"/>${eyes}${notch}</mask>${grads}</defs>`,
  );

  const dot = (d: BotFrame["dots"][number]) => {
    const fill = d.color ?? (d.depth === undefined ? ink : mixHex(paper, ink, d.depth));
    return d.d
      ? `<path d="${d.d}" fill="${fill}" opacity="${d.opacity}" transform="translate(${d.x} ${d.y}) rotate(${d.rot ?? 0}) scale(${RAYON})"/>`
      : `<circle cx="${d.x}" cy="${d.y}" r="${d.r}" fill="${fill}" opacity="${d.opacity}"/>`;
  };
  const dots = frame.dots.map(dot).join("");

  // back halves of the orbit rings — drawn before the body, so the body occludes them
  parts.push(
    `<g fill="none" stroke-linecap="round">` +
      frame.arcs
        .map(
          (a) =>
            `<path d="${a.back}" stroke="url(#${uid}-${a.id})" stroke-width="${a.width}" opacity="${a.opacity}"/>`,
        )
        .join("") +
      `</g>`,
  );

  if (frame.dotsBehind) parts.push(`<g>${dots}</g>`);

  parts.push(
    `<g opacity="${frame.bodyAlpha}">` +
      `<path d="${frame.bodyPath}" fill="${paper}"/>` +
      `<g mask="url(#${uid}-m)"><rect x="${-VB}" y="${-VB}" width="${VB * 2}" height="${VB * 2}" fill="${ink}"/></g>` +
      `</g>`,
  );

  if (!frame.dotsBehind) parts.push(`<g>${dots}</g>`);

  if (frame.notif) {
    parts.push(
      `<circle cx="${frame.notif.x}" cy="${frame.notif.y}" r="${frame.notif.r}" fill="${NOTIF_BLUE}"/>`,
    );
  }

  parts.push(
    `<g fill="none" stroke-linecap="round">` +
      frame.arcs
        .map(
          (a) =>
            `<path d="${a.front}" stroke="url(#${uid}-${a.id})" stroke-width="${a.width}" opacity="${a.opacity}"/>`,
        )
        .join("") +
      `</g>`,
  );

  return parts.join("");
}

interface Cell {
  label: string;
  frame: BotFrame;
  uid: string;
  /** Overrides the sheet's ink for this cell alone — the colour sheet needs it. */
  ink?: string;
}

function sheet(cells: Cell[], cols: number, ink: string, paper: string, title: string): string {
  const CELL = 190;
  const LABEL = 26;
  const PAD = 18;
  const rows = Math.ceil(cells.length / cols);
  const w = PAD * 2 + cols * CELL;
  const h = PAD * 2 + 34 + rows * (CELL + LABEL);

  const body = cells
    .map((c, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = PAD + col * CELL;
      const y = PAD + 34 + row * (CELL + LABEL);
      const cellInk = c.ink ?? ink;
      return (
        `<g transform="translate(${x} ${y})">` +
        `<rect width="${CELL - 8}" height="${CELL - 8}" rx="14" fill="${paper}" stroke="${ink}" stroke-opacity="0.09"/>` +
        `<svg x="8" y="8" width="${CELL - 24}" height="${CELL - 24}" viewBox="${BOX}">${renderFrame(c.frame, c.uid, cellInk, paper)}</svg>` +
        `<text x="4" y="${CELL + 8}" font-family="ui-monospace, monospace" font-size="12" fill="${ink}" fill-opacity="0.62">${esc(c.label)}</text>` +
        `</g>`
      );
    })
    .join("");

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<rect width="${w}" height="${h}" fill="${paper}"/>` +
    `<text x="${PAD}" y="${PAD + 18}" font-family="ui-sans-serif, system-ui" font-size="15" fill="${ink}">${esc(title)}</text>` +
    body +
    `</svg>`
  );
}

/** Both themes, stacked into one file, so a single image proves both. */
function themed(build: (ink: string, paper: string, tone: string) => string): string {
  const light = build("#0a0a0c", "#f9f9f9", "light");
  const dark = build("#f2f2f4", "#0b0b0d", "dark");
  const hOf = (s: string) => Number(/height="(\d+)"/.exec(s)![1]);
  const wOf = (s: string) => Number(/width="(\d+)"/.exec(s)![1]);
  const lh = hOf(light);
  const w = Math.max(wOf(light), wOf(dark));
  const h = lh + hOf(dark);
  const strip = (s: string) => s.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<g>${strip(light)}</g><g transform="translate(0 ${lh})">${strip(dark)}</g></svg>`
  );
}

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "tmp");
mkdirSync(out, { recursive: true });

// --- every animation in the catalogue, at the instant each reads best
const states: StateId[] = [...SEQUENCE, "swirl"];
writeFileSync(
  join(out, "bloub-states.svg"),
  themed((ink, paper, tone) =>
    sheet(
      states.map((id) => {
        const engine = new BotEngine(RAYON, id);
        return { label: `${id}  ${POSES[id].toFixed(2)}s`, frame: engine.sample(POSES[id]), uid: `s-${tone}-${id}` };
      }),
      5,
      ink,
      paper,
      `bloub — ${states.length} animations (${tone})`,
    ),
  ),
);

// --- the shapes the customiser offers, on the resting state
writeFileSync(
  join(out, "bloub-shapes.svg"),
  themed((ink, paper, tone) =>
    sheet(
      SHAPES.map((s) => {
        const engine = new BotEngine(RAYON, "idle", s.radii);
        return { label: s.id, frame: engine.sample(1), uid: `sh-${tone}-${s.id}` };
      }),
      4,
      ink,
      paper,
      `bloub — 8 shapes (${tone})`,
    ),
  ),
);

// --- the colours, on the resting state, in the shape most people will keep
writeFileSync(
  join(out, "bloub-colors.svg"),
  themed((ink, paper, tone) =>
    sheet(
      COLORS.map((c) => {
        const engine = new BotEngine(RAYON, "idle", SHAPE_BY_ID.get("cercle")!.radii);
        return { label: c.id, frame: engine.sample(1), uid: `c-${tone}-${c.id}` };
      }).map((cell, i) => ({ ...cell, ink: COLORS[i]!.hex })),
      4,
      ink,
      paper,
      `bloub — 12 colours (${tone})`,
    ),
  ),
);

console.log(`wrote ${out}/bloub-states.svg — ${states.length} animations x 2 themes`);
console.log(`wrote ${out}/bloub-shapes.svg — ${SHAPES.length} shapes x 2 themes`);
console.log(`wrote ${out}/bloub-colors.svg — ${COLORS.length} colours x 2 themes`);
