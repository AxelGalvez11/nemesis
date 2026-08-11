/**
 * TRUST AND AGENCY — deliberately below the product narrative.
 *
 * First establish that someone wants this, then establish that they can rely on it.
 * Trust copy at the top of a page is answering an objection nobody has formed yet.
 *
 * ── EVERY LINE HERE IS SOMETHING THAT EXISTS ──────────────────────────────────
 *
 * The brief asked to preserve material on "approval requirements" and "consequential
 * academic actions". There is no approval-gate system in the product — it was looked
 * for and it is not there — so it is not claimed. What IS here is real and, between
 * them, these four cover the same ground more honestly:
 *
 *   - "never submits work on your behalf" is standing product policy and already
 *     shipped on /about.
 *   - the refusal to guess is `canvas-judge.ts`, which will not aim a correction at a
 *     reading it is not confident about, on the stated grounds that a confident
 *     correction of the wrong thing costs the learner more than an honest
 *     re-explanation. That is an unusual thing for a product to do and it is worth
 *     more than a privacy badge.
 *   - provenance is `canvas-grounding.ts`, and it is excerpt-level, not page-level.
 *   - the library being plain, exportable files is existing policy on /about.
 */

interface Point {
  label: string;
  lead: string;
  body: string;
}

const POINTS: readonly Point[] = [
  {
    label: "the line",
    lead: "It never submits work for you.",
    body: "Nemesis helps you learn the material. It does not sit an assessment, and it does not hand anything in on your behalf. Drafts are yours to check, finish and turn in.",
  },
  {
    label: "uncertainty",
    lead: "When it cannot tell, it says so instead of guessing.",
    body: "If an answer is too ambiguous to read confidently, Nemesis re-explains rather than correcting you precisely. A confident correction aimed at the wrong thing costs you more than an honest second pass.",
  },
  {
    label: "checkable",
    lead: "Explanations stay attached to your own material.",
    body: "A passage keeps a link to the sentences it was built from, so anything that looks wrong can be checked against the source rather than argued with.",
  },
  {
    label: "yours",
    lead: "Your library is plain files you can take with you.",
    body: "Exportable at any time and readable in any editor. No ads, no selling your data, and your coursework is not training material. Leave whenever you want and take all of it.",
  },
];

export function Trust() {
  return (
    <section className="hsec" id="trust">
      <div className="wrap">
        <div className="hsec-head" data-reveal="up">
          <p className="hkicker">control</p>
          <h2 className="htitle">it works for you, and only where you let it.</h2>
        </div>

        <dl className="defs" data-reveal="soft">
          {POINTS.map((point) => (
            <div className="def" key={point.label}>
              <dt>{point.label}</dt>
              <dd>
                <p className="def-lead">{point.lead}</p>
                <p className="def-body">{point.body}</p>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
