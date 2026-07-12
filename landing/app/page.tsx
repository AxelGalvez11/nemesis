"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect } from "react";
import { SocialLinks } from "@/components/SocialLinks";

const APP_SIGN_UP = "https://app.pharmaorb.app/sign-up";
const APP_SIGN_IN = "https://app.pharmaorb.app/sign-in";

/**
 * One scroll controller drives every decorative background layer. Each offset is
 * calculated relative to its own section, clamped to the available overscan, and
 * disabled when the visitor requests reduced motion.
 */
function useBackgroundParallax() {
  useEffect(() => {
    const layers = Array.from(
      document.querySelectorAll<HTMLElement>(".parallax-layer"),
    );
    if (!layers.length) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const visibleLayers = new Set<HTMLElement>();
    let frame = 0;

    const resetLayers = () => {
      layers.forEach((layer) => {
        layer.style.setProperty("--parallax-y", "0px");
        layer.classList.remove("is-parallax-active");
      });
    };

    const update = () => {
      frame = 0;
      if (reducedMotion.matches) {
        resetLayers();
        return;
      }

      const viewportHeight = window.innerHeight;
      const mobileScale = window.innerWidth <= 820 ? 0.55 : 1;

      visibleLayers.forEach((layer) => {
        const anchor = layer.closest<HTMLElement>(".hero, .obj, .band") ?? layer;
        const rect = anchor.getBoundingClientRect();
        const travel = (viewportHeight + rect.height) / 2;
        const progress = Math.max(
          -1,
          Math.min(1, (viewportHeight / 2 - (rect.top + rect.height / 2)) / travel),
        );
        const amount = Number(layer.dataset.parallaxAmount ?? 0) * mobileScale;

        layer.style.setProperty("--parallax-y", `${(progress * amount).toFixed(2)}px`);
      });
    };

    const requestUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const layer = entry.target as HTMLElement;
          if (entry.isIntersecting && !reducedMotion.matches) {
            visibleLayers.add(layer);
            layer.classList.add("is-parallax-active");
          } else {
            visibleLayers.delete(layer);
            layer.classList.remove("is-parallax-active");
          }
        });
        requestUpdate();
      },
      { rootMargin: "12% 0px" },
    );

    const onMotionPreferenceChange = () => {
      if (reducedMotion.matches) resetLayers();
      requestUpdate();
    };

    layers.forEach((layer) => observer.observe(layer));
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate);
    reducedMotion.addEventListener("change", onMotionPreferenceChange);
    requestUpdate();

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", requestUpdate);
      reducedMotion.removeEventListener("change", onMotionPreferenceChange);
      if (frame) window.cancelAnimationFrame(frame);
      resetLayers();
    };
  }, []);
}

