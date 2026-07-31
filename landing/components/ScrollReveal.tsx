"use client";

import { useEffect } from "react";

/**
 * Reveals `[data-reveal]` elements as they are scrolled to.
 *
 * Mounted once from SiteChrome, so it covers every marketing page without each
 * one wiring anything up. The CSS in globals.css owns the distances and the
 * timing; this only decides WHEN each element has arrived.
 *
 * Three details that matter:
 *
 *   - It does nothing unless `.js-reveal` is on <html>. That class is added
 *     before paint by the inline script in layout.tsx, and NOT added when the
 *     visitor asks for reduced motion. Checking it here means this component
 *     can never reveal something that was never hidden, and can never leave
 *     something hidden that the CSS is not hiding.
 *   - Each element is unobserved the moment it lands. A reveal is a one-way
 *     door; re-hiding a section when it scrolls back off screen is the thing
 *     that makes these effects feel cheap.
 *   - The bottom margin is negative, so an element has to be properly inside
 *     the viewport rather than one pixel past its edge. Without it, a section
 *     "arrives" while still under the fold and the reader never sees the motion.
 */
export function ScrollReveal() {
  useEffect(() => {
    const root = document.documentElement;
    if (!root.classList.contains("js-reveal")) return;

    const targets = document.querySelectorAll<HTMLElement>("[data-reveal]");
    if (targets.length === 0) return;

    // No IntersectionObserver (very old browser): show everything at once
    // rather than leaving the page permanently blank.
    if (typeof IntersectionObserver === "undefined") {
      targets.forEach((el) => el.classList.add("is-in"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-in");
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.05 },
    );

    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return null;
}
