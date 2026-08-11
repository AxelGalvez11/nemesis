/**
 * YOUR MISTAKES CHANGE WHAT COMES NEXT.
 *
 * The section shows a stack of concepts reorganising itself once, when it is scrolled
 * to: what held recedes, what broke expands, and a prerequisite that was not in the
 * list appears underneath it. The motion happens a single time, on arrival, because
 * it is reporting a change of state — and a state that keeps changing back was never
 * a state.
 *
 * WHY THERE IS NO SCORE ANYWHERE HERE. "7 / 10" is the thing this product exists not
 * to do. A number records that something went wrong without recording what, which is
 * exactly the information needed in order to fix it. The wording below matches what
 * the judge actually produces: a verdict, what was demonstrated, and what was missing.
 *
 * The verdicts are real (`apps/web/lib/learn/canvas-model.ts`): strong, understood,
 * partial, incorrect, misconception. "misconception" being separate from "incorrect"
 * is the distinction worth showing — a false belief has to be replaced rather than
 * filled in, and the system takes a different action for each.
 *
 * The subject is deliberately not the same as the Canvas section's. Nemesis is
 * field-agnostic by standing rule, and the cheapest way to show that is to stop
 * saying it and simply keep changing discipline.
 */

type Role = "settled" | "opened" | "appears";

interface Row {
  name: string;
  state: string;
  role: Role;
  found?: string;
}

const ROWS: readonly Row[] = [
  { name: "cardiac output", state: "understood", role: "settled" },
  { name: "stroke volume", state: "understood", role: "settled" },
  {
    name: "preload and contractility",
    state: "misconception",
    role: "opened",
    found:
      "You are treating them as one lever. Preload is how full the ventricle is before the beat; contractility is how hard the muscle squeezes at a given filling. Your answer changes one and reports the other.",
  },
  {
    name: "the frank-starling relationship",
    state: "prerequisite, added",
    role: "appears",
  },
  { name: "afterload", state: "not yet asked", role: "settled" },
];

export function FailureIsNavigation() {
  return (
    <section className="hsec" id="failure">
      <div className="wrap">
        <div className="hsec-head" data-reveal="up">
          <p className="hkicker">diagnosis</p>
          <h2 className="htitle">your mistakes change what comes next.</h2>
          <p className="hlede">
            A wrong answer is not a score. It is the most useful evidence available
            about how you are modelling something, and it is the only moment the model
            is visible at all.
          </p>
        </div>

        <dl className="restack" data-reveal="soft">
          {ROWS.map((row) => (
            <div className={`rrow rrow-${row.role}`} key={row.name}>
              <dt className="rrow-name">{row.name}</dt>
              <dd className="rrow-state">{row.state}</dd>
              {row.found ? <dd className="rrow-sub">{row.found}</dd> : null}
            </div>
          ))}
        </dl>

        <p className="hlede hsec-foot" data-reveal="soft">
          One idea collapses. Another expands. A prerequisite that was skipped appears
          underneath it. Then the question comes back, from the other direction.
        </p>
      </div>
    </section>
  );
}
