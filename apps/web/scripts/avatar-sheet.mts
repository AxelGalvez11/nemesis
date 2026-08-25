// Contact sheets for the avatar. Every face, and every animation as a filmstrip.
import { writeFileSync } from "node:fs";
import { ANIMATIONS, AVATARS, DEFAULT_AVATAR, EXPRESSION_IDS, FACES, ROUTINE_IDS, VIEW_SIZE, animationDuration, avatarFrameAt, drawFace } from "@/lib/avatar";
import type { Avatar, AvatarFrame } from "@/lib/avatar";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const label = (id: string) => id.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());

let masks = 0;

function cell(f: AvatarFrame, a: Avatar, x: number, y: number, w: number, h: number): string {
  const k = Math.min(w - 10, h - 10) / VIEW_SIZE;
  const parts: string[] = [];
  if (f.dotsBehind) parts.push(`<path d="${f.dotsBehind}" fill="${a.ink}"/>`);
  if (f.notch) {
    // The same bite the component takes, so the sheet is a picture of what ships rather
    // than of what the engine would draw if nobody masked it.
    const id = `notch${masks++}`;
    parts.push(
      `<mask id="${id}" maskUnits="userSpaceOnUse" x="${-VIEW_SIZE / 2}" y="${-VIEW_SIZE / 2}" width="${VIEW_SIZE}" height="${VIEW_SIZE}"><path d="${f.body}" fill="#fff"/><circle cx="${f.notch.x}" cy="${f.notch.y}" r="${f.notch.r}" fill="#000"/></mask>`,
      `<path d="${f.body}" fill="${a.ink}" mask="url(#${id})"/>`,
    );
  } else {
    parts.push(`<path d="${f.body}" fill="${a.ink}"/>`);
  }
  if (f.leftVisible) parts.push(`<path d="${f.left}" fill="${a.eye}" opacity="${f.eyeAlpha}"/>`);
  if (f.rightVisible) parts.push(`<path d="${f.right}" fill="${a.eye}" opacity="${f.eyeAlpha}"/>`);
  if (f.dots) parts.push(`<path d="${f.dots}" fill="${a.ink}"/>`);
  return `<g transform="translate(${x + w / 2} ${y + h / 2}) scale(${k})">${parts.join("")}</g>`;
}

function facesSheet(a: Avatar, cols = 7, cw = 150, ch = 150): string {
  const rows = Math.ceil(FACES.length / cols);
  const lab = 22, W = cols * cw, H = rows * (ch + lab) + 54;
  const body = [`<text x="18" y="32" font-family="ui-sans-serif,system-ui,sans-serif" font-size="20" font-weight="600" fill="#111">${esc(a.name)} — ${FACES.length} faces</text>`];
  FACES.forEach((face, i) => {
    const x = (i % cols) * cw, y = 54 + Math.floor(i / cols) * (ch + lab);
    body.push(`<rect x="${x + 4}" y="${y + 2}" width="${cw - 8}" height="${ch + lab - 6}" rx="12" fill="#f5f6f8"/>`);
    body.push(cell(drawFace(a.surface, face), a, x, y, cw, ch));
    body.push(`<text x="${x + cw / 2}" y="${y + ch + 8}" text-anchor="middle" font-family="ui-sans-serif,system-ui,sans-serif" font-size="11" fill="#555">${esc(label(face.id))}</text>`);
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#fff"/>${body.join("")}</svg>`;
}

function stripsSheet(a: Avatar, title: string, only: readonly string[] = [], frames = 8, cw = 96, ch = 96): string {
  const list = only.length > 0 ? only.map((id) => ANIMATIONS.find((x) => x.id === id)!) : ANIMATIONS;
  const nameW = 150, W = nameW + frames * cw + 20, H = list.length * (ch + 6) + 54;
  const body = [`<text x="18" y="32" font-family="ui-sans-serif,system-ui,sans-serif" font-size="20" font-weight="600" fill="#111">${esc(a.name)} — ${title}, left to right in time</text>`];
  list.forEach((anim, ai) => {
    const y = 54 + ai * (ch + 6), dur = animationDuration(anim);
    body.push(`<rect x="10" y="${y}" width="${W - 20}" height="${ch}" rx="12" fill="${ai % 2 ? "#f5f6f8" : "#fafbfc"}"/>`);
    body.push(`<text x="24" y="${y + ch / 2 - 2}" font-family="ui-sans-serif,system-ui,sans-serif" font-size="13" font-weight="600" fill="#222">${esc(label(anim.id))}</text>`);
    body.push(`<text x="24" y="${y + ch / 2 + 14}" font-family="ui-sans-serif,system-ui,sans-serif" font-size="11" fill="#777">${(dur / 1000).toFixed(1)}s · ${anim.mode}</text>`);
    for (let i = 0; i < frames; i++) {
      const f = avatarFrameAt(anim.id, (dur * (i + 0.02)) / (frames - 1 + 0.04), a);
      if (f) body.push(cell(f, a, nameW + i * cw, y, cw, ch));
    }
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#fff"/>${body.join("")}</svg>`;
}

function bodiesSheet(cw = 170, ch = 170): string {
  const cols = 5, rows = Math.ceil(AVATARS.length / cols), lab = 22;
  const W = cols * cw, H = rows * (ch + lab) + 54;
  const face = FACES.find((f) => f.id === "smallAttentive") ?? FACES[0]!;
  const body = [`<text x="18" y="32" font-family="ui-sans-serif,system-ui,sans-serif" font-size="20" font-weight="600" fill="#111">${AVATARS.length} bodies, same face on each</text>`];
  AVATARS.forEach((a, i) => {
    const x = (i % cols) * cw, y = 54 + Math.floor(i / cols) * (ch + lab);
    body.push(`<rect x="${x + 4}" y="${y + 2}" width="${cw - 8}" height="${ch + lab - 6}" rx="12" fill="#f5f6f8"/>`);
    body.push(cell(drawFace(a.surface, face), a, x, y, cw, ch));
    body.push(`<text x="${x + cw / 2}" y="${y + ch + 8}" text-anchor="middle" font-family="ui-sans-serif,system-ui,sans-serif" font-size="11" fill="#555">${esc(a.name)} · ${a.surface.type}</text>`);
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#fff"/>${body.join("")}</svg>`;
}

const out = process.argv[2] ?? ".";
writeFileSync(`${out}/avatar-faces.svg`, facesSheet(DEFAULT_AVATAR));
writeFileSync(`${out}/avatar-animations.svg`, stripsSheet(DEFAULT_AVATAR, `${ANIMATIONS.length} animations`));
writeFileSync(`${out}/avatar-routines.svg`, stripsSheet(DEFAULT_AVATAR, "the ten routines", ROUTINE_IDS, 10, 110, 110));
writeFileSync(`${out}/avatar-feelings.svg`, stripsSheet(DEFAULT_AVATAR, "the sixteen feelings", EXPRESSION_IDS, 4, 130, 130));
writeFileSync(`${out}/avatar-bodies.svg`, bodiesSheet());
console.log("wrote 5 sheets, viewBox size", VIEW_SIZE);
