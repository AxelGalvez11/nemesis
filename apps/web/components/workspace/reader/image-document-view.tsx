"use client";

// Images and scans. Zoom, rotate, and — the part that makes it a reader rather
// than a viewer — drag a box around part of the picture and ask about just that
// part.
//
// The region is reported as FRACTIONS of the natural image (0–1), never as
// screen pixels: the same contract the occlusion editor already uses, and the
// only one that survives a zoom, a rotation or a different-sized window. The
// crop itself is cut from the natural-size image on a canvas, so what the model
// receives is the real pixels, not a scaled-down screenshot of them.
//
// 🔴 THE DRAG ITSELF LIVES IN `use-region-drag.ts` NOW, because PDF pages grew
// the same gesture. Two copies of "which corner does a fast drag end at" is
// exactly how one of them silently stops working.

import { useCallback, useRef } from "react";

import { Codicon } from "@/components/desktop-ui/codicon";

import { cropFrom, useRegionDrag, type RegionAnchor, type RegionBox } from "./use-region-drag";

/** Kept as its own name because it is part of this view's published contract and
 *  `document-reader.tsx` imports it; structurally it is a `RegionBox`. */
export type ImageRegion = RegionBox;

interface ImageDocumentViewProps {
  url: string;
  fileName: string;
  scale: number;
  rotation: number;
  onNaturalSize: (size: { width: number; height: number }) => void;
  registerElement?: (unit: number, element: HTMLElement | null) => void;
  onRegion: (region: ImageRegion, cropDataUrl: string | null, anchor: RegionAnchor) => void;
}

export function ImageDocumentView({ url, fileName, scale, rotation, onNaturalSize, onRegion, registerElement }: ImageDocumentViewProps) {
  const imageRef = useRef<HTMLImageElement>(null);

  // A region is only meaningful while the picture is the right way up: a
  // rotated crop would need the box rotated with it, and reporting a fraction
  // of a rotated frame as a fraction of the file would be quietly wrong.
  const canSelect = rotation % 360 === 0;

  const picked = useCallback(
    (region: RegionBox, anchor: RegionAnchor) => {
      const image = imageRef.current;
      const crop = image ? cropFrom(image, region, { height: image.naturalHeight, width: image.naturalWidth }) : null;
      onRegion(region, crop, anchor);
    },
    [onRegion],
  );

  // Stable for the same crash-shaped reason as the docx article — see its note.
  const registerFrame = useCallback((element: HTMLElement | null) => registerElement?.(1, element), [registerElement]);

  const { box, onPointerDown } = useRegionDrag({ enabled: canSelect, onPicked: picked, target: imageRef });

  return (
    <div className="flex h-full min-h-0 flex-col overflow-auto overscroll-contain p-6" data-testid="reader-image-scroll">
      <div className="m-auto flex flex-col items-center gap-3">
        <div className="nemesis-reader-canvas relative" ref={registerFrame}>
          {/* eslint-disable-next-line @next/next/no-img-element -- a private, short-lived signed URL; next/image cannot optimize it */}
          <img
            alt={fileName}
            className="nemesis-reader-image block max-w-none select-none"
            draggable={false}
            onLoad={(event) => {
              const image = event.currentTarget;
              onNaturalSize({ width: image.naturalWidth, height: image.naturalHeight });
            }}
            onPointerDown={onPointerDown}
            ref={imageRef}
            src={url}
            style={{
              transform: `rotate(${rotation}deg)`,
              width: `${Math.round(scale * 100)}%`,
              cursor: canSelect ? "crosshair" : "default",
            }}
          />
          {box && <div className="nemesis-reader-region" style={box} />}
        </div>
        <p className="flex items-center gap-1.5 text-[0.6875rem] text-(--ui-text-tertiary)">
          <Codicon name={canSelect ? "screen-full" : "info"} size="0.75rem" />
          {canSelect ? "Drag a box on the picture to ask about part of it" : "Rotate back to upright to select a region"}
        </p>
      </div>
    </div>
  );
}
