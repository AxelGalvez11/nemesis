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
        <h1 className="hero-h1">
          Answers that show their <em>work.</em>
        </h1>
        <p className="hero-sub">
          Plain-English answers about any medication or supplement — every claim traced to FDA
          labels, PubMed, and ClinicalTrials.gov.
        </p>
        <div className="waitlist-wrap" id="waitlist-area">
          <WaitlistForm note="We'll email you when the beta opens. No spam, ever." />
        </div>
        <p style={{ marginTop: "28px", fontSize: "13px", color: "var(--t35)" }}>
          or{" "}
          <a
            href="#demo"
            style={{
              color: "var(--teal)",
              fontWeight: 600,
              textDecoration: "underline",
              textUnderlineOffset: "3px",
            }}
          >
            try a live query ↓
          </a>
        </p>
      </div>
      <div className="scroll-cue">
        <div className="sline" />
        Scroll
      </div>
    </section>
  );
}
