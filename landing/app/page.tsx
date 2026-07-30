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

/**
 * A real screenshot of the running product. Light and dark captures are separate
 * files chosen by <picture> media, so the visitor downloads one, not both — which
 * is also why this is a plain <img> rather than next/image: next/image has no way
 * to express "pick the source by colour scheme".
 */
function Shot({ name, alt, width, height }: { name: string; alt: string; width: number; height: number }) {
  return (
    <picture className="shot">
      <source srcSet={`/nemesis/shots/${name}-dark.png`} media="(prefers-color-scheme: dark)" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/nemesis/shots/${name}-light.png`} alt={alt} width={width} height={height} loading="lazy" decoding="async" />
    </picture>
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
          student actually hits them: files in, ask, study what came out. Every
          image here is a real capture of the running app. */}
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
                  Everything for a class sits in one place, notes link to each other,
                  and everything Nemesis makes later is built out of it rather than
                  out of the open internet.
                </p>
              </div>
              <div className="row-art">
                <Shot
                  name="library"
                  alt="The Nemesis library: folders for art history, constitutional law and structural engineering, with a note open in the editor and its linked notes listed alongside."
                  width={1680}
                  height={900}
                />
              </div>
            </div>

            <div className="row">
              <div className="row-copy">
                <div className="k">Ask</div>
                <h3>Ask for the thing you need.</h3>
                <p>
                  Say it plainly and it makes it: a summary of a topic, a table of the
                  cases or formulas you keep mixing up, a practice test on last week.
                  It shows the sources it used, so you can check them.
                </p>
              </div>
              <div className="row-art">
                <Shot
                  name="chat"
                  alt="A Nemesis conversation explaining a law topic in bullet points, followed by a table of leading cases with their exam weight."
                  width={1680}
                  height={1000}
                />
              </div>
            </div>

            <div className="row">
              <div className="row-copy">
                <div className="k">Study</div>
                <h3>Then actually study it.</h3>
                <p>
                  Decks and practice tests with real spaced repetition, so cards come
                  back just before you would have forgotten them. It tracks what is due
                  today and what can wait, per subject.
                </p>
              </div>
              <div className="row-art">
                <Shot
                  name="study"
                  alt="The Nemesis study screen listing decks for Baroque painting, constitutional law, Spanish and statics, each with counts of new, learning and due cards."
                  width={1680}
                  height={620}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* iPhone gets its own section rather than one line buried in a FAQ. The
          artwork here is drawn line art, not a capture — see globals.css. */}
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
                  come out readable. It lands in the same library your laptop uses, so
                  the deck you make tonight knows which lecture it came from.
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
                    <div className="phone-msg">
                      &hellip; so the second constraint only binds when the system is
                      already at equilibrium, which is the case we care about here.
                    </div>
                    <div className="phone-k">Saves to</div>
                    <div className="phone-file"><span className="ext">M4A</span><span className="nm">Lecture 12</span></div>
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
