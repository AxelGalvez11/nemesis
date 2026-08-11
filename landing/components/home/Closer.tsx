"use client";

import { NemesisMark } from "@/components/NemesisMark";
import { APP_SIGN_UP } from "@/components/SiteChrome";
import { captureCtaClick } from "@/lib/posthog";

/**
 * THE CLOSE.
 *
 * A question rather than a promise. Everything a page can honestly claim about
 * learning outcomes has already been claimed above; what is left is to hand the
 * question back — which is also the only ending that does not require inventing a
 * guarantee about grades or mastery that no product can make.
 *
 * The mark returns in `success` — its one non-looping state. It plays once as the
 * page ends and then holds still, which is what the state means.
 */
export function Closer() {
  return (
    <section className="nclose" id="start">
      <div className="wrap" data-reveal="up">
        <h2>how fast can you actually learn?</h2>
        <p className="nclose-sub">
          remove the busywork.
          <br />
          find the gaps.
          <br />
          keep moving.
        </p>
        <div className="nclose-cta">
          <a
            className="btn btn-primary"
            href={APP_SIGN_UP}
            onClick={() => captureCtaClick("closer", "Start learning")}
          >
            Start learning
          </a>
        </div>
        <p className="nclose-note">
          Free to start, no card. The phone app is included with your account.
        </p>
        <div className="nclose-mark">
          <NemesisMark state="success" size={54} />
        </div>
      </div>
    </section>
  );
}
