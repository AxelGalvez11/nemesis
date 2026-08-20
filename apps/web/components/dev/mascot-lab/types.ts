import type { ExpressionId, MascotFocus, MascotMode } from "@/lib/mascot";

/** Everything the lab can change. One flat record so the whole thing is one useState. */
export interface LabState {
  mode: MascotMode;
  intensity: number;
  confidence: number;
  voice: number;
  focus: MascotFocus;
  /** null lets each state wear its own default. */
  expression: ExpressionId | null;
  /** Aim the gaze by hand instead of by focus / pointer. */
  manualGaze: boolean;
  gazeX: number;
  gazeY: number;
  track: boolean;
  speed: number;
  paused: boolean;
  /** 0..1 through the current state's own duration. Only meaningful while paused. */
  progress: number;
  size: number;
  theme: "light" | "dark";
  reduced: boolean;
  view: View;
  /** Board: catch each state at its characteristic frame, or all at one timestamp. */
  boardStill: boolean;
  boardT: number;
  /** Board: show every state twice, light and dark. */
  boardBothThemes: boolean;
}

export type View = "stage" | "board" | "faces" | "dock" | "transitions";

export const INITIAL: LabState = {
  mode: "idle",
  intensity: 1,
  confidence: 1,
  voice: 0,
  focus: "none",
  expression: null,
  manualGaze: false,
  gazeX: 0,
  gazeY: 0,
  track: true,
  speed: 1,
  paused: false,
  progress: 0,
  size: 260,
  theme: "dark",
  reduced: false,
  view: "stage",
  boardStill: true,
  boardT: 0.8,
  boardBothThemes: false,
};
