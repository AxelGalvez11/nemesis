import type { CSSProperties } from "react";
import { EB_Garamond } from "next/font/google";

const serif = EB_Garamond({ subsets: ["latin"], weight: ["500"], display: "swap" });

/**
 * A row of names drifting sideways without end, the way Sana runs its customer logos under the hero.
 *
 * Owner, 2026-09-10: "a sort of Harvard, like top universities banner scrolling horizontally across
 * the page somewhere so it looks professional".
 *
 * 🔴 NAMES IN TYPE, NEVER CRESTS OR LOGOS. A university's seal and wordmark are trademarks it
 * polices, and borrowing them implies a relationship Nemesis does not have. Every name is set in the
 * same serif so no row imitates any one school's identity.
 *
 * 🔴 THE LABEL MUST NOT CLAIM THESE SCHOOLS USE NEMESIS. A row of school names under a hero reads as
 * "our customers" whatever it says, so the words above it have to be literally true: Nemesis reads a
 * course from any school. "Trusted by" or "used at" needs real students from those schools first, the
 * same rule that keeps fake testimonials off these pages. variations.test.ts refuses those phrases.
 *
 * Motion: one transform on the track, from 0 to -50%, over a list rendered twice, so the loop has no
 * seam and runs on the compositor at the display's own frame rate. Hover pauses it; reduced motion
 * stops it and wraps the names.
 */
export function Marquee({ label, items, seconds = 64, className }: { label: string; items: string[]; seconds?: number; className?: string }) {
  const style = { "--sn-mq-s": `${seconds}s` } as CSSProperties;
  return (
    <section className={["sn-mq", className].filter(Boolean).join(" ")} aria-label={label}>
      <p className="sn-mq-label">{label}</p>
      <div className="sn-mq-view">
        <ul className={`sn-mq-track ${serif.className}`} style={style}>
          {items.concat(items).map((name, i) => (
            <li key={`${name}-${i}`} aria-hidden={i >= items.length ? true : undefined}>
              {name}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
