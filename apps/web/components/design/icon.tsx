// The single icon entry point.
//
// Canonical source: /design/ICONS.md.
//
// 🔴🔴 ONE LIBRARY, ONE STROKE WEIGHT. We ship TWO icon libraries today, lucide-react in 28 files
// and @tabler/icons-react in 22, with different stroke weights, different corner treatments and
// different metrics. Mixing them is visible on screen. Lucide wins because it is already the larger
// half and its geometry is closest to the references; tabler is being removed.
//
// 🔴 STROKE 1.5, NOT LUCIDE'S DEFAULT OF 2. Measured: Figma draws at 1.25, x.ai at 1.75. Lucide's
// stock 2.0 reads noticeably heavier than any reference beside 12px text. 1.5 sits between the two
// measured values and is set HERE, once, so it cannot drift across 50 call sites.
//
// 🔴 ICONS USE THE `--icon-*` TONES, NEVER THE TEXT TONES, and that is not tidiness. A glyph is a
// solid mass and a letterform is not, so an icon at the label's alpha reads HEAVIER than the label.
// `--icon-primary` is 80% ink where `--text-primary` is 100%. Figma keeps the two namespaces apart
// for exactly this reason. Ours currently share the text colour, which is why our icons look
// slightly too loud next to their labels.

import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/** The five allowed sizes. 18 is deliberately absent: too close to 16 to justify a step. */
export const ICON_SIZES = [12, 14, 16, 20, 24] as const;
export type IconSize = (typeof ICON_SIZES)[number];

export const ICON_TONES = ["primary", "secondary", "muted", "inherit"] as const;
export type IconTone = (typeof ICON_TONES)[number];

const TONE_CLASS: Record<IconTone, string> = {
  primary: "itone-primary",
  secondary: "itone-secondary",
  muted: "itone-muted",
  inherit: "itone-inherit",
};

/**
 * 🔴 THE GLYPH IS 50 TO 60% OF ITS BUTTON, AND IT IS THE RATIO THAT IS THE RULE, not the pixel
 * value. Measured on Sana (28px button / 14 to 16px glyph, 36px button / 16 to 20px glyph) and
 * Figma (24 and 32px boxes with the glyph inset). A control that picks its own icon size breaks the
 * ratio and reads either weedy or crowded.
 */
export const ICON_FOR_CONTROL: Record<number, IconSize> = {
  24: 14,
  28: 16,
  32: 16,
  36: 20,
  44: 20,
};

export interface IconProps {
  /** A Lucide icon component. Importing from lucide-react in feature code is a lint error. */
  icon: LucideIcon;
  size?: IconSize;
  tone?: IconTone;
  className?: string;
  /** Decorative by default. Give a label only when the icon is the sole carrier of meaning. */
  label?: string;
}

export function Icon({ icon: Glyph, size = 16, tone = "secondary", className, label }: IconProps) {
  return (
    <Glyph
      aria-hidden={label ? undefined : true}
      aria-label={label}
      className={cn("shrink-0", TONE_CLASS[tone], className)}
      focusable="false"
      role={label ? "img" : undefined}
      // 🔴 EXPLICIT WIDTH AND HEIGHT, NOT A CLASS. A `size-4` utility can be overridden by a parent's
      // `[&_svg]` selector, which is exactly how our current icons drift; an attribute cannot.
      height={size}
      strokeWidth={1.5}
      width={size}
    />
  );
}
