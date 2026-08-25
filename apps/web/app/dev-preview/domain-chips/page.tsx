"use client";

// DEV-ONLY PREVIEW — the searched-domain chips, against the REAL favicon route.
//
// 🔴 THE STATES THAT MATTER HERE ARE THE UGLY ONES. The happy path (four well-known sites with
// clean icons) is the one case that needs no looking at. What needs looking at is a site with no
// icon at all, a hostname that resolves to nothing, an overflow list, and a single chip — because
// those are what a real turn produces and what no screenshot of the reference can show us.
//
// This hits `/api/favicon` for real, so the fallback glyph and the timeout path are exercised
// rather than mocked. A domain that does not exist is the point, not an oversight.

import { DomainChips } from "@/components/DomainChips";
import { BloubDock } from "@/components/bloub/bloub-dock";

const WELL_KNOWN = ["en.wikipedia.org", "www.bbc.co.uk", "arxiv.org", "www.nature.com"];
const MANY = [...WELL_KNOWN, "pubmed.ncbi.nlm.nih.gov", "www.jstor.org", "plato.stanford.edu", "www.reuters.com", "openstax.org"];
const BROKEN = ["this-domain-does-not-exist-9f2a.example", "localhost.invalid", "en.wikipedia.org"];

function Row({ children, note, title }: { children: React.ReactNode; note: string; title: string }) {
  return (
    <div className="flex flex-col gap-1 border-b border-(--ui-stroke-tertiary) py-4 last:border-b-0">
      <p className="text-[length:var(--canvas-text-small)] font-medium text-foreground">{title}</p>
      <p className="mb-1 text-[length:var(--canvas-text-meta)] text-(--ui-text-tertiary)">{note}</p>
      {children}
    </div>
  );
}

export default function DomainChipsPreview() {
  return (
    <main className="min-h-screen p-10" data-workspace="">
      <h1 className="workspace-page-title mb-2">Searched-domain chips</h1>
      <p className="mb-6 max-w-2xl text-[length:var(--canvas-text-meta)] text-(--ui-text-tertiary)">
        Live against <code>/api/favicon</code>. Icons are fetched by the server from each site&rsquo;s own
        origin, so nothing here tells a third party which sites are listed. Geometry measured off
        ChatGPT 2026-08-24; the label is the bare hostname, matching the source pills and the
        Sources panel rather than the reference&rsquo;s publisher names.
      </p>

      <div className="max-w-2xl">
        <Row note="The ordinary case: four sites, real icons." title="Four sites">
          <DomainChips domains={WELL_KNOWN} />
        </Row>
        <Row note="Nine sites at the default cap of six, so the remainder shows as +3." title="Overflow">
          <DomainChips domains={MANY} />
        </Row>
        <Row note="One site, no overflow marker at all." title="Single">
          <DomainChips domains={["arxiv.org"]} />
        </Row>
        <Row
          note="Two hosts that cannot resolve, beside one that can. The unreachable pair must show the drawn globe — never a broken-image glyph, and never a gap in the row."
          title="🔴 Unreachable hosts — the state that will actually happen"
        >
          <DomainChips domains={BROKEN} />
        </Row>
        <Row note="An empty list draws nothing whatsoever — no placeholder, no default list." title="🔴 Nothing searched">
          <span className="text-[length:var(--canvas-text-meta)] text-(--ui-text-tertiary)">
            [<DomainChips domains={[]} />] &larr; there must be nothing between those brackets
          </span>
        </Row>
      </div>

      {/* The real render site: chips under the caption, both counter-scaled with the character. */}
      <div className="relative mt-10 h-64 w-full max-w-2xl rounded-xl border border-(--ui-stroke-secondary)">
        <p className="p-3 text-[length:var(--canvas-text-meta)] text-(--ui-text-tertiary)">
          On the dock, centre station — caption shimmers, chips do not.
        </p>
        <BloubDock
          caption="Reading sources"
          contain
          domains={WELL_KNOWN}
          state="idle"
          station="centre"
        />
      </div>
    </main>
  );
}
