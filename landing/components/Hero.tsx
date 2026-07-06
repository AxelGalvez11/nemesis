"use client";

import dynamic from "next/dynamic";

// The WebGL hero (three.js) is client-only and code-split: ssr:false keeps `three`
// out of the server render + initial bundle, loading it after hydration. A plain
// var(--bg) hero shows underneath until it mounts, so there's no layout shift.
const HeroCanvas = dynamic(() => import("@/components/HeroCanvas").then((m) => m.HeroCanvas), {
  ssr: false,
});

export function Hero() {
  return (
    <section className="hero" id="top">
      <HeroCanvas />
      <div className="hero-overlay" />
      <div className="hero-content">
        <div className="eyebrow hero-eyebrow">
          <span className="bdot" />
          Beta · Now open
        </div>
        <h1 className="hero-h1">
          Evidence<br />
          <em>engine</em>
        </h1>
        <p className="hero-sub">
          Plain-English answers about any medication or supplement, with every claim traced to FDA
          labels, PubMed, and ClinicalTrials.gov.
        </p>
        <div className="hero-cta-row" id="get-started">
          <a className="wbtn" href="https://app.pharmaorb.app/sign-up">
            Get started — free
          </a>
          <a className="hero-ghost" href="https://app.pharmaorb.app/sign-in">
            Sign in
          </a>
        </div>
        <p style={{ marginTop: "28px", fontSize: "13px", color: "var(--t35)" }}>
          or{" "}
          <a
            href="#reel"
            style={{
              color: "var(--teal)",
              fontWeight: 600,
              textDecoration: "underline",
              textUnderlineOffset: "3px",
            }}
          >
            watch the 30-second tour ↓
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
