"use client";

// Empty-thread intro — desktop src/components/chat/intro.tsx (shell spec §B3).
// NEMESIS wordmark via the .fit-text container-query technique (ported to
// desktop-chrome.css) + one line of body copy, picked once per mount from the
// fallback pair list (a web build has no ?raw jsonl import).

import { useState } from "react";

const FALLBACK_COPY = { body: "Ask a question to start a new session.", headline: "Ready when you are." };

const INTRO_COPY: { headline: string; body: string }[] = [
  {
    body: "Ask about a drug, a mechanism, or a whole unit — Nemesis will meet you where you are.",
    headline: "What are we studying today?",
  },
  { body: "Paste your lecture notes, a tricky question, or just say what's due.", headline: "Where do we start?" },
  { body: "Nemesis answers plainly, cites what matters, and skips the fluff.", headline: "What's on the exam?" },
  { body: "Describe the concept and Nemesis will break it down step by step.", headline: "Stuck on something?" },
  { body: "Ask a question to start a new session.", headline: "Ready when you are." },
];

export function Intro() {
  const [copy] = useState(() => INTRO_COPY[Math.floor(Math.random() * INTRO_COPY.length)] ?? FALLBACK_COPY);

  return (
    <div
      className="pointer-events-none flex w-full min-w-0 flex-col items-center justify-center px-0.5 py-6 text-center text-muted-foreground sm:px-6 lg:px-8"
      data-slot="aui_intro"
    >
      <div className="w-full min-w-0">
        <p
          aria-label="NEMESIS"
          className="fit-text mx-auto mb-1 w-[calc(100%-1rem)] font-['Collapse'] font-bold uppercase leading-[0.9] tracking-[0.08em] text-midground mix-blend-plus-lighter dark:text-foreground/90"
          style={{ ["--fit-min" as string]: "2.75rem" }}
        >
          <span>
            <span>NEMESIS</span>
          </span>
          <span aria-hidden="true">NEMESIS</span>
        </p>
        <p className="m-0 text-center leading-normal tracking-tight">{copy.body}</p>
      </div>
    </div>
  );
}
