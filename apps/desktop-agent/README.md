# PharmaOrb desktop agent

The autopilot school agent for healthcare students, as a Mac/Windows desktop app — built in the PharmaOrb
design language and embedding the real PharmaOrb web app. It watches your files, turns lectures into
pharmacy-grade study material, connects to your logged-in school portals, builds a daily brief, and gives
you the full research assistant in one window. Local-first: it reads only what you point it at, stores no
passwords, and **never submits anything for you** — everything it makes is a draft you review.

## Run it

```bash
cd apps/desktop-agent
npm install                          # Electron + chokidar + pdf-parse + playwright
npx playwright install chromium      # only needed for the portal connector
npm start
```

## The app (six views, PharmaOrb-styled)
- **Today** — your daily brief: what the agent made today (real, computed stats), a short study nudge, and
  a live activity feed.
- **Study library** — every deck it has generated; open any deck's folder to import `cards.txt` into Anki.
- **Courses** — decks grouped into course workspaces (inferred from the folder each lecture lives in).
- **Connections** — the folder it watches, and your school portals. Click **Log in** on a portal and a real
  browser opens; you sign in once, and the agent reuses that session for scheduled checks (Playwright
  `launchPersistentContext`). Your password is never stored; Canvas can use its student API token instead.
- **Assistant** — the real **app.pharmaorb.app** embedded in the window (chat, deep research, evidence).
- **Settings** — DeepSeek key (encrypted in your OS keychain via `safeStorage`), light/dark, about.

It lives in the menu-bar/tray and keeps working after you close the window.

## What's verified (against the real engine / runtime)
- **Card quality (the moat)** on real DeepSeek: application-level, clinically-anchored, one-concept cards —
  including the lisinopril→bradykinin→ARB card — with zero "what is X" filler. `npm run test:core`.
- **PDF extraction** on a real PDF; **course grouping** and **daily-brief** computation; **content-hash
  dedupe** (a file is never processed twice — no runaway spend).
- **Electron boot**, **encrypted key + Canvas-token storage**, and **Chromium launches** for portal automation.

What still needs your machine to fully exercise: the GUI itself, live portal scraping against *your* school
login, and the embedded assistant (all need a screen / your credentials / network).

## Integrity posture (structural, not a setting)
- **No submit path exists anywhere** — the agent drafts; you submit. This is the lesson from tools that got
  banned for auto-submitting.
- Every artifact carries a provenance header ("AI-drafted — review before use", source, timestamp).
- Cards are grounded only in *your* lecture text; the prompt forbids inventing drugs/facts.
- Local-first: credentials and data stay on your machine; portals use your own logged-in browser session.

## Roadmap (next layers, same loop)
- Deep per-LMS parsing (new assignments/files → auto study material), scheduled scans, "what changed" diff.
- Lecture recording + on-device transcription (whisper.cpp).
- One-click `.apkg` export; PowerPoint/Word ingestion; per-course academic-integrity policy modes.
- Each capability as its own MCP server (see `docs/research/school-autopilot-agent-build-2026-07.md`).

## Notes
- Reads PDF / .txt / .md today (export slides to PDF for now — the UI tells you).
- `npm install` shows one advisory from a `pdf-parse` transitive dep — low-risk for a local tool.
- Standalone app: use `npm` here, not the repo's pnpm workspace.
