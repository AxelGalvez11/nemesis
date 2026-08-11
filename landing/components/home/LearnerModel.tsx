/**
 * WHAT NEMESIS KNOWS ABOUT YOUR LEARNING.
 *
 * ── THIS SECTION HAS THE TIGHTEST ACCURACY CONSTRAINTS ON THE PAGE ────────────
 *
 * Three claims are easy to make here and all three would be false. They are the
 * reason the copy below is worded the way it is.
 *
 * 1. IT IS PER-TOPIC, NOT PER-PERSON. `diagnose()` takes one canvas's own concept
 *    list (`apps/web/lib/learn/canvas-diagnosis.ts`). There is no cross-course
 *    mastery profile that follows a learner through a degree, so the read-out is
 *    captioned with the topic it belongs to and the copy says "within a topic".
 *
 * 2. "UNTESTED" IS A REAL THIRD STATE, and it exists specifically "so the page never
 *    implies a concept was passed when nothing asked about it" — the code's own
 *    words. Showing it is the honest thing AND the more convincing thing: a read-out
 *    that admits what it has not measured is a read-out you can believe about what
 *    it has.
 *
 * 3. ELAPSED TIME IS NEVER A CLAIM OF FORGETTING. `canvas-retention.ts` carries a
 *    test asserting that no amount of elapsed time can turn into a claim of loss;
 *    its gate is named `needsFreshEvidence` for exactly that reason. So the copy
 *    says "worth asking about again", never "you have forgotten this".
 *
 * There are deliberately no percentages, no bars and no score. A number here would
 * be a precision the evidence does not support.
 */

interface Concept {
  name: string;
  state: string;
  tone?: "strong" | "weak";
}

const READOUT: readonly Concept[] = [
  { name: "elastic vs plastic deformation", state: "strong", tone: "strong" },
  { name: "second moment of area", state: "strong", tone: "strong" },
  { name: "shear vs bending failure", state: "developing" },
  { name: "buckling under eccentric load", state: "weak", tone: "weak" },
  { name: "combined loading", state: "not yet asked" },
];

const EVIDENCE = [
  "what you produced when asked, and what was missing from it",
  "false beliefs that showed up in an explanation",
  "which ideas a concept depends on, and whether those held",
  "how many corrective attempts an idea has already taken",
  "how long since you last demonstrated it",
] as const;

export function LearnerModel() {
  return (
    <section className="hsec" id="model">
      <div className="wrap">
        <div className="hsec-head" data-reveal="up">
          <p className="hkicker">learner model</p>
          <h2 className="htitle">it remembers what you know.</h2>
          <p className="hlede">
            Tomorrow&rsquo;s session is different because you are. Nemesis keeps a read
            of where a topic stands for you, and the next thing it asks comes out of
            that rather than out of a fixed sequence.
          </p>
        </div>

        <dl className="model" data-reveal="soft">
          {READOUT.map((concept) => (
            <div className="model-row" key={concept.name}>
              <dt>{concept.name}</dt>
              <dd className={concept.tone ? `is-${concept.tone}` : undefined}>
                {concept.state}
              </dd>
            </div>
          ))}
        </dl>
        <p className="model-cap" data-reveal="soft">
          One topic&rsquo;s read-out. Nemesis tracks understanding within the thing you
          are learning, not as a single score for a whole degree. Anything it has not
          asked about is shown as untested rather than counted as known.
        </p>

        <div className="hsec-foot" data-reveal="soft">
          <p className="hkicker">what it reads</p>
          <ul className="ev">
            {EVIDENCE.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p className="model-cap">
            Time is a reason to ask again, never a conclusion on its own. If it has
            been a while, the idea comes back as a question rather than as a claim
            that you have lost it.
          </p>
        </div>
      </div>
    </section>
  );
}
