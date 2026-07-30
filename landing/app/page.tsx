"use client";

import { SiteChrome, APP_SIGN_UP } from "@/components/SiteChrome";
import { captureCtaClick } from "@/lib/posthog";

/**
 * A real screenshot of the running product. Light and dark captures are separate
 * files chosen by <picture> media, so the visitor downloads one, not both, which
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
              one calendar.
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

      {/* iPhone gets its own section rather than one line buried in a FAQ. Words
          only: the drawn recorder that used to sit here was removed by the owner,
          and a mocked-up phone next to three real screenshots read as the odd one
          out anyway. A real capture can go back in once there is a build to take
          one from. */}
      <section className="section" id="iphone">
        <div className="wrap">
          <div className="section-head">
            <p className="eyebrow">On your phone</p>
            <h2>Record the lecture. It files itself.</h2>
            <p>
              Nemesis writes the lecture down as it happens, then cleans up the
              transcript afterwards, so quiet rooms and far-away lecturers still come
              out readable. It lands in the same library your laptop uses, so the deck
              you make tonight knows which lecture it came from.
            </p>
            <p>
              Between classes you can review cards, check what is due, and ask it
              anything about your own material. The phone app is free with your
              account, with nothing extra to buy.
            </p>
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
