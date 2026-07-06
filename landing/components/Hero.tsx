"use client";

import dynamic from "next/dynamic";
import { WaitlistForm } from "@/components/WaitlistForm";

// The WebGL hero (three.js) is client-only and code-split: ssr:false keeps `three`
// out of the server render + initial bundle, loading it after hydration. A plain
// var(--bg) hero shows underneath until it mounts, so there's no layout shift.
const HeroCanvas = dynamic(() => import("@/components/HeroCanvas").then((m) => m.HeroCanvas), {
  ssr: false,
});

export function Hero() {
  return (
    <section className="hero" id="waitlist">
      <HeroCanvas />
      <div className="hero-overlay" />
      <div className="hero-content">
        <div className="eyebrow hero-eyebrow">
          <span className="bdot" />
          Scientific research beta
        </div>
        <h1 className="hero-h1">
          Evidence<br />
          <em>workspace</em>
        </h1>
        <p className="hero-sub">
          Deep research for biomedicine, life sciences, behavioral sciences, and health
          evidence. Ask questions, build source-grounded notebooks, deploy research agents, and
          turn evidence into deliverables you can inspect.
        </p>
        <div className="waitlist-wrap" id="waitlist-area">
          <WaitlistForm note="We'll email you when the beta opens. No spam, ever." />
        </div>
      </div>
      <div className="scroll-cue">
        <div className="sline" />
        Scroll
      </div>
    </section>
  );
}
