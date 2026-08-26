// Regenerates lib/avatar/{faces,animations,avatars}.ts from the reference's exported
// document.
//
//   npx tsx scripts/avatar-import.mts <path-to-defaultStudioDocument.json>
//
// 🔴 THE REFERENCE'S CODE IS AGPL-3.0 AND IS NOT VENDORED HERE. `lib/avatar` is written
// from a reading of how their renderer works, not copied from it — the arithmetic of
// quaternions, perspective projection and convex hulls is not anyone's property, and the
// expression of it here is ours. What this script imports is the DATA: the 27 faces, the
// 23 sequences and the 10 bodies, as plain numbers.
//
// 🔴 IT TAKES A PATH RATHER THAN CARRYING A COPY, so running it requires deliberately
// pointing at a checkout. That keeps the provenance visible instead of letting someone
// else's document quietly become part of this repo's build.

import { readFileSync, writeFileSync } from "node:fs";

const source = process.argv[2];
if (!source) {
  console.error("Usage: npx tsx scripts/avatar-import.mts <path-to-defaultStudioDocument.json>");
  process.exit(1);
}
const doc = JSON.parse(readFileSync(source, "utf8"));
const OUT = "lib/avatar";

const r2 = (v) => Math.round(v * 100) / 100;
const key = (s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
const byId = new Map(doc.expressions.map((e) => [e.id, e]));

const faces = doc.expressions.map((e) => ({
  id: key(e.semanticKey),
  head: [r2(e.headX), r2(e.headY), r2(e.headZ)],
  spacing: r2(e.spacing),
  left: [r2(e.widthLeft), r2(e.heightLeft), r2(e.positionXLeft), r2(e.positionYLeft), r2(e.leftAngle)],
  right: [r2(e.widthRight), r2(e.heightRight), r2(e.positionXRight), r2(e.positionYRight), r2(e.rightAngle)],
  eyes: e.eyeMotion,
  body: e.bodyMotion,
}));

const facesSrc = `// The faces, in the reference's own units. Generated — see scripts/avatar-import.mts.
//
// 🔴 THESE ARE RAW NUMBERS ON A 120-RADIUS FACE, NOT MULTIPLIERS. The first attempt at
// this converted them into the flat mascot engine's fractions-of-a-radius and lost a
// factor of two on the eye separation on the way — \`spacing\` is the FULL gap between the
// two eyes, and each eye sits at plus or minus half of it. Keeping the reference's own
// units means there is no conversion left to get wrong.

import type { Face } from "./types";

const face = (
  id: string,
  head: readonly [number, number, number],
  spacing: number,
  left: readonly [number, number, number, number, number],
  right: readonly [number, number, number, number, number],
  eyes: Face["eyeMotion"],
  body: Face["bodyMotion"],
): Face => ({
  id,
  head: { x: head[0], y: head[1], z: head[2] },
  spacing,
  left: { width: left[0], height: left[1], x: left[2], y: left[3], angle: left[4] },
  right: { width: right[0], height: right[1], x: right[2], y: right[3], angle: right[4] },
  eyeMotion: eyes,
  bodyMotion: body,
});

export const FACES: readonly Face[] = [
${faces.map((f) => `  face(${JSON.stringify(f.id)}, [${f.head}], ${f.spacing}, [${f.left}], [${f.right}], ${JSON.stringify(f.eyes)}, ${JSON.stringify(f.body)}),`).join("\n")}
];

export const FACE_BY_ID: ReadonlyMap<string, Face> = new Map(FACES.map((f) => [f.id, f]));
`;

const EASE = { smooth: "smooth", snappy: "snappy", bouncy: "bouncy" };
const anims = doc.sequences.map((s) => ({
  // 🔴 PREFIXED, BECAUSE THESE ARE NOT THE PRODUCT'S FEELINGS. Seventeen of the twenty-three
  // are named for a feeling — `happy`, `sad`, `angry` — and the owner's verdict on 2026-08-25
  // was that they do not look like it: they were measured off a video and labelled after the
  // fact, so `angryRight` has the tops of its eyes diverging, which is the geometry of
  // sadness. `lib/avatar/expressions.ts` holds the sixteen that do keep their promise, and
  // it is those that own the plain words. What these are is gaze patterns; that is what they
  // are now called.
  id: `gaze-${key(s.semanticKey)}`,
  mode: s.playbackMode === "pingPong" ? "pingPong" : s.playbackMode === "once" ? "once" : "loop",
  steps: s.steps.map((st) => ({
    face: key(byId.get(st.expressionId).semanticKey),
    transitionMs: st.transitionMs,
    holdMs: st.holdMs,
    ease: EASE[st.transition] ?? "smooth",
  })),
  blink: s.blink?.enabled
    ? { firstMs: s.blink.initialDelayMs, minGapMs: s.blink.minIntervalMs, maxGapMs: s.blink.maxIntervalMs, durationMs: s.blink.durationMs }
    : null,
}));

const animSrc = `// The animations. Generated — see scripts/avatar-import.mts.
//
// A step is a MORPH followed by a HOLD: \`transitionMs\` easing from whatever was on screen
// into this face, then \`holdMs\` sitting on it. The list then loops.

import type { Animation } from "./types";

export const ANIMATIONS: readonly Animation[] = [
${anims
  .map(
    (a) => `  {
    id: ${JSON.stringify(a.id)},
    mode: ${JSON.stringify(a.mode)},
    steps: [
${a.steps.map((st) => `      { face: ${JSON.stringify(st.face)}, transitionMs: ${st.transitionMs}, holdMs: ${st.holdMs}, ease: ${JSON.stringify(st.ease)} },`).join("\n")}
    ],
    blink: ${a.blink ? `{ firstMs: ${a.blink.firstMs}, minGapMs: ${a.blink.minGapMs}, maxGapMs: ${a.blink.maxGapMs}, durationMs: ${a.blink.durationMs} }` : "null"},
  },`,
  )
  .join("\n")}
];

export const ANIMATION_BY_ID: ReadonlyMap<string, Animation> = new Map(ANIMATIONS.map((a) => [a.id, a]));
`;

const EXTRA = ["morphRoundness", "tipRoundness", "baseRoundness"] as const;
const bodies = doc.library.avatars.map((a: Record<string, never>) => {
  const p = (a as { body: { primary: Record<string, number | string> } }).body.primary;
  const extra = EXTRA.filter((k) => p[k] !== undefined)
    .map((k) => `, ${k}: ${r2(p[k] as number)}`)
    .join("");
  const colors = (a as unknown as { colors: { body: string; eyes: string } }).colors;
  const id = (a as unknown as { id: string }).id;
  const name = (a as unknown as { name: string }).name;
  return `  { id: ${JSON.stringify(id)}, name: ${JSON.stringify(name)}, surface: { type: ${JSON.stringify(p.type)}, width: ${r2(p.width as number)}, height: ${r2(p.height as number)}, depth: ${r2(p.depth as number)}, roundness: ${r2(p.roundness as number)}${extra} }, ink: ${JSON.stringify(colors.body)}, eye: ${JSON.stringify(colors.eyes)} },`;
});

const bodiesSrc = `// The bodies. Generated — see scripts/avatar-import.mts.
//
// A body is a SOLID, described by its three half-extents and how square it is. The face is
// laid on whichever one is chosen, so the same 27 faces and 23 animations work on all of
// them — that is the whole point of keeping the two apart.

import type { Avatar } from "./types";

export const AVATARS: readonly Avatar[] = [
${bodies.join("\n")}
];

export const AVATAR_BY_ID: ReadonlyMap<string, Avatar> = new Map(AVATARS.map((a) => [a.id, a]));

/** The one the reference opens on, and the one every animation was authored against. */
export const DEFAULT_AVATAR = AVATARS[0]!;
`;

writeFileSync(`${OUT}/faces.ts`, facesSrc);
writeFileSync(`${OUT}/animations.ts`, animSrc);
writeFileSync(`${OUT}/avatars.ts`, bodiesSrc);
console.log(`${faces.length} faces, ${anims.length} animations, ${bodies.length} bodies`);
