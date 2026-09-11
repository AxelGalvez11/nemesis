// Surfaces and layout primitives.
//
// Canonical source: /design/TOKENS.md §3, §4, §6; /design/COMPONENTS.md §1, §7.
//
// 🔴🔴 HIERARCHY BEFORE CONTAINERS. /design/DESIGN.md §3 gives the order to reach for: whitespace,
// then typography, then a hairline, then a background step, then a container, then a shadow. Most
// of our current screens start at "container". A CARD IS AN ADMISSION THAT THE FIRST FOUR FAILED,
// which is why `Card` lives at the bottom of this file rather than the top.
//
// 🔴 THERE IS NO TIGHT SHADOW ANYWHERE. `raised` is a BORDER. Figma ships exactly two elevations
// for its entire product, both 10% opacity with a very wide blur and almost no offset; Sana's
// application chrome has effectively none. A `0 1px 2px` is the clearest single signature of a
// generated interface.

import type { CSSProperties, ElementType, ReactNode } from "react";

import { cn } from "@/lib/utils";

export const SPACE = [2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48, 64] as const;
export type Space = (typeof SPACE)[number];

export const RADII = [2, 4, 6, 8, 12, "full"] as const;
export type Radius = (typeof RADII)[number];

export const ELEVATIONS = ["flat", "sunken", "raised", "floating", "overlay"] as const;
export type Elevation = (typeof ELEVATIONS)[number];

const ELEV_CLASS: Record<Elevation, string> = {
  flat: "surface-flat",
  sunken: "surface-sunken",
  raised: "surface-raised",
  floating: "surface-floating",
  overlay: "surface-overlay",
};

const radiusVar = (r: Radius) => (r === "full" ? "var(--radius-full)" : `var(--radius-${r})`);
const spaceVar = (s: Space) => `var(--space-${s})`;

export interface SurfaceProps {
  level?: Elevation;
  radius?: Radius;
  padding?: Space;
  border?: boolean;
  as?: ElementType;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

export function Surface({
  level = "flat",
  radius,
  padding,
  border,
  as,
  className,
  style,
  children,
  ...rest
}: SurfaceProps) {
  const Component = as ?? "div";
  return (
    <Component
      className={cn(ELEV_CLASS[level], border && "border", className)}
      style={{
        ...(radius !== undefined ? { borderRadius: radiusVar(radius) } : null),
        ...(padding !== undefined ? { padding: spaceVar(padding) } : null),
        ...(border ? { borderColor: "var(--border-default)" } : null),
        ...style,
      }}
      {...rest}
    >
      {children}
    </Component>
  );
}

/**
 * 🔴 `gap` TAKES A SCALE VALUE, NOT A PIXEL. The app carries 210 distinct arbitrary spacing values
 * across 1,142 uses, which is the single largest source of visual noise in the product. Almost all
 * of them are a one-off `flex gap-[14px]` in feature code, and almost all of them become one of
 * these twelve steps.
 */
interface FlexProps {
  gap?: Space;
  align?: "start" | "center" | "end" | "stretch" | "baseline";
  justify?: "start" | "center" | "end" | "between";
  wrap?: boolean;
  as?: ElementType;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

const ALIGN = { start: "items-start", center: "items-center", end: "items-end", stretch: "items-stretch", baseline: "items-baseline" };
const JUSTIFY = { start: "justify-start", center: "justify-center", end: "justify-end", between: "justify-between" };

function flex(direction: "col" | "row") {
  return function Flex({ gap, align, justify, wrap, as, className, style, children, ...rest }: FlexProps) {
    const Component = as ?? "div";
    return (
      <Component
        className={cn(
          "flex",
          direction === "col" ? "flex-col" : "flex-row",
          align && ALIGN[align],
          justify && JUSTIFY[justify],
          wrap && "flex-wrap",
          className,
        )}
        style={{ ...(gap !== undefined ? { gap: spaceVar(gap) } : null), ...style }}
        {...rest}
      >
        {children}
      </Component>
    );
  };
}

export const Stack = flex("col");
export const Row = flex("row");

/**
 * 🔴 THE READING COLUMN IS 672px AND IT DOES NOT GROW ON A LARGE MONITOR. Measured independently at
 * x.ai and Figma, and it is Tailwind's `max-w-2xl`. Prose wider than roughly 70 characters costs
 * comprehension; on a wide screen the answer is more margin, not more width.
 */
export function Container({
  width = "content",
  className,
  children,
  as,
}: {
  width?: "reading" | "content" | "full";
  className?: string;
  children?: ReactNode;
  as?: ElementType;
}) {
  const Component = as ?? "div";
  return (
    <Component
      className={cn("mx-auto w-full px-(--space-16) md:px-(--space-24) lg:px-(--space-32)", className)}
      style={width === "full" ? undefined : { maxWidth: width === "reading" ? "var(--reading-column)" : "var(--content-max)" }}
    >
      {children}
    </Component>
  );
}

/**
 * 🔴🔴 A CARD IS A LAST RESORT, AND NESTING ONE IS FORBIDDEN. /design/ANTI_PATTERNS.md: if you have
 * put a card inside a card, one of them should have been a section with a heading and some space.
 * The reference applications barely use cards at all: Sana's chrome has effectively none, and
 * Figma's file browser is rows on a plain ground.
 */
export function Card({ padding = 16, className, children, ...rest }: Omit<SurfaceProps, "level" | "border">) {
  return (
    <Surface border className={className} level="raised" padding={padding} radius={8} {...rest}>
      {children}
    </Surface>
  );
}

/** A hairline. Never two within 16px of each other. */
export function Divider({ className, vertical }: { className?: string; vertical?: boolean }) {
  return (
    <div
      aria-orientation={vertical ? "vertical" : "horizontal"}
      className={cn(vertical ? "w-px self-stretch" : "h-px w-full", className)}
      role="separator"
      style={{ background: "var(--border-subtle)" }}
    />
  );
}
