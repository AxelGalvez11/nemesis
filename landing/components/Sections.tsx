import type { CSSProperties } from "react";
import { WaitlistForm } from "@/components/WaitlistForm";
import { BrandMark } from "@/components/icons";

const SOURCES = [
  {
    name: "FDA / openFDA",
    desc: "Official drug approval records, adverse event reports, and labeling data from the US Food & Drug Administration",
    status: "Live · Updated 1h ago",
  },
  {
    name: "DailyMed",
    desc: "Full FDA-approved drug labels published by the National Library of Medicine, the most authoritative prescribing information available",
    status: "Live · Updated 3h ago",
  },
  {
    name: "PubMed / MEDLINE",
    desc: "30M+ peer-reviewed biomedical studies from the National Library of Medicine, the world's largest medical literature database",
    status: "Live · Updated 2h ago",
  },
  {
    name: "ClinicalTrials.gov",
    desc: "The US registry of publicly and privately funded clinical trials: ongoing, completed, and recruiting",
    status: "Live · Updated 4h ago",
  },
  {
    name: "RxNorm",
    desc: "Normalized names for clinical drugs from the NLM, used to unify drug terminology across all data sources",
    status: "Live · Updated 6h ago",
  },
];

const STEPS = [
  {
    title: "Ask in plain English",
    body: "Type any medication question (side effects, interactions, what studies say) exactly as you'd ask a friend.",
  },
  {
    title: "Get a cited answer",
    body: "Receive a clear, jargon-free response graded by evidence strength. Every claim links back to its source.",
  },
  {
    title: "Read the original",
    body: "Tap any citation to open the original FDA label, PubMed study, or ClinicalTrials.gov record in full.",
  },
  {
    title: "Stay informed",
    body: "Follow any drug or topic. Get notified when labels change, new trials publish, or new studies land.",
  },
];

const EVIDENCE = [
  {
    tier: "vs",
    color: "#9BD92E",
    name: "Very Strong",
    desc: "FDA-approved with multiple meta-analyses and large, consistent randomized controlled trials.",
    tag: "High",
    chips: ["FDA Approval", "Meta-analyses", "Large RCTs"],
    litBars: 5,
    breathe: "2.3s",
  },
  {
    tier: "s",
    color: "#3BC87A",
    name: "Strong",
    desc: "Multiple well-designed randomized trials with consistent, reproducible findings.",
    tag: "Good",
    chips: ["RCTs", "Consistent trials", "Human data"],
    litBars: 4,
    breathe: "2.9s",
  },
  {
    tier: "m",
    color: "#C97B06",
    name: "Moderate",
    desc: "Limited or mixed human trial data. Findings exist but may vary across studies.",
    tag: "Some",
    chips: ["Limited trials", "Mixed data"],
    litBars: 3,
    breathe: "3.6s",
  },
  {
    tier: "w",
    color: "#C24A00",
    name: "Weak",
    desc: "Observational studies or indirect evidence only. No controlled trials available.",
    tag: "Low",
    chips: ["Observational", "Indirect evidence"],
    litBars: 2,
    breathe: "4.3s",
  },
  {
    tier: "vw",
    color: "#B51C1C",
    name: "Very Weak",
    desc: "Early lab or animal studies only. No human clinical data yet available.",
    tag: "Preliminary",
    chips: ["Lab studies", "Animal data"],
    litBars: 1,
    breathe: "5.2s",
  },
  {
    tier: "unk",
    color: "#555",
    nameColor: "#888",
    name: "Unknown",
    desc: "Insufficient data exists to assign a confidence level to this claim.",
    tag: "Ungraded",
    tagColor: "#888",
    chips: ["No data"],
    litBars: 0,
  },
] as const;

const EVIDENCE_TICKS = [
  { label: "Very Weak", color: "#B51C1C" },
  { label: "Weak", color: "#C24A00" },
  { label: "Moderate", color: "#C97B06" },
  { label: "Strong", color: "#3BC87A" },
  { label: "Very Strong", color: "#9BD92E" },
] as const;

const EVIDENCE_BAR_HEIGHTS = ["20%", "40%", "60%", "80%", "100%"] as const;
const EVIDENCE_BAR_DELAYS = [".05s", ".22s", ".38s", ".12s", ".28s"] as const;

