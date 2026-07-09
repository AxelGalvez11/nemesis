# Nemesis product-shaping plan — same Hermes UI/UX, our product

*2026-07-09. Owner brief given while running the real Hermes desktop app on their Mac. Companion to
[desktop-agent-hermes-build-plan-2026-07.md](desktop-agent-hermes-build-plan-2026-07.md) (the chassis
decision) and `apps/nemesis-desktop/` (the verified brand-string reskin kit). Every claim below is
anchored to the actual Hermes v0.18.2 source at `apps/desktop/` in the hermes-agent repo — file:line
anchors verified 2026-07-09 by two source-mapping passes.*

## The owner's brief (verbatim intent)
1. **Keep the same UI/UX.** Clone the product, shape it — don't redesign it.
2. **Default color = mono.** Nemesis palette = **monochrome with a red tint**. (Hermes already ships a mono look.)
3. **Reframe "coding" → "research, school, and similar".** Today it vibes "for coders" (connects a folder for coding, git surfaces).
4. **Keep the Artifacts page.** Hide **Capabilities** and **Messaging** — too technical for the audience.
5. **Trim Settings** — especially **Model**: we receive payment and provide the model; students never manage providers/keys.
6. Clinical-search abilities: deprioritized for now. Focus = shape the shell.

## How the shaping is done (the one big idea)
Hermes's UI is disciplined: colors are design tokens (their DESIGN.md forbids raw hex in components),
pages hang off small registries, and settings panels come from two arrays. So Nemesis = Hermes **plus a
short, maintained patch series on our private fork** — no redesign, no parallel UI. Two layers:

- **Layer A — brand strings & assets**: already solved by the verified reskin kit
  (`apps/nemesis-desktop/reskin/apply-nemesis-reskin.mjs`, 211 strings, internals preserved).
- **Layer B — product shaping** (this plan): ~6 small structural commits on the fork, each anchored below.
  These are code edits, not string swaps, so they live as fork commits that rebase cleanly on upstream pulls.

A later **Layer C** (server-driven "student mode") gets a natural hook: the desktop already reads an
open-ended config bag from the backend (`/api/config` → `HermesConfigRecord = Record<string, unknown>`,
`src/hermes.ts:377-414`) — our backend can emit `ui.student_mode` with zero desktop schema changes, and
the flag gets consumed once at the app root. v1 hardcodes the student build; Layer C arrives with Nemesis
accounts/billing.

---

## B1. Look: mono default now, "Nemesis mono+red" theme next
Hermes has six built-in themes (`src/themes/presets.ts`); **`mono` is the only true monochrome** (bg
`#0e0e0e`, fg `#eaeaea`, neutral-gray accent `#9a9a9a`, pure system fonts). The default is
`DEFAULT_SKIN_NAME = 'nous'` (blue) at `presets.ts:292`.

1. **Immediate (done in the reskin kit, safe one-word anchor):** default skin `'nous'` → `'mono'`.
   Satisfies "default = mono" using a theme that already exists — zero risk of a broken half-state.
