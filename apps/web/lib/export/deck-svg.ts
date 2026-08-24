// A Scene, drawn as SVG.
//
// 🔴 THIS IS THE REVIEW SURFACE, AND IT IS NOT A LOOKALIKE. It renders the same Scene objects
// deck-pptx.ts writes into the real file (deck-scene.ts explains why that matters). Text metrics
// are estimated rather than measured — a browser and PowerPoint do not agree to the pixel
// anyway — so line breaks can differ by a word. Everything structural (composition, colour,
// proportion, type scale) is exact.
//
// Used by the theme picker's live previews and by the dev-preview board.

import { deckArtPng } from "./deck-art";
import { SLIDE_H, SLIDE_W, type Box, type Scene, type SceneBullets, type SceneShape, type SceneText } from "./deck-scene";

/** Rough average glyph width as a fraction of the type size. Enough to wrap a preview. */
function emWidth(font: string, bold: boolean): number {
  const wide = /verdana|tahoma|consolas|courier/i.test(font);
  const serif = /georgia|cambria|constantia|times/i.test(font);
  const base = wide ? 0.6 : serif ? 0.5 : 0.51;
  return bold ? base * 1.045 : base;
}

/** Greedy wrap, in characters that fit the box at this type size. */
function wrap(text: string, widthIn: number, sizePt: number, font: string, bold = false): string[] {
  const perChar = (sizePt / 72) * emWidth(font, bold);
  const max = Math.max(4, Math.floor(widthIn / perChar));
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (next.length <= max) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    line = word;
  }
  if (line) lines.push(line);
  return lines;
}

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Font stacks so a preview on a machine without Office still reads as serif vs sans. */
function stack(font: string): string {
  if (/georgia|cambria|constantia|times/i.test(font)) return `${font}, Georgia, 'Times New Roman', serif`;
  if (/consolas|courier/i.test(font)) return `${font}, 'Courier New', monospace`;
  return `${font}, Helvetica, Arial, sans-serif`;
}

const opacity = (alpha?: number): string => (alpha ? ` opacity="${(100 - alpha) / 100}"` : "");

function shapeSvg(item: SceneShape, k: number): string {
  const { box: b } = item;
  const x = b.x * k;
  const y = b.y * k;
  const w = b.w * k;
  const h = b.h * k;
  const fill = item.fill ? `#${item.fill}` : "none";
  const stroke = item.line ? ` stroke="#${item.line.color}" stroke-width="${item.line.width * k}"` : "";
  const spin = item.rotate ? ` transform="rotate(${item.rotate} ${x + w / 2} ${y + h / 2})"` : "";
  const common = `fill="${fill}"${stroke}${opacity(item.alpha)}${spin}`;
  switch (item.shape) {
    case "line":
      return `<line stroke="#${item.line?.color ?? item.fill ?? "000000"}" stroke-width="${(item.line?.width ?? 0.01) * k}" x1="${x}" x2="${x + w}" y1="${y}" y2="${y + h}"${opacity(item.alpha)}/>`;
    case "ellipse":
      return `<ellipse cx="${x + w / 2}" cy="${y + h / 2}" rx="${w / 2}" ry="${h / 2}" ${common}/>`;
    case "donut": {
      const r = Math.min(w, h) / 2;
      const ring = r * 0.16;
      return `<circle cx="${x + w / 2}" cy="${y + h / 2}" fill="none" r="${r - ring / 2}" stroke="#${item.fill ?? "000000"}" stroke-width="${ring}"${opacity(item.alpha)}/>`;
    }
    case "blockArc": {
      const r = Math.min(w, h);
      return `<path d="M ${x} ${y + h} A ${r} ${r} 0 0 1 ${x + w} ${y + h} L ${x + w} ${y + h} Z" ${common}/>`;
    }
    case "triangle":
      return `<polygon points="${x + w / 2},${y} ${x + w},${y + h} ${x},${y + h}" ${common}/>`;
    case "rtTriangle":
      return `<polygon points="${x},${y} ${x + w},${y + h} ${x},${y + h}" ${common}/>`;
    case "chevron":
      return `<polygon points="${x},${y} ${x + w * 0.72},${y} ${x + w},${y + h / 2} ${x + w * 0.72},${y + h} ${x},${y + h} ${x + w * 0.28},${y + h / 2}" ${common}/>`;
    case "roundRect":
      return `<rect height="${h}" rx="${(item.radius ?? 0.12) * Math.min(w, h)}" width="${w}" x="${x}" y="${y}" ${common}/>`;
    default:
      return `<rect height="${h}" width="${w}" x="${x}" y="${y}" ${common}/>`;
  }
}

