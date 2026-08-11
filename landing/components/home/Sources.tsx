/**
 * SOURCES BECOME CONTEXT.
 *
 * The framing matters more than the list. "Upload your files and generate study
 * material" is the positioning this product moved away from; what an upload actually
 * does is give the system the territory it has to navigate.
 *
 * ── ONE CORRECTION TO EXISTING COPY ───────────────────────────────────────────
 *
 * The old page said citations point back at "the file and the page". They do not, and
 * `apps/web/lib/learn/canvas-grounding.ts` says why in its own header: nothing in the
 * AI-facing path can produce a page locator, Word documents have no internal units at
 * all, and asking a model for a page number it cannot know produces a confident
 * invention. So the text is split into excerpts with ids we minted, and a citation
 * resolves to the actual sentences a passage was built from. That is real provenance
 * and it is worth saying accurately — "the sentences it came from" is a stronger
 * claim than a page number would have been anyway.
 */

const KINDS = [
  "slide decks",
  "lecture recordings",
  "textbook chapters",
  "readings",
  "your own notes",
  "a syllabus",
  "photographs of a whiteboard",
] as const;

export function Sources() {
  return (
    <section className="hsec" id="sources">
      <div className="wrap">
        <div className="hsec-head" data-reveal="up">
          <p className="hkicker">sources</p>
          <h2 className="htitle">
            drop in everything.
            <br />
            <em>don&rsquo;t organise it first.</em>
          </h2>
          <p className="hlede">
            Nothing has to be tidy, named properly, or in the right folder. What goes in
            is not raw material for a generator — it is the territory Nemesis has to
            navigate before it can decide what you should do next.
          </p>
        </div>

        <ul className="kinds" data-reveal="soft">
          {KINDS.map((kind) => (
            <li key={kind}>{kind}</li>
          ))}
        </ul>

        <div className="hsec-foot" data-reveal="soft">
          <p className="hkicker">provenance</p>
          <p className="hlede hlede-tight">
            An explanation stays attached to the sentences it was built from, in your own
            material, so you can check it rather than take its word. Nemesis does not
            invent a page number it has no way of knowing.
          </p>
        </div>
      </div>
    </section>
  );
}
