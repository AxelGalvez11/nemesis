// The mascot engine's public surface. Nothing below this imports React or touches the
// DOM, so the whole thing runs — and is tested — in plain Node.

export { EASINGS, type EaseName } from "./easing";
export {
  BODY,
  MARK_SCALE,
  REST_INK,
  SATELLITES,
  UNIT_BLOB,
  VIEW,
  beadBounds,
  profileAt,
  silhouette,
} from "./geometry";
export { focusLook, mergeLook, NO_LOOK, PointerGaze, type Look } from "./gaze";
export { blinkLid, liveliness } from "./face";
export { blendPose, REST, resolvePose, scalePose, type PosePatch } from "./pose";
export {
  DEFAULT_CTX,
  STATE_ORDER,
  STATES,
  stateDuration,
  stillTime,
  type StateCtx,
  type StateDef,
} from "./states";
export { MascotEngine, poseOf, renderPose, sampleState, type SampleOptions } from "./engine";
export type {
  BeadRender,
  BodyPose,
  EyePose,
  EyeRender,
  MascotFocus,
  MascotFrame,
  MascotMode,
  MascotState,
  Pose,
  SatellitePose,
} from "./types";
