/**
 * THE PROBLEM — and it is not that your files are scattered.
 *
 * The old page's problem section was "slides in one portal, readings in another".
 * That is real, but it is a filing problem, and a filing problem invites a filing
 * product. The deeper one is that a student spends most of their study time getting
 * READY to study, and none of that preparation is the part that produces learning.
 *
 * The argument is made by the two chains rather than by the paragraph: one is nine
 * steps long and grey, the other is three and in full ink. Nobody has to finish
 * reading to get it.
 *
 * THE LEDGER UNDERNEATH IS THE HONEST HALF. "Remove friction" on its own says the
 * product wants learning to be effortless, which is the opposite of what it does —
 * so the two columns name exactly what goes and exactly what stays, and the column
 * that stays is the hard one.
 */

const TRADITIONAL = [
  "sit through the lecture",
  "take notes",
  "clean up the notes",
  "organise them by week",
  "build a study guide",
  "make flashcards",
  "hunt for practice questions",
  "work out what is weak",
  "plan the review",
] as const;

const REMOVED = [
  "formatting",
  "organising",
  "rereading what you already know",
  "building a study system by hand",
  "deciding what to do next",
] as const;

const PRESERVED = [
  "retrieval",
  "reasoning",
  "synthesis",
  "explanation",
  "application",
  "correction",
] as const;

export function Preparation() {
  return (
    <section className="hsec hsec-open" id="problem">
      <div className="wrap">
        <div className="hsec-head" data-reveal="up">
          <p className="hkicker">the preparation tax</p>
          <h2 className="htitle">spend less time preparing to learn.</h2>
          <p className="hlede">
            Almost none of the work between a lecture and an exam is learning. It is
            transcription, tidying, formatting and scheduling, and it has to be
            finished before the part that actually builds understanding can start.
          </p>
        </div>

        <div className="chains">
          <div data-reveal="soft">
            <p className="chain-k">how it usually goes</p>
            <ol className="chain-list">
              {TRADITIONAL.map((step) => (
                <li key={step}>{step}</li>
              ))}
              <li className="is-learning">finally learn</li>
            </ol>
          </div>

          <div className="chain-now" data-reveal="soft">
            <p className="chain-k">with nemesis</p>
            <ol className="chain-list">
              <li>course material in</li>
              <li>an adaptive path through it</li>
              <li>learn</li>
            </ol>
          </div>
        </div>

        <div className="ledger">
          <div data-reveal="soft">
            <h3>what nemesis removes</h3>
            <ul>
              {REMOVED.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div className="ledger-keep" data-reveal="soft">
            <h3>what nemesis keeps</h3>
            <ul>
              {PRESERVED.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>

        <p className="hlede hsec-foot" data-reveal="soft">
          The goal is not to make learning effortless. It is to remove the effort that
          does not produce learning.
        </p>
      </div>
    </section>
  );
}
