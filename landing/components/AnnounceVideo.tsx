"use client";

import { useRef, useState } from "react";

/**
 * "Introducing PharmaOrb" — the vertical (9:16) announce video, shown in a phone-style
 * frame. Click-to-play WITH sound (a real user gesture, so audio is allowed). Native
 * controls appear once it's playing; the poster + play button return when it ends.
 */
export function AnnounceVideo() {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  const play = () => {
    const v = ref.current;
    if (!v) return;
    v.play()
      .then(() => setPlaying(true))
      .catch(() => {});
  };

  return (
    <section className="section announce reveal" id="announce">
      <div className="container announce-in">
        <span className="section-tag">Announcement</span>
        <h2 className="section-h2">Introducing PharmaOrb</h2>
        <p className="section-p">A 30-second look — source-grounded drug answers that show their work.</p>
        <div className="phone">
          <video
            ref={ref}
            className="phone-video"
            poster="/video/pharmaorb-announce-poster.jpg"
            controls={playing}
            playsInline
            preload="metadata"
            onEnded={() => {
              setPlaying(false);
              ref.current?.load();
            }}
          >
            <source src="/video/pharmaorb-announce.mp4" type="video/mp4" />
          </video>
          {!playing && (
            <button
              type="button"
              className="phone-play"
              onClick={play}
              aria-label="Play the PharmaOrb announcement"
            >
              <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M8 5v14l11-7z" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
