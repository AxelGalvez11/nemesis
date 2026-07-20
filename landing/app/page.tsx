"use client";

import { SiteChrome, APP_SIGN_UP } from "@/components/SiteChrome";
import {
  IconCalendar,
  IconSplit,
  IconLayers,
  IconSearch,
  IconDocStack,
} from "@/components/FeatureIcons";

export default function Home() {
  return (
    <SiteChrome>
      {/* The hero keeps the committed dark-chrome panel; the notebook art was
          removed with the rest of the page photography (2026-07-20). */}
      <header className="hero">
        <div className="wrap">
          <div className="hero-in">
            <h1 className="reveal">Nemesis</h1>
            <p className="hero-purpose reveal r2">
              A study agent that gets better the more you use it. It builds its
              knowledge from your library and turns your course files into
              notes, flashcards, and practice tests.
            </p>
            <div className="hero-cta reveal r3">
              <a className="btn btn-primary" href={APP_SIGN_UP}>Get started free</a>
            </div>
          </div>
        </div>
      </header>

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
              <h3>It reads your semester</h3>
              <p>Connects to Canvas or Blackboard and builds your calendar: classes, deadlines, exams.</p>
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
            <p className="eyebrow">Semester</p>
            <h2>The whole semester, in one place.</h2>
            <p>Notes filed, decks current, calendar true.</p>
          </div>
        </div>
      </div>

      <section className="section">
        <div className="wrap">
          <div className="section-head">
            <p className="eyebrow">How it grows</p>
            <h2>It gets sharper the longer you use it.</h2>
          </div>
          <div className="triad">
            <div className="obj">
              <div className="cap">
                <div className="k">Memory</div>
                <h3>It remembers across sessions</h3>
                <p>Courses, deadlines, and concepts stay with their source and history.</p>
              </div>
            </div>
            <div className="obj">
              <div className="cap">
                <div className="k">Skill</div>
                <h3>It learns how you work</h3>
                <p>A workflow that goes well becomes a routine it can repeat.</p>
              </div>
            </div>
            <div className="obj">
              <div className="cap">
                <div className="k">Rhythm</div>
                <h3>It keeps your week honest</h3>
                <p>Reviews land before exams. Deadlines never sneak up.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section alt" id="privacy">
        <div className="wrap">
          <div className="section-head">
            <p className="eyebrow">Trust</p>
            <h2>Nothing happens without you.</h2>
          </div>
          <div className="trust">
            <p>
              It helps you learn. It never does the work for you. Coursework is
              never submitted on your behalf, and every action is logged.{" "}
              <span>Your notes stay in your account &mdash; never sold, never trained on.</span>
            </p>
          </div>
        </div>
      </section>

      <div className="band">
        <div className="wrap">
          <div className="band-in">
            <p className="eyebrow">Order</p>
            <h2>Files, calendar, inbox. Kept in order.</h2>
            <p>Everything the agent touches is logged and filed where you expect it.</p>
          </div>
        </div>
      </div>

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
              <summary>Which schools does it work with?</summary>
              <p>
                Canvas and Blackboard work out of the box. Other school portals
                can be set up from a chat.
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
                content.
              </p>
            </details>
            <details>
              <summary>Do I need to install anything?</summary>
              <p>
                No. Nemesis runs in your browser. A Mac desktop app is planned,
                but nothing is required to start.
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
            <a className="btn btn-primary" href={APP_SIGN_UP}>Get started free</a>
          </div>
        </div>
      </section>
    </SiteChrome>
  );
}
