/**
 * THE SUPPORTING INFRASTRUCTURE — and only now.
 *
 * These are real capabilities that used to be the whole page. They are last because
 * a capability list answers "what does it have", and nobody asks that until they know
 * what the thing is for.
 *
 * TWO RULES SHAPE THE COPY. Every row has to answer "how does this reduce friction or
 * improve the loop", which is why each one leads with the outcome and explains the
 * mechanism second. And none of them are described as PLACES any more: the product
 * retired Chat, Study, Library and Chill as destinations you navigate to, so
 * "retrieval" is a thing that happens when it is useful, not a tab you visit.
 *
 * The layout is a definition list on hairlines rather than a three-by-three grid of
 * tiles. A grid says these are peers of equal weight, which they are not, and it caps
 * the list at whatever number divides neatly.
 */

interface Capability {
  label: string;
  lead: string;
  body: string;
}

const CAPABILITIES: readonly Capability[] = [
  {
    label: "recording",
    lead: "Stay present during the lecture.",
    body: "Nemesis writes the lecture down as it happens and cleans up the transcript afterwards, so a quiet room and a distant lecturer still come out readable. Parts upload while you are still recording rather than at the end, so a closed tab does not take the lecture with it.",
  },
  {
    label: "ingestion",
    lead: "Course material arrives in whatever state it is in.",
    body: "Slide decks, PDFs, documents and readings are parsed into text, structure and figures, and what comes out keeps enough of the original shape that a citation can point back into it.",
  },
  {
    label: "retrieval",
    lead: "Retrieval appears when retrieval is the useful next action.",
    body: "Not a deck you remember to open. When an idea is due to be produced from memory rather than recognised again, that is what the canvas asks for, and how it asks depends on what kind of knowledge it is.",
  },
  {
    label: "sources",
    lead: "Your material stays connected to what you learned from it.",
    body: "A passage keeps a link back to the excerpt it was built from, so an explanation you doubt can be checked against the thing it came from in a couple of seconds.",
  },
  {
    label: "calendar",
    lead: "Deadlines and free hours shape what learning happens next.",
    body: "What is due, and how much time there actually is before it, is information about what to work on now. Review turns into blocks of work rather than one entry per objective, and a block that cannot fit says so instead of pretending.",
  },
  {
    label: "memory",
    lead: "It gets sharper the longer you use it.",
    body: "Everything you and the system make stays in your own library. That library is what the next session is built from, which is why the second month works better than the first.",
  },
];

export function Capabilities() {
  return (
    <section className="hsec" id="capabilities">
      <div className="wrap">
        <div className="hsec-head hsec-head-wide" data-reveal="up">
          <p className="hkicker">underneath</p>
          <h2 className="htitle">what has to be true for the loop to work.</h2>
        </div>

        <dl className="defs" data-reveal="soft">
          {CAPABILITIES.map((cap) => (
            <div className="def" key={cap.label}>
              <dt>{cap.label}</dt>
              <dd>
                <p className="def-lead">{cap.lead}</p>
                <p className="def-body">{cap.body}</p>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
