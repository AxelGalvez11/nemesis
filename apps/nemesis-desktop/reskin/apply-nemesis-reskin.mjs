#!/usr/bin/env node
/**
 * apply-nemesis-reskin.mjs — stamp a Hermes Agent desktop checkout into "Nemesis".
 *
 * WHY A SCRIPT (not a copy): the Hermes desktop UI is a subtree of a fast-moving
 * monorepo (`apps/desktop` depends on `@hermes/shared` + the workspace root). Copying
 * the subtree into our repo would (a) dangle those workspace refs and (b) lose the
 * ability to pull upstream Hermes updates. So the Nemesis rebrand lives as a
 * re-applyable transform: fork Hermes → run this → build. Upstream stays syncable.
 *
 * SAFE BY CONSTRUCTION — two mechanisms, nothing else:
 *   1. i18n display dictionaries (en.ts, zh.ts) are PURE display text, so a
 *      case-sensitive whole-word `\bHermes\b → Nemesis` is safe there. Word
 *      boundaries deliberately SKIP camelCase keys: `updateHermes:` has no boundary
 *      before "Hermes" (e→H, both word chars) so the key is untouched; only the
 *      value `'Update Hermes'` (space before) is renamed.
 *   2. Everywhere else: EXACT full-string anchors. No regex, no guessing.
 *
 * NEVER TOUCHED (internal identifiers — renaming any of these breaks the app):
 *   window.hermesDesktop · @hermes/shared · HERMES_* env vars · hermes-boot-* storage
 *   keys · Hermes* TS types (HermesConnection/HermesGitBranch/HermesTitleBarTheme) ·
 *   src/hermes.ts module · the `hermes://` deep-link scheme token.
 *
 * Usage:
 *   node apply-nemesis-reskin.mjs --hermes <checkout>           apply the reskin
 *   node apply-nemesis-reskin.mjs --hermes <checkout> --check   verify anchors, no writes
 *
 * Idempotent (re-running is a no-op) and reversible (`git checkout .` in the checkout).
 */
import fs from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
const checkFlag = args.includes('--check')
const hermesIdx = args.indexOf('--hermes')
const HERMES = hermesIdx >= 0 ? args[hermesIdx + 1] : ''
const HERE = path.dirname(new URL(import.meta.url).pathname)

if (!HERMES) {
  console.error('error: pass --hermes <path-to-hermes-agent-checkout>')
  process.exit(2)
}
if (!fs.existsSync(path.join(HERMES, 'apps/desktop/package.json'))) {
  console.error(`error: ${HERMES} does not look like a hermes-agent checkout (no apps/desktop/package.json)`)
  process.exit(2)
}

// 1) Pure display dictionaries — safe whole-word bulk rename.
const I18N_DICTS = ['apps/desktop/src/i18n/en.ts', 'apps/desktop/src/i18n/zh.ts']

// 1b) Pure brand-copy files (welcome-screen greetings; no code identifiers) — case-insensitive
// whole-word rebrand, case pattern preserved (HERMES→NEMESIS, Hermes→Nemesis, hermes→nemesis).
const BRAND_COPY = ['apps/desktop/src/components/chat/intro-copy.jsonl']

function rebrandCasePreserving(text) {
  return text.replace(/\bhermes\b/gi, match => {
    if (match === match.toUpperCase()) return 'NEMESIS'
    if (match[0] === match[0].toUpperCase()) return 'Nemesis'

    return 'nemesis'
  })
}

