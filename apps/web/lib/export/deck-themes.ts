// The twenty looks a deck can wear.
//
// 🔴 THE BORDER HOLDS. deck-plan.ts still says the model writes CONTENT and never design; this
// file is the other half of that bargain — every visual decision for every deck lives here, in
// twenty complete, hand-set looks. The learner picks one. The model never sees this file.
//
// A theme is a palette, a font pairing, a motif, and three ART RECIPES (cover, section break,
// closing). The art is painted at build time by deck-art.ts, so a new colourway costs a dozen
// numbers rather than three baked images.
//
// 🔴 FONT RULE. Only fonts that exist on a stock Windows/macOS machine or ship with Microsoft
// Office, because nothing is embedded — a .pptx that substitutes fonts stops being the design
// we shipped. `SAFE_FONTS` is the whole permitted pool and a test holds every theme to it.
//
// 🔴 CONTRAST RULE. Title and body colours are chosen against their own background, never
// borrowed from a neighbouring theme. Dark art carries light text; light art carries ink.

import type { DeckArt } from "./deck-art";
import { EXPORT_FONTS } from "./theme";

export const SAFE_FONTS = [
  "Arial",
  "Calibri",
  "Cambria",
  "Candara",
  "Consolas",
  "Constantia",
  "Corbel",
  "Courier New",
  "Georgia",
  "Tahoma",
  "Times New Roman",
  "Trebuchet MS",
  "Verdana",
] as const;

export interface DeckTheme {
  /** Stable id — stored with the learner's choice, so never rename one. */
  id: string;
  /** What the picker calls it. */
  name: string;
  /** One plain line under the name in the picker. */
  blurb: string;
  fonts: { display: string; body: string };
  /** Hex without '#', as pptxgenjs wants it. */
  accent: string;
  /** The workhorse slides: bullets, two-column, stat, quote, references. */
  body: { bg: string; title: string; text: string; muted: string; dark: boolean };
  cover: { art: DeckArt; title: string; subtitle: string };
  section: { art: DeckArt; title: string; dark: boolean };
  closing: { art: DeckArt; title: string; text: string };
  /** The quiet recurring mark beside body titles. */
  motif: "tick" | "bar" | "dot" | "none";
}

// ── Art recipes, composed rather than repeated ───────────────────────────────────────────────

/** A light source off one shoulder — the house cover. */
const bloom = (base: string, glow: string, cx = 0.76, cy = 0.27, strength = 0.55, r = 0.66): DeckArt => ({
  base,
  glows: [{ color: glow, cx, cy, r, strength }],
  grain: 0.45,
  vignette: 0.34,
});

/** Light rising from below the bottom edge — used for closings, which read as an ending. */
const dusk = (base: string, glow: string, strength = 0.5): DeckArt => ({
  base,
  glows: [{ color: glow, cx: 0.5, cy: 1.08, r: 0.8, strength }],
  grain: 0.4,
  vignette: 0.42,
});

/** Two colours meeting across the slide — the busiest composition, for the boldest themes. */
const twin = (base: string, a: string, b: string, r = 0.56, strength = 0.55): DeckArt => ({
  base,
  glows: [
    { color: a, cx: 0.15, cy: 0.19, r, strength },
    { color: b, cx: 0.89, cy: 0.87, r: r * 1.04, strength: strength * 0.92 },
  ],
  grain: 0.45,
  vignette: 0.36,
});

/** A quiet tinted paper with the light in one corner — the house section break. */
const wash = (base: string, to: string, angle = 118, glow = "ffffff", strength = 0.6): DeckArt => ({
  base,
  glows: [{ color: glow, cx: 0.21, cy: 0.17, r: 0.6, strength }],
  grain: 0.28,
  ramp: { angle, to },
});

/** A straight ramp, nothing else — the most restrained art in the set. */
const ramp = (base: string, to: string, angle: number, grain = 0.35): DeckArt => ({ base, grain, ramp: { angle, to } });

