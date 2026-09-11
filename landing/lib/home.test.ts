import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";

import { describe, expect, it } from "vitest";

// ── The homepage, shipped 2026-09-10 ───────────────────────────────────────────────────────────────
//
// Owner: "I like the way the together one looks. It looks really nice" (of the round-two variation
// built on sanalabs.com's measured anatomy), then "put it on the site now". This replaces the earlier
// Hero/LearnAnything/Features/Closer page — see the long comment at the top of app/page.tsx for why
// those files are kept on disk rather than deleted.
//
// What these guards defend is the part a screenshot cannot show: that every photograph and clip the
// page names is really on disk and small enough to ship, that no invented testimonial or em dash
// slipped in, that the one named-institution claim (real students at named schools, owner-confirmed
// 2026-09-10) stays scoped to individuals and never claims an institutional partnership, and that the
// mascot's known off-centre bug ("the mascot looks a little bit off center") stays fixed.

const url = (p: string) => new URL(p, import.meta.url);
const read = (p: string) => readFileSync(url(p), "utf8");
const stripComments = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");

const page = stripComments(read("../app/page.tsx"));
const marquee = stripComments(read("../components/reference/Marquee.tsx"));
const sanaCss = read("../app/home-sana.css");
const motionCss = read("../components/reference/motion/motion.css");
const studyTools = stripComments(read("../components/reference/StudyTools.tsx"));
const chrome = stripComments(read("../components/reference/SanaChrome.tsx"));

describe("the homepage", () => {
  it("🔴🔴 every photograph and clip the page names exists, and is light enough to ship", () => {
    const refs = new Set<string>();
    for (const src of [page, read("../components/reference/device/photos.ts")]) {
      for (const m of src.matchAll(/["'](\/(?:photos|showcase|gradients)\/[a-z0-9-]+\.(?:webp|mp4))["']/g)) refs.add(m[1]);
    }
    expect(refs.size).toBeGreaterThanOrEqual(12);
    for (const ref of refs) {
      const file = url(`../public${ref}`);
      expect(existsSync(file), `missing asset: ${ref}`).toBe(true);
      const cap = ref.endsWith(".mp4") ? 1_500_000 : 500_000;
      expect(statSync(file).size, `${ref} is too heavy for a landing page`).toBeLessThan(cap);
    }
  });

  it("🔴 every clip has a poster", () => {
    const dir = url("../public/showcase/");
    const clips = readdirSync(dir).filter((f) => f.endsWith(".mp4"));
    expect(clips.length).toBeGreaterThanOrEqual(2);
    for (const clip of clips) expect(existsSync(url(`../public/showcase/${clip.replace(".mp4", ".webp")}`)), `${clip} has no poster`).toBe(true);
  });

  it("🔴 no invented testimonials and no em dashes", () => {
    for (const [name, src] of [["page", page], ["StudyTools", studyTools], ["Marquee", marquee], ["SanaChrome", chrome]] as const) {
      expect(src, `${name} carries a quote`).not.toMatch(/<blockquote|<cite|testimonial/i);
      expect(src, `${name} carries an em dash`).not.toMatch(/—/);
    }
  });

  it("🔴🔴 the school banner stays a claim about students, never about the schools themselves", () => {
    // Owner, 2026-09-10: "just say used by real students at these top Ivy League universities...
    // It's true." Confirmed, so the claim may stand — but ONLY the scope it was confirmed for: real
    // individual students attend these schools and use Nemesis. A DIFFERENT claim — that a school
    // itself partners with, endorses, or officially provides Nemesis — was never confirmed and would
    // need its own check before it could go on the page.
    expect(page + marquee).toMatch(/used by real students/i);
    for (const src of [page, marquee]) {
      expect(src, "claims an institutional partnership, not individual usage").not.toMatch(
        /partner(?:ed)? with|official(?:ly)?|endorses?|in partnership|provided by [A-Z]/i,
      );
    }
    // 🔴🔴 No real school's crest or wordmark — a licensed FILE (an <img>, a .svg/.png asset, or an
    // external fetch) is exactly how one would sneak in. An inline, hand-drawn <svg> badge is fine
    // as long as it is the SAME shape for every row (see Badge() in Marquee.tsx) — sameness is what
    // keeps a generic mark from reading as any one school's actual seal.
    expect(marquee, "a real logo file appeared").not.toMatch(/<img|\.svg["'`]|\.png|fetch\(|require\(/i);
    const badgeDefs = [...marquee.matchAll(/function Badge\(\)[\s\S]*?\n\}/g)];
    expect(badgeDefs.length, "the badge component is missing").toBe(1);
    expect(marquee.match(/<Badge \/>/g)?.length ?? 0, "not every row gets the same one badge").toBeGreaterThan(0);
  });

  it("🔴 every Student Spaces tool named 2026-09-10 is offered on the page", () => {
    for (const tool of ["Flashcards", "Quiz", "Study guide", "Mind map", "Study packet", "Podcast", "Video summary", "Slides", "Cheat sheet"]) {
      expect(studyTools, `the study tools lost ${tool}`).toContain(`name: "${tool}"`);
    }
    for (const phrase of ["Bring any file", "shows its sources", "notes", "classmates", "exam date"]) expect(studyTools).toContain(phrase);
  });

  it("🔴 the mascot sits in the middle of its bubble", () => {
    // art.css gives every .mascot a 168px min-height for the old hero; inside the 128px orbit bubble
    // that pushed the character 20px below centre (owner, 2026-09-10: "off center").
    expect(sanaCss).toMatch(/\.sn-bubble \.mascot\s*\{\s*min-height:\s*0;?\s*\}/);
  });

  it("🔴🔴 no page link points at a route this site does not have", () => {
    // The variation pages this was built from used a placeholder "/app" for every call to action; a
    // marketing domain has no /app route, the real app lives on a different subdomain.
    for (const src of [page, chrome]) {
      expect(src, "a call-to-action still points at the placeholder /app route").not.toMatch(/href="\/app"/);
    }
    expect(chrome, "the footer still hands out dead '#' links").not.toMatch(/href="#"/);
  });

  it("the motion is the measured Sana easing, converted from their 10px rem, and nothing hides unarmed", () => {
    expect(motionCss).toMatch(/--nm-ease-out:\s*cubic-bezier\(0\.16,\s*1,\s*0\.3,\s*1\)/);
    // the rem trap: Sana's html font-size is 62.5%, so their 1rem is 10px, not 16
    expect(motionCss.replace(/\/\*[\s\S]*?\*\//g, "")).not.toMatch(/\d(\.\d+)?rem\b/);
    expect(motionCss).toMatch(/prefers-reduced-motion/);
    const bare = motionCss.replace(/\/\*[\s\S]*?\*\//g, "");
    const hides = [...bare.matchAll(/^([^{}]*)\{[^}]*opacity:\s*0[;\s}]/gm)].map((m) => m[1].trim()).filter((s) => s && !s.startsWith("@") && !/^(from|to|\d)/.test(s));
    for (const selector of hides) expect(selector, `"${selector}" hides without being armed`).toMatch(/data-nm="armed"|nm-out|:is\(\[data-nm="on"\]/);
  });
});
