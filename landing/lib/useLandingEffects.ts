"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

type Theme = "dark" | "light";

const THEME_KEY = "pharmaorb-theme";
const themeListeners = new Set<() => void>();

function subscribeTheme(cb: () => void): () => void {
  themeListeners.add(cb);
  return () => {
    themeListeners.delete(cb);
  };
}

function getThemeSnapshot(): Theme {
  return (localStorage.getItem(THEME_KEY) as Theme | null) ?? "dark";
}

// Stable primitive on the server so useSyncExternalStore doesn't loop; defaults to dark.
function getThemeServerSnapshot(): Theme {
  return "dark";
}

function setStoredTheme(theme: Theme): void {
  localStorage.setItem(THEME_KEY, theme);
  themeListeners.forEach((l) => l());
}

/**
 * Dark/light theme sourced from localStorage via useSyncExternalStore (the server snapshot
 * is "dark", so hydration matches and the stored preference is applied right after). The
 * value is mirrored onto <html class="light"> by a DOM-sync effect. Persisted under the
 * prototype's "pharmaorb-theme" key.
 */
export function useTheme(): { theme: Theme; toggle: () => void } {
  const theme = useSyncExternalStore(
    subscribeTheme,
    getThemeSnapshot,
    getThemeServerSnapshot,
  );

  useEffect(() => {
    document.documentElement.classList.toggle("light", theme === "light");
  }, [theme]);

  const toggle = () => setStoredTheme(theme === "light" ? "dark" : "light");
  return { theme, toggle };
}

/** Adds `.scrolled` to the nav once the page is scrolled past 60px. */
export function useNavScrolled(): boolean {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return scrolled;
}

/**
 * IntersectionObserver that adds `.in` to every `.reveal` element once, when it enters the
 * viewport — the design's scroll-reveal. Re-scans after the deps change so late-mounted
 * nodes (e.g. demo result) are still observed.
 */
export function useScrollReveal(): void {
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("in");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -36px 0px" },
    );
    document.querySelectorAll(".reveal").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);
}

/**
 * Parallax for the full-bleed section artwork: each `[data-parallax]` image is translated as its
 * section moves through the viewport, so the art appears to sit behind the section like a window.
 * rAF-throttled, passive scroll, and disabled when the user prefers reduced motion.
 */
export function useParallax(): void {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const els = Array.from(document.querySelectorAll<HTMLElement>("[data-parallax]"));
    if (!els.length) return;

    let raf = 0;
    const update = () => {
      raf = 0;
      const vh = window.innerHeight;
      for (const el of els) {
        const section = el.closest("section");
        if (!section) continue;
        const rect = section.getBoundingClientRect();
        if (rect.bottom < -200 || rect.top > vh + 200) continue; // skip off-screen
        const sectionCenter = rect.top + rect.height / 2;
        const fromCenter = sectionCenter - vh / 2; // px from viewport center
        const shift = Math.max(-80, Math.min(80, fromCenter * -0.14));
        el.style.transform = `translate3d(0, ${shift.toFixed(1)}px, 0)`;
      }
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
}
