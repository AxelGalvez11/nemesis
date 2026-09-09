"use client";

import { useId } from "react";

/**
 * The artwork that fills every image slot on the landing page.
 *
 * WHY THIS EXISTS. figma.com's page is carried by product screenshots: a 581x700 hero video and
 * rows of 348x433 cards, each a real shot of their app. We are redesigning the app right now, so
 * shipping today's screens onto the marketing page would put a picture of something that is about
 * to change in front of every visitor. Owner, 2026-09-09: use gradients until the in-app work
 * lands. So the STRUCTURE is Figma's and the CONTENT of each frame is generated here.
 *
 * 🔴 THIS IS NOT "ADD GRADIENTS TO THE PAGE". The page ground stays one flat white with an 80px
 * section rhythm, exactly as measured on figma.com, which carries precisely ONE gradient across
 * 8,973px. Colour appears only INSIDE the frames where the reference has a photograph. Scatter
 * washes behind the type and the page stops looking like Figma and starts looking like every
 * other AI landing page.
 *
 * 🔴 THE GRAIN IS THE WHOLE TRICK. A plain CSS gradient reads as cheap because it is mathematically
 * smooth and banding is visible on any 8-bit display. Real gradient artwork is dithered. The
 * feTurbulence layer below is what separates this from a `linear-gradient` in a div, and it costs
 * one inline SVG per panel with no image request.
 *
 * Colours are the product's own: the same deep #062E86 through cobalt, azure, sky and cyan that
 * the sign-in wash and the launch film use, so the marketing page and the first screen of the app
 * are recognisably one thing.
 */

export type GradientVariant = "deep" | "cyan" | "azure" | "dusk" | "ice" | "cobalt";

/** Each variant is a MESH: several large radial stops with transparent falloff over a linear base.
 *  Two-stop linear gradients are the thing that reads as a template; a mesh has a light direction. */
const MESH: Record<GradientVariant, string> = {
  deep: [
    "radial-gradient(78% 62% at 12% 8%, rgba(84,212,237,0.92) 0%, rgba(84,212,237,0) 62%)",
    "radial-gradient(70% 58% at 88% 18%, rgba(115,184,250,0.85) 0%, rgba(115,184,250,0) 60%)",
    "radial-gradient(90% 72% at 78% 92%, rgba(42,140,205,0.90) 0%, rgba(42,140,205,0) 66%)",
    "radial-gradient(85% 70% at 22% 88%, rgba(11,96,180,0.95) 0%, rgba(11,96,180,0) 64%)",
    "linear-gradient(148deg, #0b60b4 0%, #062e86 52%, #0a4ea0 100%)",
  ].join(","),
  cyan: [
    "radial-gradient(84% 70% at 18% 22%, rgba(158,240,255,0.95) 0%, rgba(158,240,255,0) 58%)",
    "radial-gradient(76% 64% at 82% 10%, rgba(84,212,237,0.90) 0%, rgba(84,212,237,0) 60%)",
    "radial-gradient(92% 76% at 70% 96%, rgba(42,140,205,0.85) 0%, rgba(42,140,205,0) 64%)",
    "linear-gradient(160deg, #2a8ccd 0%, #0b60b4 60%, #073a92 100%)",
  ].join(","),
  azure: [
    "radial-gradient(80% 66% at 26% 14%, rgba(115,184,250,0.95) 0%, rgba(115,184,250,0) 60%)",
    "radial-gradient(88% 70% at 90% 74%, rgba(84,212,237,0.80) 0%, rgba(84,212,237,0) 62%)",
    "radial-gradient(70% 60% at 8% 92%, rgba(6,46,134,0.90) 0%, rgba(6,46,134,0) 58%)",
    "linear-gradient(136deg, #0a4ea0 0%, #2a8ccd 55%, #0b60b4 100%)",
  ].join(","),
  /* The one warm variant. A page of six blues is a swatch book; one panel that disagrees is what
     makes the other five read as a deliberate palette rather than a default. */
  dusk: [
    "radial-gradient(82% 68% at 22% 18%, rgba(255,168,142,0.85) 0%, rgba(255,168,142,0) 58%)",
    "radial-gradient(78% 64% at 86% 24%, rgba(186,140,255,0.85) 0%, rgba(186,140,255,0) 60%)",
    "radial-gradient(94% 78% at 62% 98%, rgba(11,96,180,0.90) 0%, rgba(11,96,180,0) 66%)",
    "linear-gradient(152deg, #4a2f8f 0%, #16307e 58%, #062e86 100%)",
  ].join(","),
  /* The light one. Used where the panel sits next to type and a deep field would shout. */
  ice: [
    "radial-gradient(86% 72% at 20% 16%, rgba(255,255,255,0.96) 0%, rgba(255,255,255,0) 56%)",
    "radial-gradient(78% 66% at 84% 20%, rgba(158,240,255,0.78) 0%, rgba(158,240,255,0) 58%)",
    "radial-gradient(88% 74% at 72% 94%, rgba(115,184,250,0.72) 0%, rgba(115,184,250,0) 62%)",
    "linear-gradient(150deg, #dff2fb 0%, #b9dcf6 54%, #8fc4ee 100%)",
  ].join(","),
  cobalt: [
    "radial-gradient(74% 62% at 14% 12%, rgba(115,184,250,0.80) 0%, rgba(115,184,250,0) 58%)",
    "radial-gradient(96% 80% at 88% 88%, rgba(84,212,237,0.70) 0%, rgba(84,212,237,0) 64%)",
    "linear-gradient(142deg, #062e86 0%, #0a4ea0 62%, #0b60b4 100%)",
  ].join(","),
};

interface GradientArtProps {
  variant?: GradientVariant;
  /** Corner radius in px. The page's frames differ, so the caller owns this. */
  radius?: number;
  /** Slow drift. Off for the small cards, where six things breathing at once is noise. */
  drift?: boolean;
  className?: string;
  style?: React.CSSProperties;
  /** Optional label rendered over the art, e.g. a caption inside a product frame. */
  children?: React.ReactNode;
}

export function GradientArt({
  variant = "deep",
  radius = 24,
  drift = false,
  className,
  style,
  children,
}: GradientArtProps) {
  // The grain filter needs an id unique per instance, or every panel on the page shares the
  // first one's turbulence. This is the same class of fault as the React Flow pattern-id
  // collision that painted every board dot the wrong colour for the life of that feature.
  const id = useId().replace(/:/g, "");

  return (
    <div
      className={["grad-art", drift ? "is-drifting" : "", className].filter(Boolean).join(" ")}
      style={{ borderRadius: radius, ...style }}
    >
      <div className="grad-art-mesh" style={{ background: MESH[variant] }} />

      {/* THE GRAIN. feTurbulence at a high base frequency is film grain; the desaturate keeps it
          neutral so it does not tint the colour underneath. 0.16 opacity is the point where it
          kills banding without reading as texture. */}
      <svg className="grad-art-grain" aria-hidden="true" focusable="false">
        <filter id={`grain-${id}`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.82" numOctaves="3" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter={`url(#grain-${id})`} />
      </svg>

      {/* A single light shaft gives the panel a direction. Without it a mesh reads as a blob. */}
      <div className="grad-art-shaft" aria-hidden="true" />

      {children ? <div className="grad-art-body">{children}</div> : null}
    </div>
  );
}
