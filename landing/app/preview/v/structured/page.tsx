import type { Metadata } from "next";

import { ArtGround, DeckMock, DocMock, SchemaMock, SlidesMock, WorkspaceMock } from "@/components/reference/mockups/Mockups";
import { CtaBand, TwoTone, VxFoot, VxNav } from "@/components/reference/VariantChrome";

import "../../reference.css";
import "../variants.css";

export const metadata: Metadata = { title: "Nemesis · D · Structured, not slop" };

/** Variation D. Lead: the rules. Every output fills a fixed shape, so decks and guides come out the
 *  same way every time. Figma's three-column hero with the rules themselves in the art slot. */
export default function VariantStructured() {
  return (
    <div className="ref-page">
      <VxNav />
      <section className="ref-hero">
        <div className="ref-hero-in">
          <h1 className="ref-h1">Study material with rules, not AI slop</h1>
          <div className="ref-hero-art">
            <ArtGround name="coral" className="vx-ground vx-ground-fill">
              <SchemaMock />
            </ArtGround>
          </div>
          <a className="ref-hero-cta" href="/app">
            <span className="ref-lead">Start free</span>
          </a>
        </div>
      </section>

      <section className="ref-section" id="tools">
        <div className="ref-container">
          <TwoTone
            lead="Every output fills a fixed shape."
            rest="Decks, slides, guides and tests each have rules. Anything that breaks one goes back to be fixed before you see it."
          />
          <div className="vx-grid-3">
            <figure className="vx-fig">
              <DeckMock />
              <figcaption>Cards: one idea, a source, and a back that answers the front</figcaption>
            </figure>
            <figure className="vx-fig">
              <SlidesMock />
              <figcaption>Slides: a title, three points at most, a source on every one</figcaption>
            </figure>
            <figure className="vx-fig">
              <DocMock />
              <figcaption>Guides: definitions first, cases in a table, nothing uncited</figcaption>
            </figure>
          </div>
        </div>
      </section>

      <section className="ref-section" id="agents">
        <div className="ref-container">
          <TwoTone
            lead="Any agent, the same rules."
            rest="Whether Claude, ChatGPT, Cursor or Nemesis made it, the same checks run every time."
          />
        </div>
        <div className="vx-stage">
          <ArtGround name="azure" className="vx-ground">
            <WorkspaceMock />
          </ArtGround>
        </div>
      </section>

      <CtaBand heading="See what structured study material looks like" />
      <VxFoot />
    </div>
  );
}
