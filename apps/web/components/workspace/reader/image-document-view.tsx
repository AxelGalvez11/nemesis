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

import { useCallback, useEffect, useRef, useState } from "react";

import { Codicon } from "@/components/desktop-ui/codicon";

export interface ImageRegion {
  /** All four are fractions of the natural image size. */
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ImageDocumentViewProps {
  url: string;
  fileName: string;
  scale: number;
  rotation: number;
  onNaturalSize: (size: { width: number; height: number }) => void;
  onRegion: (region: ImageRegion, cropDataUrl: string | null) => void;
}

export function ImageDocumentView({ url, fileName, scale, rotation, onNaturalSize, onRegion }: ImageDocumentViewProps) {
  const imageRef = useRef<HTMLImageElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const naturalSize = useCallback(() => {
    const image = imageRef.current;
    return image ? { width: image.naturalWidth, height: image.naturalHeight } : null;
  }, []);

  // A region is only meaningful while the picture is the right way up: a
  // rotated crop would need the box rotated with it, and reporting a fraction
  // of a rotated frame as a fraction of the file would be quietly wrong.
  const canSelect = rotation % 360 === 0;

  const pointFrom = useCallback((event: React.PointerEvent | PointerEvent) => {
    const box = imageRef.current?.getBoundingClientRect();
    if (!box || box.width === 0 || box.height === 0) return null;
    return {
      x: Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)),
      y: Math.min(1, Math.max(0, (event.clientY - box.top) / box.height)),
    };
  }, []);

  const finish = useCallback(() => {
    setDragging(false);
    if (!drag) return;
    const region: ImageRegion = {
      x: Math.min(drag.x1, drag.x2),
      y: Math.min(drag.y1, drag.y2),
      width: Math.abs(drag.x2 - drag.x1),
      height: Math.abs(drag.y2 - drag.y1),
    };
    // A stray click is not a selection. Below ~1.5% in either direction there
    // is nothing to ask about, and reporting it would clear the panel for no
    // reason.
    if (region.width < 0.015 || region.height < 0.015) {
      setDrag(null);
      return;
    }
    const size = naturalSize();
    const image = imageRef.current;
    let crop: string | null = null;
    if (size && image) {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(region.width * size.width));
        canvas.height = Math.max(1, Math.round(region.height * size.height));
        const context = canvas.getContext("2d");
        if (context) {
          context.drawImage(
            image,
            region.x * size.width,
            region.y * size.height,
            region.width * size.width,
            region.height * size.height,
            0,
            0,
            canvas.width,
            canvas.height,
          );
          crop = canvas.toDataURL("image/png");
        }
      } catch {
        // A cross-origin image taints the canvas and toDataURL throws. The
        // region is still reported — the panel just cannot show a preview of it.
        crop = null;
      }
    }
    onRegion(region, crop);
  }, [drag, naturalSize, onRegion]);

  useEffect(() => {
    if (!dragging) return;
    const move = (event: PointerEvent) => {
      const point = pointFrom(event);
      if (point) setDrag((current) => (current ? { ...current, x2: point.x, y2: point.y } : current));
    };
    const up = () => finish();
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [dragging, finish, pointFrom]);

  const box = drag
    ? {
        left: `${Math.min(drag.x1, drag.x2) * 100}%`,
        top: `${Math.min(drag.y1, drag.y2) * 100}%`,
        width: `${Math.abs(drag.x2 - drag.x1) * 100}%`,
        height: `${Math.abs(drag.y2 - drag.y1) * 100}%`,
      }
    : null;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-auto overscroll-contain p-6" data-testid="reader-image-scroll">
      <div className="m-auto flex flex-col items-center gap-3">
        <div className="nemesis-reader-canvas relative" ref={frameRef}>
          {/* eslint-disable-next-line @next/next/no-img-element -- a private, short-lived signed URL; next/image cannot optimize it */}
          <img
            alt={fileName}
            className="nemesis-reader-image block max-w-none select-none"
            draggable={false}
            onLoad={(event) => {
              const image = event.currentTarget;
              onNaturalSize({ width: image.naturalWidth, height: image.naturalHeight });
            }}
            onPointerDown={(event) => {
              if (!canSelect || event.button !== 0) return;
              const point = pointFrom(event);
              if (!point) return;
              event.preventDefault();
              setDrag({ x1: point.x, y1: point.y, x2: point.x, y2: point.y });
              setDragging(true);
            }}
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
