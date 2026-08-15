"use client";

import { APP_SIGN_UP } from "@/components/SiteChrome";
import { captureCtaClick } from "@/lib/posthog";

/**
 * THE CLOSE.
 *
 * The headline is the hero's headline again, deliberately. It is the only
 * repetition left on the page and it is the one that earns its place: the visitor
 * has now watched the Canvas change representation and seen their own material go
 * in, so the phrase means something on the second reading that it could not mean
 * on the first.
 *
 * No blob here. The organism appears twice — the hero and the intake — and a third
 * showing would make it punctuation rather than a character. The page ends on the
 * words and the action.
 */
export function Closer() {
  return (
    <section className="nclose" id="start">
      <div className="wrap" data-reveal="up">
        <h2>accelerate cognition.</h2>
        <div className="nclose-cta">
          <a
            className="btn btn-primary"
            href={APP_SIGN_UP}
            onClick={() => captureCtaClick("closer", "Start learning")}
          >
            Start learning
          </a>
        </div>
        <p className="nclose-note">Free to start. No card.</p>
      </div>
    </section>
  );
}
