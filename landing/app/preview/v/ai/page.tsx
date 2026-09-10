import type { Metadata } from "next";

import { ArtGround, CanvasMock, DeckMock, DocMock, WorkspaceMock } from "@/components/reference/mockups/Mockups";
import { CtaBand, TwoTone, VxFoot, VxNav, WorksWith } from "@/components/reference/VariantChrome";

import "../../reference.css";
import "../variants.css";

export const metadata: Metadata = { title: "Nemesis · C · Nemesis's own AI" };

/** Variation C. Lead: the built-in AI that thinks with you on the canvas, with sources beside it. */
export default function VariantAI() {
  return (
    <div className="ref-page">
      <VxNav />
      <section className="vx-hero">
        <a className="vx-pill" href="#tools">
          Nemesis AI
        </a>
        <h1 className="vx-h1">An AI that thinks with you, not for you</h1>
        <p className="vx-sub">
          Nemesis reads what you bring, answers on a canvas next to the source, and turns those answers
          into material you can study.
        </p>
        <div className="vx-actions">
          <a className="ref-btn ref-btn-solid" href="/app">
            Start free
          </a>
          <a className="ref-btn ref-btn-outline" href="#tools">
            See the canvas
          </a>
        </div>
      </section>

      <div className="vx-stage">
        <ArtGround name="violet" className="vx-ground">
          <div style={{ width: "100%", maxWidth: 976 }}>
            <CanvasMock />
          </div>
        </ArtGround>
      </div>

      <section className="ref-section" id="tools">
        <div className="ref-container">
          <TwoTone
            lead="Every answer shows its source."
            rest="Each claim links back to the slide or page it came from, so you can check it instead of trusting it."
          />
          <div className="vx-grid-2">
            <figure className="vx-fig">
              <ArtGround name="emerald" className="vx-ground vx-ground-tight">
                <DeckMock />
              </ArtGround>
              <figcaption>Answers become flashcards, scheduled with FSRS</figcaption>
            </figure>
            <figure className="vx-fig">
              <ArtGround name="orange" className="vx-ground vx-ground-tight">
                <DocMock />
              </ArtGround>
              <figcaption>and study guides you can download</figcaption>
            </figure>
          </div>
        </div>
      </section>

      <section className="ref-section" id="agents">
        <div className="ref-container">
          <TwoTone
            lead="It works with your other agents too."
            rest="Claude, ChatGPT and Cursor can use the same tools, and their work lands in the same place."
          />
        </div>
        <div className="vx-stage">
          <ArtGround name="azure" className="vx-ground">
            <WorkspaceMock />
          </ArtGround>
        </div>
      </section>

      <section className="ref-section">
        <div className="ref-container">
          <WorksWith />
        </div>
      </section>

      <CtaBand heading="Ask your first question" />
      <VxFoot />
    </div>
  );
}
