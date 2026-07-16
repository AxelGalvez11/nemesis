"use client";

import { useEffect } from "react";
import { SiteChrome, APP_SIGN_UP, APP_DOWNLOAD } from "@/components/SiteChrome";
import {
  IconCalendar,
  IconSplit,
  IconLayers,
  IconSearch,
  IconDocStack,
  IconDownload,
} from "@/components/FeatureIcons";

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
    <SiteChrome>
      {/* The hero keeps the committed dark-chrome panel (the notebook art was cut
          for a black ground) while the rest of the page runs on paper. */}
      <header className="hero">
        <div className="hero-art parallax-layer" data-parallax-amount="64" />
        <div className="hero-veil" />
        <div className="wrap">
          <div className="hero-in">
            <h1 className="reveal">Nemesis</h1>
            <p className="hero-purpose reveal r2">
              A study agent for your Mac that gets better the more you use it.
              It builds its knowledge from your library and turns your course
              files into notes, flashcards, and practice tests.
            </p>
            <div className="hero-cta reveal r3">
              <a className="btn btn-primary" href={APP_SIGN_UP}>Start free trial</a>
              <a className="btn btn-secondary" href={APP_DOWNLOAD}>
                <IconDownload size={15} />
                Download for macOS
              </a>
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
              <p>Notes and decks are plain files on your Mac. Every file you add teaches it more about your classes.</p>
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
        <div className="band-art binder parallax-layer" data-parallax-amount="48" />
        <div className="band-veil" />
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
              <div className="img-shell" role="img" aria-label="Black-chrome clipboard">
                <div className="img intelligence parallax-layer" data-parallax-amount="18" />
              </div>
              <div className="cap">
                <div className="k">Memory</div>
                <h3>It remembers across sessions</h3>
                <p>Courses, deadlines, and concepts stay with their source and history.</p>
              </div>
            </div>
            <div className="obj">
              <div className="img-shell" role="img" aria-label="Black-chrome open textbook">
                <div className="img mastery parallax-layer" data-parallax-amount="18" />
              </div>
              <div className="cap">
                <div className="k">Skill</div>
                <h3>It learns how you work</h3>
                <p>A workflow that goes well becomes a routine it can repeat.</p>
              </div>
            </div>
            <div className="obj">
              <div className="img-shell" role="img" aria-label="Black-chrome desk calendar">
                <div className="img calendar parallax-layer" data-parallax-amount="18" />
              </div>
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
              <span>Your notes and school sign-ins stay on your Mac.</span>
            </p>
          </div>
        </div>
      </section>

      <div className="band">
        <div className="band-art order parallax-layer" data-parallax-amount="48" />
        <div className="band-veil" />
        <div className="wrap">
          <div className="band-in">
            <p className="eyebrow">Order</p>
            <h2>Files, calendar, inbox. Kept in order.</h2>
            <p>Everything the agent touches is logged and filed where you expect it.</p>
          </div>
        </div>
      </div>

      <section className="closer" id="get">
        <div className="wrap">
          <h2>Built from your notes. Sharper every week.</h2>
          <div className="closer-cta">
            <a className="btn btn-primary" href={APP_SIGN_UP}>Start free trial</a>
            <a className="btn btn-secondary" href={APP_DOWNLOAD}>
              <IconDownload size={15} />
              Download for macOS
            </a>
          </div>
        </div>
      </section>
    </SiteChrome>
  );
}
