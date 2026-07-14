"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect } from "react";
import { SocialLinks } from "@/components/SocialLinks";
import {
  IconCalendar,
  IconWaveform,
  IconLayers,
  IconSearch,
  IconDocStack,
  IconShieldCheck,
  IconWindow,
  IconRepeat,
  IconSplit,
  IconDownload,
  IconCheck,
} from "@/components/FeatureIcons";

const APP_SIGN_UP = "https://app.enternemesis.com/sign-up";
const APP_SIGN_IN = "https://app.enternemesis.com/sign-in";
const APP_DOWNLOAD = "https://app.enternemesis.com/api/download/mac";

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
          <a className="ghost" href="#work">Features</a>
          <a className="ghost" href="#plans">Plans</a>
          <a className="ghost" href={APP_DOWNLOAD}>Download</a>
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
            <p className="hero-purpose reveal r3">
              Nemesis is a desktop study assistant for students on macOS. It organizes your semester
              from your school portals, turns lectures into notes and flashcards, and drafts cited
              research that you review and finish. Create a Nemesis account to use it.
            </p>
            <div className="hero-cta reveal r4">
              <a className="btn btn-primary" href={APP_SIGN_UP}>Deploy Nemesis</a>
              <a className="btn btn-secondary" href={APP_DOWNLOAD}>
                <IconDownload size={15} />
                Download for macOS
              </a>
            </div>
            <p className="hero-cta-caption reveal r4">
              Apple Silicon Macs. Sign in with your Nemesis account.
            </p>
          </div>
        </div>
      </header>

      <section className="section" id="work">
        <div className="wrap">
          <div className="section-head">
            <p className="eyebrow">The work</p>
            <h2>What it does, concretely.</h2>
          </div>
          <div className="feature-grid">
            <div className="feature">
              <div className="feature-icon"><IconCalendar /></div>
              <div className="k">Semester</div>
              <h3>It reads your semester</h3>
              <p>Connects to Blackboard or Canvas and builds your calendar.</p>
            </div>
            <div className="feature">
              <div className="feature-icon"><IconWaveform /></div>
              <div className="k">Lectures</div>
              <h3>Lectures become notes</h3>
              <p>Transcribes on your Mac and files clean notes.</p>
            </div>
            <div className="feature">
              <div className="feature-icon"><IconLayers /></div>
              <div className="k">Recall</div>
              <h3>Flashcards that fight back</h3>
              <p>Spaced-repetition decks built from your own lectures.</p>
            </div>
            <div className="feature">
              <div className="feature-icon"><IconSearch /></div>
              <div className="k">Research</div>
              <h3>Research with receipts</h3>
              <p>Real citations from journals you can open.</p>
            </div>
            <div className="feature">
              <div className="feature-icon"><IconDocStack /></div>
              <div className="k">Drafts</div>
              <h3>Drafts you finish</h3>
              <p>Slides, reports, and posters, cited and ready to edit.</p>
            </div>
            <div className="feature">
              <div className="feature-icon"><IconShieldCheck /></div>
              <div className="k">Authority</div>
              <h3>Nothing happens without you</h3>
              <p>Every action is logged. Nothing is submitted for you.</p>
            </div>
          </div>
        </div>
      </section>

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
              <p>Nemesis compares your sources with the record and flags what moved.</p>
            </div>
            <div className="q">
              <div className="n">02</div>
              <h3>It ranks what comes <span className="b">next</span>.</h3>
              <p>Ranked by deadline, grade weight, and mastery, with the reason attached.</p>
            </div>
            <div className="q">
              <div className="n">03</div>
              <h3>It finds the <span className="b">weak point</span>.</h3>
              <p>Tracks recall and surfaces what you are about to forget.</p>
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
          </div>
          <div className="triad">
            <div className="obj">
              <div className="img-shell" role="img" aria-label="Glitched black-chrome clipboard">
                <div className="img intelligence parallax-layer" data-parallax-amount="18" />
              </div>
              <div className="cap">
                <div className="k">Persistent memory</div>
                <h3>It remembers across sessions</h3>
                <p>Courses, deadlines, and concepts persist with their source and history.</p>
              </div>
            </div>
            <div className="obj">
              <div className="img-shell" role="img" aria-label="Glitched open black-chrome textbook">
                <div className="img mastery parallax-layer" data-parallax-amount="18" />
              </div>
              <div className="cap">
                <div className="k">Procedural skill</div>
                <h3>It learns how the work gets done</h3>
                <p>A successful workflow becomes a reusable skill, without new authority.</p>
              </div>
            </div>
            <div className="obj">
              <div className="img-shell" role="img" aria-label="Glitched black-chrome desk calendar">
                <div className="img calendar parallax-layer" data-parallax-amount="18" />
              </div>
              <div className="cap">
                <div className="k">Controlled agency</div>
                <h3>It divides the work, then returns it</h3>
                <p>Bounded tasks run in isolated contexts. Results return to you.</p>
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
            <p>Courses, deadlines, and grades live in one graph that survives the chat.</p>
          </div>
        </div>
      </div>

      <section className="section alt">
        <div className="wrap">
          <div className="section-head">
            <p className="eyebrow">Authorized capabilities</p>
            <h2>What it is allowed to do.</h2>
          </div>
          <div className="feature-grid cols-2">
            <div className="feature">
              <div className="feature-icon"><IconWaveform /></div>
              <div className="k">Signal</div>
              <h3>Turn lectures into study material</h3>
              <p>Transcribes on-device into notes, decks, and practice tests.</p>
            </div>
            <div className="feature">
              <div className="feature-icon"><IconWindow /></div>
              <div className="k">Browser</div>
              <h3>Enter the accounts you authorize</h3>
              <p>Reads Blackboard, Outlook, Canvas, and Gmail from your logged-in browser.</p>
            </div>
            <div className="feature">
              <div className="feature-icon"><IconRepeat /></div>
              <div className="k">Automation</div>
              <h3>Run the mission on schedule</h3>
              <p>Recurring briefs and review queues, logged after every run.</p>
            </div>
            <div className="feature">
              <div className="feature-icon"><IconSplit /></div>
              <div className="k">Delegation</div>
              <h3>Split complex work into contained tasks</h3>
              <p>Parallel research and drafting return cited work for your review.</p>
            </div>
          </div>
          <div className="trust" id="privacy">
            <p>
              School sign-ins and lecture audio stay on your Mac.{" "}
              <span>Tools stay in scope, and coursework is never submitted for you.</span>
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
            <p>Notes filed, decks current, calendar reconciled.</p>
          </div>
        </div>
      </div>

      <section className="section" id="plans">
        <div className="wrap">
          <div className="section-head">
            <p className="eyebrow">Plans</p>
            <h2>Seven days free. Cancel anytime.</h2>
            <p>Card required. Nothing charged for 7 days.</p>
          </div>
          <div className="plans">
            <div className="plan">
              <div className="plan-price">$9.99</div>
              <h3>Student</h3>
              <ul className="plan-features">
                <li><IconCheck size={13} />Higher limits on answers and study decks</li>
                <li><IconCheck size={13} />Lecture capture</li>
                <li><IconCheck size={13} />Scheduled school sync</li>
              </ul>
            </div>
            <div className="plan plan-featured">
              <span className="plan-badge">Featured</span>
              <div className="plan-price">$19.99</div>
              <h3>Agent Pro</h3>
              <ul className="plan-features">
                <li><IconCheck size={13} />Everything in Student</li>
                <li><IconCheck size={13} />Deep research with cited reports</li>
                <li><IconCheck size={13} />Higher automation limits</li>
              </ul>
            </div>
            <div className="plan">
              <div className="plan-price">$49.99</div>
              <h3>Max</h3>
              <ul className="plan-features">
                <li><IconCheck size={13} />Highest limits across the agent</li>
                <li><IconCheck size={13} />Unlimited lecture copilot</li>
                <li><IconCheck size={13} />First access to new capabilities</li>
              </ul>
            </div>
          </div>
          <div className="hero-cta" style={{ marginTop: "28px", justifyContent: "center" }}>
            <a className="btn btn-primary" href={APP_SIGN_UP}>Start the trial</a>
          </div>
        </div>
      </section>

      <section className="closer" id="get">
        <div className="wrap">
          <p className="eyebrow">Containment doctrine</p>
          <h2>It grows more capable. The perimeter stays still.</h2>
          <p>It carries your knowledge forward, into whatever comes next.</p>
          <div className="closer-cta">
            <a className="btn btn-primary" href={APP_SIGN_UP}>Deploy Nemesis</a>
            <a className="btn btn-secondary" href={APP_DOWNLOAD}>
              <IconDownload size={15} />
              Download for macOS
            </a>
          </div>
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
