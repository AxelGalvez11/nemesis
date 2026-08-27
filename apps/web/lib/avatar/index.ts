// The avatar: a solid with a face on it, and fifty-six things it can do on any of them.
//
// Sixteen feelings (`expressions.ts`), ten routines that change the body (`routines.ts`),
// twenty-three gaze patterns measured off the reference (`animations.ts`), and seven
// gestures of our own that are timing rather than drawing (`gestures.ts`). One engine draws
// all of them and morphs between any two — see `catalogue.ts`.

export { ANIMATIONS, ANIMATION_BY_ID, FACES, FACE_BY_ID } from "./catalogue";
export { AVATARS, AVATAR_BY_ID, DEFAULT_AVATAR } from "./avatars";
export { EXPRESSIONS, EXPRESSION_IDS } from "./expressions";
export { GESTURE_IDS } from "./gestures";
export { ROUTINE_IDS } from "./routines";
export {
  animationDuration,
  blendFaces,
  blinkAt,
  cursorAt,
  ease,
  createPlayhead,
  eyeDriftAt,
  livenFace,
  nearestAngle,
  playedFaceAt,
  sparkDots,
  HANDOVER_MS,
  type Playhead,
  type PlayedFace,
  type PlayOptions,
} from "./play";
export {
  MAX_SPARKS,
  MIN_SPARK_PX,
  REST_BODY,
  SHUT_HEIGHT,
  VIEW_BOX,
  VIEW_SIZE,
  drawEye,
  drawFace,
  eyeFrames,
  posedSurface,
  sparkScaleFor,
  type EyeFrame,
} from "./render";
export {
  FOCAL,
  RADIUS,
  faceToSkin,
  frontOfSkin,
  mixHex,
  project,
  quatFromTurn,
  rotate,
} from "./space";
export type {
  Animation,
  Avatar,
  AvatarFrame,
  BlinkPlan,
  BodyMotion,
  BodyPose,
  Dot,
  EaseName,
  EyeMotion,
  EyeSpec,
  Face,
  HeadTurn,
  Notch,
  PlaybackMode,
  SparkPlan,
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
 * the previous character used, kept so the swap does not also change how attentive it feels.
 */
export const TRACK_YAW = 26;
export const TRACK_PITCH = 15;
