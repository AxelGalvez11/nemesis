import type { CSSProperties } from "react";
import { EB_Garamond } from "next/font/google";

const serif = EB_Garamond({ subsets: ["latin"], weight: ["500"], display: "swap" });

/**
 * A row of names drifting sideways without end, the way Sana runs its customer logos under the hero.
 *
 * Owner, 2026-09-10: "a sort of Harvard, like top universities banner scrolling horizontally across
 * the page somewhere so it looks professional". 2026-09-11: "add like the actual logos of the
 * universities".
 *
 * 🔴🔴 NEVER A REAL SCHOOL'S SEAL OR WORDMARK. A university's crest is a trademark it actively
 * polices, and the only way to put one on a page that says "used by" is a licence from that school —
 * we have none. This is the same rule this codebase already keeps for Sana's own assets ("Do not
 * copy Sana's proprietary source code, branding, copyrighted illustrations, text, logos, or private
 * assets"), applied to sixteen more brand owners instead of one.
 *
 * 🔴 WHAT'S HERE INSTEAD: `Badge` is ONE mark, identical for every row, in our own geometry (the same
 * superellipse the character and the Nemesis mark are built from — see body.ts / NemesisMark.tsx).
 * It reads as "an institution" the way a plaque or a seal SHAPE does, without claiming to be anyone's
 * actual seal. No school gets its own badge; that sameness is what keeps it from becoming sixteen
 * small trademark problems.
 *
 * 🔴 THE LABEL MUST NOT CLAIM MORE THAN IS TRUE. A row of school names under a hero reads as "our
 * customers" whatever it says, so the words above it have to be literally true. Owner, 2026-09-10,
 * confirming real usage: "just say used by real students at these top Ivy League universities...
 * It's true" — see app/page.tsx for why the claim stays about individual students, never the schools
 * themselves. home.test.ts guards both halves: the claim exists, and it never grows into "partnered
 * with" or "official".
 *
 * Motion: one transform on the track, from 0 to -50%, over a list rendered twice, so the loop has no
 * seam and runs on the compositor at the display's own frame rate. Hover pauses it; reduced motion
 * stops it and wraps the names.
 */

/** One neutral institutional mark, drawn from the app's own geometry — not any school's crest.
 *  A shield built the same way the character's body is (superellipse n = 4.2), split by a single
 *  band, the way a seal's ribbon splits one. Every row gets the same badge. */
function Badge() {
  return (
    <svg className="sn-mq-badge" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path d="M16 2c4.8 2.6 8.4 3.6 12.5 3.6 0 13.6-5 20.4-12.5 24.4C8.5 26 3.5 19.2 3.5 5.6 7.6 5.6 11.2 4.6 16 2Z" />
      <path className="sn-mq-badge-band" d="M6.6 15.4h18.8" />
    </svg>
  );
}

export function Marquee({ label, items, seconds = 64, className }: { label: string; items: string[]; seconds?: number; className?: string }) {
  const style = { "--sn-mq-s": `${seconds}s` } as CSSProperties;
  return (
    <section className={["sn-mq", className].filter(Boolean).join(" ")} aria-label={label}>
      <p className="sn-mq-label">{label}</p>
      <div className="sn-mq-view">
        <ul className={`sn-mq-track ${serif.className}`} style={style}>
          {items.concat(items).map((name, i) => (
            <li key={`${name}-${i}`} aria-hidden={i >= items.length ? true : undefined}>
              <Badge />
              {name}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
