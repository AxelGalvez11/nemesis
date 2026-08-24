// A Scene, rendered as HTML.
//
// 🔴 THE THIRD BACKEND, AND THE ONE THE LEARNER ACTUALLY LOOKS AT. Owner 2026-08-24: *"instead
// of doing directly PowerPoint or slides, can it do HTML based since that might be a bit better
// for agents?"* — yes, and it is better for people too: the deck becomes a page that can be
// viewed, presented and printed to PDF with no download and no server, and the preview stops
// being an approximation of the file because it IS the deck. The .pptx stays, as an export, for
// the student whose professor wants an editable file.
//
// Nothing here decides anything: deck-compose.ts already did. This file only knows how to write
// a Scene as elements. Same contract as deck-pptx.ts and deck-svg.ts.
//
// 🔴 THE COORDINATE SYSTEM IS THE PRINTED PAGE. A slide is 13.33in x 7.5in, drawn at exactly
// 96 CSS pixels per inch — 1280 x 720 — so `@page { size: 13.33in 7.5in }` prints it at true
// size with no scaling, and the on-screen view is the same box under a CSS transform. One
// geometry for screen, print and PDF.

import { deckArtPng } from "./deck-art";
import { SLIDE_H, SLIDE_W, type Scene, type SceneBullets, type SceneImage, type SceneShape, type SceneText } from "./deck-scene";

/** CSS pixels per inch. The web's own definition, and what makes print come out true size. */
export const PX_PER_IN = 96;
export const SLIDE_PX_W = SLIDE_W * PX_PER_IN;
export const SLIDE_PX_H = SLIDE_H * PX_PER_IN;

const px = (inches: number): string => `${(inches * PX_PER_IN).toFixed(2)}px`;
/** Points to CSS pixels: type is specified in points everywhere else in the deck code. */
const pt = (points: number): string => `${((points / 72) * PX_PER_IN).toFixed(2)}px`;

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Fallbacks so a machine without Office still renders serif as serif. */
function stack(font: string): string {
  if (/georgia|cambria|constantia|times/i.test(font)) return `'${font}', Georgia, 'Times New Roman', serif`;
  if (/consolas|courier/i.test(font)) return `'${font}', 'Courier New', ui-monospace, monospace`;
  return `'${font}', Helvetica, Arial, sans-serif`;
}

const place = (b: { x: number; y: number; w: number; h: number }): string =>
  `left:${px(b.x)};top:${px(b.y)};width:${px(b.w)};height:${px(b.h)}`;

function shapeHtml(item: SceneShape): string {
  const { box: b } = item;
  const opacity = item.alpha ? `;opacity:${(100 - item.alpha) / 100}` : "";
  const spin = item.rotate ? `;transform:rotate(${item.rotate}deg)` : "";
  const fill = item.fill ? `;background:#${item.fill}` : "";
  const stroke = item.line ? `;border:${px(item.line.width)} solid #${item.line.color}` : "";

  switch (item.shape) {
    case "line": {
      // Lines can be diagonal, so they are drawn rather than faked with a border.
      const w = Math.max(Math.abs(b.w), 0.01);
      const h = Math.max(Math.abs(b.h), 0.01);
      const colour = item.line?.color ?? item.fill ?? "000000";
      const width = item.line?.width ?? 0.01;
      return `<svg class="dk-i" style="${place({ h, w, x: b.x, y: b.y - (b.h === 0 ? width / 2 : 0) })};overflow:visible${opacity}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><line x1="0" y1="0" x2="${w}" y2="${h}" stroke="#${colour}" stroke-width="${width}" vector-effect="non-scaling-stroke" style="stroke-width:${px(width)}"/></svg>`;
    }
    case "ellipse":
      return `<div class="dk-i" style="${place(b)}${fill}${stroke};border-radius:50%${opacity}${spin}"></div>`;
    case "donut": {
      const ring = Math.min(b.w, b.h) * 0.08;
      return `<div class="dk-i" style="${place(b)};border:${px(ring)} solid #${item.fill ?? "000"};border-radius:50%${opacity}${spin}"></div>`;
    }
    case "triangle":
      return `<div class="dk-i" style="${place(b)}${fill}${opacity}${spin};clip-path:polygon(50% 0,100% 100%,0 100%)"></div>`;
    case "rtTriangle":
      return `<div class="dk-i" style="${place(b)}${fill}${opacity}${spin};clip-path:polygon(0 0,100% 100%,0 100%)"></div>`;
    case "chevron":
      return `<div class="dk-i" style="${place(b)}${fill}${opacity}${spin};clip-path:polygon(0 0,72% 0,100% 50%,72% 100%,0 100%,28% 50%)"></div>`;
    case "blockArc":
      return `<div class="dk-i" style="${place(b)}${fill}${opacity}${spin};border-radius:${px(b.w)} ${px(b.w)} 0 0"></div>`;
    case "roundRect":
      return `<div class="dk-i" style="${place(b)}${fill}${stroke};border-radius:${px((item.radius ?? 0.12) * Math.min(b.w, b.h))}${opacity}${spin}"></div>`;
    default:
      return `<div class="dk-i" style="${place(b)}${fill}${stroke}${opacity}${spin}"></div>`;
  }
}