export default function Home() {
  useBackgroundParallax();

  return (
    <>
      <nav className="nav">
        <div className="wrap nav-in">
          <Link className="brand" href="/" aria-label="Nemesis home">
            <Image src="/nemesis/logo.png" alt="" width={26} height={26} />
            <b>Nemesis</b>
          </Link>
          <span className="spacer" />
          <a className="ghost" href="#how">Containment</a>
          <a className="ghost" href="#graph">Memory</a>
          <a className="ghost" href="#privacy">Boundaries</a>
          <a className="ghost" href={APP_SIGN_IN}>Sign in</a>
          <a className="btn btn-primary" href={APP_SIGN_UP}>Deploy Nemesis</a>
        </div>
      </nav>

      <header className="hero">
        <div className="hero-art parallax-layer" data-parallax-amount="64" />
        <div className="hero-veil" />
        <div className="wrap">
          <div className="hero-in">
            <p className="eyebrow reveal">
              Academic agent<span className="dot"> · </span>under containment
              <span className="dot"> · </span>macOS
            </p>
            <h1 className="reveal r2">Nemesis</h1>
            <p className="phrase reveal r3">
              It remembers<span className="dot"> · </span>It learns
              <span className="dot"> · </span>It acts
            </p>
            <div className="hero-cta reveal r4">
              <a className="btn btn-primary" href={APP_SIGN_UP}>Deploy Nemesis</a>
              <a className="btn btn-ghost" href="#how">Inspect the system</a>
            </div>
            <div className="hero-meta reveal r4">
              <span>persistent memory</span>
              <span className="rule" />
              <span>scoped tools</span>
              <span className="rule" />
              <span>human submission</span>
            </div>
          </div>
        </div>
      </header>

      <section className="section alt" id="how">
        <div className="wrap">
          <div className="section-head">
            <p className="eyebrow">Containment brief</p>
            <h2>Give it the semester. Keep the final authority.</h2>
          </div>
          <div className="qs">
            <div className="q">
              <div className="n">01</div>
              <h3>It detects what <span className="b">changed</span>.</h3>
              <p>
                Announcements, moved exams, new grades, new files. Nemesis reads the sources
                you authorize, compares them with the record, and tells you exactly what moved.
              </p>
            </div>
            <div className="q">
              <div className="n">02</div>
              <h3>It ranks what comes <span className="b">next</span>.</h3>
              <p>
                Open work is ranked by deadline, grade weight, and mastery. One task rises
                to the top, with the reason attached.
              </p>
            </div>
            <div className="q">
              <div className="n">03</div>
              <h3>It finds the <span className="b">weak point</span>.</h3>
              <p>
                Recall is tracked through your review history. Nemesis identifies what is
                likely to cost you and brings it forward before the exam does.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <div className="section-head">
            <p className="eyebrow">
              Memory<span className="dot"> · </span>Skill
              <span className="dot"> · </span>Agency
            </p>
            <h2>A capable system, held to a narrow mission.</h2>
            <p>
              Built on the Hermes agent framework, Nemesis can compound its intelligence.
              Its permitted scope remains fixed.
            </p>
          </div>
          <div className="triad">
            <div className="obj">
              <div className="img-shell" role="img" aria-label="Glitched black-chrome clipboard">
                <div className="img intelligence parallax-layer" data-parallax-amount="18" />
              </div>
              <div className="cap">
                <div className="k">Persistent memory</div>
                <h3>It remembers across sessions</h3>
                <p>
                  Courses, deadlines, lectures, concepts, and preferences persist after the
                  conversation ends. Every academic fact keeps its source and history, so
                  Nemesis does not wake up blank.
                </p>
              </div>
            </div>
            <div className="obj">
              <div className="img-shell" role="img" aria-label="Glitched open black-chrome textbook">
                <div className="img mastery parallax-layer" data-parallax-amount="18" />
              </div>
              <div className="cap">
                <div className="k">Procedural skill</div>
                <h3>It learns how the work gets done</h3>
                <p>
                  A successful workflow can become a reusable skill: sync a portal, build a
                  deck, prepare a brief. The procedure can improve without gaining new
                  authority.
                </p>
              </div>
            </div>
            <div className="obj">
              <div className="img-shell" role="img" aria-label="Glitched black-chrome desk calendar">
                <div className="img calendar parallax-layer" data-parallax-amount="18" />
              </div>
              <div className="cap">
                <div className="k">Controlled agency</div>
                <h3>It divides the work, then returns it</h3>
                <p>
                  Nemesis can delegate bounded tasks, run recurring prompts on schedule, and
                  call only the tools in scope. Work runs in isolated task contexts. Results
                  return to you. Submission does not.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="band" id="graph">
        <div className="band-art graph parallax-layer" data-parallax-amount="48" />
        <div className="band-veil" />
        <div className="wrap">
          <div className="band-in">
            <p className="eyebrow">Persistent memory</p>
            <h2>The entity remembers the whole semester.</h2>
            <p>
              Courses, deadlines, lectures, grades, and concepts live in one sourced graph
              that survives the chat. New evidence updates the record without erasing its
              history. Ask about the semester and Nemesis answers from what it can trace.
            </p>
          </div>
        </div>
      </div>

      <section className="section">
        <div className="wrap">
          <div className="section-head">
            <p className="eyebrow">Authorized capabilities</p>
            <h2>What it is allowed to do.</h2>
          </div>
          <div className="caps">
            <div className="cap">
              <div className="k">Signal</div>
              <h3>Turn lectures into study material</h3>
              <p>
                With microphone access, Nemesis transcribes lectures on-device. From that
                transcript, it can prepare notes, mind maps, decks, and practice tests. The
                audio remains on your Mac.
              </p>
            </div>
            <div className="cap">
              <div className="k">Browser</div>
              <h3>Enter the accounts you authorize</h3>
              <p>
                Nemesis uses your logged-in school browser to read Blackboard, Outlook,
                Canvas, and Gmail. The session stays on your Mac; your password is never
                handed to the agent.
              </p>
            </div>
            <div className="cap">
              <div className="k">Automation</div>
              <h3>Run the mission on schedule</h3>
              <p>
                Set recurring briefs and recall-based review queues. When authorized, each
                run follows a defined prompt or skill, then records what changed.
              </p>
            </div>
            <div className="cap">
              <div className="k">Delegation</div>
              <h3>Split complex work into contained tasks</h3>
              <p>
                Research, organizing, and drafting can run in parallel, isolated task
                contexts. Nemesis returns cited slides, reports, and handouts for review.
                Submission remains yours.
              </p>
            </div>
          </div>
          <div className="trust" id="privacy">
            <span className="lock">Containment protocol</span>
            <p>
              School sign-ins and lecture audio stay on your Mac. Nemesis uses its configured
              AI provider for reasoning.{" "}
              <span>
                Tools stay within the scope you authorize, material actions are logged, and
                coursework is never submitted on your behalf.
              </span>
            </p>
          </div>
        </div>
      </section>

      <div className="band">
        <div className="band-art order parallax-layer" data-parallax-amount="48" />
        <div className="band-veil" />
        <div className="wrap">
          <div className="band-in">
            <p className="eyebrow">
              Files<span className="dot"> · </span>Calendar
              <span className="dot"> · </span>Inbox
            </p>
            <h2>Order is maintained inside the perimeter.</h2>
            <p>
              Notes filed. Decks current. Calendar reconciled. Browser sweeps and scheduled
              tasks leave a plain-English trail.
            </p>
          </div>
        </div>
      </div>

      <section className="closer" id="get">
        <div className="wrap">
          <p className="eyebrow">Containment doctrine</p>
          <h2>It grows more capable. The perimeter stays still.</h2>
          <p>
            The semester ends; its memory does not. Nemesis carries forward the knowledge,
            procedures, and projects you choose to retain—from school into residency,
            research, and work. It gains context. Never authority.
          </p>
          <a
            className="btn btn-primary"
            href={APP_SIGN_UP}
            style={{ fontSize: "13px", padding: "14px 30px" }}
          >
            Deploy Nemesis
          </a>
        </div>
      </section>

      <footer className="foot">
        <div className="wrap foot-in">
          <Link className="brand" href="/" aria-label="Nemesis home">
            <Image className="brand-logo-footer" src="/nemesis/logo.png" alt="" width={20} height={20} />
            <b style={{ fontSize: "11px" }}>Nemesis</b>
          </Link>
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
          <SocialLinks />
          <span className="spacer" />
          <span className="muted">persistent · scoped · never submits · macOS</span>
        </div>
      </footer>
    </>
  );
}
