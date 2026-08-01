# Nemesis browser extension

Reads the courses and syllabus files already sitting on a student's school
portal, so Nemesis can set up their semester without them typing it all in.

**Status: built and testable, not yet published.** It runs today if you load it
unpacked. It is not on the Chrome Web Store, and only the account owner can
submit it — see [Publishing](#publishing).

## Why an extension and not the Canvas API

Canvas, Blackboard, Moodle and Brightspace all have real APIs. Getting into any
of them needs either a developer key the university has to approve, or a
personal access token the student generates from a settings page they have
never opened. Both end the setup for most people — which is presumably why the
competitor we studied puts all five of its school integrations behind a paywall.

An extension reads a page the student is **already signed in to**. No
institution to ask, no token to configure, nothing to leak.

## What it does and does not do

- **Reads only.** It never clicks, submits, navigates or changes anything on the
  portal. A scraper with a write bug on a grades page is a catastrophe waiting
  for its first report.
- **Only when asked.** No standing permission over the web, no background
  watching. The student presses "Read this page", Chrome asks them to approve
  that one site by name, and the scanner is injected once.
- **Holds no credentials and calls no server.** `background.ts` contains no
  network code at all — the easiest kind of privacy claim to verify.
- **Keeps one thing:** the most recent reading, in this browser, until the
  student imports it or clears it.

## How the data reaches Nemesis

The app **pulls**; the extension never pushes.

```
portal page  →  content-scan.ts  →  chrome.storage.local
                                          ↓
app.enternemesis.com  ←  content-bridge.ts  (window.postMessage)
        ↓
   sanitiseScan()  →  review screen  →  student picks  →  saved
```

The student is already signed in on the Nemesis tab, so the page asks for the
scan and writes it with the session it already has. That is why no token exists
anywhere in this codebase.

**Nothing on that channel is trusted in either direction.** Any script on the
page can post those messages, so every scan is sanitised on arrival by
`packages/shared/src/lms-import.ts`: length caps, control characters stripped,
`javascript:` and `data:` URLs refused, dates checked against a real calendar,
unknown kinds folded to "other". A spoofed or compromised sender changes nothing
about what the app will accept.

It deliberately does **not** filter wording. See the header of `lms-import.ts`:
a keyword blocklist never catches the rephrasing, and it does mangle real
coursework — "Ignore the previous assumption and re-derive" is a genuine exam
question, and "SYSTEM:" is a real heading in a computer-architecture unit.

## Layout

```
manifest.json          Manifest V3
build.mjs              esbuild bundle → dist/
src/
  lms/detect.ts        which portal is this page   (pure, tested)
  lms/parse.ts         courses and coursework      (pure, tested)
  lms/dom.ts           the only file touching a real DOM
  content-scan.ts      injected on demand, reads the page once
  content-bridge.ts    runs on the Nemesis app, answers three questions
  background.ts        keeps the last scan, nothing else
  popup/               one button and an honest account of what it found
  messages.ts          the message names, in one place
  wire.ts              type-only re-export of the shared contract
test/                  detect + parse
```

Detection keys off **routes, not markup**. A Canvas course is at `/courses/:id`
on every installation on earth, because the application's own links depend on
it. Every university themes its portal; none of them change that.

Dates come only from machine-readable `<time datetime>` attributes. A row
without one arrives with no date, which the review screen shows honestly.
Parsing "Aug 4" out of prose means guessing a year and a timezone, and a
deadline silently wrong by a day is worse than one visibly missing.

## Build and load

```bash
node extension/build.mjs
```

Then in Chrome: `chrome://extensions` → enable Developer mode → **Load
unpacked** → choose the `extension/` folder (not `dist/`).

While working on it:

```bash
node extension/build.mjs --watch
```

Reload the extension in `chrome://extensions` after each rebuild.

## Tests

```bash
./node_modules/.bin/tsx --test extension/test/*.test.ts
```

The DOM adapter has no unit tests: there is no DOM library in this repo and it
was not worth adding a dependency for one file. It is verified by running the
real bundle against a real page — a check that caught a bug the unit tests did
not, where a footer link named the course "Syllabus (footer copy)".

## No package.json, on purpose

`apps/*` and `packages/*` are pnpm workspace globs. A member with no importer in
`pnpm-lock.yaml` makes `pnpm install --frozen-lockfile` fail, which once killed
an EAS build in 44 seconds. Living at the repo root with no dependencies of its
own, this folder cannot repeat that. It borrows esbuild from the root
`node_modules`.

## Publishing

Not done, and not something an agent can do. It needs:

1. A Chrome Web Store developer account (one-off 5 USD registration).
2. Icons at 16/32/48/128 px — the manifest declares none yet.
3. A privacy-policy URL and a justification per permission. `activeTab`,
   `scripting` and `storage` are straightforward; the optional host permissions
   need the "reads the portal you point it at, when you ask" explanation.
4. Review, historically days to weeks for an extension that reads page content.

Until then, the third onboarding step detects that the extension is missing and
says so plainly rather than linking to a page that does not exist.

## Adding a portal

1. Add its route patterns to `PATH_SIGNS` in `detect.ts`, and to `COURSE_ROUTES`
   and `ITEM_ROUTES` in `parse.ts`.
2. Add a detection test and a whole-page parse test.
3. Check it against a real page before believing it. Institutional HTML varies
   far more than routing does, and the browser has caught what fixtures did not.
