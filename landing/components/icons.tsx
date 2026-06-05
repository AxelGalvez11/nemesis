// SVG icons ported verbatim from the design prototype. Each mirrors the exact markup
// (viewBox, stroke/fill, paths) so the rendered output stays pixel-identical.

import type { FeaturedIcon } from "@/lib/demoData";

export function BrandMark({ size = 26 }: { size?: number }) {
  const height = Math.round((size / 26) * 29);
  // Unique gradient ids per instance so multiple marks (nav + footer) don't collide.
  const id = size >= 24 ? "nl" : "fl";
  const oid = size >= 24 ? "no" : "fo";
  return (
    <svg width={size} height={height} viewBox="0 0 40 44" fill="none">
      <defs>
        <linearGradient id={id} x1="12" y1="6" x2="28" y2="38" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#DDFF99" />
          <stop offset="55%" stopColor="#C8FF52" />
          <stop offset="100%" stopColor="#99EE00" />
        </linearGradient>
        <radialGradient id={oid} cx="50%" cy="42%" r="55%">
          <stop offset="0%" stopColor="#F4FFCC" />
          <stop offset="45%" stopColor="#BEFF66" />
          <stop offset="100%" stopColor="#AAFF00" />
        </radialGradient>
      </defs>
      <path d="M12.5 7 A15 15 0 1 1 27.5 33" stroke={`url(#${id})`} strokeWidth="4.5" strokeLinecap="round" fill="none" />
      <path d="M27.5 33 Q35 40 28 43 Q22 44 22 40" stroke="#99EE00" strokeWidth="4" strokeLinecap="round" fill="none" />
      <circle cx="20" cy="19" r="7.5" fill={`url(#${oid})`} />
    </svg>
  );
}

export function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <line x1="12" y1="2" x2="12" y2="5" />
      <line x1="12" y1="19" x2="12" y2="22" />
      <line x1="4.22" y1="4.22" x2="6.34" y2="6.34" />
      <line x1="17.66" y1="17.66" x2="19.78" y2="19.78" />
      <line x1="2" y1="12" x2="5" y2="12" />
      <line x1="19" y1="12" x2="22" y2="12" />
      <line x1="4.22" y1="19.78" x2="6.34" y2="17.66" />
      <line x1="17.66" y1="6.34" x2="19.78" y2="4.22" />
    </svg>
  );
}

export function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

export function SearchIcon({ size = 22, strokeWidth = 1.75 }: { size?: number; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}

export function PrecautionIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

export function FeaturedQueryIcon({ icon }: { icon: FeaturedIcon }) {
  const common = {
    width: 14,
    height: 14,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2.2,
    strokeLinecap: "round" as const,
  };
  switch (icon) {
    case "triangle-alert":
      return (
        <svg {...common}>
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      );
    case "star":
      return (
        <svg {...common}>
          <path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      );
    case "shield":
      return (
        <svg {...common}>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      );
    case "link":
      return (
        <svg {...common}>
          <path d="M9.5 14.5 3 21" />
          <path d="M15 9l-6 6" />
          <circle cx="17.5" cy="6.5" r="3.5" />
        </svg>
      );
  }
}

// Feature-card icons (fill via explicit #AAFF00 stroke as in the prototype).
export function FeatTraceIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2v-4M9 21H5a2 2 0 0 1-2-2v-4m0 0h18" stroke="#AAFF00" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

export function FeatFollowIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" stroke="#AAFF00" strokeWidth="1.75" strokeLinejoin="round" />
    </svg>
  );
}

export function FeatShieldIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="#AAFF00" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