/** The house look, and the fallback whenever a stored id no longer exists. */
const HOUSE: DeckTheme = {
  accent: "cc1f33",
  blurb: "The house look: crimson light on near-black, printed on warm paper.",
  body: { bg: "f9f8f7", dark: false, muted: "6b6773", text: "43404a", title: "17151a" },
  closing: { art: dusk("17151a", "cc1f33", 0.45), text: "9a94a3", title: "f5f2f2" },
  cover: { art: bloom("120f16", "cc1f33"), subtitle: "9a94a3", title: "f5f2f2" },
  fonts: { body: EXPORT_FONTS.sans, display: EXPORT_FONTS.serif },
  id: "nemesis",
  motif: "tick",
  name: "Nemesis",
  section: { art: wash("f4efee", "e7dad9"), dark: false, title: "17151a" },
};

export const DECK_THEMES: readonly DeckTheme[] = [
  HOUSE,
  {
    accent: "2f5fd0",
    blurb: "Deep navy night, ice-blue light, crisp white pages.",
    body: { bg: "f7f9fc", dark: false, muted: "6b7488", text: "3c4457", title: "111a2b" },
    closing: { art: dusk("0b1526", "3f7fe0", 0.42), text: "9fb0c9", title: "f2f6fb" },
    cover: { art: bloom("0b1526", "3f7fe0"), subtitle: "9fb0c9", title: "f2f6fb" },
    fonts: { body: "Calibri", display: "Georgia" },
    id: "midnight",
    motif: "tick",
    name: "Midnight",
    section: { art: wash("eef2f9", "dde5f2", 118, "ffffff", 0.65), dark: false, title: "111a2b" },
  },
  {
    accent: "c07a17",
    blurb: "Charcoal and amber. Sober, industrial, easy to read at the back of the room.",
    body: { bg: "f5f4f2", dark: false, muted: "6f6c66", text: "45423d", title: "1c1a17" },
    closing: { art: dusk("1c1a17", "d98a1f", 0.4), text: "a09a90", title: "f4f2ee" },
    cover: { art: bloom("17161a", "d98a1f", 0.82, 0.26, 0.34, 0.5), subtitle: "a09a90", title: "f4f2ee" },
    fonts: { body: "Corbel", display: "Cambria" },
    id: "graphite",
    motif: "bar",
    name: "Graphite",
    section: { art: wash("efedea", "ddd9d2"), dark: false, title: "1c1a17" },
  },
  {
    accent: "9a6b3f",
    blurb: "Cream paper and sepia ink, like a well-set book.",
    body: { bg: "faf6ee", dark: false, muted: "7a6b58", text: "463a2c", title: "2c2318" },
    closing: { art: dusk("241c12", "9a6b3f", 0.45), text: "b6a68f", title: "f6efe2" },
    cover: { art: bloom("201810", "c99b5f", 0.78, 0.26, 0.3, 0.52), subtitle: "b6a68f", title: "f6efe2" },
    fonts: { body: "Candara", display: "Constantia" },
    id: "ivory",
    motif: "tick",
    name: "Ivory",
    section: { art: wash("f4ede0", "e6d9c4", 122, "fffaf0", 0.6), dark: false, title: "2c2318" },
  },
  {
    accent: "2f7d52",
    blurb: "Forest greens, moss light, quiet pages.",
    body: { bg: "f3f7f3", dark: false, muted: "667066", text: "3a453c", title: "10261a" },
    closing: { art: dusk("0d2119", "3f9a63", 0.42), text: "9db8a6", title: "eef6f0" },
    cover: { art: bloom("0d2119", "3f9a63", 0.74, 0.72, 0.5), subtitle: "9db8a6", title: "eef6f0" },
    fonts: { body: "Calibri", display: "Georgia" },
    id: "forest",
    motif: "tick",
    name: "Forest",
    section: { art: wash("edf3ed", "dbe7dc"), dark: false, title: "10261a" },
  },
  {
    accent: "b2477a",
    blurb: "Aubergine and rose. Warm, a little theatrical.",
    body: { bg: "faf5f8", dark: false, muted: "7a6a74", text: "473f47", title: "231428" },
    closing: { art: dusk("1d1021", "c2557f", 0.45), text: "b39fb4", title: "f7eff5" },
    cover: { art: twin("241428", "6d2a63", "c2557f"), subtitle: "b39fb4", title: "f7eff5" },
    fonts: { body: "Calibri", display: "Cambria" },
    id: "plum",
    motif: "dot",
    name: "Plum",
    section: { art: wash("f4ecf1", "e6d7e2"), dark: false, title: "231428" },
  },
  {
    accent: "0f7d86",
    blurb: "Deep water blues with an aqua glow.",
    body: { bg: "f2f8f9", dark: false, muted: "62757a", text: "38484c", title: "07242c" },
    closing: { art: dusk("07202e", "2aa3b0", 0.42), text: "97b4bb", title: "eef7f8" },
    cover: { art: { ...ramp("07202e", "0a3d52", 62), glows: [{ color: "38bdc9", cx: 0.85, cy: 0.74, r: 0.6, strength: 0.42 }], vignette: 0.3 }, subtitle: "97b4bb", title: "eef7f8" },
    fonts: { body: "Corbel", display: "Georgia" },
    id: "ocean",
    motif: "tick",
    name: "Ocean",
    section: { art: wash("ecf4f5", "d7e7e9"), dark: false, title: "07242c" },
  },
  {
    accent: "d2570d",
    blurb: "Cooling charcoal with an ember burning through it.",
    body: { bg: "faf7f4", dark: false, muted: "76706a", text: "45403b", title: "1d1a17" },
    closing: { art: dusk("161311", "e2610f", 0.5), text: "a89f96", title: "f7f2ec" },
    cover: { art: bloom("120f0e", "e2610f", 0.5, 1.0, 0.52, 0.72), subtitle: "a89f96", title: "f7f2ec" },
    fonts: { body: "Calibri", display: "Georgia" },
    id: "ember",
    motif: "bar",
    name: "Ember",
    section: { art: wash("f3efea", "e3d8cc"), dark: false, title: "1d1a17" },
  },
  {
    accent: "63c6e8",
    blurb: "Dark drafting blue throughout. Technical, high contrast, easy on a projector.",
    body: { bg: "10263c", dark: true, muted: "8fa8bf", text: "cfe0ee", title: "f2f7fb" },
    closing: { art: dusk("0a1a2b", "3f8fd0", 0.4), text: "9fb6cc", title: "f2f7fb" },
    cover: { art: bloom("0a1a2b", "3f8fd0", 0.2, 0.24, 0.48), subtitle: "9fb6cc", title: "f2f7fb" },
    fonts: { body: "Calibri", display: "Consolas" },
    id: "blueprint",
    motif: "bar",
    name: "Blueprint",
    section: { art: ramp("11304c", "0a1a2b", 118), dark: true, title: "f2f7fb" },
  },
  {
    accent: "b4562a",
    blurb: "Desert sand and burnt sienna.",
    body: { bg: "f7f1e6", dark: false, muted: "7d7161", text: "4a4136", title: "2a2119" },
    closing: { art: dusk("241a12", "c9743a", 0.45), text: "bcab95", title: "f7efe2" },
    cover: { art: twin("221a13", "8a4a20", "d8975c", 0.5, 0.48), subtitle: "bcab95", title: "f7efe2" },
    fonts: { body: "Tahoma", display: "Georgia" },
    id: "sandstone",
    motif: "tick",
    name: "Sandstone",
    section: { art: wash("f2e9d9", "e2d2b8", 120, "fffdf6", 0.55), dark: false, title: "2a2119" },
  },
  {
    accent: "1a1a1a",
    blurb: "Black, white, and nothing else. The most serious room in the building.",
    body: { bg: "ffffff", dark: false, muted: "6e6e6e", text: "2e2e2e", title: "000000" },
    closing: { art: ramp("000000", "1c1c1c", 90, 0.25), text: "b0b0b0", title: "ffffff" },
    cover: { art: ramp("0a0a0a", "1f1f1f", 60, 0.3), subtitle: "b0b0b0", title: "ffffff" },
    fonts: { body: "Arial", display: "Arial" },
    id: "mono",
    motif: "bar",
    name: "Mono",
    section: { art: ramp("f2f2f2", "e2e2e2", 118, 0.2), dark: false, title: "000000" },
  },
  {
    accent: "e6cf72",
    blurb: "A green board and chalk. Straight out of a lecture hall.",
    body: { bg: "1d2b24", dark: true, muted: "8fa294", text: "dbe7dd", title: "f4f7f2" },
    closing: { art: dusk("1a2620", "5d7c65", 0.32), text: "aebdb0", title: "f4f7f2" },
    cover: { art: bloom("223028", "5f8069", 0.3, 0.28, 0.34, 0.58), subtitle: "aebdb0", title: "f4f7f2" },
    fonts: { body: "Trebuchet MS", display: "Trebuchet MS" },
    id: "chalk",
    motif: "dot",
    name: "Chalk",
    section: { art: ramp("2a3a31", "1c2822", 118), dark: true, title: "f4f7f2" },
  },
  {
    accent: "5b4bd6",
    blurb: "Soft violet pages under a deep indigo sky.",
    body: { bg: "f7f5fc", dark: false, muted: "6f6a84", text: "413d52", title: "1b1633" },
    closing: { art: dusk("161233", "6a5ae0", 0.45), text: "a9a2c9", title: "f3f1fb" },
    cover: { art: twin("161233", "3b2fa0", "8c6ce8"), subtitle: "a9a2c9", title: "f3f1fb" },
    fonts: { body: "Corbel", display: "Cambria" },
    id: "lavender",
    motif: "dot",
    name: "Lavender",
    section: { art: wash("f0edf9", "e0daf2"), dark: false, title: "1b1633" },
  },
  {
    accent: "b23245",
    blurb: "Blush paper, deep red ink. Gentle but not soft.",
    body: { bg: "fdf5f4", dark: false, muted: "7d6b6b", text: "4a3f3f", title: "2a1a1c" },
    closing: { art: dusk("241416", "b23245", 0.42), text: "bda3a4", title: "faf0ef" },
    cover: { art: bloom("241416", "b23245", 0.28, 0.72, 0.5), subtitle: "bda3a4", title: "faf0ef" },
    fonts: { body: "Candara", display: "Georgia" },
    id: "rose",
    motif: "tick",
    name: "Rose",
    section: { art: wash("f8ecea", "eed9d6"), dark: false, title: "2a1a1c" },
  },
  {
    accent: "1f6feb",
    blurb: "Cool grey and electric blue. Reads like a well-run meeting.",
    body: { bg: "f4f6f8", dark: false, muted: "6a7480", text: "3d454e", title: "141a20" },
    closing: { art: dusk("141a20", "1f6feb", 0.38), text: "9aa5b1", title: "f2f5f8" },
    cover: { art: bloom("141a20", "2f7ff0", 0.82, 0.7, 0.42), subtitle: "9aa5b1", title: "f2f5f8" },
    fonts: { body: "Tahoma", display: "Cambria" },
    id: "steel",
    motif: "bar",
    name: "Steel",
    section: { art: wash("eef1f4", "dee3e9"), dark: false, title: "141a20" },
  },
  {
    accent: "c2600f",
    blurb: "A light cover for once: peach into gold, with brown ink on top.",
    body: { bg: "fffaf2", dark: false, muted: "80705c", text: "4c4133", title: "2b2115" },
    closing: { art: { ...ramp("f6c98a", "e08b3c", 100), glows: [{ color: "fff0d8", cx: 0.3, cy: 0.2, r: 0.6, strength: 0.55 }] }, text: "5a4326", title: "2b2115" },
    cover: { art: { ...ramp("fbdcae", "e59b52", 108), glows: [{ color: "fff4e2", cx: 0.24, cy: 0.22, r: 0.62, strength: 0.6 }] }, subtitle: "5f4728", title: "2b2115" },
    fonts: { body: "Calibri", display: "Georgia" },
    id: "sunrise",
    motif: "tick",
    name: "Sunrise",
    section: { art: wash("fdf1e0", "f6dcbc", 120, "fffaf0", 0.5), dark: false, title: "2b2115" },
  },
  {
    accent: "27b585",
    blurb: "Near-black pages with an emerald signal. Best in a dark room.",
    body: { bg: "121614", dark: true, muted: "8b968f", text: "d5ded8", title: "f2f6f3" },
    closing: { art: dusk("0d100e", "27b585", 0.35), text: "9aa79f", title: "f2f6f3" },
    cover: { art: bloom("0d100e", "27b585", 0.78, 0.76, 0.4), subtitle: "9aa79f", title: "f2f6f3" },
    fonts: { body: "Verdana", display: "Georgia" },
    id: "emerald",
    motif: "dot",
    name: "Emerald",
    section: { art: ramp("18201c", "0d100e", 118), dark: true, title: "f2f6f3" },
  },
  {
    accent: "1a4fd6",
    blurb: "White pages, cobalt accents. The plain business look, done properly.",
    body: { bg: "ffffff", dark: false, muted: "6b7280", text: "3b4250", title: "0f1729" },
    closing: { art: ramp("0f2a7a", "0a1a4d", 100, 0.3), text: "aebbe4", title: "f5f8ff" },
    cover: { art: { ...ramp("123084", "0a1a4d", 112, 0.3), glows: [{ color: "3f6fe8", cx: 0.8, cy: 0.28, r: 0.6, strength: 0.4 }] }, subtitle: "aebbe4", title: "f5f8ff" },
    fonts: { body: "Calibri", display: "Cambria" },
    id: "cobalt",
    motif: "bar",
    name: "Cobalt",
    section: { art: wash("f0f4fd", "dee7fa", 118, "ffffff", 0.6), dark: false, title: "0f1729" },
  },
  {
    accent: "a24e2e",
    blurb: "Terracotta and cream, with a hand-made feel.",
    body: { bg: "fbf5ef", dark: false, muted: "7c6d61", text: "4a3f36", title: "2b201a" },
    closing: { art: dusk("2b201a", "b9633b", 0.45), text: "c0aa9a", title: "f9f0e8" },
    cover: { art: twin("2a1712", "a3401f", "dd8a5c", 0.52, 0.55), subtitle: "c0aa9a", title: "f9f0e8" },
    fonts: { body: "Corbel", display: "Constantia" },
    id: "clay",
    motif: "tick",
    name: "Clay",
    section: { art: wash("f5ebe1", "e8d6c6"), dark: false, title: "2b201a" },
  },
  {
    accent: "a8e02a",
    blurb: "Black with lime and cyan light. Loud, modern, unmistakable.",
    body: { bg: "0d0f12", dark: true, muted: "8a9099", text: "d7dce2", title: "f4f7fa" },
    closing: { art: dusk("07080a", "2ad0d0", 0.35), text: "97a0aa", title: "f4f7fa" },
    cover: { art: twin("05060a", "2ad0d0", "a8e02a", 0.44, 0.6), subtitle: "97a0aa", title: "f4f7fa" },
    fonts: { body: "Verdana", display: "Trebuchet MS" },
    id: "neon",
    motif: "dot",
    name: "Neon",
    section: { art: ramp("14181d", "07080a", 118), dark: true, title: "f4f7fa" },
  },
];

export const DEFAULT_DECK_THEME = "nemesis";

/** Look one up by id, falling back to the house look — a stored id must never break a download. */
export function deckTheme(id: string | null | undefined): DeckTheme {
  return DECK_THEMES.find((t) => t.id === id) ?? HOUSE;
}
