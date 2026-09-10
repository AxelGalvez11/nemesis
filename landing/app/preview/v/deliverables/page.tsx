import type { Metadata } from "next";

import { ArtGround, DeckMock, DocMock, SlidesMock, WorkspaceMock } from "@/components/reference/mockups/Mockups";
import { CtaBand, Stat, TwoTone, VxFoot, VxNav } from "@/components/reference/VariantChrome";

import "../../reference.css";
import "../variants.css";

export const metadata: Metadata = { title: "Nemesis · B · The deliverables" };

/** Variation B. Lead: what comes out. Figma's own three-column hero, the deck standing in the art
 *  slot on the lime gradient, the call to action as a slab on the right. */
export default function VariantDeliverables() {
  return (
    <div className="ref-page">
      <VxNav />
      <section className="ref-hero">
        <div className="ref-hero-in">
          <h1 className="ref-h1">Decks, slides and guides from your own notes</h1>
          <div className="ref-hero-art">
            <ArtGround name="lime" className="vx-ground vx-ground-fill">
              <DeckMock />
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
            lead="One source, four outputs."
            rest="Drop in a lecture and get a spaced repetition deck, a slide summary, a study guide and a practice test."
          />
          <div className="vx-grid-2">
            <ArtGround name="orange" className="vx-ground vx-ground-tight">
              <SlidesMock />
            </ArtGround>
            <ArtGround name="violet" className="vx-ground vx-ground-tight">
              <DocMock />
            </ArtGround>
          </div>
        </div>
      </section>

      <section className="ref-section">
        <div className="ref-container vx-split">
          <TwoTone
            align="left"
            lead="Reviews at the right moment."
            rest="FSRS predicts when you are about to forget each card and brings it back just before you do."
          />
          <ArtGround name="emerald" className="vx-ground vx-ground-tight">
            <DeckMock />
          </ArtGround>
        </div>
      </section>

      <section className="ref-section" id="agents">
        <div className="ref-container">
          <TwoTone lead="Or let your agent do it." rest="Claude, ChatGPT and Cursor can build the same things, to the same rules." />
        </div>
        <div className="vx-stage">
          <ArtGround name="azure" className="vx-ground">
            <WorkspaceMock />
          </ArtGround>
        </div>
      </section>

      <section className="ref-section">
        <div className="ref-container">
          <Stat value="17" label="File formats read on the way in, from slide decks to handwriting." />
        </div>
      </section>

      <CtaBand heading="Turn your next lecture into a deck" />
      <VxFoot />
    </div>
  );
}