function textSvg(item: SceneText, k: number): string {
  const size = item.size;
  const lineH = (size / 72) * (item.lineSpacing ?? 1.18);
  const content = item.caps ? item.text.toUpperCase() : item.text;
  const lines = wrap(content, item.box.w, size, item.font, item.bold);
  const blockH = lines.length * lineH;
  const top =
    item.valign === "middle"
      ? item.box.y + (item.box.h - blockH) / 2
      : item.valign === "bottom"
        ? item.box.y + item.box.h - blockH
        : item.box.y;
  const anchor = item.align === "center" ? "middle" : item.align === "right" ? "end" : "start";
  const ax = item.align === "center" ? item.box.x + item.box.w / 2 : item.align === "right" ? item.box.x + item.box.w : item.box.x;
  return lines
    .map((line, i) => {
      // Baseline sits about 78% down the em box; close enough that a preview lines up.
      const baseline = (top + i * lineH + (size / 72) * 0.78) * k;
      return `<text fill="#${item.color}" font-family="${stack(item.font)}" font-size="${(size / 72) * k}" font-style="${item.italic ? "italic" : "normal"}" font-weight="${item.bold ? "bold" : "normal"}" letter-spacing="${((item.spacing ?? 0) / 72) * k}" text-anchor="${anchor}" x="${ax * k}" y="${baseline}">${esc(line)}</text>`;
    })
    .join("");
}

function bulletsSvg(item: SceneBullets, k: number): string {
  const lineH = (item.size / 72) * (item.lineSpacing ?? 1.24);
  const gap = ((item.gap ?? 8) / 72);
  const markW = item.bullet === "none" ? 0 : (item.size / 72) * 0.9;
  let y = item.box.y;
  const out: string[] = [];
  for (const raw of item.items) {
    const lines = wrap(raw, item.box.w - markW, item.size, item.font);
    lines.forEach((line, i) => {
      const baseline = (y + i * lineH + (item.size / 72) * 0.78) * k;
      if (i === 0 && item.bullet !== "none") {
        const mark = item.bullet === "dot" ? "•" : "–";
        out.push(
          `<text fill="#${item.color}" font-family="${stack(item.font)}" font-size="${(item.size / 72) * k}" x="${item.box.x * k}" y="${baseline}">${mark}</text>`,
        );
      }
      out.push(
        `<text fill="#${item.color}" font-family="${stack(item.font)}" font-size="${(item.size / 72) * k}" x="${(item.box.x + markW) * k}" y="${baseline}">${esc(line)}</text>`,
      );
    });
    y += lines.length * lineH + gap;
  }
  return out.join("");
}

/**
 * The rectangle a text or bullet block will ACTUALLY occupy, as opposed to the box it was
 * given — layout boxes are deliberately generous, so only a measured extent can answer "is
 * anything sitting on top of anything". Exported for the composition tests.
 */
