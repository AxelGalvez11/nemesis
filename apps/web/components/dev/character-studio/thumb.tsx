"use client";

// A small still of one face.
//
// 🔴 STILL, AND NOT A SECOND ANIMATION. A wall of sixteen thumbnails each running its
// own requestAnimationFrame is sixteen engines, and it costs enough that dragging a
// slider in the inspector goes visibly rough — the one interaction the whole studio
// exists for. Every thumbnail is one `sampleState` call at a fixed instant, painted
// once, and repainted only when the face it shows actually changes.
//
// The instant is not 0. At t=0 the resting gaze is dead centre and the lid is fully
// open, which is the least characteristic frame a face has; a little way in, the drift
// has moved and the eyes are where they normally sit.

import { memo } from "react";

import { NemesisMascot } from "@/components/mascot/nemesis-mascot";
import type { StudioCharacter, StudioExpression } from "@/lib/studio/document";
import { expressionFrame } from "@/lib/studio/frame";

/** Far enough in for the drift to have moved, comfortably clear of the first blink. */
const STILL_AT = 0.9;

export const Thumb = memo(function Thumb({
  character,
  expression,
  size = 44,
  ink,
  eye,
}: {
  character: StudioCharacter;
  expression: StudioExpression;
  size?: number;
  ink: string;
  eye: string;
}) {
  const frame = expressionFrame(character, expression, STILL_AT, { reduced: true });
  return (
    <span
      className="cs-thumb-art"
      style={{ ["--mascot-ink" as string]: ink, ["--mascot-eye" as string]: eye }}
    >
      <NemesisMascot frame={frame} size={size} eyeShape={character.eyeShape} />
    </span>
  );
});
