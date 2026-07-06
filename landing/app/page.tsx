"use client";

import { Nav } from "@/components/Nav";
import { Hero } from "@/components/Hero";
import { Stats } from "@/components/Stats";
import {
  Manifesto,
  Sources,
  HowItWorks,
  Evidence,
  Features,
  CallToAction,
  Wordmark,
  SiteFooter,
} from "@/components/Sections";
import { useParallax, useScrollReveal, useTheme } from "@/lib/useLandingEffects";

export default function Home() {
  const { theme, toggle } = useTheme();
  // Wire the design's scroll-reveal IntersectionObserver across all `.reveal` elements.
  useScrollReveal();
  // Parallax the full-bleed section artwork (the "window" effect).
  useParallax();

  return (
    <>
      <Nav theme={theme} onToggleTheme={toggle} />
      <Hero />
      <hr className="rule" />
      <Manifesto />
      <hr className="rule" />
      <Stats />
      <hr className="rule" />
      <Sources />
      <hr className="rule" />
      <HowItWorks />
      <hr className="rule" />
      <Evidence />
      <hr className="rule" />
      <Features />
      <hr className="rule" />
      <CallToAction />
      <Wordmark />
      <SiteFooter />
    </>
  );
}