function textHtml(item: SceneText): string {
  const justify = item.valign === "middle" ? "center" : item.valign === "bottom" ? "flex-end" : "flex-start";
  const style = [
    place(item.box),
    `font-family:${stack(item.font)}`,
    `font-size:${pt(item.size)}`,
    `color:#${item.color}`,
    `line-height:${item.lineSpacing ?? 1.16}`,
    `text-align:${item.align ?? "left"}`,
    `justify-content:${justify}`,
    item.bold ? "font-weight:700" : "font-weight:400",
    item.italic ? "font-style:italic" : "",
    item.caps ? "text-transform:uppercase" : "",
    item.spacing ? `letter-spacing:${pt(item.spacing)}` : "",
  ]
    .filter(Boolean)
    .join(";");
  return `<div class="dk-i dk-t" style="${style}"><span>${esc(item.text)}</span></div>`;
}

function bulletsHtml(item: SceneBullets): string {
  if (!item.items.length) return "";
  const mark = item.bullet === "dot" ? "•" : item.bullet === "none" ? "" : "–";
  const style = [
    place(item.box),
    `font-family:${stack(item.font)}`,
    `font-size:${pt(item.size)}`,
    `color:#${item.color}`,
    `line-height:${item.lineSpacing ?? 1.24}`,
    `gap:${pt(item.gap ?? 8)}`,
  ].join(";");
  const rows = item.items
    .map(
      (line) =>
        `<li>${mark ? `<span class="dk-m" aria-hidden="true">${mark}</span>` : ""}<span>${esc(line)}</span></li>`,
    )
    .join("");
  return `<ul class="dk-i dk-b" style="${style}">${rows}</ul>`;
}

const imageHtml = (item: SceneImage): string =>
  `<img alt="" class="dk-i" src="${item.data}" style="${place(item.box)};object-fit:cover"/>`;

/** One slide, as a self-contained element sized in the printed page's own units. */
export async function sceneToHtml(scene: Scene, index: number): Promise<string> {
  const art = scene.background.art ? await deckArtPng(scene.background.art) : null;
  const background = art
    ? `background-color:#${scene.background.color};background-image:url(${art});background-size:100% 100%`
    : `background:#${scene.background.color}`;
  const body = scene.items
    .map((item) => {
      switch (item.kind) {
        case "shape":
          return shapeHtml(item);
        case "text":
          return textHtml(item);
        case "bullets":
          return bulletsHtml(item);
        default:
          return imageHtml(item);
      }
    })
    .join("");
  return `<section aria-label="Slide ${index}" class="dk-s" data-slide="${index}" style="${background}">${body}</section>`;
}

/** Every slide of a plan, in order. */
export async function scenesToHtml(scenes: Scene[]): Promise<string[]> {
  const out: string[] = [];
  for (const [i, scene] of scenes.entries()) out.push(await sceneToHtml(scene, i + 1));
  return out;
}

/**
 * The stylesheet the slides need. Deliberately tiny and scoped to `.dk-*`, and it carries the
 * print rules: a slide is exactly one page at true size, so "Save as PDF" in any browser
 * produces the deck with no server, no headless Chrome, and no export pipeline.
 */
export const DECK_CSS = `
.dk-s{position:relative;width:${SLIDE_PX_W}px;height:${SLIDE_PX_H}px;overflow:hidden;box-sizing:border-box}
.dk-s *{box-sizing:border-box;margin:0}
.dk-i{position:absolute}
.dk-t{display:flex;flex-direction:column;white-space:pre-wrap;overflow-wrap:break-word}
.dk-b{display:flex;flex-direction:column;list-style:none;padding:0}
.dk-b li{display:flex;align-items:flex-start}
.dk-b .dk-m{flex:0 0 auto;width:1.1em;opacity:.9}
.dk-print-only{display:none}
@media print{
  .dk-print-only{display:block!important}
  @page{size:${SLIDE_W}in ${SLIDE_H}in;margin:0}
  html,body{margin:0;padding:0;background:#fff}
  .dk-s{break-after:page;page-break-after:always;box-shadow:none!important;border-radius:0!important}
  .dk-s:last-child{break-after:auto;page-break-after:auto}
  .dk-print-hide{display:none!important}
}
`;
