import type { CSSProperties } from "react";
import { WaitlistForm } from "@/components/WaitlistForm";

const SOURCES = [
  {
    name: "Scientific literature",
    desc: "Biomedical, life-science, and behavioral-science papers gathered into one searchable evidence layer",
    status: "Live · Updated 1h ago",
  },
  {
    name: "Clinical and public registries",
    desc: "Trials, study records, labels, safety notices, and public datasets connected back to their original source",
    status: "Live · Updated 3h ago",
  },
  {
    name: "Uploaded papers and notes",
    desc: "Your PDFs, saved findings, notebook entries, and source collections become part of the same research workspace",
    status: "Live · Updated 2h ago",
  },
  {
    name: "Citation and claim context",
    desc: "Support, conflict, related work, study type, recency, and evidence strength are kept visible beside each claim",
    status: "Live · Updated 4h ago",
  },
  {
    name: "Living monitors",
    desc: "Agents keep watching selected topics for new papers, trial changes, retractions, and major evidence shifts",
    status: "Live · Updated 6h ago",
  },
];

const STEPS = [
  {
    title: "Start with a question",
    body: "Ask about a mechanism, intervention, behavior, biomarker, trial, claim, paper, or open scientific debate.",
  },
  {
    title: "Build a source notebook",
    body: "Collect papers, labels, registries, notes, saved answers, and PDFs into one traceable research file.",
  },
  {
    title: "Deploy a research agent",
    body: "Have PharmaOrb screen sources, extract findings, compare evidence, map related work, and keep the topic moving.",
  },
  {
    title: "Export the work",
    body: "Turn the evidence into briefs, tables, slide decks, citations, study maps, and living reports that stay current.",
  },
];

const EVIDENCE = [
  {
    tier: "vs",
    color: "#9BD92E",
    name: "Very Strong",
    desc: "Multiple high-quality human studies, meta-analyses, or well-established source consensus point the same way.",
    tag: "High",
    chips: ["Meta-analyses", "Large studies", "Consistent signal"],
    litBars: 5,
    breathe: "2.3s",
  },
  {
    tier: "s",
    color: "#3BC87A",
    name: "Strong",
    desc: "Several reliable studies or registered evidence sources support the finding with limited conflict.",
    tag: "Good",
    chips: ["Human data", "Replicated", "Low conflict"],
    litBars: 4,
    breathe: "2.9s",
  },
  {
    tier: "m",
    color: "#C97B06",
    name: "Moderate",
    desc: "Useful evidence exists, but results may be mixed, narrow, indirect, or dependent on study context.",
    tag: "Some",
    chips: ["Limited trials", "Mixed data"],
    litBars: 3,
    breathe: "3.6s",
  },
  {
    tier: "w",
    color: "#C24A00",
    name: "Weak",
    desc: "Mostly observational, exploratory, underpowered, or indirect evidence. Enough to inspect, not enough to settle.",
    tag: "Low",
    chips: ["Observational", "Indirect evidence"],
    litBars: 2,
    breathe: "4.3s",
  },
  {
    tier: "vw",
    color: "#B51C1C",
    name: "Very Weak",
    desc: "Early, preclinical, theoretical, or sparse evidence. Useful for hypothesis work, not a firm conclusion.",
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
    desc: "The system cannot find enough relevant, inspectable evidence to grade the claim responsibly.",
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
    title: "Source-grounded notebooks",
    body: "Organize papers, notes, registries, saved answers, and research threads into notebooks that stay tied to their sources.",
  },
  {
    img: "/art/mortar.webp",
    title: "Agentic deep research",
    body: "Give the agent a question and it can gather sources, screen papers, extract findings, compare claims, and summarize the state of the evidence.",
  },
  {
    img: "/art/heart.webp",
    title: "Research deliverables",
    body: "Generate evidence briefs, study tables, slide decks, citation exports, claim summaries, and living reports from the same source file.",
  },
  {
    img: "/art/brain.webp",
    title: "Chat with the literature",
    body: "Ask plain-English questions across biomedicine, life sciences, behavioral sciences, and health evidence without losing the citation trail.",
  },
  {
    img: "/art/lungs.webp",
    title: "Maps and claim tracing",
    body: "Explore related papers, mechanisms, populations, interventions, citations, conflicts, and adjacent questions in one research map.",
  },
  {
    img: "/art/asclepius.webp",
    title: "Living topic monitors",
    body: "Follow a topic, paper, claim, or intervention. PharmaOrb monitors new evidence and shows what changed since the last check.",
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
          <h2 className="section-h2">Research scattered across too many tabs</h2>
          <p className="section-p">
            Scientific work now lives across papers, preprints, trial registries, citation
            trails, PDFs, notes, chats, and static reports. PharmaOrb pulls those pieces into one
            source-grounded workspace for asking, extracting, mapping, monitoring, and making
            deliverables.
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
          <h2 className="section-h2">Bring every source into the same evidence layer</h2>
          <p className="section-p">
            PharmaOrb is built around inspectable sources. Public databases, scientific papers,
            registries, notes, and saved materials remain linked to the claims and deliverables
            they support.
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
          <h2 className="section-h2 reveal d1">Ask. Notebook. Agent. Deliver.</h2>
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
          <h2 className="section-h2">Evidence you can inspect</h2>
          <p className="section-p">
            Every answer, notebook, and deliverable keeps the evidence visible: source, study
            type, recency, strength, support, conflict, and uncertainty. The point is not just a
            summary. It is a research trail you can audit.
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
          <h2 className="section-h2 reveal d1">The full evidence loop in one place</h2>
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
          Build your scientific evidence workspace.
        </h2>
        <p className="section-p reveal d2" style={{ margin: "0 auto 36px" }}>
          Join the beta for source-grounded deep research across biomedicine, life sciences,
          behavioral sciences, and health evidence.
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
          Pharma<span>Orb</span>
        </div>
        <div className="footer-links">
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
          <a href="/terms#disclaimer">Disclaimer</a>
        </div>
        <p className="footer-disc">
          PharmaOrb provides educational research tools for scientific evidence, including
          biomedicine, life sciences, behavioral sciences, and health-adjacent research. Not
          medical advice. Does not diagnose, treat, or prescribe. Always consult a qualified
          healthcare professional.
        </p>
        <p className="footer-copy">
          We only use your email to notify you about the beta. © 2026 PharmaOrb.
        </p>
      </div>
    </footer>
  );
}
