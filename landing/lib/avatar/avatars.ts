// 🔴 COPIED FROM apps/web — DO NOT EDIT HERE. Run `pnpm --filter @pharmaorb/web character:sync`.
// The bodies. Generated — see scripts/avatar-import.mts.
//
// A body is a SOLID, described by its three half-extents and how square it is. The face is
// laid on whichever one is chosen, so the same 27 faces and 23 animations work on all of
// them — that is the whole point of keeping the two apart.

import type { Avatar } from "./types";

export const AVATARS: readonly Avatar[] = [
  { id: "strobi", name: "Strobi", surface: { type: "sphere", width: 240, height: 240, depth: 240.04, roundness: 1 }, ink: "#5b7fe5", eye: "#111316" },
  { id: "avatar-4fe2d1bd-cf46-4e5e-a62d-d6b60be519ed", name: "Freddy", surface: { type: "cube", width: 174.73, height: 149.47, depth: 125.6, roundness: 0.76 }, ink: "#e6855c", eye: "#ffffff" },
  { id: "avatar-295e74a7-5d70-4d61-83d4-7beebb22bdd8", name: "Citrus", surface: { type: "cone", width: 252.71, height: 274.97, depth: 225, roundness: 0, morphRoundness: 1.15, tipRoundness: 0.74, baseRoundness: 1.34 }, ink: "#ffcf24", eye: "#000000" },
  { id: "avatar-1786600724626", name: "Nova", surface: { type: "capsule", width: 205, height: 270, depth: 205, roundness: 1 }, ink: "#55b6c3", eye: "#111316" },
  { id: "avatar-7874f78a-93ec-4536-a3b6-bb53ed744efd", name: "Grok bot", surface: { type: "sphere", width: 240, height: 240, depth: 240, roundness: 1 }, ink: "#000000", eye: "#ffffff" },
  { id: "avatar-1b2ee9c6-a6c5-4054-87e7-fec24f285269", name: "Sunee", surface: { type: "sphere", width: 182.96, height: 185.55, depth: 100.01, roundness: 1 }, ink: "#e69a5c", eye: "#111316" },
  { id: "avatar-b6362e59-81a3-4334-a399-a721b23cf553", name: "Kirby", surface: { type: "sphere", width: 240, height: 240, depth: 240, roundness: 1 }, ink: "#ffc2e9", eye: "#3e4e65" },
  { id: "avatar-fafdaf4d-2071-41d6-9d42-7d34670956f0", name: "Cloudee", surface: { type: "sphere", width: 159.79, height: 159.79, depth: 159.78, roundness: 1 }, ink: "#c9cbcf", eye: "#111316" },
  { id: "avatar-2739f2c2-a5b4-45d9-8915-c9d6101d4d3b", name: "Cubee", surface: { type: "cube", width: 191.5, height: 191.5, depth: 171.96, roundness: 0.73 }, ink: "#e65c5c", eye: "#111316" },
  { id: "avatar-4b9ea0c1-286f-4aa1-b053-61fcc416ba7e", name: "Onee", surface: { type: "cone", width: 250, height: 182.01, depth: 225, roundness: 0, morphRoundness: 1.2, tipRoundness: 2, baseRoundness: 2 }, ink: "#dbe2f5", eye: "#111316" },
];

export const AVATAR_BY_ID: ReadonlyMap<string, Avatar> = new Map(AVATARS.map((a) => [a.id, a]));

/** The one the reference opens on, and the one every animation was authored against. */
export const DEFAULT_AVATAR = AVATARS[0]!;
