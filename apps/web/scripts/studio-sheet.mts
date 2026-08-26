// Contact sheets for the character studio, rendered headlessly.
//
//   npx tsx scripts/studio-sheet.mts <out-dir>
//
// 🔴 THE WHOLE SET AT ONCE, WHICH THE STUDIO ITSELF CANNOT SHOW. The stage draws one face
// at a time and the filmstrip draws thumbnails at 18px; both are right for authoring and
// neither answers "does this character look like the reference". Two bugs survived every
// test in `lib/mascot` and were obvious the first time all 27 faces sat on one page: a
// body that drew 14% wider than tall, and a triangle pointing down. See `ROUND_STRETCH`
// and the orientation guard in `geometry.test.ts`.
//
// It draws through the studio's own `frame.ts` — the same path the stage uses — so a
// sheet is evidence about the character rather than about a second renderer. This file
// only serialises: it mirrors `NemesisMascot.paint`, and if that gains an element this
// needs the same one.

import { writeFileSync } from "node:fs";

import { UNIT_BLOB, VIEW, capsuleEyePath } from "@/lib/mascot/geometry";
import type { MascotFrame } from "@/lib/mascot/types";
import { animationDuration, newDoc, type StudioCharacter } from "@/lib/studio/document";
import { animationFrame, expressionFrame } from "@/lib/studio/frame";

const n = (v: number): string => (Math.round(v * 100) / 100).toString();

/** One frame as an SVG group, in mark space. Mirrors `NemesisMascot.paint`. */
function frameGroup(f: MascotFrame, ink: string, eyeInk: string, capsule: boolean, uid: string): string {
  const out: string[] = [];
  out.push(`<clipPath id="${uid}"><path d="${f.body.d}"/></clipPath>`);
  const parts: string[] = [];
  for (const s of f.satellites) {
    if (s.alpha <= 0.001) continue;
    parts.push(
      `<path d="${UNIT_BLOB}" fill="${ink}" opacity="${n(s.alpha)}" transform="translate(${n(s.cx)} ${n(s.cy)}) rotate(${n(s.tilt)}) scale(${n(s.rx)} ${n(s.ry)})"/>`,
    );
  }
  const inner: string[] = [];
  if (f.glow > 0.001) {
    inner.push(
      `<path d="${f.body.d}" fill="${ink}" opacity="${n(f.glow * 0.24)}" transform="scale(${n(1 + 0.17 * f.glow)})"/>`,
    );
  }
  inner.push(`<path d="${f.body.d}" fill="${ink}"/>`);
  const eyes = f.eyes.map((e) => {
    const seat = `translate(${n(e.cx)} ${n(e.cy)}) rotate(${n(e.tilt)})`;
    return capsule
      ? `<path d="${capsuleEyePath(e.rx, e.ry)}" fill="${eyeInk}" transform="${seat}"/>`
      : `<path d="${UNIT_BLOB}" fill="${eyeInk}" transform="${seat} scale(${n(e.rx)} ${n(e.ry)})"/>`;
  });
  inner.push(`<g clip-path="url(#${uid})">${eyes.join("")}</g>`);
  parts.push(`<g transform="translate(${n(f.body.cx)} ${n(f.body.cy)}) rotate(${n(f.body.tilt)})">${inner.join("")}</g>`);
  out.push(`<g opacity="${n(f.bodyAlpha * f.body.alpha)}">${parts.join("")}</g>`);
  return out.join("");
}

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** A frame placed in a cell of `cw` x `ch`, scaled to fit with a margin. */
function cell(f: MascotFrame, c: StudioCharacter, x: number, y: number, cw: number, ch: number, uid: string): string {
  const pad = 6;
  const k = Math.min((cw - pad * 2) / VIEW.w, (ch - pad * 2) / VIEW.h);
  const ox = x + (cw - VIEW.w * k) / 2 - VIEW.x * k;
  const oy = y + (ch - VIEW.h * k) / 2 - VIEW.y * k;
  return `<g transform="translate(${n(ox)} ${n(oy)}) scale(${n(k)})">${frameGroup(f, c.ink, c.eye, c.eyeShape === "capsule", uid)}</g>`;
}

