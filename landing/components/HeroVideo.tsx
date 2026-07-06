"use client";

import { useEffect, useRef } from "react";

/**
 * Cinematic hero background — a seamless (boomerang) loop of the acid-green wireframe
 * orb with orbiting data motes, generated to match the app's brand. Replaces the old
 * three.js HeroCanvas. Sits at `inset:0` behind the `.hero-overlay` + copy.
 *
 * Accessibility/performance:
 * - `prefers-reduced-motion`: the video is paused and its `poster` frame shows instead.
 * - Pauses when scrolled out of view (IntersectionObserver) to save battery/CPU.
 * - `muted` + `playsInline` so iOS autoplays inline; `aria-hidden` (decorative).
 */
export function HeroVideo() {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      v.removeAttribute("autoplay");
      v.pause();
      return; // poster frame stays visible — no motion
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          void v.play().catch(() => {});
        } else {
          v.pause();
        }
      },
      { threshold: 0.05 },
    );
    io.observe(v);
    return () => io.disconnect();
  }, []);

  return (
    <video
      ref={ref}
      className="hero-video"
      poster="/cinematic/hero-orb-poster.jpg"
      autoPlay
      muted
      loop
      playsInline
      preload="metadata"
      aria-hidden="true"
    >
      <source src="/cinematic/hero-orb.webm" type="video/webm" />
      <source src="/cinematic/hero-orb.mp4" type="video/mp4" />
    </video>
  );
}