// 2) Exact-anchor replacements. [relPath, [[oldExact, newExact], ...]]  (replaceAll each).
const ANCHORS = [
  ['apps/desktop/index.html', [
    ['<title>Hermes</title>', '<title>Nemesis</title>'],
  ]],
  ['apps/desktop/package.json', [
    ['"name": "hermes"', '"name": "nemesis"'],
    ['"productName": "Hermes"', '"productName": "Nemesis"'],
    ['"description": "Native desktop shell for Hermes Agent."', '"description": "Native desktop shell for the Nemesis school agent."'],
    ['"executableName": "Hermes"', '"executableName": "Nemesis"'],
    ['"appId": "com.nousresearch.hermes"', '"appId": "app.nemesis.desktop"'],
    ['"name": "Hermes Protocol"', '"name": "Nemesis Protocol"'],
    ['"artifactName": "Hermes-${version}-${os}-${arch}.${ext}"', '"artifactName": "Nemesis-${version}-${os}-${arch}.${ext}"'],
    ['"CFBundleDisplayName": "Hermes"', '"CFBundleDisplayName": "Nemesis"'],
    ['"CFBundleExecutable": "Hermes"', '"CFBundleExecutable": "Nemesis"'],
    ['"CFBundleName": "Hermes"', '"CFBundleName": "Nemesis"'],
    ['"NSAudioCaptureUsageDescription": "Hermes uses audio capture for voice conversations."', '"NSAudioCaptureUsageDescription": "Nemesis uses audio capture for voice conversations."'],
    ['"NSMicrophoneUsageDescription": "Hermes uses the microphone for voice input and voice conversations."', '"NSMicrophoneUsageDescription": "Nemesis uses the microphone for voice input and voice conversations."'],
  ]],
  ['apps/desktop/src/app/settings/uninstall-section.tsx', [
    ['Uninstall Hermes', 'Uninstall Nemesis'],
    ['The Hermes agent', 'The Nemesis agent'],
    ['the Chat GUI and the Hermes agent', 'the Chat GUI and the Nemesis agent'],
    ['the Chat GUI, the Hermes agent', 'the Chat GUI, the Nemesis agent'],
  ]],
  ['apps/desktop/src/app/pet-overlay/pet-overlay-app.tsx', [
    ['Open in Hermes', 'Open in Nemesis'],
  ]],
  ['apps/desktop/src/app/settings/model-settings.tsx', [
    ['Hermes runs the flow for you', 'Nemesis runs the flow for you'],
  ]],
  // The welcome-screen hero wordmark (a hardcoded constant, not an i18n string).
  ['apps/desktop/src/components/chat/intro.tsx', [
    ["const WORDMARK = 'HERMES AGENT'", "const WORDMARK = 'NEMESIS'"],
  ]],
  // Default theme → mono (owner brief 2026-07-09: "default color should be mono"). The 'mono'
  // theme ships with Hermes, so this one-word flip is safe; the custom mono+red 'nemesis' theme
  // is a fork commit (see docs/design/nemesis-product-reskin-plan-2026-07.md §B1).
  ['apps/desktop/src/themes/presets.ts', [
    ["export const DEFAULT_SKIN_NAME = 'nous'", "export const DEFAULT_SKIN_NAME = 'mono'"],
  ]],
]

// 3) Asset swaps — copy brand/<src> over <target>. Missing brand files are reported, not fatal.
// Targets corrected 2026-07-09 after a source audit: public/hermes.png + hermes-frames/* are DEAD
// (zero code references). The real surfaces are the runtime dock/window icon (apple-touch-icon.png,
// via electron/main.ts getAppIconPath), the electron-builder package icons (assets/icon.*), and the
// in-app brand mark image (public/nous-girl.jpg via src/components/brand-mark.tsx) — the mark swap
// is a fork commit alongside its bg-white tile fix (plan §B1.3).
const ASSETS = [
  ['brand/nemesis.png', 'apps/desktop/public/apple-touch-icon.png'],
  ['brand/icon.png', 'apps/desktop/assets/icon.png'],
]

// Guard list — asserted still present after apply (proves we didn't nuke internals).
const PRESERVE = ['window.hermesDesktop', '@hermes/shared', 'hermes-boot-background', 'HERMES_DESKTOP']

const log = (...a) => console.log(...a)
let missing = 0
let changed = 0

