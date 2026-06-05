"use client";

import { Nav } from "@/components/Nav";
import { Hero } from "@/components/Hero";
import { Stats } from "@/components/Stats";
import { InteractiveDemo } from "@/components/InteractiveDemo";
import {
  Sources,
  HowItWorks,
  Evidence,
  Features,
  CallToAction,
  SiteFooter,
} from "@/components/Sections";
import { useScrollReveal, useTheme } from "@/lib/useLandingEffects";

export default function Home() {
  const { theme, toggle } = useTheme();
  // Wire the design's scroll-reveal IntersectionObserver across all `.reveal` elements.
  useScrollReveal();

  return (
    <>
      <Nav theme={theme} onToggleTheme={toggle} />
      <Hero />
      <Stats />
      <hr className="rule" />
      <InteractiveDemo />
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
      <SiteFooter />
    </>
  );
}