const doc = newDoc();
const named = (name: string): StudioCharacter => {
  const c = doc.characters.find((x) => x.name === name);
  if (!c) throw new Error(`no character called ${name}`);
  return c;
};

// ── Sheet one: every face ───────────────────────────────────────────────────────

function facesSheet(c: StudioCharacter, cols: number, cw = 150, ch = 150): string {
  const rows = Math.ceil(c.expressions.length / cols);
  const label = 22;
  const W = cols * cw;
  const H = rows * (ch + label) + 54;
  const body: string[] = [];
  body.push(
    `<text x="18" y="32" font-family="ui-sans-serif,system-ui,sans-serif" font-size="20" font-weight="600" fill="#111">${esc(c.name)} — ${c.expressions.length} faces</text>`,
  );
  c.expressions.forEach((e, i) => {
    const x = (i % cols) * cw;
    const y = 54 + Math.floor(i / cols) * (ch + label);
    const f = expressionFrame(c, e, 0.9, { reduced: true });
    body.push(`<rect x="${x + 4}" y="${y + 2}" width="${cw - 8}" height="${ch + label - 6}" rx="12" fill="#f5f6f8"/>`);
    body.push(cell(f, c, x, y, cw, ch, `f${i}`));
    body.push(
      `<text x="${x + cw / 2}" y="${y + ch + 8}" text-anchor="middle" font-family="ui-sans-serif,system-ui,sans-serif" font-size="11" fill="#555">${esc(e.name)}</text>`,
    );
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#fff"/>${body.join("")}</svg>`;
}

// ── Sheet two: every sequence, as a filmstrip ───────────────────────────────────

function stripsSheet(c: StudioCharacter, frames = 8, cw = 96, ch = 96): string {
  const nameW = 150;
  const W = nameW + frames * cw + 20;
  const H = c.animations.length * (ch + 6) + 54;
  const body: string[] = [];
  body.push(
    `<text x="18" y="32" font-family="ui-sans-serif,system-ui,sans-serif" font-size="20" font-weight="600" fill="#111">${esc(c.name)} — ${c.animations.length} animations, left to right in time</text>`,
  );
  c.animations.forEach((a, ai) => {
    const y = 54 + ai * (ch + 6);
    const dur = animationDuration(a);
    body.push(`<rect x="10" y="${y}" width="${W - 20}" height="${ch}" rx="12" fill="${ai % 2 ? "#f5f6f8" : "#fafbfc"}"/>`);
    body.push(
      `<text x="24" y="${y + ch / 2 - 2}" font-family="ui-sans-serif,system-ui,sans-serif" font-size="13" font-weight="600" fill="#222">${esc(a.name)}</text>`,
    );
    body.push(
      `<text x="24" y="${y + ch / 2 + 14}" font-family="ui-sans-serif,system-ui,sans-serif" font-size="11" fill="#777">${dur.toFixed(2)}s · ${a.playback}</text>`,
    );
    for (let i = 0; i < frames; i++) {
      // Sampled just inside each end, so the first and last cells are the animation's own
      // start and finish rather than a loop seam.
      const t = (dur * (i + 0.02)) / (frames - 1 + 0.04);
      const played = animationFrame(c, a.id, t, { reduced: true });
      if (!played) continue;
      body.push(cell(played.frame, c, nameW + i * cw, y, cw, ch, `s${ai}_${i}`));
    }
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#fff"/>${body.join("")}</svg>`;
}

const out = process.argv[2] ?? ".";
const bs = named("Bible Strong reference");
const bl = named("Bloub reference");
const us = named("Nemesis");

writeFileSync(`${out}/bible-strong-faces.svg`, facesSheet(bs, 7));
writeFileSync(`${out}/bible-strong-animations.svg`, stripsSheet(bs));
writeFileSync(`${out}/bloub-states.svg`, facesSheet(bl, 5, 170, 170));
writeFileSync(`${out}/bloub-animations.svg`, stripsSheet(bl));
writeFileSync(`${out}/nemesis-faces.svg`, facesSheet(us, 5, 170, 170));
console.log("wrote 5 sheets to", out);
