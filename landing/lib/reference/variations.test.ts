import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";

import { describe, expect, it } from "vitest";

// ── The second round of landing variations (E to H), 2026-09-10 ──────────────────────────────────
//
// Owner: "the landing page needs more sana feel, use higgsfield to create those crisp images ... the
// landing page doesnt have any animations like in sana or microanimations ... use hyperframes for it".
//
// What these guards defend is the part a screenshot cannot show: that every photograph and clip a
// page names is really on disk and small enough to ship, that the motion is the measured motion and
// not a lookalike, and that the copy never slides into fake testimonials or em dashes.

const url = (p: string) => new URL(p, import.meta.url);
const read = (p: string) => readFileSync(url(p), "utf8");

// Comments are stripped before scanning: a comment explaining why there are no testimonials is not one.
const stripComments = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");
const PAGES = ["together", "desk", "canvas", "session"].map((name) => ({ name, src: stripComments(read(`../../app/preview/v/${name}/page.tsx`)) }));
// Components that carry page copy of their own are scanned with the pages.
const COPY = [...PAGES, ...["Marquee", "StudyTools"].map((name) => ({ name, src: stripComments(read(`../../components/reference/${name}.tsx`)) }))];
const sanaCss = read("../../app/preview/v/sana.css");
const studyTools = read("../../components/reference/StudyTools.tsx");
const motionCss = read("../../components/reference/motion/motion.css");
const photos = read("../../components/reference/device/photos.ts");

describe("the second round of landing variations", () => {
  it("🔴🔴 every photograph and clip a page names exists, and is light enough for a landing page", () => {
    const refs = new Set<string>();
    for (const { src } of [...PAGES, { name: "photos", src: photos }]) {
      for (const m of src.matchAll(/["'](\/(?:photos|showcase|gradients)\/[a-z0-9-]+\.(?:webp|mp4))["']/g)) refs.add(m[1]);
    }
    expect(refs.size).toBeGreaterThanOrEqual(12);
    for (const ref of refs) {
      const file = url(`../../public${ref}`);
      expect(existsSync(file), `missing asset: ${ref}`).toBe(true);
      const size = statSync(file).size;
      // A clip over 1.5 MB or a photograph over 500 KB means an unoptimised export slipped in.
      const cap = ref.endsWith(".mp4") ? 1_500_000 : 500_000;
      expect(size, `${ref} is ${size} bytes`).toBeLessThan(cap);
    }
  });

  it("🔴 every clip has a poster, so a slow connection shows a frame instead of a black box", () => {
    const dir = url("../../public/showcase/");
    const clips = readdirSync(dir).filter((f) => f.endsWith(".mp4"));
    expect(clips.length).toBeGreaterThanOrEqual(2);
    for (const clip of clips) expect(existsSync(url(`../../public/showcase/${clip.replace(".mp4", ".webp")}`)), `${clip} has no poster`).toBe(true);
  });

  it("🔴 the motion is Sana's measured motion, converted from their 10px rem", () => {
    expect(motionCss).toMatch(/--nm-ease-out:\s*cubic-bezier\(0\.16,\s*1,\s*0\.3,\s*1\)/);
    expect(motionCss).toMatch(/--nm-ease-in-out:\s*cubic-bezier\(0\.83,\s*0,\s*0\.17,\s*1\)/);
    expect(motionCss).toMatch(/--nm-drop-ease:\s*cubic-bezier\(0\.327,\s*0\.023,\s*0\.988,\s*0\.015\)/);
    // word by word: 2s each, 0.1s apart from 0.1s
    expect(motionCss).toMatch(/animation:\s*nm-word 2s var\(--nm-ease-out\)/);
    expect(motionCss).toMatch(/calc\(0\.1s \+ var\(--w, 0\) \* 0\.1s\)/);
    // the polaroid drop: 0.7s, 0.07s apart, from 200px (their 20rem)
    expect(motionCss).toMatch(/--nm-dur:\s*0\.7s;\s*--nm-stagger:\s*0\.07s/);
    expect(motionCss).toMatch(/translate3d\(0, 0, 200px\)/);
    // 🔴 THE REM TRAP: their 1rem is 10px. A literal "20rem" here would drop cards from 320px.
    expect(motionCss.replace(/\/\*[\s\S]*?\*\//g, "")).not.toMatch(/\d(\.\d+)?rem\b/);
    expect(motionCss).toMatch(/prefers-reduced-motion/);
  });

  it("🔴 nothing is hidden before JavaScript has armed it", () => {
    // A reveal that hides on first paint blanks the page at hydration and fades it back in. The only
    // CSS-only hide is the hero's `now` animation, which never waits for JavaScript.
    const bare = motionCss.replace(/\/\*[\s\S]*?\*\//g, "");
    const hides = [...bare.matchAll(/^([^{}]*)\{[^}]*opacity:\s*0[;\s}]/gm)].map((m) => m[1].trim()).filter((s) => s && !s.startsWith("@") && !/^(from|to|\d)/.test(s));
    for (const selector of hides) expect(selector, `"${selector}" hides without being armed`).toMatch(/data-nm="armed"|nm-out|:is\(\[data-nm="on"\]/);
  });

  it("🔴🔴 no testimonials, no invented people, no em dashes in the copy", () => {
    for (const { name, src } of COPY) {
      // Nemesis has no customers to quote, so a quote with a name on it would be a fake review.
      expect(src, `${name} carries a quote`).not.toMatch(/<blockquote|<cite|testimonial/i);
      expect(src, `${name} carries an em dash`).not.toMatch(/—/);
    }
  });

  it("🔴🔴 the school names never claim the schools use Nemesis", () => {
    // Owner, 2026-09-10: "a Harvard, like top universities banner". A row of school names reads as a
    // customer list whatever it says, so the words around it must stay literally true. "Trusted by"
    // or "used at" needs real students from those schools first, the same rule as testimonials.
    for (const { name, src } of COPY) {
      expect(src, `${name} claims an endorsement`).not.toMatch(/trusted by|used (?:by|at)|loved by|students at .* use|partner(?:ed)? with/i);
    }
    const marquee = read("../../components/reference/Marquee.tsx");
    // names in type only: no crest, seal or logo file for a school
    expect(stripComments(marquee)).not.toMatch(/<img|\.svg|\.png|logo/i);
  });

  it("🔴 every Student Spaces tool is offered on the page", () => {
    // Owner, 2026-09-10, of acrobat.adobe.com/studentspaces: "make sure we offer everythats on here on
    // the landing page". Its tool list that day: Flashcards, Quiz, Study guide, Mind map, Study packet,
    // Podcast, Video summary, Presentation, Cheat sheet. Presentation is "Slides" in our words.
    for (const tool of ["Flashcards", "Quiz", "Study guide", "Mind map", "Study packet", "Podcast", "Video summary", "Slides", "Cheat sheet"]) {
      expect(studyTools, `the study tools lost ${tool}`).toContain(`name: "${tool}"`);
    }
    // and the rest of that page: files, a cited tutor, notes, sharing with classmates, deadlines
    for (const phrase of ["Bring any file", "shows its sources", "notes", "classmates", "exam date"]) expect(studyTools).toContain(phrase);
  });

  it("🔴 the mascot sits in the middle of its bubble", () => {
    // art.css gives every .mascot a 168px min-height for the old home hero; inside the 128px orbit
    // bubble that pushed the character 20px below centre (measured 2026-09-10, owner: "off center").
    expect(sanaCss).toMatch(/\.sn-bubble \.mascot\s*\{\s*min-height:\s*0;?\s*\}/);
  });
});
