# School-portal test runbook (Blackboard + Outlook)

Plain-English guide for running the agent against a real school account, and for
wiring it up again later. Written 2026-07-10 (round 15).

> **Historical note:** every `~/.hermes/...` path below refers to the local chassis
> checkout this testing was originally run against. That checkout was retired
> 2026-07-14 to reclaim disk (see `apps/nemesis-desktop/patches/README.md`), so these
> paths no longer resolve on this machine. Kept as a record of the setup and test
> steps, not as a live path to follow as-is.

> **Round-16 update — the browser now lives INSIDE the app.** The chat right
> rail has a **Browser** tab (button in the Sources rail header, and it pops
> open automatically whenever the agent starts browsing): a live mirror of the
> agent's persistent browser with its own tab strip, URL bar, and full
> mouse/keyboard — **type the Blackboard/Outlook logins right in the panel**.
> The app spawns the browser itself at launch, and `browser.cdp_url` is now set
> permanently in `~/.hermes/config.yaml`, so the manual launcher + config toggle
> below are only the fallback path.

## How the pieces fit

- The agent has real browser tools (`browser_navigate`, `browser_snapshot`,
  `browser_click`, …) and a `school-portal` skill (`~/.hermes/skills/school-portal/`)
  with hard rules: never submit, never send, never touch account settings,
  login belongs to the student.
- By default the agent launches its own **invisible** (headless) Chromium —
  fine for public pages, useless for logins (there is no window to type into).
- The fix is built into the agent: set `browser.cdp_url` in `~/.hermes/config.yaml`
  and the agent **drives an existing browser instead** — one we launch visibly,
  where the owner signs in once. Cookies live in a persistent profile
  (`~/.hermes/browser_auth/school-profile`), so logins survive restarts.

## One-time setup (already done in round 15)

1. `~/.hermes/config.yaml` browser block gained `camofox.managed_persistence: true`
   (harmless today, correct if the Camoufox backend is installed later).
2. Login browser launcher (visible Chrome with the persistent profile):

```bash
"/Users/axelgalvez/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing" \
  --remote-debugging-port=9333 \
  --user-data-dir=/Users/axelgalvez/.hermes/browser_auth/school-profile \
  --no-first-run --no-default-browser-check \
  "https://outlook.office.com" "https://www.blackboard.com"
```

## Running the test

1. **Owner**: in that Chrome window, sign into the school's Blackboard URL and
   outlook.office.com (test account). Credentials are typed by the owner only —
   never pasted into chat, never handled by any agent.
2. Point the agent at the logged-in browser — add to `~/.hermes/config.yaml`:

```yaml
browser:
  cdp_url: http://127.0.0.1:9333
```

3. Ask Nemesis (in the app): "Check my school portal — what's new on Blackboard
   and triage my Outlook inbox." The school-portal skill takes it from there
   (daily-brief note into `~/Documents/Nemesis Library/School/`).
4. **After the test**: remove the `cdp_url` line (or the agent will error on
   browser tasks whenever the school browser isn't running). The login browser
   can be closed; cookies stay in the profile for next time.

## Verified so far (2026-07-10)

- Dry run PASSED without any login: the agent browsed outlook.office.com
  (reported the Microsoft 365 sign-in gate) and blackboard.com (reported the
  marketing homepage and correctly noted a school-specific portal URL is needed).
- Still needed from the owner: the school's actual Blackboard URL + signed-in
  session in the profile browser.

## Security notes

- Port 9333 is localhost-only, but any local process could attach to it while
  the browser runs with debugging on. Run it for test sessions, close it after.
- The persistent profile holds real session cookies — it lives under
  `~/.hermes/browser_auth/` on this Mac only. Delete the folder to log out.
