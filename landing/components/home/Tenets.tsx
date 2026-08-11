/**
 * THE TENETS, and the mission under them.
 *
 * Called tenets rather than a manifesto, on instruction and because a manifesto is a
 * document about the company and these are statements about how the product behaves —
 * every one of them is visible in the sections above, which is the only thing that
 * earns them a place on a homepage.
 *
 * ON THE ROUTE QUESTION: this stays a section and does not become /tenets. The brief
 * permits either and warns against unnecessary routes; a separate page would need its
 * own traffic to be worth anything, and these six lines land hardest immediately after
 * the evidence for them. /about keeps the company story and is not duplicated here.
 *
 * Each tenet gets one line of why. Six bare slogans is a poster; six slogans with a
 * sentence apiece is a position.
 */

interface Tenet {
  n: string;
  say: string;
  why: string;
}

const TENETS: readonly Tenet[] = [
  {
    n: "01",
    say: "retrieval over recognition.",
    why: "Seeing something again is not evidence you could produce it. Nemesis asks you to explain, solve, write or say it whenever producing it is the useful next action.",
  },
  {
    n: "02",
    say: "failure is navigation.",
    why: "A wrong answer is evidence about your current model, not a mark against you. Nemesis works out why the understanding broke and changes what comes next.",
  },
  {
    n: "03",
    say: "first the map, then the territory.",
    why: "Start at the highest useful level and increase resolution from there. Twenty isolated facts are harder to hold than the three ideas that unlock them.",
  },
  {
    n: "04",
    say: "remove friction. preserve struggle.",
    why: "Formatting, organising and planning go. Retrieval, reasoning, synthesis and correction stay, because those are the parts that produce capability.",
  },
  {
    n: "05",
    say: "the system adapts, not the learner.",
    why: "You do not have to decide what to study, when to test yourself, or which prerequisite you are missing. Those decisions come from evidence of what you understand.",
  },
  {
    n: "06",
    say: "progress means capability.",
    why: "No streaks, no experience points, no manufactured scarcity. Progress is being able to do something that was not available to you last week.",
  },
];

export function Tenets() {
  return (
    <section className="hsec" id="tenets">
      <div className="wrap">
        <div className="hsec-head" data-reveal="up">
          <p className="hkicker">tenets</p>
          <h2 className="htitle">what nemesis believes.</h2>
        </div>

        <div className="tenets">
          {TENETS.map((tenet) => (
            <div className="tenet" key={tenet.n} data-reveal="soft">
              <div className="tenet-n">{tenet.n}</div>
              <div>
                <p className="tenet-say">{tenet.say}</p>
                <p className="tenet-why">{tenet.why}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mission" data-reveal="up">
          <p className="hkicker">the mission</p>
          <p>push deep human learning toward its cognitive limits.</p>
          <p className="mission-sub">
            the machine prepares.
            <br />
            the human learns.
          </p>
        </div>

        <p className="hlede hsec-foot" data-reveal="soft">
          The bet behind all of it: AI can make people more capable. A machine knowing
          more does not require the person to know less.
        </p>
      </div>
    </section>
  );
}
