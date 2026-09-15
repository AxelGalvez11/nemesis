// The web app's character engine, imported — not copied. See web.ts for the rule (pure
// modules only): `lib/avatar/**` is pure math that turns a clock into SVG path strings, no
// React, no DOM, and its own files say so at the top.
//
// 🔴 THE PHONE DRAWS THESE PATH STRINGS WITH react-native-svg's <Path d="…">, WHICH SPEAKS
// THE SAME SVG PATH GRAMMAR THE WEB DOES. Nothing about the engine changes for the port —
// only the component that writes its output onto the screen does (`NemesisAvatar.tsx`).
export {
  ANIMATION_BY_ID,
  AVATAR_BY_ID,
  DEFAULT_AVATAR,
  MAX_SPARKS,
  VIEW_BOX,
  VIEW_SIZE,
  animationDuration,
  createPlayhead,
  drawFace,
  eyeFrames,
  mixHex,
  sparkScaleFor,
  type Avatar,
  type AvatarFrame,
  type EyeFrame,
  type PlayOptions,
  type Playhead,
} from "../../../web/lib/avatar/index.ts";

// The character's own resting outline — a squircle, not any of the ten vendored bodies.
// `lib/character/body.ts` on the web is a one-line re-export of this same constant but
// reaches it through `@/lib/avatar/vendor/silhouettes`, a path alias that resolves inside
// the web app only; the phone's `@/` means `apps/mobile/src` (see web.ts's own warning), so
// the constant is taken directly from where the web file gets it instead of through it.
export { SQUIRCLE as CHARACTER_SILHOUETTE } from "../../../web/lib/avatar/vendor/silhouettes.ts";