const FEATURES = [
  {
    img: "/art/dna.webp",
    title: "Every answer is traceable",
    body: "No black-box claims. Each point cites its source (FDA labels, peer-reviewed research, registered trials) so you can check the basis yourself.",
  },
  {
    img: "/art/mortar.webp",
    title: "Built on real studies",
    body: "Answers are grounded in published research and official labels, not vibes or guesswork, and you can always see what they draw from.",
  },
  {
    img: "/art/heart.webp",
    title: "Follow what you take",
    body: "Track the medications you care about. Get notified when labels change, new trials publish results, or new studies land.",
  },
  {
    img: "/art/brain.webp",
    title: "Ask in plain English",
    body: "Type any medication question exactly as you'd ask a friend: side effects, interactions, what the studies actually say.",
  },
  {
    img: "/art/lungs.webp",
    title: "Fast or thorough",
    body: "Get a quick, plain answer in seconds, or switch to a deeper, more detailed read when you want the full picture.",
  },
  {
    img: "/art/asclepius.webp",
    title: "Educational, not advice",
    body: "PharmaOrb helps you ask better questions at your next appointment. It doesn't diagnose, treat, or prescribe. Always consult a professional.",
  },
];

export function Manifesto() {
  return (
    <section className="manifesto art-section" id="manifesto">
      <div className="art-section-bg">
        <img src="/art/hygieia.webp" alt="" loading="lazy" width={1216} height={896} data-parallax />
      </div>
      <div className="container reveal">
        <div className="art-section-copy">
          <div className="section-tag">Why we built it</div>
          <h2 className="section-h2">Medicine you can actually check</h2>
          <p className="section-p">
            Most health answers ask you to just trust them. PharmaOrb does the opposite. Every
            claim is traced back to the FDA label, the study, or the trial it came from, in plain
            English, so you can see the evidence for yourself.
          </p>
        </div>
      </div>
    </section>
  );
}

