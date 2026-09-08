// Typography. The only way to render type in this application.
//
// Canonical source: /design/TOKENS.md §2, /design/COMPONENTS.md §1.
//
// 🔴🔴 SIZE, WEIGHT, LINE HEIGHT AND TRACKING TRAVEL TOGETHER, ALWAYS. A call site picks a
// variant, never a size, because the four values are one decision. Letter spacing in particular is
// never set by hand: measured across all five references, sans tracking is POSITIVE below 12px and
// increasingly NEGATIVE above, plateauing near -0.025em (Figma app 11px/+0.055px, Figma 18px/
// -0.075px, champ 32px/-0.8px, x.ai 60px/-1.5px). That curve is baked into the type utilities in
// app/styles/design-tokens.css and cannot be got right by eye.
//
// 🔴 TWO DENSITIES, NEVER MIXED IN ONE REGION. `ui` (12px) is chrome. `body` (16px) and `body-lg`
// (18px) are content. There is no 14px chrome and no 12px prose. This is the rule that most
// separates a designed application from a generated one, and Figma proves it inside its own brand:
// their app runs at 11px with 4px radii, their marketing site at 16px with 24px radii. Our app
// currently uses landing-page proportions on working surfaces, which is most of why it reads as
// generic.
//
// The app carries 24 distinct hard-coded font sizes across 401 uses today, including `text-[12.5px]`
// and `text-[13.5px]`. This component is how that number reaches zero.

import type { ElementType, ReactNode } from "react";

import { cn } from "@/lib/utils";

export const TEXT_VARIANTS = [
  "meta",
  "caption",
  "ui",
  "ui-lg",
  "body",
  "body-lg",
  "title-sm",
  "title",
  "display",
] as const;
export type TextVariant = (typeof TEXT_VARIANTS)[number];

export const TEXT_TONES = ["primary", "secondary", "muted", "disabled", "danger", "inverse"] as const;
export type TextTone = (typeof TEXT_TONES)[number];

const VARIANT_CLASS: Record<TextVariant, string> = {
  meta: "type-meta",
  caption: "type-caption",
  ui: "type-ui",
  "ui-lg": "type-ui-lg",
  body: "type-body",
  "body-lg": "type-body-lg",
  "title-sm": "type-title-sm",
  title: "type-title",
  display: "type-display",
};

const TONE_CLASS: Record<TextTone, string> = {
  primary: "tone-primary",
  secondary: "tone-secondary",
  muted: "tone-muted",
  disabled: "tone-disabled",
  danger: "tone-danger",
  inverse: "tone-inverse",
};

export interface TextProps {
  variant?: TextVariant;
  tone?: TextTone;
  as?: ElementType;
  className?: string;
  children?: ReactNode;
  /** Clamp to one line with an ellipsis. */
  truncate?: boolean;
  title?: string;
  id?: string;
  htmlFor?: string;
}

export function Text({
  variant = "body",
  tone = "primary",
  as,
  className,
  truncate,
  children,
  ...rest
}: TextProps) {
  const Component = as ?? "span";
  return (
    <Component className={cn(VARIANT_CLASS[variant], TONE_CLASS[tone], truncate && "block truncate", className)} {...rest}>
      {children}
    </Component>
  );
}

/**
 * 🔴🔴 VISUAL LEVEL AND SEMANTIC LEVEL ARE DECOUPLED, DELIBERATELY. `level` picks the heading
 * ELEMENT, for screen readers and document outline; `variant` picks how it LOOKS. A section that
 * must be an `<h2>` for accessibility can still be set at `ui-lg`, which is what a dense workspace
 * usually wants. Tying the two together is why so many applications either shout or lie to a
 * screen reader.
 *
 * 🔴 THE DEFAULT FOR `display` IS WEIGHT 450, NOT BOLD, and that is not a nicety: not one of the
 * five measured references sets a heading at 700, and three set display type at 400 (x.ai 60px/400,
 * Figma 88px/400). Presence comes from size and negative tracking. `text-4xl font-bold` is the
 * signature of a generated interface.
 */
const LEVEL_DEFAULT: Record<1 | 2 | 3 | 4, TextVariant> = {
  1: "display",
  2: "title",
  3: "title-sm",
  4: "ui-lg",
};

export function Heading({
  level = 2,
  variant,
  ...rest
}: Omit<TextProps, "as"> & { level?: 1 | 2 | 3 | 4 }) {
  return <Text as={`h${level}`} variant={variant ?? LEVEL_DEFAULT[level]} {...rest} />;
}
