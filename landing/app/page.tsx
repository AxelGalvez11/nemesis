"use client";

import { useEffect } from "react";

const APP_SIGN_UP = "https://app.pharmaorb.app/sign-up";
const APP_SIGN_IN = "https://app.pharmaorb.app/sign-in";

/** Subtle downward drift on the hero mask while scrolling. The image bands get their
 *  parallax from CSS (background-attachment: fixed); both effects turn off under
 *  prefers-reduced-motion, and the bands also fall back to plain scroll on mobile. */
function useHeroParallax() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const art = document.querySelector<HTMLElement>(".hero-art");
    if (!art) return;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        art.style.setProperty("--par", `${(window.scrollY * 0.14).toFixed(1)}px`);
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
}

export default function Home() {
  useHeroParallax();

  return (
    <>
      <nav className="nav">
        <div className="wrap nav-in">
          <a className="brand" href="/">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/nemesis/logo.png" alt="Nemesis logo" />
            <b>Nemesis</b>
          </a>
          <span className="spacer" />
          <a className="ghost" href="#how">System</a>
          <a className="ghost" href="#graph">The graph</a>
          <a className="ghost" href="#privacy">Privacy</a>
          <a className="ghost" href={APP_SIGN_IN}>Sign in</a>
          <a className="btn btn-primary" href={APP_SIGN_UP}>Get Nemesis</a>
        </div>
      </nav>

      <header className="hero">
        <div className="hero-art" />
        <div className="hero-veil" />
        <div className="wrap">
          <div className="hero-in">
            <p className="eyebrow reveal">
              Academic operating system<span className="dot"> · </span>macOS
            </p>
            <h1 className="reveal r2">Nemesis</h1>
            <p className="phrase reveal r3">
              Intelligence<span className="dot"> · </span>Precision
              <span className="dot"> · </span>Relentless
            </p>
            <div className="hero-cta reveal r4">
              <a className="btn btn-primary" href={APP_SIGN_UP}>Get Nemesis</a>
              <a className="btn btn-ghost" href="#how">Watch it work</a>
            </div>
            <div className="hero-meta reveal r4">
              <span>macOS</span>
              <span className="rule" />
              <span>on-device</span>
              <span className="rule" />
              <span>never submits</span>
            </div>
          </div>
        </div>
      </header>

      <section className="section alt" id="how">
        <div className="wrap">
          <div className="section-head">
            <p className="eyebrow">The product</p>
            <h2>A student needs three answers. Nemesis keeps them current.</h2>
          </div>
          <div className="qs">
            <div className="q">
              <div className="n">01</div>
              <h3>It knows what <span className="b">changed</span>.</h3>
              <p>
                Announcements, moved exams, new grades, new files. It reads them and reports
                the difference. Nothing slips.
              </p>
            </div>
            <div className="q">
              <div className="n">02</div>
              <h3>It knows what comes <span className="b">next</span>.</h3>
              <p>
                Open work, ranked by deadline, grade weight, and how well you know the
                material. One task on top. A reason attached.
              </p>
            </div>
            <div className="q">
              <div className="n">03</div>
              <h3>It knows what you <span className="b">don&rsquo;t</span>.</h3>
              <p>
                Recall tracked per concept. It flags what will cost you, weeks before the
                exam.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <div className="section-head">
            <p className="eyebrow">
              Mastery<span className="dot"> · </span>Intelligence
              <span className="dot"> · </span>Nemesis
            </p>
            <h2>Three functions. Nothing else.</h2>
            <p>Every capability serves one of these.</p>
          </div>
          <div className="triad">
            <div className="obj">
              <div className="img intelligence" role="img" aria-label="Interlocking chrome rings" />
              <div className="cap">
                <div className="k">Intelligence</div>
                <h3>It knows your semester</h3>
                <p>
                  It reads your accounts and builds one model: courses, deadlines, lectures,
                  concepts. Every fact carries its source. A professor&rsquo;s word never
                  blurs into a guess.
                </p>
              </div>
            </div>
            <div className="obj">
              <div className="img mastery" role="img" aria-label="Ascending chrome spiral" />
              <div className="cap">
                <div className="k">Mastery</div>
                <h3>It measures what you know</h3>
                <p>
                  Not card counts. Recall, per concept, tracked over time. It schedules
                  review right before you forget and names where you are weak.
                </p>
              </div>
            </div>
            <div className="obj">
              <div className="img obelisk" role="img" aria-label="Dark chrome obelisk" />
              <div className="cap">
                <div className="k">Nemesis</div>
                <h3>It does the work around learning</h3>
                <p>
                  It watches your portals, files your materials, keeps your calendar, drafts
                  your documents. It never submits. That part is yours.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="band" id="graph">
        <div className="band-art graph" />
        <div className="band-veil" />
        <div className="wrap">
          <div className="band-in">
            <p className="eyebrow">The graph</p>
            <h2>One model of your semester.</h2>
            <p>
              Courses, deadlines, lectures, grades, concepts. Every fact carries its source
              and its history. Ask it anything about your semester; it answers from record,
              not memory.
            </p>
          </div>
        </div>
      </div>

      <section className="section">
        <div className="wrap">
          <div className="section-head">
            <p className="eyebrow">Capabilities</p>
            <h2>What it does.</h2>
          </div>
          <div className="caps">
            <div className="cap">
              <div className="k">Lectures</div>
              <h3>Records and transcribes on-device</h3>
              <p>
                Lectures become notes, mind maps, decks, and practice tests. Transcription
                runs on your Mac. The audio stays there.
              </p>
            </div>
            <div className="cap">
              <div className="k">Accounts</div>
              <h3>Reads Blackboard, Outlook, Canvas, Gmail</h3>
              <p>
                You sign in once, in its browser, on your machine. No API keys. It checks
                your portals so you don&rsquo;t have to.
              </p>
            </div>
            <div className="cap">
              <div className="k">Study</div>
              <h3>Schedules review by recall</h3>
              <p>
                Decks, mind maps, and tests per section. It queues each concept right before
                you would forget it.
              </p>
            </div>
            <div className="cap">
              <div className="k">Documents</div>
              <h3>Drafts. Never submits.</h3>
              <p>
                Slides, reports, and handouts with real citations. You review. You submit.
                There is no code path for it to do that.
              </p>
            </div>
          </div>
          <div className="trust" id="privacy">
            <span className="lock">Local-first</span>
            <p>
              Logins stay on your Mac. Audio stays on your Mac.{" "}
              <span>It sends nothing and submits nothing without you.</span>
            </p>
          </div>
        </div>
      </section>

      <div className="band">
        <div className="band-art order" />
        <div className="band-veil" />
        <div className="wrap">
          <div className="band-in">
            <p className="eyebrow">
              Files<span className="dot"> · </span>Calendar
              <span className="dot"> · </span>Inbox
            </p>
            <h2>Order is maintained.</h2>
            <p>
              Notes filed. Decks current. Calendar true. Every action it takes is logged in
              plain English.
            </p>
          </div>
        </div>
      </div>

      <section className="closer" id="get">
        <div className="wrap">
          <p className="eyebrow">After graduation</p>
          <h2>It starts with school. It does not end there.</h2>
          <p>
            Nemesis keeps your knowledge, projects, and record. It follows you into
            residency, research, and work.
          </p>
          <a
            className="btn btn-primary"
            href={APP_SIGN_UP}
            style={{ fontSize: "13px", padding: "14px 30px" }}
          >
            Get Nemesis
          </a>
        </div>
      </section>

      <footer className="foot">
        <div className="wrap foot-in">
          <a className="brand" href="/">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/nemesis/logo.png" alt="" style={{ width: 20, height: 20 }} />
            <b style={{ fontSize: "11px" }}>Nemesis</b>
          </a>
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
          <span className="spacer" />
          <span className="muted">local-first · never submits · macOS</span>
        </div>
      </footer>
    </>
  );
}
