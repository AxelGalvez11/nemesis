"use client";

import { useEffect, useState } from "react";

import { resolveStudyImageUrl } from "@/lib/workspace/study-cloud-store";
import { occlusionMaskState, type OcclusionPayload } from "@nemesis/shared";
import { cn } from "@/lib/utils";

interface OcclusionCardViewProps {
  payload: OcclusionPayload;
  revealed: boolean;
  className?: string;
}

/**
 * The review-time face of an image occlusion card: the shared image with each
 * mask drawn in its current state. Coordinates live in natural-image pixels,
 * so the viewBox scales everything together at any display size.
 */
export function OcclusionCardView({ payload, revealed, className }: OcclusionCardViewProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    setError(null);
    resolveStudyImageUrl(payload.image)
      .then((resolved) => {
        if (!cancelled) setUrl(resolved);
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Couldn't load the card image.");
      });
    return () => {
      cancelled = true;
    };
  }, [payload.image]);

  if (error) {
    return <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive" role="alert">{error}</p>;
  }

  // Stroke widths and corner radii are in image pixels, so scale them with
  // the image to look constant on screen regardless of resolution.
  const unit = Math.max(1, Math.min(payload.width, payload.height) / 300);
  return (
    <svg
      aria-label={revealed ? "Image with the answer revealed" : "Image with a region hidden"}
      className={cn("mx-auto block h-auto max-h-[min(52vh,34rem)] w-auto max-w-full rounded-xl border border-(--ui-stroke-secondary) bg-white", className)}
      height={payload.height}
      role="img"
      viewBox={`0 0 ${payload.width} ${payload.height}`}
      width={payload.width}
    >
      {url && <image height={payload.height} href={url} width={payload.width} />}
      {payload.shapes.map((shape) => {
        const state = occlusionMaskState(shape.id, payload, revealed);
        if (state === "clear") return null;
        const isTarget = state !== "covered";
        return (
          <rect
            fill={state === "target-revealed" ? "none" : "#52525b"}
            height={shape.h}
            key={shape.id}
            rx={4 * unit}
            stroke={isTarget ? "hsl(var(--destructive))" : "#3f3f46"}
            strokeWidth={(isTarget ? 2.5 : 1.25) * unit}
            width={shape.w}
            x={shape.x}
            y={shape.y}
          />
        );
      })}
    </svg>
  );
}
