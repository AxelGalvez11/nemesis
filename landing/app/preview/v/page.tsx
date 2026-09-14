import type { Metadata } from "next";

import { VxNav } from "@/components/reference/VariantChrome";

import "../reference.css";
import "./variants.css";

export const metadata: Metadata = { title: "Nemesis · Landing variations" };

/**
 * E to H are the second round (owner, 2026-09-10): Sana's page anatomy and motion, 4K photographs
 * of the objects students work with, and product clips rendered in HyperFrames. A to D are the first
 * round, kept for comparison.
 */
const VARIANTS = [
  { href: "/preview/v/together", kicker: "E", title: "Together", note: "Sana's page, section for section: your agents build it, you learn it.", art: "/photos/desk-laptop.webp" },
  { href: "/preview/v/desk", kicker: "F", title: "Desk", note: "A split hero where the agent's name turns over, and the product runs on the laptop in the photo.", art: "/photos/laptop-cards.webp" },
  { href: "/preview/v/canvas", kicker: "G", title: "Canvas", note: "Bold type, the canvas film, and the character peeking over the frame.", art: "/photos/card-board.webp" },
  { href: "/preview/v/session", kicker: "H", title: "Session", note: "x.ai's composition: agents you message like classmates, each with a job.", art: "/gradients/orange.webp" },
  { href: "/preview/v/agents", kicker: "A", title: "Bring your own agent", note: "First round. Claude, ChatGPT or Cursor connect and use Nemesis tools.", art: "/gradients/azure.webp" },
  { href: "/preview/v/deliverables", kicker: "B", title: "The deliverables", note: "First round. Lead with what comes out: FSRS decks, slides, guides.", art: "/gradients/lime.webp" },
  { href: "/preview/v/ai", kicker: "C", title: "Nemesis's own AI", note: "First round. The AI that thinks with you on the canvas.", art: "/gradients/violet.webp" },
  { href: "/preview/v/structured", kicker: "D", title: "Structured, not slop", note: "First round. Every output fills a fixed shape.", art: "/gradients/coral.webp" },
  { href: "/preview/brand", kicker: "Brand", title: "The mark and the name", note: "The current mark, three new ones, and the name in Inter.", art: "/gradients/emerald.webp" },
  { href: "/preview", kicker: "Earlier", title: "Figma reconstruction", note: "The first Figma-skeleton landing, for comparison.", art: "/gradients/orange.webp" },
];

export default function VariationsIndex() {
  return (
    <div className="ref-page">
      <VxNav />
      <main className="vx-index">
        <h1 className="ref-h2">Landing page variations</h1>
        <p className="ref-body ref-dim" style={{ marginTop: 12, maxWidth: 640 }}>
          E to H are the new round: Sana&apos;s layout and motion, 4K photographs, and product clips rendered in HyperFrames.
          A to D are the first round. Nothing here is live.
        </p>
        <div className="vx-index-grid">
          {VARIANTS.map((v) => (
            <a className="vx-card" href={v.href} key={v.href}>
              <div className="vx-card-art">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={v.art} alt="" />
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
