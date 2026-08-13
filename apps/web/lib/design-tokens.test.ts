import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

// The retired crimson, and the blue-tinted ground, must not come back.
//
// 🔴 A CLEANUP WITHOUT A GUARD IS A CLEANUP THAT HAPPENS AGAIN. "crimson" was the product's accent
// until the owner retired it, and it survived that retirement in the token layer for long enough
// that the owner had to find it themselves, by reading the live stylesheet (UX brief §27.3). The
// values are gone now; this is what stops the next palette edit from quietly reintroducing the
// hue, which is exactly how it survived the first removal.
//
// 🔴 THIS TESTS THE STYLESHEET, NOT A FUNCTION, BECAUSE THAT IS WHERE THE DEFECT LIVES. There is
// no module to import — the tokens are CSS custom properties, and every consumer reaches them
// through the cascade. Crude, and it is the only place the property is expressible.

const CSS = readFile(new URL("../app/globals.css", import.meta.url), "utf8");

/** Hues 350–360 are the retired crimson family. `--destructive` is a red and stays one — an error
 *  state is meant to be red, and it was never part of the brand palette being retired. */
const RETIRED_CRIMSON = /^\s*--([a-z0-9-]+):\s*(3(?:5[0-9]|60))\s+\d+%\s+\d+%/;

/**
 * Tokens still declared in a crimson hue, each with the reason it was left alone.
 *
 * 🔴 AN ALLOW-LIST, NOT A LOOSER REGEX — and the difference matters. Widening the pattern until it
 * passes would hide the next one; naming them keeps the remaining debt VISIBLE and makes removing
 * an entry the way this shrinks. These were found while clearing the two tokens the owner named,
 * are the same retired hue, and were NOT changed because `--primary` and `--ring` feed shadcn's
 * primary button and every focus ring outside the workspace — a blast radius the owner should rule
 * on rather than a Canvas PR should absorb. Reported on issue #505.
 */
const KNOWN_CRIMSON: Readonly<Record<string, string>> = {
  primary: "shadcn primary button fill, every non-workspace surface — owner's call, see #505",
  "primary-foreground": "the glyph colour that pairs with --primary; moves with it or not at all",
  ring: "shadcn focus ring outside the workspace — moves with --primary",
  destructive: "an error state is meant to be red; never part of the retired brand palette",
  "destructive-foreground": "pairs with --destructive",
};

test("🔴 the two tokens the owner named carry no hue at all", async () => {
  const css = await CSS;
  // Both themes. Leaving one behind is how a retired hue survives a cleanup — the light values get
  // looked at because that is what the owner had open, and the dark ones do not.
  const declarations = [...css.matchAll(/--accent-(?:shadcn|foreground):\s*([^;]+);/g)].map((m) => m[1]!.trim());
  assert.ok(declarations.length >= 4, `expected both themes to declare both tokens, saw ${declarations.length}`);
  for (const value of declarations) {
    assert.match(
      value,
      /^0 0% \d+%$/,
      `--accent-* is ${value} — hue 0, saturation 0, or it is not neutral. Re-point it; do NOT delete the declaration (tailwind.config.ts maps accent.DEFAULT to hsl(var(--accent-shadcn)), so removing it makes every bg-accent hover transparent).`,
    );
  }
});

test("🔴 no NEW token is declared in the retired crimson", async () => {
  const css = await CSS;
  const found = new Set<string>();
  for (const line of css.split("\n")) {
    // A line may declare several tokens; the palette rows in this file routinely do.
    for (const declaration of line.split(";")) {
      const hit = RETIRED_CRIMSON.exec(declaration);
      if (hit) found.add(hit[1]!);
    }
  }
  const unexpected = [...found].filter((name) => !(name in KNOWN_CRIMSON));
  assert.deepEqual(
    unexpected,
    [],
    `new crimson token(s): ${unexpected.join(", ")}. The product retired this hue. If one of these is genuinely intended, add it to KNOWN_CRIMSON with the reason rather than widening the pattern.`,
  );
});

/**
 * Tokens in the light `:root` that are allowed to carry a hue, each with the reason.
 *
 * 🔴 THE STATUS COLOURS ARE OBVIOUS; THE OTHERS ARE DEBT, AND NAMING THEM IS THE POINT. The first
 * version of this guard read a SINGLE LINE — the one declaring `--bg` — and so it could not see
 * `--rail-bg`, which is on its own line and which I had left blue while neutralising everything
 * around it. Scanning the whole block is what turned that from a thing nobody would notice into a
 * line in this list.
 */
const HUE_ALLOWED: Readonly<Record<string, string>> = {
  warn: "a status colour; meant to be amber",
  danger: "a status colour; meant to be red",
  info: "a status colour; meant to be blue",
  success: "a status colour; meant to be green",
  // 🔴 REPORTED, NOT CHANGED. These are the retired crimson surviving as a tint, and they belong
  // to the Chat surface rather than the Canvas — changing them is a visible change to a surface
  // this pass did not look at. Filed on #505 with the two shadcn tokens.
  "user-bubble": "pink residue of the retired palette — Chat's surface, owner's call, see #505",
  "user-bubble-border": "pairs with --user-bubble",
  // 🔴 ALSO REPORTED, NOT CHANGED. Cool greys (spread 14). The owner flagged the GROUND, not the
  // text, and shifting body-text colour is a legibility change rather than a palette tidy-up.
  "text-2": "cool grey; the owner flagged the ground, not the text — see #505",
  "text-3": "cool grey; pairs with --text-2",
};

test("🔴 every light SURFACE is neutral — no channel may outrun another", async () => {
  // §27.3: "--bg #f8faff — blue-tinted white; ChatGPT's ground is neutral." `--bg` is painted on
  // <body>, so the tint shows in the overscroll gutter and anywhere the workspace's own neutral
  // surface does not reach. Measured before the fix: body `rgb(248,250,255)` under a workspace
  // element at `srgb(0.996 0.996 0.996)`; after, `rgb(250,250,250)`.
  //
  // 🔴 THE WHOLE LADDER, NOT JUST `--bg`. Neutralising the ground alone leaves the surfaces above
  // it blue, which reads WORSE than a consistent tint — the step between two surfaces is what
  // carries depth, and a hue shift across that step is visible where a uniform one is not. That is
  // not hypothetical: this guard's first version missed `--rail-bg` and I shipped exactly that
  // defect for the length of one commit.
  const css = await CSS;
  const root = css.slice(css.indexOf(":root {"), css.indexOf("\n}", css.indexOf(":root {")));
  const tinted: string[] = [];
  for (const [, name, hex] of root.matchAll(/--([a-z0-9-]+):\s*#([0-9a-f]{6})/gi)) {
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex!.slice(i, i + 2), 16));
    if (r === g && g === b) continue;
    if (name! in HUE_ALLOWED) continue;
    tinted.push(`--${name} #${hex} (r${r} g${g} b${b})`);
  }
  assert.deepEqual(
    tinted,
    [],
    `tinted light token(s): ${tinted.join(", ")}. The light ground is neutral. If a tint is genuinely wanted, add the token to HUE_ALLOWED with the reason — do not widen the check.`,
  );
});
