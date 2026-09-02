// Which of the character engine's animations plays for a turn's state.
//
// PURE: no React, no timers — a state in, an animation id out, so the mapping is one
// assertion rather than something only visible on a running phone. Kept out of
// NemesisAvatar.tsx for the same reason `sparkScaleFor` lives in the engine and not in the
// web's component: a rule inside a component can only be asked the prop it was given, not
// the id it chose.
export type AvatarTurnState = "sending" | "idle";

/** Both ids are the engine's own routine names (`lib/avatar/routines.ts`), not ours. */
export function animationForTurnState(state: AvatarTurnState): string {
  return state === "sending" ? "thinking" : "idle";
}
