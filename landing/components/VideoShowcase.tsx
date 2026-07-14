"use client";

import { useRef, useState } from "react";

/**
 * "See it in action" — the monitoring feature reel, placed directly under the hero.
 * Silent motion graphic (no audio track) so it autoplays muted + loops without
 * being intrusive. Click toggles play/pause; the poster covers the load gap so
 * there's no black flash before the first frame paints.
 */
export function VideoShowcase() {
  const ref = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(false);

  function toggle() {
    const v = ref.current;
    if (!v) return;
    if (v.paused) {
      v.play();
      setPaused(false);
    } else {
      v.pause();
      setPaused(true);
    }
  }

  return (
    <section className="section vshow" id="reel">
      <div className="container">
        <div className="vshow-head reveal">
          <span className="section-tag">
            <span className="bdot" /> New · Monitoring
          </span>
          <h2 className="section-h2">See it in action.</h2>
          <p className="section-p">
            Build a watchlist of any topic, source, or research thread. Nemesis watches the evidence and
            sends you smart alerts and a weekly digest. Here&apos;s the 30-second tour.
          </p>
        </div>

        <div className="vshow-frame reveal d2" onClick={toggle} role="button" aria-label="Play or pause the demo reel">
          <video
            ref={ref}
            className="vshow-video"
            src="/monitoring.mp4"
            poster="/monitoring-poster.jpg"
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
          />
          {paused && (
            <div className="vshow-playcue" aria-hidden>
              <svg viewBox="0 0 24 24" width="34" height="34" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
