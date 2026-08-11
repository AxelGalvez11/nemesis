"use client";

import { NemesisMark, type MarkState } from "@/components/NemesisMark";
import { APP_SIGN_UP } from "@/components/SiteChrome";
import { captureCtaClick } from "@/lib/posthog";

/**
 * CANVAS — the largest section on the page, and the only one allowed to be wide.
 *
 * Canvas is not one feature among several. It is where the learning happens, so it
 * gets the space that implies, and everything after it is support.
 *
 * ── WHAT IS SHOWN, AND WHY IT IS NOT A SCREENSHOT ─────────────────────────────
 *
 * Two things, both honest about what they are.
 *
 * The RAIL is the five stages of the loop, each carrying the bead mark in the state
 * that stage corresponds to. This is where the motion vocabulary is taught: by the
 * time a bead appears anywhere else, `diagnosing` already means something.
 *
 * The TURN below it writes out one pass through the loop in the page's own type. It
 * is deliberately not dressed as a capture — no window chrome, no toolbar, no
 * cursor — because a fabricated screenshot of a surface the visitor has not seen is
 * the one thing that would make the rest of the page untrustworthy.
 *
 * ── EVERY BEHAVIOUR NAMED HERE EXISTS ─────────────────────────────────────────
 *
 * The stage names are the canvas's own states (`apps/web/lib/learn/canvas-model.ts`:
 * orient, learn, recall, test, diagnose, targeted_relearn, retest). The diagnosis
 * wording matches what the judge actually produces — a verdict plus what was
 * demonstrated and what was missing, not a score. The five outcomes the system can
 * choose between are `canvas-policy.ts`'s own: advance, clarify the gap, correct,
 * repair a misconception, or re-teach and ask again.
 *
 * The worked example is constitutional law rather than pharmacology on purpose.
 * Nemesis is field-agnostic by standing rule, the product's own demo fixture happens
 * to be cardiac physiology, and leading with medicine on the homepage would make a
 * general-purpose instrument look like a med-school tool.
 */

interface Stage {
  n: string;
  state: MarkState;
  name: string;
  says: string;
}

const STAGES: readonly Stage[] = [
  {
    n: "01",
    state: "reading",
    name: "understand",
    says: "The material becomes a lesson pitched at what you already know, with every term defined the first time it is used.",
  },
  {
    n: "02",
    state: "retrieving",
    name: "retrieve",
    says: "The explanation recedes and Nemesis asks you to produce it: explain, solve, write, or say it back.",
  },
  {
    n: "03",
    state: "diagnosing",
    name: "diagnose",
    says: "Your answer is read for what it shows. Not a mark out of ten, but which idea held and which one broke.",
  },
  {
    n: "04",
    state: "adapting",
    name: "adapt",
    says: "The canvas changes. What you have recedes, the gap is taught directly, and the next question is a different question.",
  },
  {
    n: "05",
    state: "success",
    name: "advance",
    says: "Once an idea holds under retrieval, it stops taking up room and the next one gets the attention.",
  },
];

export function Canvas() {
  return (
    <section className="hsec" id="canvas">
      <div className="wrap">
        <div className="hsec-head hsec-head-wide" data-reveal="up">
          <p className="hkicker">canvas</p>
          <h2 className="htitle">
            one surface that keeps deciding what you should do next.
          </h2>
          <p className="hlede">
            You do not assemble notes, then cards, then a quiz, then a revision plan,
            and then begin. Nemesis builds the map. You move through it, and the map
            changes as it learns what you can do.
          </p>
        </div>

        {/* The loop, as a measured rail. */}
        <div className="loop">
          {STAGES.map((stage) => (
            <div className="stage" key={stage.n} data-reveal="soft">
              <div className="stage-mark">
                <NemesisMark state={stage.state} size={44} />
              </div>
              <div className="stage-n">{stage.n}</div>
              <h3>{stage.name}</h3>
              <p>{stage.says}</p>
            </div>
          ))}
        </div>

        {/* One turn, written out. */}
        <div className="turn" data-reveal="soft">
          <p className="turn-k">retrieve</p>
          <p className="turn-ask">
            Why can a state law that treats in-state and out-of-state business
            identically still fail under the commerce clause?
          </p>

          <p className="turn-k">you answer</p>
          <p className="turn-said">
            because congress has the power over interstate commerce, so a state law
            that burdens it is preempted
          </p>

          <p className="turn-k">nemesis reads</p>
          <p className="turn-read">
            You have the source of the power. What is missing is that this one is not
            about discrimination at all: a neutral law survives or fails on whether its
            burden on interstate commerce is <b>clearly excessive</b> against the local
            benefit. That is a weighing, not a preemption.
          </p>

          <p className="turn-k">next</p>
          <p className="turn-read">
            The discrimination test collapses to a line. Balancing opens, with one
            worked case, and you are asked again in the other direction.
          </p>

          <p className="turn-note">
            Illustration of one pass through the loop, in the page&rsquo;s own type
            rather than a screenshot. What Nemesis chooses between is real and narrow:
            advance, teach only the missing piece, correct, replace a false belief, or
            re-teach and ask again. After two corrective attempts on the same idea it
            stops rephrasing and brings the idea back later with fresh material.
          </p>
        </div>

        <div className="hcta hsec-foot" data-reveal="soft">
          <a
            className="btn btn-primary"
            href={APP_SIGN_UP}
            onClick={() => captureCtaClick("canvas", "Start learning")}
          >
            Start learning
          </a>
          <span className="hlink-quiet">free to start, no card</span>
        </div>
      </div>
    </section>
  );
}
