import type { Metadata } from "next";

import { VxNav } from "@/components/reference/VariantChrome";

import "../reference.css";
import "./variants.css";

export const metadata: Metadata = { title: "Nemesis · Landing variations" };

const VARIANTS = [
  { href: "/preview/v/agents", kicker: "A", title: "Bring your own agent", note: "Claude, ChatGPT or Cursor connect and use Nemesis tools.", art: "azure" },
  { href: "/preview/v/deliverables", kicker: "B", title: "The deliverables", note: "Lead with what comes out: FSRS decks, slides, guides.", art: "lime" },
  { href: "/preview/v/ai", kicker: "C", title: "Nemesis's own AI", note: "The AI that thinks with you on the canvas.", art: "violet" },
  { href: "/preview/v/structured", kicker: "D", title: "Structured, not slop", note: "Every output fills a fixed shape.", art: "coral" },
  { href: "/preview/brand", kicker: "Brand", title: "The mark and the name", note: "The current mark, three new ones, and the name in Inter.", art: "emerald" },
  { href: "/preview", kicker: "Earlier", title: "Figma reconstruction", note: "The first Figma-skeleton landing, for comparison.", art: "orange" },
];

export default function VariationsIndex() {
  return (
    <div className="ref-page">
      <VxNav />
      <main className="vx-index">
        <h1 className="ref-h2">Landing page variations</h1>
        <p className="ref-body ref-dim" style={{ marginTop: 12, maxWidth: 620 }}>
          Four angles on the same product, each with coded product mockups and the approved gradients.
          Nothing here is live.
        </p>
        <div className="vx-index-grid">
          {VARIANTS.map((v) => (
            <a className="vx-card" href={v.href} key={v.href}>
              <div className="vx-card-art">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/gradients/${v.art}.webp`} alt="" />
              </div>
              <div className="vx-card-body">
                <span className="vx-card-kicker">{v.kicker}</span>
                <p className="vx-card-title">{v.title}</p>
                <p className="ref-meta ref-dim">{v.note}</p>
              </div>
            </a>
          ))}
        </div>
      </main>
    </div>
  );
}
