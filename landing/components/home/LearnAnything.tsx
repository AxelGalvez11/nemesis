"use client";

import Image from "next/image";

import { useParallax } from "@/components/use-parallax";
import { LEARN_BLUR, LEARN_FIGURE_BLUR } from "./art-blur";

/**
 * "Learn anything", centred, inside a ring of subjects.
 *
 * ── WHY A RING AND NOT A LIST ─────────────────────────────────────────────────
 *
 * A list has a first item and a last one, and whichever subject leads reads as the
 * one the product is really for. That is exactly the impression this section has to
 * avoid: the standing rule in CLAUDE.md is that Nemesis is field-agnostic, and the
 * design test is whether a feature works for a law student and a mechanical
 * engineering student alike. A ring has no first element. Everything on it is
 * equidistant from the claim in the middle, which is the argument stated as
 * geometry rather than as a sentence.
 *
 * ── WHY THESE TWELVE ──────────────────────────────────────────────────────────
 *
 * Chosen to span the whole space rather than to flatter STEM: four sciences, then
 * mathematics and engineering, then code, then law, history, languages, music and
 * economics. If a future edit adds a thirteenth, change `--n` in art.css to match —
 * the ring computes its own angles from it.
 *
 * ── THE ROTATION ──────────────────────────────────────────────────────────────
 *
 * Ninety seconds for one turn, which is slow enough that nobody watches it move and
 * fast enough that the section is not static in a screen recording. Each icon
 * counter-rotates at the same period so it stays upright the whole way round — a
 * ring of tumbling glyphs would be a carousel, and this is meant to read as a
 * field. The whole thing stops under `prefers-reduced-motion`; see art.css.
 */

const SUBJECTS = [
  // A radical, not the multiplication cross the first draft used — at 20px an X
  // beside an underline read as a delete button rather than as mathematics.
  { id: "maths", label: "Mathematics", path: "M3 13l3 7 4-16h11M14 8h7" },
  { id: "chemistry", label: "Chemistry", path: "M9 3v6l-5 9a2 2 0 0 0 1.7 3h12.6a2 2 0 0 0 1.7-3l-5-9V3M8 3h8M7 15h10" },
  { id: "biology", label: "Biology", path: "M7 3c0 6 10 6 10 12M17 3c0 6-10 6-10 12M7 21h10M6 7h12M8 11h8" },
  { id: "physics", label: "Physics", path: "M12 12m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0M12 3c5 0 9 4 9 9s-4 9-9 9-9-4-9-9 4-9 9-9M3.5 8c4 3 13 3 17 0M3.5 16c4-3 13-3 17 0" },
  { id: "medicine", label: "Medicine", path: "M3 12h4l2-5 3 10 2-5h7" },
  { id: "engineering", label: "Engineering", path: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1" },
  { id: "code", label: "Computer science", path: "M9 8l-4 4 4 4M15 8l4 4-4 4M13 5l-2 14" },
  { id: "law", label: "Law", path: "M12 4v16M6 20h12M12 6l-6 2 3 5h6l3-5-6-2M3 13h6M15 13h6" },
  { id: "history", label: "History", path: "M5 21V9l7-5 7 5v12M9 21v-6h6v6M3 21h18" },
  { id: "languages", label: "Languages", path: "M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18" },
  { id: "music", label: "Music", path: "M9 18V6l10-2v12M9 18a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0M19 16a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0" },
  { id: "economics", label: "Economics", path: "M4 20V10M10 20V4M16 20v-7M22 20V7M2 20h20" },
] as const;

export function LearnAnything() {
  const art = useParallax<HTMLDivElement>(0.16);
  const figure = useParallax<HTMLDivElement>(0.1);

  return (
    <section className="band ring-band" data-side="right">
      <div className="band-art" ref={art} aria-hidden="true">
        <Image
          src="/nemesis/art/learn.webp"
          alt=""
          width={1100}
          height={1100}
          sizes="(max-width: 900px) 130vw, 80vw"
          placeholder="blur"
          blurDataURL={LEARN_BLUR}
          quality={82}
        />
      </div>

      {/* The engraving sits IN FRONT of the wash above, on its own slower offset, so the
          two grounds separate as the page moves instead of sliding as one sheet. */}
      <div className="band-figure" ref={figure} aria-hidden="true">
        <Image
          src="/nemesis/art/learn-figure.webp"
          alt=""
          width={1100}
          height={1100}
          sizes="(max-width: 900px) 100vw, 34vw"
          placeholder="blur"
          blurDataURL={LEARN_FIGURE_BLUR}
          quality={84}
        />
      </div>

      <div className="wrap ring-in" data-reveal="up">
        <div className="subject-ring" style={{ ["--n" as string]: SUBJECTS.length }}>
          {/* aria-hidden on the orbit: the twelve glyphs are an illustration of the
              sentence in the middle, and a screen reader reading out twelve subject
              names before reaching the claim would bury it. The copy below names the
              range in words for exactly that reason. */}
          <ul className="ring-orbit" aria-hidden="true">
            {SUBJECTS.map((s, i) => (
              <li key={s.id} style={{ ["--i" as string]: i }}>
                <span className="ring-chip" title={s.label}>
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d={s.path} />
                  </svg>
                </span>
              </li>
            ))}
          </ul>

          {/* Only the claim goes inside the circle. The two sentences that name the
              range live below it: at 560px the ring shrinks to 300px and anything
              more than three words in the middle has nowhere to go — and the range
              is the one thing this section exists to say, so it must not be what
              gets dropped on a phone. */}
          <div className="ring-centre">
            <h3>Learn anything</h3>
          </div>
        </div>

        <p className="ring-lede">
          Sciences and maths, engineering and code, law, history, economics and languages. Any
          subject, any level.
        </p>
        <p className="ring-note">
          Ask for a topic, or bring your own material: slides, PDFs, lecture recordings, notes.
        </p>
      </div>
    </section>
  );
}
