// What shape Nemesis is.
//
// Owner, 2026-08-26: *"could you make the character, the mascot, a cube? instead of the
// circle?"*, then, asked how far that should go: *"use squircle like in the github repo for
// bloub"*. So this is not a rounded-square of my own devising — it is the shape jeremy-prt/bloub
// offers in its own customiser, built by its own code, at its own numbers. See
// `lib/avatar/vendor/silhouettes.ts`.
//
// 🔴 A SILHOUETTE, NOT A SOLID, AND THE CHOICE BETWEEN THEM IS NOT COSMETIC. This engine can
// already draw a real rounded box — `Surface.type` has had `"cube"` since the import, and two of
// the vendored avatars use it. A box would have been fewer lines. It is the wrong answer twice:
//
//   1. It is not what the owner asked for. Bloub's squircle is a flat outline, so a box seen
//      turning shows edges and faces that their shape does not have.
//   2. The site and the phone draw this character with bloub's OWN renderer, which knows only
//      flat radial outlines. A solid here and an outline there is two different characters
//      wearing one name, and the entire reason the engine was vendored three times unedited is
//      that they are supposed to agree about what a frame means.
//
// 🔴 AND IT IS THE BODY AT REST, NOT A POSE. Passing it as a pose would make the squircle
// something the character DOES, which is a thing an animation could then undo. It is what the
// character IS: applied wherever a pose has no silhouette of its own, which is every pose this
// product schedules — see `no-state-reshapes-the-body` in `character.test.ts`, which is the
// guard that keeps that sentence true.

import { SQUIRCLE } from "@/lib/avatar/vendor/silhouettes";

/**
 * The outline Nemesis wears everywhere it is Nemesis.
 *
 * 🔴 NOT THE DEFAULT ON `NemesisAvatar`, AND THAT IS DELIBERATE. The same component draws the
 * ten vendored bodies in the catalogue browser, and pushing a squircle onto a cone or a capsule
 * would draw something that is neither. The product's surfaces pass this; previews of the
 * catalogue pass nothing. `character.test.ts` names the surfaces that must pass it, so a new one
 * that forgets is a red test rather than two differently shaped characters on one page.
 */
export const CHARACTER_SILHOUETTE: readonly number[] = SQUIRCLE;