export function measureText(item: SceneText | SceneBullets): Box {
  if (item.kind === "text") {
    const lineH = (item.size / 72) * (item.lineSpacing ?? 1.18);
    const content = item.caps ? item.text.toUpperCase() : item.text;
    const lines = wrap(content, item.box.w, item.size, item.font, item.bold);
    const h = Math.max(lines.length * lineH, lineH);
    const widest = Math.max(...lines.map((l) => l.length), 1) * (item.size / 72) * emWidth(item.font, item.bold ?? false);
    const w = Math.min(item.box.w, widest);
    const y =
      item.valign === "middle"
        ? item.box.y + (item.box.h - h) / 2
        : item.valign === "bottom"
          ? item.box.y + item.box.h - h
          : item.box.y;
    const x =
      item.align === "center"
        ? item.box.x + (item.box.w - w) / 2
        : item.align === "right"
          ? item.box.x + item.box.w - w
          : item.box.x;
    return { h, w, x, y };
  }
  const lineH = (item.size / 72) * (item.lineSpacing ?? 1.24);
  const gap = (item.gap ?? 8) / 72;
  let h = 0;
  for (const raw of item.items) {
    h += wrap(raw, item.box.w, item.size, item.font).length * lineH + gap;
  }
  return { h: Math.max(0, h - gap), w: item.box.w, x: item.box.x, y: item.box.y };
}

/** Draw the scene at `width` pixels wide (the slide's aspect is fixed). */
export async function sceneToSvg(scene: Scene, width = 800): Promise<string> {
  const k = width / SLIDE_W;
  const height = SLIDE_H * k;
  const art = scene.background.image ?? (scene.background.art ? await deckArtPng(scene.background.art) : null);
  const body = scene.items
    .map((item) => {
      switch (item.kind) {
        case "shape":
          return shapeSvg(item, k);
        case "text":
          return textSvg(item, k);
        case "bullets":
          return bulletsSvg(item, k);
        default:
          // 🔴 A PICTURE FILLS ITS BOX, IT DOES NOT FIT INSIDE IT. Default SVG behaviour letterboxes,
          // so a 16:9 photograph in a tall column drew as a thin band floating in the middle of it.
          // "slice" is the vector spelling of CSS `object-fit: cover`, which is what the HTML
          // backend already does and what a .pptx does with sizing.type "cover".
          return `<image height="${item.box.h * k}" href="${item.data}" preserveAspectRatio="xMidYMid slice" width="${item.box.w * k}" x="${item.box.x * k}" y="${item.box.y * k}"/>`;
      }
    })
    .join("");
  // Everything is clipped to the slide, because PowerPoint clips too: a circle that bleeds off
  // the corner is a design decision there, and an unclipped preview would lie about it.
  const id = `slide${Math.round(width)}`;
  const washId = `${id}wash`;
  const wash = scene.overlay
    ? `<defs><linearGradient id="${washId}" x1="0" x2="0" y1="0" y2="1"><stop offset="${scene.overlay.start}" stop-color="#${scene.overlay.color}" stop-opacity="0"/><stop offset="1" stop-color="#${scene.overlay.color}" stop-opacity="${scene.overlay.strength}"/></linearGradient></defs><rect fill="url(#${washId})" height="${height}" width="${width}"/>`
    : "";
  return `<svg height="${height}" viewBox="0 0 ${width} ${height}" width="${width}" xmlns="http://www.w3.org/2000/svg"><defs><clipPath id="${id}"><rect height="${height}" width="${width}"/></clipPath></defs><g clip-path="url(#${id})"><rect fill="#${scene.background.color}" height="${height}" width="${width}"/>${
    art ? `<image height="${height}" href="${art}" preserveAspectRatio="none" width="${width}" x="0" y="0"/>` : ""
  }${wash}${body}</g></svg>`;
}

/** The same picture as a data URI, for an <img> in the picker. */
export async function sceneToDataUri(scene: Scene, width = 800): Promise<string> {
  const svg = await sceneToSvg(scene, width);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Convenience for callers that want the slide's proportions. */
export const SLIDE_ASPECT = SLIDE_W / SLIDE_H;

export type { Box };
