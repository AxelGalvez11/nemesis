"use client";

import { SiteChrome, APP_SIGN_UP } from "@/components/SiteChrome";
import { captureCtaClick } from "@/lib/posthog";

/**
 * A real screenshot of the running product. Light and dark captures are separate
 * files chosen by <picture> media, so the visitor downloads one, not both, which
 * is also why this is a plain <img> rather than next/image: next/image has no way
 * to express "pick the source by colour scheme".
 *
 */
function Shot({
  name,
  alt,
  width,
  height,
}: {
  name: string;
  alt: string;
  width: number;
  height: number;
}) {
  return (
    <picture className="shot">
      <source srcSet={`/nemesis/shots/${name}-dark.png`} media="(prefers-color-scheme: dark)" />
      <img
        src={`/nemesis/shots/${name}-light.png`}
        alt={alt}
        width={width}
        height={height}
        loading="lazy"
        decoding="async"
      />
    </picture>
  );
}

/**
 * A finished device image: the real capture already composited into a rendered
 * laptop or phone body.
 *
 * These were drawn in CSS first — a rounded border for the lid, a bar for the
 * base — and the owner's verdict was that they did not look real, which was
 * right: an outline reads as a diagram of a machine. They are now rendered by
 * `landing/scripts/render-devices.py` (Pillow), which composites the capture
 * into a body with an aluminium gradient, a machined edge highlight, black
 * glass, a notch and island, and a contact shadow.
 *
 * RE-RUN THAT SCRIPT WHEN THE APP UI CHANGES. The frames bake in the screenshot,
 * so a stale device image is a stale product shot — worse than none. The source
 * captures it reads stay in public/nemesis/shots for exactly that reason.
 */
function Device({
  name,
  alt,
  width,
  height,
  className,
}: {
  name: string;
  alt: string;
  width: number;
  height: number;
  className: string;
}) {
  return (
    <picture className={className}>
      <source srcSet={`/nemesis/devices/${name}-dark.webp`} media="(prefers-color-scheme: dark)" />
      <img
        src={`/nemesis/devices/${name}-light.webp`}
        alt={alt}
        width={width}
        height={height}
        fetchPriority="high"
        decoding="async"
      />
    </picture>
  );
}

function DeviceShowcase() {
  return (
    <div className="devices">
      <Device
        name="device-mac"
        className="device-mac"
        alt="Nemesis on a laptop: the library, with folders for art history, constitutional law and structural engineering, a note on the commerce clause open in the editor, and its linked notes listed alongside."
        width={2000}
        height={1269}
      />
      <Device
        name="device-phone"
        className="device-phone"
        alt="Nemesis on a phone: an answer about the dormant commerce clause, with a table of leading cases and their exam weight, and a follow-up box at the bottom."
        width={520}
        height={1102}
      />
    </div>
  );
}

/* The page's own questions, answered on the page rather than behind a support link.
   Billing questions stay on /pricing; these are the ones asked before signing up. */
const HOME_FAQ = [
  {
    q: "What do I actually give it?",
    a: "Whatever the course gave you: slide decks, PDFs, readings, your own notes, a syllabus, a lecture you recorded. Nothing has to be tidy first.",
  },
  {
    q: "Does it work for my subject?",
    a: "It works off your material rather than a fixed subject list, so law, nursing, engineering and art history all get the same treatment. If your course has readings, it has something to work with.",
  },
  {
    q: "Will it write my assignment for me?",
    a: "No, and that is deliberate. Nemesis makes the things you study from — notes, flashcards, practice tests, a calendar. It never submits work on your behalf.",
  },
  {
    q: "Can I trust what it tells me?",
    a: "It shows the sources behind an answer, pointing back at the file and the page in your own library, so you can check it rather than take its word.",
  },
  {
    q: "What does it cost to try?",
    a: "Nothing. The free plan needs no card, and the phone app is included with any account. Paid plans raise the limits when you outgrow them.",
  },
] as const;

