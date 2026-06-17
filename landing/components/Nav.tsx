"use client";

import { useNavScrolled } from "@/lib/useLandingEffects";
import { MoonIcon, SunIcon } from "@/components/icons";
import { Orb } from "@/components/Orb";

interface NavProps {
  theme: "dark" | "light";
  onToggleTheme: () => void;
}

export function Nav({ theme, onToggleTheme }: NavProps) {
  const scrolled = useNavScrolled();
  return (
    <nav className={`nav${scrolled ? " scrolled" : ""}`} id="nav">
      <div className="container nav-inner">
        <a className="nav-brand" href="#">
          <Orb size={26} />
          PharmaOrb
        </a>
        <div className="nav-links">
          <a href="#sources">Sources</a>
          <a href="#how-it-works">How it works</a>
          <a href="#evidence">Evidence</a>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button
            type="button"
            className="theme-btn"
            id="theme-btn"
            title="Toggle theme"
            aria-label="Toggle light/dark"
            onClick={onToggleTheme}
          >
            {theme === "light" ? <MoonIcon /> : <SunIcon />}
          </button>
          <a className="nav-cta" href="#waitlist">
            Join waitlist
          </a>
        </div>
      </div>
    </nav>
  );
}
