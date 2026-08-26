"use client";

// The stage — the character, big, on a plain ground.
//
// 🔴 IT PAINTS A FRAME THE SHELL COMPUTED, rather than running an engine of its own.
// Everything else in the studio needs the same frame at the same instant — the filmstrip
// highlights the step, the timeline draws a playhead, the snapshot button serialises
// what is on screen — and two clocks would drift apart within seconds of the first
// scrub. One clock lives in the shell; this is a canvas.

import { forwardRef } from "react";

import { NemesisMascot } from "@/components/mascot/nemesis-mascot";
import type { MascotFrame } from "@/lib/mascot/types";

import { Button } from "./bits";

export interface StageProps {
  frame: MascotFrame;
  ink: string;
  eye: string;
  size: number;
  /** What is playing, for the corner chip. `null` while a single face is held. */
  playingLabel: string | null;
  faceLabel: string;
  /** Checkerboard behind the character, to judge a colour against nothing. */
  transparent: boolean;
  onSnapshot: () => void;
  onResetGaze: () => void;
  /** The character's own name, for the eyebrow above the chip. */
  characterName: string;
  /** What the eyes are cut as. See `NemesisMascotProps.eyeShape`. */
  eyeShape: "blob" | "capsule";
}

/**
 * The stage.
 *
 * The ref is the `<svg>` the mascot draws into, handed up so the export can serialise
 * the very node on screen rather than re-render one. See `svgMarkup` on why that
 * distinction is load-bearing.
 */
export const Stage = forwardRef<HTMLDivElement, StageProps>(function Stage(
  { frame, ink, eye, size, playingLabel, faceLabel, transparent, onSnapshot, onResetGaze, characterName, eyeShape },
  ref,
) {
  return (
    <div className="cs-stage">
      <div className="cs-stage-top">
        <div className="cs-chip">
          <span className={`cs-chip-dot${playingLabel ? " is-live" : ""}`} aria-hidden="true" />
          <span className="cs-chip-text">
            <span className="cs-chip-kind">{playingLabel ? "Playing" : "Holding"}</span>
            <strong>{playingLabel ?? faceLabel}</strong>
          </span>
        </div>
        <span className="cs-stage-name">{characterName}</span>
      </div>

      <div
        ref={ref}
        className={`cs-stage-art${transparent ? " is-checkered" : ""}`}
        // The two tokens the renderer fills from. Set here rather than in the stylesheet
        // because they are the character's, and the studio edits several characters.
        style={{ ["--mascot-ink" as string]: ink, ["--mascot-eye" as string]: eye }}
      >
        <NemesisMascot frame={frame} size={size} eyeShape={eyeShape} label={`${characterName}, ${faceLabel.toLowerCase()}`} />
      </div>

      <div className="cs-stage-tools">
        <Button onClick={onSnapshot}>Take a picture</Button>
        <Button onClick={onResetGaze} title="Point the gaze back at the middle">
          Centre the gaze
        </Button>
      </div>
    </div>
  );
});
