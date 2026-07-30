"use client";

import { SiteChrome, APP_SIGN_UP } from "@/components/SiteChrome";
import { captureCtaClick } from "@/lib/posthog";
import {
  IconCalendar,
  IconSplit,
  IconLayers,
  IconSearch,
  IconDocStack,
} from "@/components/FeatureIcons";

// The drawn app window used by the showcase rows. `rail` marks which nav item is
// lit so each row shows the part of the product it is actually talking about.
function AppWindow({
  rail,
  label,
  children,
}: {
  rail: "Library" | "Study" | "New chat" | "Calendar";
  label: string;
  children: React.ReactNode;
}) {
  const items = ["New chat", "Study", "Library", "Calendar"] as const;
  return (
    <div className="ui" aria-hidden="true">
      <div className="ui-top">
        <span className="ui-dot" />
        <span className="ui-dot" />
        <span className="ui-dot" />
        <b>{label}</b>
      </div>
      <div className="ui-body">
        <div className="ui-rail">
          {items.map((item) => (
            <div key={item} className={item === rail ? "ui-nav on" : "ui-nav"}>
              {item}
            </div>
          ))}
        </div>
        <div className="ui-main">{children}</div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <SiteChrome>
      <header className="hero">
        <div className="wrap">
          <div className="hero-in">
            <h1 className="reveal">Nemesis</h1>
            <p className="hero-purpose reveal r2">
              Drop in your slides, readings, and syllabus. Nemesis turns them into
              notes, flashcards, and practice tests, and keeps the whole semester on
              one calendar. It runs in your browser, with an iPhone app for recording
              lectures.
            </p>
            <div className="hero-cta reveal r3">
              <a
                className="btn btn-primary"
                href={APP_SIGN_UP}
                onClick={() => captureCtaClick("hero", "Get started free")}
              >
                Get started free
              </a>
            </div>
          </div>
        </div>
      </header>

      {/* The product, shown before it is described. Three beats in the order a
          student actually hits them: files in, ask, study what came out. */}
      <section className="section" id="showcase">
        <div className="wrap">
          <div className="section-head">
            <p className="eyebrow">The product</p>
            <h2>What you actually get.</h2>
            <p>
              One place your course sits in, an agent that reads it, and study
              material made out of the real thing instead of a generic bank.
            </p>
          </div>

          <div className="rows">
            <div className="row">
              <div className="row-copy">
                <div className="k">Library</div>
                <h3>Your whole course goes in.</h3>
                <p>
                  Slides, PDFs, readings, your own notes, a lecture you recorded.
                  Everything for a class sits in one place, and everything Nemesis
                  makes later is built out of it, not out of the open internet.
                </p>
              </div>
              <div className="row-art">
                <AppWindow rail="Library" label="Library">
                  <div className="ui-file"><span className="ext">PDF</span><span className="nm">Contracts &mdash; Week 6 reading</span></div>
                  <div className="ui-file"><span className="ext">PPTX</span><span className="nm">Thermodynamics, Lecture 12</span></div>
                  <div className="ui-file"><span className="ext">DOCX</span><span className="nm">Renaissance survey notes</span></div>
                  <div className="ui-file"><span className="ext">M4A</span><span className="nm">Seminar recording, Tue</span></div>
                </AppWindow>
              </div>
            </div>

            <div className="row">
              <div className="row-copy">
                <div className="k">Ask</div>
                <h3>Ask for the thing you need.</h3>
                <p>
                  Say it plainly and it makes it: a practice test on week six, a deck
                  from that lecture, a summary that keeps the parts your professor
                  stressed. It tells you which file each answer came from.
                </p>
              </div>
              <div className="row-art">
                <AppWindow rail="New chat" label="Chat">
                  <div className="ui-msg me">Make me a practice test on week 6.</div>
                  <div className="ui-msg">
                    Built 12 questions from your week 6 reading and lecture &mdash; 8 short
                    answer, 4 applied. Saved to Study.
                    <span className="ui-chip">Contracts &mdash; Week 6 reading</span>
                  </div>
                </AppWindow>
              </div>
            </div>

            <div className="row">
              <div className="row-copy">
                <div className="k">Study</div>
                <h3>Then actually study it.</h3>
                <p>
                  Decks and practice tests with real spaced repetition, so the cards
                  come back exactly when you are about to forget them. It knows what
                  is due today and what can wait.
                </p>
              </div>
              <div className="row-art">
                <AppWindow rail="Study" label="Study">
                  <div className="ui-tbl">
                    <div className="ui-tr head"><span>Deck</span><span>New</span><span>Learn</span><span>Due</span></div>
                    <div className="ui-tr"><span className="nm">Constitutional law</span><span>6</span><span>2</span><span>14</span></div>
                    <div className="ui-tr"><span className="nm">Statics and dynamics</span><span>0</span><span>4</span><span>9</span></div>
                    <div className="ui-tr"><span className="nm">Renaissance painting</span><span>11</span><span>0</span><span>3</span></div>
                  </div>
                </AppWindow>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* iPhone gets its own section. It used to be one line buried in the FAQ,
          which is not where someone deciding whether to sign up will find it. */}
      <section className="section" id="iphone">
        <div className="wrap">
          <div className="section-head">
            <p className="eyebrow">On your phone</p>
            <h2>Record the lecture. It files itself.</h2>
          </div>
          <div className="rows">
            <div className="row">
              <div className="row-copy">
                <div className="k">iPhone</div>
                <h3>Hit record and put the phone down.</h3>
                <p>
                  Nemesis writes the lecture down as it happens, then cleans up the
                  transcript afterwards so quiet rooms and far-away lecturers still
                  come out readable. It lands in the same library your laptop uses,
                  so the deck you make tonight knows which lecture it came from.
                </p>
                <p>
                  Between classes you can review cards, check what is due, and ask it
                  anything about your own material. The phone app is free with your
                  account &mdash; nothing extra to buy.
                </p>
              </div>
              <div className="row-art">
                <div className="phone" aria-hidden="true">
                  <div className="phone-in">
                    <div className="phone-k">Recording &middot; 32:14</div>
                    <div className="wave">
                      {[38, 62, 27, 88, 54, 71, 33, 95, 46, 68, 24, 80, 57, 41, 74, 30, 86, 49].map(
                        (h, i) => (
                          <i key={i} style={{ height: `${h}%` }} />
                        ),
                      )}
                    </div>
                    <div className="ui-msg">
                      &hellip; so the second constraint only binds when the system is
                      already at equilibrium, which is the case we care about here.
                    </div>
                    <div className="phone-k">Saves to</div>
                    <div className="ui-file"><span className="ext">M4A</span><span className="nm">Lecture 12</span></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section" id="work">
        <div className="wrap">
          <div className="section-head">
            <p className="eyebrow">The work</p>
            <h2>What it does.</h2>
          </div>
          <div className="feature-grid">
            <div className="feature">
              <div className="feature-icon"><IconCalendar /></div>
              <div className="k">Semester</div>
              <h3>It reads your syllabus</h3>
              <p>Drop in a syllabus and it builds your calendar: classes, deadlines, exams.</p>
            </div>
            <div className="feature">
              <div className="feature-icon"><IconSplit /></div>
              <div className="k">Library</div>
              <h3>The library is its memory</h3>
              <p>Notes and decks live in your library. Every file you add teaches it more about your classes.</p>
            </div>
            <div className="feature">
              <div className="feature-icon"><IconLayers /></div>
              <div className="k">Recall</div>
              <h3>Flashcards from your slides</h3>
              <p>Spaced-repetition decks and practice tests, built from your own course material.</p>
            </div>
            <div className="feature">
              <div className="feature-icon"><IconSearch /></div>
              <div className="k">Research</div>
              <h3>Research with receipts</h3>
              <p>Real citations from journals you can open and check.</p>
            </div>
            <div className="feature">
              <div className="feature-icon"><IconDocStack /></div>
              <div className="k">Drafts</div>
              <h3>Drafts you finish</h3>
              <p>Slides, reports, and study guides, cited and yours to finish.</p>
            </div>
          </div>
        </div>
      </section>

      <div className="band">
        <div className="wrap">
          <div className="band-in">
            <p className="eyebrow">Any subject</p>
            <h2>Law, nursing, engineering, art history.</h2>
            <p>
              Nemesis works off the material you give it, so it is not built around one
              field. If your course has readings, it has something to work with.
            </p>
          </div>
        </div>
      </div>

      <section className="section alt" id="privacy">
        <div className="wrap">
          <div className="section-head">
            <p className="eyebrow">Trust</p>
            <h2>It helps you learn. It never turns work in for you.</h2>
          </div>
          <div className="trust">
            <p>
              Coursework is never submitted on your behalf, and every action is
              logged.{" "}
              <span>Your notes stay in your account &mdash; never sold, never trained on.</span>
            </p>
          </div>
        </div>
      </section>

      {/* FAQ answers the questions the page raises but never settles — the
          honesty questions first, because they're the ones that decide trust.
          Native <details> accordions: no JS, keyboard-accessible for free. */}
      <section className="section" id="faq">
        <div className="wrap">
          <div className="section-head">
            <p className="eyebrow">Questions</p>
            <h2>Fair questions.</h2>
          </div>
          <div className="faq">
            <details>
              <summary>Does it do my homework for me?</summary>
              <p>
                No. It drafts, you finish. Nemesis never submits coursework on
                your behalf &mdash; everything it makes is a draft you review, edit,
                and turn in yourself. Every action is logged.
              </p>
            </details>
            <details>
              <summary>What can it make from my course files?</summary>
              <p>
                Notes, flashcard decks, and practice tests, from slides, PDFs, or a
                lecture you recorded. Give it a syllabus and it fills in your
                calendar too &mdash; and because it all sits in one library, a deck
                knows which lecture it came from and which exam it is for.
              </p>
            </details>
            <details>
              <summary>Is this only for science subjects?</summary>
              <p>
                No. Nemesis works off whatever you put in your library, so it fits
                any course with readings &mdash; law, nursing, engineering, history,
                a trade certification. It is not tuned to one field.
              </p>
            </details>
            <details>
              <summary>Where do my files live?</summary>
              <p>
                In your Nemesis library, in your account. Notes and decks are
                yours to export or move any time &mdash; and they stay yours, on any
                plan or none.
              </p>
            </details>
            <details>
              <summary>Do you sell my data or train on my notes?</summary>
              <p>
                No and no. No ads, no selling your data, no training on your
                content. We do measure which pages of this website get read, and
                nothing more &mdash; see <a href="/privacy">privacy</a>.
              </p>
            </details>
            <details>
              <summary>Do I need to install anything?</summary>
              <p>
                No. Nemesis runs in your browser, on any computer. The iPhone app is
                there when you want to record a lecture or study between classes, and
                it comes free with your account &mdash; but nothing is required to start.
              </p>
            </details>
            <details>
              <summary>What does it cost?</summary>
              <p>
                There&rsquo;s a free plan you can use every day. Paid plans &mdash;
                $9.99, $19.99, or $99 a month &mdash; raise the limits. See{" "}
                <a href="/pricing">pricing</a> for what each plan includes.
              </p>
            </details>
          </div>
        </div>
      </section>

      <section className="closer" id="get">
        <div className="wrap">
          <h2>Built from your notes. Sharper every week.</h2>
          <div className="closer-cta">
            <a
              className="btn btn-primary"
              href={APP_SIGN_UP}
              onClick={() => captureCtaClick("closer", "Get started free")}
            >
              Get started free
            </a>
          </div>
        </div>
      </section>
    </SiteChrome>
  );
}
