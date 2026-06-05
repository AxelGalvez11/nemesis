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
