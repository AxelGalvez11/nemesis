"use client";

import { useNavScrolled } from "@/lib/useLandingEffects";
import { MoonIcon, SunIcon } from "@/components/icons";

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
          Pharma<span>Orb</span>
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
          <a className="nav-signin" href="https://app.pharmaorb.app/sign-in">
            Sign in
          </a>
          <a className="nav-cta" href="https://app.pharmaorb.app/sign-up">
            Sign up
          </a>
        </div>
      </div>
    </nav>
  );
}
