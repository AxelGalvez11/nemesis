// The avatar: a solid with a face on it, and its animations.
//
// 🔴 THIS IS A COPY OF apps/web/lib/avatar, AND IT HAS TO BE. This site has its own
// pnpm-workspace.yaml, its Turbopack root is pinned to this folder, and Vercel deploys
// `landing/` alone — anything outside it is not even uploaded. `lib/bloub` was already here
// for the same reason. Copy it UNEDITED when it changes, so the two renderers cannot
// disagree about what a frame means; the only thing that differs between the two copies is
// which surfaces they are wired into.

export { ANIMATIONS, ANIMATION_BY_ID } from "./animations";
export { AVATARS, AVATAR_BY_ID, DEFAULT_AVATAR } from "./avatars";
export { FACES, FACE_BY_ID } from "./faces";
export {
  animationDuration,
  blendFaces,
  blinkAt,
  cursorAt,
  ease,
  eyeDriftAt,
  livenFace,
  nearestAngle,
  playedFaceAt,
  type PlayedFace,
  type PlayOptions,
} from "./play";
export { SHUT_HEIGHT, VIEW_BOX, VIEW_SIZE, drawEye, drawFace } from "./render";
export { FOCAL, RADIUS, faceToSkin, frontOfSkin, project, quatFromTurn, rotate } from "./space";
export type {
  Animation,
  Avatar,
  AvatarFrame,
  BlinkPlan,
  BodyMotion,
  EaseName,
  EyeMotion,
  EyeSpec,
  Face,
  HeadTurn,
  PlaybackMode,
  Step,
  Surface,
  SurfaceType,
} from "./types";

import { DEFAULT_AVATAR } from "./avatars";
import { drawFace } from "./render";
import { playedFaceAt, type PlayOptions } from "./play";
import type { AvatarFrame, Avatar } from "./types";

/**
 * One animation, one instant, one picture.
 *
 * This is the whole public surface for anything that just wants a character on screen:
 * name an animation, give it a millisecond, get three paths back.
 */
export function avatarFrameAt(
  animationId: string,
  ms: number,
  avatar: Avatar = DEFAULT_AVATAR,
  opts: PlayOptions & { readonly turn?: { readonly x: number; readonly y: number } } = {},
): AvatarFrame | null {
  const played = playedFaceAt(animationId, ms, opts);
  if (!played) return null;
  return drawFace(avatar.surface, played.face, {
    blink: played.blink,
    eyeDrift: played.eyeDrift,
    ...(opts.turn ? { turn: opts.turn } : null),
  });
}

/**
 * How far the head turns to follow the pointer, in degrees.
 *
 * 🔴 SMALL, AND SMALLER VERTICALLY. The character sits beside dense reading material; a
 * head that swings the full range of the engine reads as a toy watching you rather than as
 * a thing paying attention. These are the same numbers the previous character used
 * (lib/character/look.ts), kept so the swap does not also change how attentive it feels.
 */
export const TRACK_YAW = 26;
export const TRACK_PITCH = 15;