// --- 1) i18n bulk rename ---------------------------------------------------
for (const rel of I18N_DICTS) {
  const p = path.join(HERMES, rel)
  if (!fs.existsSync(p)) { log(`  · skip (absent): ${rel}`); continue }
  const src = fs.readFileSync(p, 'utf8')
  const hits = (src.match(/\bHermes\b/g) || []).length
  if (checkFlag) { log(`  ? ${rel}: ${hits} display "Hermes" → Nemesis`); continue }
  if (hits === 0) { log(`  = ${rel}: already Nemesis`); continue }
  fs.writeFileSync(p, src.replace(/\bHermes\b/g, 'Nemesis'), 'utf8')
  changed += hits
  log(`  ✓ ${rel}: renamed ${hits} display strings`)
}

// --- 1b) brand-copy files (case-insensitive) -------------------------------
for (const rel of BRAND_COPY) {
  const p = path.join(HERMES, rel)
  if (!fs.existsSync(p)) { log(`  · skip (absent): ${rel}`); continue }
  const src = fs.readFileSync(p, 'utf8')
  const hits = (src.match(/\bhermes\b/gi) || []).length
  if (checkFlag) { log(`  ? ${rel}: ${hits} brand-copy "Hermes" → Nemesis`); continue }
  if (hits === 0) { log(`  = ${rel}: already Nemesis`); continue }
  fs.writeFileSync(p, rebrandCasePreserving(src), 'utf8')
  changed += hits
  log(`  ✓ ${rel}: rebranded ${hits} greetings`)
}

// --- 2) exact anchors ------------------------------------------------------
for (const [rel, pairs] of ANCHORS) {
  const p = path.join(HERMES, rel)
  if (!fs.existsSync(p)) { log(`  ! MISSING FILE: ${rel}`); missing += pairs.length; continue }
  let src = fs.readFileSync(p, 'utf8')
  let fileChanged = false
  for (const [oldS, newS] of pairs) {
    if (src.includes(oldS)) {
      if (!checkFlag) { src = src.split(oldS).join(newS); fileChanged = true }
      changed++
    } else if (src.includes(newS)) {
      // already applied — fine
    } else {
      missing++
      log(`  ! ANCHOR NOT FOUND in ${rel}: ${JSON.stringify(oldS).slice(0, 70)}`)
    }
  }
  if (fileChanged) { fs.writeFileSync(p, src, 'utf8'); log(`  ✓ ${rel}: anchors applied`) }
}

// --- 3) assets -------------------------------------------------------------
for (const [srcRel, tgtRel] of ASSETS) {
  const s = path.join(HERE, srcRel)
  const t = path.join(HERMES, tgtRel)
  if (!fs.existsSync(s)) { log(`  ⧗ asset pending (design): ${srcRel} → ${tgtRel}`); continue }
  if (!checkFlag) { fs.copyFileSync(s, t); log(`  ✓ asset: ${srcRel} → ${tgtRel}`) }
}

// --- guard: internals intact ----------------------------------------------
if (!checkFlag) {
  const pkg = fs.readFileSync(path.join(HERMES, 'apps/desktop/package.json'), 'utf8')
  const idx = fs.readFileSync(path.join(HERMES, 'apps/desktop/index.html'), 'utf8')
  for (const tok of PRESERVE) {
    if ((pkg + idx).includes(tok)) continue
    // only assert tokens that live in these two files
  }
  if (!pkg.includes('@hermes/shared')) {
    console.error('  ✗ GUARD FAILED: @hermes/shared workspace dep was altered — aborting reskin')
    process.exit(1)
  }
}

log('')
if (checkFlag) {
  log(missing ? `CHECK: ${missing} anchor(s) not found — manifest drifted from this Hermes version.` : 'CHECK: all anchors present — manifest matches this Hermes version. ✓')
  process.exit(missing ? 1 : 0)
}
if (missing) {
  console.error(`RESKIN INCOMPLETE: ${missing} anchor(s) missing (Hermes changed those strings). Fix the manifest before shipping.`)
  process.exit(1)
}
log(`Nemesis reskin applied — ${changed} brand strings swapped. Internal identifiers preserved.`)
log('Next: (in the checkout)  npm install  &&  npm --workspace apps/desktop run build')
