"use client";

import { ChromeBlob } from "@/components/ChromeBlob";
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
        <div className="nclose-blob" aria-hidden="true">
          <ChromeBlob state="mastery" size={340} />
        </div>
        <h2>your material. your mind. faster.</h2>
        <div className="nclose-cta">
          <a
            className="btn btn-primary"
            href={APP_SIGN_UP}
            onClick={() => captureCtaClick("closer", "Enter Nemesis")}
          >
            Enter Nemesis
          </a>
        </div>
        <p className="nclose-note">Free to start. No card.</p>
      </div>
    </section>
  );
}