export function Sources() {
  return (
    <section className="section sources art-section" id="sources">
      <div className="art-section-bg">
        <img src="/art/molecule.webp" alt="" loading="lazy" width={1216} height={896} data-parallax />
      </div>
      <div className="container">
        <div className="art-section-copy reveal">
          <div className="section-tag">Data sources</div>
          <h2 className="section-h2">Always fresh. Always open.</h2>
          <p className="section-p">
            Every answer draws from authoritative public databases, updated continuously. You
            can always trace a claim back to the original document.
          </p>
        </div>
        <div className="source-list reveal">
          {SOURCES.map((s, i) => (
            <div className="source-row" key={s.name}>
              <div className="src-num">{String(i + 1).padStart(2, "0")}</div>
              <div className="src-pulse" />
              <div className="src-name">{s.name}</div>
              <div className="src-desc">{s.desc}</div>
              <div className="src-status">{s.status}</div>
              <div className="src-bar">
                <div className="src-fill" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function HowItWorks() {
  return (
    <section className="section how" id="how-it-works">
      <div className="container">
        <div style={{ textAlign: "center" }}>
          <div className="section-tag reveal">How it works</div>
          <h2 className="section-h2 reveal d1">Ask. Read. Verify. Follow.</h2>
        </div>
        <div className="how-steps">
          {STEPS.map((step, i) => (
            <div className={`how-step reveal${i > 0 ? ` d${i}` : ""}`} key={step.title}>
              <div className="how-n">{i + 1}</div>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Evidence() {
  return (
    <section className="section evidence art-section flip" id="evidence">
      <div className="art-section-bg">
        <img src="/art/capsule.webp" alt="" loading="lazy" width={1216} height={896} data-parallax />
      </div>
      <div className="container">
        <div className="art-section-copy reveal">
          <div className="section-tag">Evidence system</div>
          <h2 className="section-h2">Graded, not guessed</h2>
          <p className="section-p">
            Every answer carries a transparent evidence grade. From large clinical trials to
            early lab data, always labelled, never hidden.
          </p>
        </div>
        <div className="ev-spectrum reveal">
          <div className="ev-spectrum-track" />
          <div className="ev-spectrum-ticks">
            {EVIDENCE_TICKS.map((tick) => (
              <span
                className="ev-spectrum-tick"
                style={{ color: tick.color }}
                key={tick.label}
              >
                {tick.label}
              </span>
            ))}
          </div>
        </div>

        <div className="ev-grid">
          {EVIDENCE.map((ev) => (
            <div
              className="ev-card reveal"
              data-tier={ev.tier}
              style={{ "--breathe": "breathe" in ev ? ev.breathe : undefined } as CSSProperties}
              key={ev.name}
            >
              <div className="ev-signal" aria-hidden="true">
                {EVIDENCE_BAR_HEIGHTS.map((height, i) => {
                  const lit = i < ev.litBars;
                  return (
                    <div
                      className={`ev-bar${lit ? " lit" : ""}`}
                      style={{
                        height,
                        ...(lit
                          ? { background: ev.color, animationDelay: EVIDENCE_BAR_DELAYS[i] }
                          : {}),
                      }}
                      key={height}
                    />
                  );
                })}
              </div>
              <div className="ev-card-header">
                <div
                  className="ev-tier-name"
                  style={{ color: "nameColor" in ev ? ev.nameColor : ev.color }}
                >
                  {ev.name}
                </div>
                <div
                  className="ev-badge"
                  style={{
                    background: ev.tier === "unk" ? "rgba(128,128,128,.1)" : `${ev.color}1a`,
                    color: "tagColor" in ev ? ev.tagColor : ev.color,
                    border:
                      ev.tier === "unk"
                        ? "1px solid rgba(128,128,128,.2)"
                        : `1px solid ${ev.color}40`,
                  }}
                >
                  {ev.tag}
                </div>
              </div>
              <p className="ev-desc">{ev.desc}</p>
              <div className="ev-chips">
                {ev.chips.map((chip) => (
                  <span className="ev-chip" key={chip}>
                    {chip}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Features() {
  return (
    <section className="section features" id="features">
      <div className="container">
        <div style={{ textAlign: "center", marginBottom: "52px" }}>
          <div className="section-tag reveal">Why PharmaOrb</div>
          <h2 className="section-h2 reveal d1">Built on trust, not vibes</h2>
        </div>
        <div className="feat-grid">
          {FEATURES.map((f, i) => (
            <div className={`feat-card reveal${i > 0 ? ` d${(i % 3) + 1}` : ""}`} key={f.title}>
              <div className="feat-art">
                <img src={f.img} alt="" loading="lazy" width={1216} height={896} />
              </div>
              <div className="feat-body">
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function CallToAction() {
  return (
    <section className="cta-sec" id="cta">
      <div style={{ position: "relative", zIndex: 1 }}>
        <div className="section-tag reveal" style={{ justifyContent: "center" }}>
          Join the waitlist
        </div>
        <h2
          className="section-h2 reveal d1"
          style={{ maxWidth: "560px", margin: "0 auto 14px" }}
        >
          Be first when the beta opens.
        </h2>
        <p className="section-p reveal d2" style={{ margin: "0 auto 36px" }}>
          We&rsquo;ll email you, and nothing else.
        </p>
        <div id="waitlist-area-2" className="reveal d3">
          <WaitlistForm centered note="We'll email you when the beta opens. No spam." />
        </div>
      </div>
    </section>
  );
}

export function Wordmark() {
  return (
    <section className="wordmark-sec" aria-hidden="true">
      <p className="wordmark">
        Pharma<em>Orb</em>
      </p>
    </section>
  );
}

export function SiteFooter() {
  return (
    <footer>
      <div className="container footer-in">
        <div className="footer-brand">
          <BrandMark size={20} />
          Pharma<span>Orb</span>
        </div>
        <div className="footer-links">
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
          <a href="/terms#disclaimer">Disclaimer</a>
        </div>
        <p className="footer-disc">
          PharmaOrb provides educational information from public sources including FDA labels,
          PubMed, and ClinicalTrials.gov. Not medical advice. Does not diagnose, treat, or
          prescribe. Always consult a qualified healthcare professional.
        </p>
        <p className="footer-copy">
          We only use your email to notify you about the beta. © 2026 PharmaOrb.
        </p>
      </div>
    </footer>
  );
}
