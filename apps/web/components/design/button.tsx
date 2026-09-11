// Buttons.
//
// Canonical source: /design/COMPONENTS.md §2, /design/TOKENS.md §5.
//
// 🔴🔴 THE PRIMARY BUTTON IS INK, NEVER THE ACCENT. Measured on Sana's own primary control:
// `background: rgb(10,18,23)` with white text, while their brand lime sits at `#cdfe00` and is used
// only as a decorative background. This is the single biggest reason their product reads as calm:
// a user never has to hunt for the coloured thing to proceed. Our accent belongs to the character,
// and the interface does not compete with the mascot.
//
// 🔴 FOUR SIZES, AND A SURFACE USES TWO. Chrome takes `sm` to `lg` at radius 6. `content` is the
// learner-facing size and the ONLY pill, following /design/REFERENCE_CONFLICTS.md §1: the closer a
// control is to the learner's content, the rounder it gets. Every reference application uses
// exactly two heights (Figma 32/24, Sana 36/28); five heights is how a system drifts.
//
// 🔴 A LOADING BUTTON KEEPS ITS WIDTH. Swapping the label for a spinner reflows the row and moves
// whatever sits beside it, which is a real bug and not a detail.

import type { ButtonHTMLAttributes, ReactNode } from "react";

import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

import { Icon, ICON_FOR_CONTROL, type IconSize } from "./icon";

export const BUTTON_VARIANTS = ["primary", "secondary", "ghost", "danger"] as const;
export type ButtonVariant = (typeof BUTTON_VARIANTS)[number];

export const BUTTON_SIZES = ["sm", "md", "lg", "content"] as const;
export type ButtonSize = (typeof BUTTON_SIZES)[number];

const SIZE: Record<ButtonSize, { height: string; padding: string; type: string; radius: string; icon: IconSize; gap: string }> = {
  sm: { height: "var(--control-compact)", padding: "0 var(--space-8)", type: "type-ui", radius: "var(--radius-6)", icon: 14, gap: "var(--space-6)" },
  md: { height: "var(--control-standard)", padding: "0 var(--space-12)", type: "type-ui", radius: "var(--radius-6)", icon: 16, gap: "var(--space-6)" },
  lg: { height: "var(--control-comfortable)", padding: "0 var(--space-12)", type: "type-ui-lg", radius: "var(--radius-6)", icon: 16, gap: "var(--space-8)" },
  content: { height: "var(--control-large)", padding: "0 var(--space-16)", type: "type-body", radius: "var(--radius-full)", icon: 20, gap: "var(--space-8)" },
};

const VARIANT: Record<ButtonVariant, { className: string; style: React.CSSProperties }> = {
  primary: { className: "tone-inverse", style: { background: "var(--text-primary)", border: "1px solid transparent" } },
  secondary: { className: "tone-primary hover:bg-(--bg-hover)", style: { background: "transparent", border: "1px solid var(--border-default)" } },
  ghost: { className: "tone-secondary hover:bg-(--bg-hover) hover:tone-primary", style: { background: "transparent", border: "1px solid transparent" } },
  danger: { className: "tone-danger hover:bg-(--danger-bg)", style: { background: "transparent", border: "1px solid var(--border-default)" } },
};

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  iconStart?: LucideIcon;
  iconEnd?: LucideIcon;
  loading?: boolean;
  className?: string;
  children?: ReactNode;
}

export function Button({
  variant = "secondary",
  size = "md",
  iconStart,
  iconEnd,
  loading,
  disabled,
  className,
  children,
  style,
  ...rest
}: ButtonProps) {
  const s = SIZE[size];
  const v = VARIANT[variant];
  return (
    <button
      className={cn(
        "focus-ring inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap",
        // 🔴 THE PROPERTIES ARE NAMED, NEVER `transition: all`. `all` animates layout too and is a
        // common source of jank. Background moves at --dur-instant (40ms, about 1.2 frames) because
        // hover feedback should feel connected to the pointer; Sana uses 0.02s for exactly this.
        "transition-[background-color,box-shadow,color] duration-(--dur-instant) ease-(--ease-standard)",
        "disabled:pointer-events-none disabled:opacity-40",
        s.type,
        v.className,
        className,
      )}
      disabled={disabled || loading}
      style={{ height: s.height, padding: s.padding, borderRadius: s.radius, gap: s.gap, ...v.style, ...style }}
      type="button"
      {...rest}
    >
      {/* 🔴 THE SPINNER REPLACES THE ICON SLOT, NOT THE LABEL, so the button keeps its width. */}
      {loading ? <Spinner size={s.icon} /> : iconStart ? <Icon icon={iconStart} size={s.icon} tone="inherit" /> : null}
      {children}
      {iconEnd && !loading ? <Icon icon={iconEnd} size={s.icon} tone="inherit" /> : null}
    </button>
  );
}

export const ICON_BUTTON_SIZES = [24, 28, 32, 36] as const;
export type IconButtonSize = (typeof ICON_BUTTON_SIZES)[number];

/**
 * 🔴 AN ICON BUTTON REQUIRES A LABEL. It is the whole accessible name; there is no text to fall
 * back on. TypeScript makes it required rather than leaving it to review.
 *
 * 🔴 THE GLYPH SIZE IS DERIVED, NOT PASSED, so the 50 to 60% glyph-to-box ratio measured on Sana
 * and Figma cannot be broken at a call site.
 */
export function IconButton({
  icon,
  label,
  size = 28,
  variant = "ghost",
  pill,
  className,
  style,
  disabled,
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children"> & {
  icon: LucideIcon;
  label: string;
  size?: IconButtonSize;
  variant?: ButtonVariant;
  pill?: boolean;
  className?: string;
}) {
  const v = VARIANT[variant];
  return (
    <button
      aria-label={label}
      className={cn(
        "focus-ring inline-flex shrink-0 items-center justify-center",
        "transition-[background-color,box-shadow,color] duration-(--dur-instant) ease-(--ease-standard)",
        "disabled:pointer-events-none disabled:opacity-40",
        v.className,
        className,
      )}
      disabled={disabled}
      style={{ width: size, height: size, borderRadius: pill ? "var(--radius-full)" : "var(--radius-6)", ...v.style, ...style }}
      title={label}
      type="button"
      {...rest}
    >
      <Icon icon={icon} size={ICON_FOR_CONTROL[size] ?? 16} tone="inherit" />
    </button>
  );
}

function Spinner({ size }: { size: number }) {
  return (
    <svg aria-hidden className="animate-spin" height={size} viewBox="0 0 16 16" width={size}>
      <circle cx="8" cy="8" fill="none" opacity="0.25" r="6.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 1.5a6.5 6.5 0 0 1 6.5 6.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
    </svg>
  );
}