export default function Home() {
  return (
    <SiteChrome>
      {/* HERO. The old hero was the word NEMESIS at display size and nothing else —
          a brand, not a proposition, so a first-time visitor had to read three more
          screens to learn what the thing does. The headline now says the job and the
          product appears immediately under it. */}
      <header className="hero">
        {/* Graph paper behind the headline, dissolving before the devices.
            Its own layer so the mask that fades it cannot fade the text. */}
        <div className="hero-grid" aria-hidden="true" />
        <div className="wrap">
          <div className="hero-in">
            <h1 className="reveal">
              Turn your course
              <br />
              into study material.
            </h1>
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
            <p className="hero-note reveal r3">Free to start. No card.</p>
          </div>
        </div>
        <div className="wrap">
          <DeviceShowcase />
        </div>
      </header>

      {/* THE PROBLEM, before the product. A visitor who has not named their own
          problem does not recognise a solution to it. */}
      <section className="section problem" id="problem">
        <div className="wrap">
          <div className="problem-in" data-reveal="up">
            <p className="eyebrow">The week before an exam</p>
            <h2>Your course is scattered.</h2>
            <p>
              Slides in one portal, readings in another, a recording on your phone,
              a syllabus you opened once in August. Then you study from whatever you
              can find the night before, and hope it was the right material.
            </p>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS: three steps, in the order a student hits them. */}
      <section className="section" id="how">
        <div className="wrap">
          <div className="section-head" data-reveal="up">
            <p className="eyebrow">How it works</p>
            <h2>Three steps, then it keeps up on its own.</h2>
          </div>
          <ol className="steps">
            <li className="step" data-reveal="up">
              <div className="step-n">01</div>
              <h3>Put the course in.</h3>
              <p>
                Slide decks, PDFs, readings, your own notes, a lecture you recorded.
                Upload it, paste it, or record it. Nothing needs tidying first.
              </p>
            </li>
            <li className="step" data-reveal="up">
              <div className="step-n">02</div>
              <h3>It builds the material.</h3>
              <p>
                Notes that link to each other, flashcard decks, practice tests, and a
                calendar read straight off your syllabus. Every piece points back at
                the file it came from.
              </p>
            </li>
            <li className="step" data-reveal="up">
              <div className="step-n">03</div>
              <h3>Study it all semester.</h3>
              <p>
                Cards come back just before you would have forgotten them, and the
                calendar keeps showing what is due next. It stays current as you add
                to it.
              </p>
            </li>
          </ol>
        </div>
      </section>

      {/* The product, shown before it is described. Three beats in the order a
          student actually hits them: files in, ask, study what came out. Every
          image here is a real capture of the running app. */}
      <section className="section" id="showcase">
        <div className="wrap">
          <div className="section-head" data-reveal="up">
            <p className="eyebrow">Inside Nemesis</p>
            <h2>Everything is built out of your own material.</h2>
          </div>
          <div className="rows">
            {/* The library capture is the hero image, so it is not repeated here:
                these two beats are what you do with a library once it exists. */}
            <div className="row">
              <div className="row-copy" data-reveal="soft">
                <div className="k">Ask</div>
                <h3>Ask for the thing you need.</h3>
                <p>
                  Say it plainly and it makes it: a summary of a topic, a table of the
                  cases or formulas you keep mixing up, a practice test on last week.
                  It shows the sources it used, so you can check them.
                </p>
              </div>
              <div className="row-art" data-reveal="zoom">
                <Shot
                  name="chat"
                  alt="A Nemesis conversation explaining a law topic in bullet points, followed by a table of leading cases with their exam weight."
                  width={1680}
                  height={1000}
                />
              </div>
            </div>

            <div className="row">
              <div className="row-copy" data-reveal="soft">
                <div className="k">Study</div>
                <h3>Then actually study it.</h3>
                <p>
                  Decks and practice tests with real spaced repetition, so cards come
                  back just before you would have forgotten them. It tracks what is due
                  today and what can wait, per subject.
                </p>
              </div>
              <div className="row-art" data-reveal="zoom">
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

      {/* RECORDING. The one thing the nearest planners do not do at all: their
          products end where a lecture begins. It gets a section and three details
          rather than a line in a list. */}
      <section className="section" id="record">
        <div className="wrap">
          <div className="section-head" data-reveal="up">
            <p className="eyebrow">On your phone</p>
            <h2>Record the lecture. It files itself.</h2>
            <p>
              Nemesis writes the lecture down as it happens, then cleans up the
              transcript afterwards, so quiet rooms and far-away lecturers still come
              out readable. It lands in the same library your laptop uses, so the deck
              you make tonight knows which lecture it came from.
            </p>
          </div>
          <div className="triad">
            <div className="obj" data-reveal="up">
              <div className="cap">
                <div className="k">Quiet rooms</div>
                <h3>Built for the back row.</h3>
                <p>
                  Most lecture audio is quiet, because the lecturer is further away
                  than your microphone. The transcript is tuned for that, not for a
                  podcast studio.
                </p>
              </div>
            </div>
            <div className="obj" data-reveal="up">
              <div className="cap">
                <div className="k">Filing</div>
                <h3>It lands in the right course.</h3>
                <p>
                  A finished recording is filed under the course it belongs to, using
                  your own course names rather than a guess at the subject. When it is
                  not sure, it asks instead of guessing.
                </p>
              </div>
            </div>
            <div className="obj" data-reveal="up">
              <div className="cap">
                <div className="k">Afterwards</div>
                <h3>The lecture becomes cards.</h3>
                <p>
                  Notes and flashcards come out of the lecture you just sat through,
                  and they stay linked to it, so a card you get wrong can take you
                  back to the minute it was said.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="band">
        <div className="wrap">
          <div className="band-in" data-reveal="up">
            <p className="eyebrow">Any subject</p>
            <h2>Law, nursing, engineering, art history.</h2>
            <p>
              Nemesis works off the material you give it, so it is not built around one
              field. If your course has readings, it has something to work with.
            </p>
          </div>
        </div>
      </div>

      <section className="section" id="faq">
        <div className="wrap">
          <div className="section-head pricing-head" data-reveal="up">
            <p className="eyebrow">Questions</p>
            <h2>Before you sign up.</h2>
          </div>
          <div className="faq" data-reveal="soft">
            {HOME_FAQ.map(({ q, a }) => (
              <details key={q}>
                <summary>{q}</summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="closer" id="get">
        <div className="wrap" data-reveal="up">
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
          <p className="closer-note">
            Free to start, no card. The phone app is included with your account.
          </p>
        </div>
      </section>
    </SiteChrome>
  );
}
