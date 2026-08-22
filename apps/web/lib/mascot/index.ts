// The mascot engine's public surface. Nothing below this imports React or touches the
// DOM, so the whole thing runs — and is tested — in plain Node.

export { approach, EASINGS, type EaseName } from "./easing";
export {
  EXPRESSION_ORDER,
  EXPRESSIONS,
  type ExpressionDef,
  type ExpressionId,
} from "./expressions";
export {
  PROFILE_SAMPLES,
  SHAPE_LABEL,
  SHAPE_ORDER,
  SHAPES,
  blendRadii,
  type ShapeId,
} from "./shapes";
export {
  BODY,
  MARK_SCALE,
  REST_INK,
  SATELLITES,
  UNIT_BLOB,
  UNIT_ROUND,
  VIEW,
  beadBounds,
  profileAt,
  silhouette,
} from "./geometry";
export {
  ATTENTION_ATTR,
  getAttention,
  lookAt,
  resolveAttention,
  subscribeAttention,
  type AttentionTarget,
} from "./attention";
export { focusLook, mergeLook, NO_LOOK, PointerGaze, type Look } from "./gaze";
export { BLINK_HALF, blinkLid, liveliness, maskBlink } from "./face";
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
export {
  SEMANTIC_MASCOT,
  mascotStateFor,
  type MascotSemanticState,
} from "./semantic";
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
