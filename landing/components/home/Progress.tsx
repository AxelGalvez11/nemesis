/**
 * PROGRESS IS THE REWARD.
 *
 * Kept short on purpose. The engagement loop is one line of five terms, and the
 * argument underneath it is made by naming what is absent rather than by promising
 * what is present — a page that says "no streaks" while showing a streak counter is
 * a page nobody believes, and the inverse is equally true: listing the mechanics we
 * decline to use is the only version of this claim that costs anything to make.
 *
 * The struck-through list is the whole design. Every one of those is a mechanic whose
 * purpose is time-in-app, and time-in-app is not what this product is optimising.
 */

const CYCLE = ["challenge", "attempt", "feedback", "competence", "next challenge"] as const;

const DECLINED = ["streaks", "hearts", "badges", "xp", "leaderboards", "daily goals"] as const;

export function Progress() {
  return (
    <section className="hsec" id="progress">
      <div className="wrap">
        <div className="hsec-head" data-reveal="up">
          <p className="hkicker">progress</p>
          <h2 className="htitle">progress is the reward.</h2>
          <p className="hlede">
            Progress means becoming able to do something that was not available to you
            before. There is nothing else to collect.
          </p>
        </div>

        <div className="cycle" data-reveal="soft">
          {CYCLE.map((step) => (
            <span key={step}>{step}</span>
          ))}
        </div>

        <ul className="absent" data-reveal="soft">
          {DECLINED.map((item) => (
            <li key={item}>
              <s>{item}</s>
            </li>
          ))}
        </ul>
        <p className="absent-say" data-reveal="soft">
          None of these measure whether you have become capable of anything. They
          measure whether you came back.
        </p>
      </div>
    </section>
  );
}
