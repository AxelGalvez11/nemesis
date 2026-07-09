# Nemesis desktop — the Hermes reskin kit

**Nemesis** is our desktop school agent for healthcare students. The plan of record
([docs/design/desktop-agent-hermes-build-plan-2026-07.md](../../docs/design/desktop-agent-hermes-build-plan-2026-07.md))
is to build it on the **Hermes Agent** codebase (MIT, `NousResearch/hermes-agent`) as the
chassis, add PharmaOrb's evidence skills (PubMed / guidelines / openFDA), and route clinical
output through PharmaOrb's enforcement (citation-drop + faithfulness + deterministic safety).

This folder is **not a copy of Hermes.** It is the **re-applyable transform** that stamps a
Hermes checkout into "Nemesis." Read `reskin/apply-nemesis-reskin.mjs` for the why — in short:
Hermes' desktop app is a subtree of a fast-moving monorepo (`apps/desktop` depends on
`@hermes/shared` + the workspace root), so copying it here would dangle those refs and cut us
off from upstream updates. Keeping the rebrand as a transform means we `git`-fork Hermes,
run this, and still `git pull` upstream fixes.

> This **supersedes** the older hand-built `apps/desktop-agent/` (a from-scratch approximation
> of the Hermes look). The owner wanted the *real* Hermes UI, rebranded — this kit delivers that.
> `apps/desktop-agent` is kept only for its already-working pieces (FSRS study engine, Obsidian
> vault writer, Playwright portal connector) which become Nemesis *skills*, not a second shell.

## What's proven working (2026-07-09)
- **Hermes runs on this Mac**, powered by our DeepSeek key: a live agent turn answered a real
  pharmacy question correctly (lisinopril cough → bradykinin → switch to an ARB). So the
  "brain + body" works today; the reskin is cosmetic + packaging on top of a working agent.
- **The reskin is verified against the real Hermes source** (`v0.18.2`): `--check` mode confirms
  every anchor matches, and a dry apply to a throwaway copy swapped **211 brand strings** while
  leaving all internal identifiers intact.

## How to produce the actual Nemesis app
Gated on **free disk space** — a Hermes build pulls its full `node_modules` + an Electron/
browser toolchain (several GB). The owner's Mac is currently ~100% full, so the *build* waits;
the *reskin* does not.

```bash
# 1. Private fork of the chassis (keeps upstream syncable — not a subtree copy)
gh repo fork NousResearch/hermes-agent --org <you> --fork-name nemesis-agent   # or clone + push to a private repo
cd nemesis-agent

# 2. Stamp it into Nemesis (safe, idempotent, reversible with `git checkout .`)
node <PharmaBro>/apps/nemesis-desktop/reskin/apply-nemesis-reskin.mjs --hermes .

# 3. Build the signed desktop app
npm install
npm --workspace apps/desktop run build      # → DMG / MSI via electron-builder
```

## What the reskin changes (and deliberately does not)
**Changes (user-visible brand only):**
- `apps/desktop/index.html` title, `package.json` product identity (productName, executableName,
  appId, CFBundle*, mic/audio usage strings, installer artifact name, protocol name).
- The i18n display dictionaries `src/i18n/en.ts` + `zh.ts` (whole-word `Hermes` → `Nemesis`).
- A few component strings (uninstall panel, pet overlay, model-settings).
- App icon + logo (`brand/nemesis-mark.svg` is the source; PNG/`.icns`/`.ico` are generated at
  build — see "pending" below).

**Never touched (internal — renaming these breaks the app):**
`window.hermesDesktop` (the preload IPC bridge) · `@hermes/shared` (workspace package) ·
`HERMES_*` env vars · `hermes-boot-*` localStorage keys · `Hermes*` TypeScript types ·
`src/hermes.ts` (the REST client) · the `hermes://` deep-link scheme token.

## Pending (design + build steps)
- **Icons:** drop `reskin/brand/nemesis.png` (512²) and `reskin/brand/icon.png` next to the SVG
  and the script copies them in. Full `.icns`/`.ico` are produced by electron-builder from those.
- **Boot mascot:** Hermes ships an animated boot sprite (`public/hermes-frames/*`). Replacing it
  with Nemesis art is a design task, not a string swap — left as-is until we have the frames.
- **Skills + enforcement:** wiring PubMed/openFDA/guidelines as MCP skills and routing clinical
  output through the safety gate is the next milestone (build sequence §9 in the plan doc).
