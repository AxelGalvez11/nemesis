import type { Metadata } from "next";

import { ArtGround, DeckMock, DocMock, SchemaMock, SlidesMock, WorkspaceMock } from "@/components/reference/mockups/Mockups";
import { CtaBand, TwoTone, VxFoot, VxNav, WorksWith } from "@/components/reference/VariantChrome";

import "../../reference.css";
import "../variants.css";

export const metadata: Metadata = { title: "Nemesis · A · Bring your own agent" };

/** Variation A. Lead: outside agents connect to Nemesis and use its tools under strict rules.
 *  x.ai/bot's composition (centred hero, the product window beneath) on an approved gradient. */
export default function VariantAgents() {
  return (
    <div className="ref-page">
      <VxNav />
      <section className="vx-hero">
        <a className="vx-pill" href="#tools">
          Agents · How connecting works
        </a>
        <h1 className="vx-h1">Let your agent build what you study</h1>
        <p className="vx-sub">
          Connect Claude, ChatGPT or Cursor to Nemesis. It reads your material, then builds FSRS
          flashcards, slides and study guides under rules that keep every output consistent.
        </p>
        <div className="vx-actions">
          <a className="ref-btn ref-btn-solid" href="/app">
            Start free
          </a>
          <a className="ref-btn ref-btn-outline" href="#tools">
            See how agents connect
          </a>
        </div>
      </section>

      <div className="vx-stage">
        <ArtGround name="azure" className="vx-ground">
          <WorkspaceMock />
        </ArtGround>
      </div>

      <section className="ref-section" id="tools">
        <div className="ref-container">
          <TwoTone
            lead="Every agent gets the same tools."
            rest="Reading, deck building, slides and study guides, each with a fixed shape its output has to match."
          />
          <div className="vx-grid-3">
            <figure className="vx-fig">
              <DeckMock />
              <figcaption>FSRS flashcards, scheduled the moment they are made</figcaption>
            </figure>
            <figure className="vx-fig">
              <SlidesMock />
              <figcaption>Slide decks you can download as .pptx</figcaption>
            </figure>
            <figure className="vx-fig">
              <DocMock />
              <figcaption>Study guides with every claim cited</figcaption>
            </figure>
          </div>
        </div>
      </section>

      <section className="ref-section">
        <div className="ref-container vx-split">
          <TwoTone
            align="left"
            lead="Rules, not prompts."
            rest="An agent cannot hand you a card with no source. Nemesis checks every output and sends the bad ones back to be fixed."
          />
          <SchemaMock />
        </div>
      </section>

      <section className="ref-section">
        <div className="ref-container">
          <WorksWith />
        </div>
      </section>

      <CtaBand heading="Put your agent to work on your studies" />
      <VxFoot />
    </div>
  );
}