2. **The `nemesis` theme (fork commit):** clone `monoTheme`'s neutral palette; set the accent seeds —
   `primary`, `ring`, `midground`, `accent`/`accentForeground` — to the Nemesis red. Register it in
   `BUILTIN_THEMES` (`presets.ts:280-287`); the theme grid, ⌘K palette, and `/skin` command pick it up
   automatically (their own comment: *"Add new themes here — no code changes needed elsewhere"*). Then
   flip `DEFAULT_SKIN_NAME` → `'nemesis'`.
   - **Red choice caveat:** Hermes has a semantic *danger* red (`--ui-red`: `#cf2d56` light / `#e75e78`
     dark, `styles.css:160/423`). Pick a brand red that reads distinct (deeper crimson family, e.g.
     `#b02a37`±) or consciously unify — don't collide by accident.
   - **Mode note:** `mono` ships one palette used for both light/dark (no separate light variant). v1
     Nemesis does the same (dark-first, like the owner's screenshots); a hand-tuned light pair is a
     later polish item (`synthLightColors()` only kicks in when `darkColors` exists — `context.tsx:79-124`).
   - **Fonts:** omit `typography` like `mono` does → clean system stack, no webfont.
3. **Brand mark goes mono+red** (supersedes the green orb in `reskin/brand/nemesis-mark.svg`). Real
   surfaces (mapping corrected 2026-07-09):
   - `public/apple-touch-icon.png` — **the actual runtime dock/window icon** (`electron/main.ts`
     `getAppIconPath()` / `app.dock.setIcon`).
   - `assets/icon.png/.icns/.ico` — installer/package icons (electron-builder).
   - `public/nous-girl.jpg` via `src/components/brand-mark.tsx` — the in-app logo (About page, update
     overlay, first-run overlay). Swap the image ref + revisit its hardcoded `bg-white` tile
     (documented as intentional, but a white square fights a dark mono+red theme).
   - `public/hermes.png`, `public/hermes-sprite.png`, `public/hermes-frames/*` — **dead, unreferenced
     legacy assets** (verified: zero code references). The kit no longer targets them.
4. **Boot paint:** first-ever launch falls back to `#111111` dark (`index.html:12-33`) — already
   mono-friendly; after first theme apply it self-corrects via the `hermes-boot-background` key.

## B2. Pages: keep Artifacts, hide Capabilities + Messaging
There is **no single page registry** — four places must agree (all small):

| Surface | Anchor | Change |
|---|---|---|
| Sidebar rail (the visible page list) | `src/app/chat/sidebar/index.tsx:133-148` (`SIDEBAR_NAV`) | Drop the `skills` ("Capabilities") and `messaging` items; keep `new-session` + `artifacts`. Cleanest: add `hidden?: boolean` to `SidebarNavItem` (`src/app/types.ts:127-133`) and filter — mirrors the `TitlebarTool.hidden` pattern that already exists. |
| ⌘K palette "Go to" | `src/app/command-palette/index.tsx:411-418` | Remove `nav.skills`, `nav.messaging` (and `nav-terminal`, see B4) entries. |
| Route table | `src/app/routes.ts:43-54` (`APP_ROUTES`) | Leave routes in place v1 (harmless, nothing links to them once nav+palette are trimmed); optionally redirect `/skills`,`/messaging` → `/` later. |
| Command Center quick-nav copy | `src/i18n/en.ts:1020-1026` | Stays; hidden entries just never render. |

**Artifacts stays exactly as-is** (`/artifacts` route, `ArtifactsView`, sidebar item, i18n
`sidebar.nav.artifacts`). Note "Capabilities" is the *display label* for the internal `skills` page —
we hide the page but the skills/MCP *machinery* stays alive underneath (our PubMed/openFDA skills ride
on it; students just don't manage it).

## B3. Settings: student trim (we provide the model — they never see it)
Settings = two arrays: `navGroups` (`src/app/settings/index.tsx:116-204`) + config sub-sections
`SECTIONS` (`src/app/settings/constants.ts:502-636`). Neither supports per-entry hiding today — add the
same `hidden` filter pattern once, then allow-list:

**KEEP:** `config:appearance` (theme/mode picker) · `config:chat` · `notifications` · `sessions`
(archived chats) · `about` (which nests Uninstall) · `config:safety` (review copy first).
**HIDE:** `config:model` + `providers` + `keys` (API keys) + `gateway` — the "bring your own AI"
plumbing; Nemesis provisions the model server-side because **we bill for it** · `config:advanced` ·
`config:workspace` (terminal cwd / code-execution mode — coding-facing) · `config:voice` (revisit when
lecture-recording lands) · `config:memory` (agent keeps using memory; students don't tune it).

**First-run flow changes with it:** today's onboarding overlay is a *provider picker*
(`src/components/onboarding/index.tsx:158,236-245` — "choose OpenRouter/OpenAI/…"). That's the exact
seam where **Nemesis sign-in** goes: create account → subscription → our backend provisions the model
(config lands via the existing `/api/config` path). The overlay's gating slot, skip logic, and
persistence keys (`hermes-desktop-onboarded-v1`) are all reusable as-is. Hermes's own "Nous Portal"
login (`hermes portal`, OAuth into a hosted model pool) is the in-repo precedent for
subscription-instead-of-API-key — we mimic that shape pointed at Nemesis accounts.

## B4. Reframe "coding" → "research, school, and similar"
The coding vibe comes from five decoupled surfaces — each independently hideable **without touching the
chat loop** (verified):

1. **"Open folder" right-sidebar** (`src/app/right-sidebar/index.tsx:27-90`; titlebar toggle
   `titlebar-controls.tsx:102-110`): **keep the mechanics, rename the frame.** Folder connection is
   actually our killer feature (point it at course materials) — reframe via i18n: "Workspace/Open
   folder" → "Library / Open your course folder" (`rightSidebar.*` keys, `src/i18n/en.ts:2093-2100`).
   Hide the **Terminal tab** inside it.
2. **Terminal takeover pane** (`desktop-controller.tsx:1253-1282`): statusbar button already supports
   `hidden` (`use-statusbar-items.tsx:398-406` sets `hidden: !chatOpen` — extend the condition);
   remove the ⌘K `nav-terminal` entry.
3. **Git branch/worktree "Projects" sidebar mode** (`src/app/chat/sidebar/projects/*`, toggle at
   `sidebar/index.tsx:1272-1286`): hide the toggle; flat session list stays (it's core navigation).
4. **"Coding" status row in the composer** (`coding-row.tsx`, mounted `composer/index.tsx:921-928`):
   already self-hides outside git repos (`$repoStatus` null → render null); wrap the mount anyway so it
   can never appear for students.
5. **CodeMirror editors**: only used in config/JSON panels + file preview — all behind surfaces hidden
   above; file preview stays (useful for PDFs/slides). No change needed.

Plus the copy pass: workspace-flavored i18n strings re-voiced for school ("session" stays; "workspace" →
"library"; examples in placeholders swap code-talk for school-talk). The i18n dictionaries are the same
files the reskin kit already rewrites — the school-voice pass extends the kit's dictionary step.

## Build sequence (fork commits, in order)
1. ~~Kit: default skin → `mono`~~ + icon-target fix (**done, this repo, 2026-07-09**).
2. Fork setup: private fork + apply kit (Layer A) — *gated on disk headroom for the build, now cleared.*
3. `nemesis` theme + default flip + brand-mark swap (B1).
4. `hidden` filter for sidebar/palette + hide Capabilities/Messaging (B2).
5. Settings allow-list (B3, without the sign-in overlay — that waits for Nemesis accounts).
6. Coding→school pass (B4) + i18n school voice.
7. Layer C: `ui.student_mode` via `/api/config` when the Nemesis backend/billing exists.

Each commit is small and isolated; on upstream Hermes pulls, conflicts localize to known anchors
(this doc is the conflict map).

## What we deliberately do NOT touch
Chat pane, composer, Artifacts, session list, the `/api/*` contract, gateway internals, skills/MCP
machinery (hidden ≠ removed), `window.hermesDesktop` bridge, `HERMES_*` env, storage keys. Same
UI/UX — different product framing.

## Open items for the owner
1. **Exact Nemesis red** (against `#0e0e0e` mono field; must not read as the danger red) — I'll bring
   2–3 swatch options rendered in the real UI.
2. **`config:safety` panel**: keep visible (transparency sells trust) or tuck into About?
3. **Voice settings**: hide now and resurface with lecture recording, or leave visible from day one?
