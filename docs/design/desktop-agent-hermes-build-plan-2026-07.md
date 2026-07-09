# Desktop Agent — Build Plan of Record (Hermes chassis + PharmaOrb skills & enforcement)
*2026-07-09. Consolidates the owner's decision to build the school agent on the Hermes Agent codebase, plus everything verified from the Hermes source and the clinical experiment. Working brand "Nemesis" is unsettled — see Open Decisions.*

---

## 1. The decision
Adopt **Hermes Agent** (MIT, `NousResearch/hermes-agent`) as the desktop **chassis**; add PharmaOrb's evidence capabilities as **skills**; route clinical output through PharmaOrb's **enforcement**; ship as a **signed installer**.

Owner made this call, overriding my earlier "don't fork" advice. It's reconciled — the fork is viable *because* the Hermes UI is separable TypeScript/Electron over a clean HTTP seam, and capabilities plug in as skills/MCP. The one thing that does not change: the trust rails (§5) and enforcement (§4) — those are what keep it from being the next Einstein.

## 2. How Hermes actually works (verified from the source)
- **Two layers, one HTTP seam.** `apps/desktop` = Electron + React/Vite/Tailwind/shadcn (assistant-ui chat, CodeMirror editor, `3d-force-graph` graph, xterm terminal). It talks to a **Python agent backend** over an HTTP `/api/*` contract (`model`, `fs`, `tools`, `skills`, `mcp`, `memory`, `cron`, `providers`, `sessions`, `config`).
- **The desktop app boots the Python agent itself** — a `backend-*.ts` subsystem (command/env/probes/ready + `bootstrap-platform`) spawns, configures, and health-checks it. The user never sees this.
- **Capabilities = skills + MCP.** `skills/`, `optional-skills/`, `tools/`, `optional-mcps/`, full MCP client (`mcp_serve`, `mcp_config`, `mcp_oauth`).
- **It's a do-anything agent** — bundles Git Bash to run shell. Model-agnostic (DeepSeek works via `providers`).
- **Ships real installers** — electron-builder config with **macOS DMG/ZIP, Windows NSIS/MSI**, notarization (`afterSign`) wired. A Tauri `apps/bootstrap-installer` handles onboarding.
- **DNA note:** the repo ships a "Migrating from OpenClaw" guide — Hermes is the same lineage as OpenClaw, the framework behind the banned Einstein tool. The rails (§5) are the whole difference.

## 3. Target user experience
Download a **signed DMG/MSI → double-click → open the app.** No terminal, ever. The app boots the agent under the hood; the student sees Chat + Knowledge + Study + the 3D graph. They connect sources (API-first, browser fallback), and clinical questions come back **cited and safety-gated**.

## 3a. Onboarding & connections flow (owner spec, 2026-07-09)
Brand: **Nemesis** (working name; `.com` unavailable — see Open Decisions). The student never manages infrastructure; they **pay, and the agent runs.** First-run flow:
1. **Create a Nemesis account** (email + password / SSO). Subscription starts here — paid service, frictionless.
2. **Connect accounts (API-first):** Gmail / Google (OAuth), and other third-party apps' APIs where the student can self-authorize. Prefer official APIs; browser automation is the fallback.
3. **Agent asks two things:** the student's **school portal web address** (Blackboard/Canvas/etc.) and their **school email**.
4. **Extract everything:** notes, lecture files, syllabi, announcements, assignments — via API where available, else the logged-in browser session (Playwright).
5. **Do the busywork, draft-only:** prepare projects/homework **with student permission** — but **the agent never submits; it only produces drafts for approval.** (Owner reaffirmed. This is the trust rail in §5.)
6. **Record lectures → transcribe → notes** (consent-gated recording; on-device whisper).
7. **Storage:** connect to **Obsidian** (Markdown vault — already wired) *or* Nemesis's built-in store for **calendar, notes, and flashcards**.
8. **Quizlet import** (see §6a).
9. **Screen viewing = an optional switch** (default OFF; consent + visible indicator when on).

## 6a. Quizlet import — feasibility (researched 2026-07-09)
Quizlet's **public API is effectively gone/restricted** — no clean API import. Paths that work:
- **Quizlet's own export** (website only): export the term/definition text of sets the student *created* (copied-from-others sets and images are blocked). Cleanest, semi-official.
- **Browser automation** on the logged-in account to pull the student's sets' term/definition text (respect ToS; text-only, images/formatting may break).
Either way, mapping into Nemesis is trivial (term → front, definition → back) → straight into the FSRS study engine / `.apkg`. Verdict: **no API; extract via export or browser automation, text-only.** Add as a `quizlet_import` skill (browser) with the export path as the manual fallback. Sources: [Quizlet Help — exporting sets](https://help.quizlet.com/hc/en-us/articles/360034345672-Exporting-your-sets), [export guide 2026](https://flashcards-open-source-app.com/blog/how-to-export-quizlet-sets-and-turn-them-into-fsrs-flashcards/).

## 4. What we take vs. what's ours (the moat)
| Take from Hermes (MIT) | Ours — the differentiation |
|---|---|
| Electron/React UI (chat, side panel, CodeMirror, 3D graph) | The **evidence engine + enforcement** (cited, safety-gated answers) |
| Agent runtime (loop, memory, cron, skills, MCP) | PubMed / guidelines / openFDA skills |
| Packaging (electron-builder → signed installers) | Pharmacy-grade card quality; the deterministic safety layer |
| Tauri bootstrap installer | School connectors (Blackboard/Canvas/Outlook) |
| Model-agnostic provider layer (→ DeepSeek) | Obsidian-compatible notes vault + FSRS study (already built in `apps/desktop-agent`) |

## 5. The enforcement layer (non-negotiable — this is why the clinical experiment mattered)
The experiment (DeepSeek + PubMed tool + instructions across 3 conditions) showed: **tools + instructions carry a do-anything agent most of the way** — grounded, cautious answers *most of the time* — but every bit is **probabilistic** (the model must choose to search, the tool must work, the model must choose to cite). "Usually safe" is not safe for health.

So clinical output routes through PharmaOrb's **enforcement**, not just the system prompt:
1. **Citation-drop** — drop any claim not backed by a real retrieved source.
2. **Faithfulness check** — verify the surviving claims against their cited sources.
3. **Deterministic safety gate** — hard refusals for self-harm / overdose / dangerous categories, regardless of the model's mood.

Instructions make the model *try*; enforcement makes it *verifiable*. That is the line between a demo and a tool schools and patients trust.

## 6. Skills to add (mostly wrapping existing PharmaOrb code)
| Skill | Wraps | Mechanism |
|---|---|---|
| `pubmed_search` | NCBI eutils / PharmaOrb retrieval | MCP server |
| `guidelines_lookup` | PharmaOrb guideline retrieval | MCP server |
| `openfda_label` | openFDA (key already held) | MCP server |
| `verify_claim` | the cited evidence-synthesis engine | MCP server (calls `/ask`/`/research`) |
| `safety_scan` | the deterministic safety layer | in-process gate (not just a tool) |
| `make_flashcards` | pharmacy-grade card generator | skill |
| `study_review` | FSRS scheduler (`ts-fsrs`) | skill / local |
| `save_note` | Obsidian-vault writer | skill / local |
| `portal_*` | Blackboard/Canvas/Outlook connectors | Playwright MCP (read/organize only) |

## 7. Trust rails (what keeps it out of the Einstein graveyard)
- **Never auto-submit = a missing code path**, not a setting.
- **Never impersonate** beyond read/organize; browser automation stays in the read lane (API-first: Canvas token; browser fallback: Blackboard/Outlook).
- **Fence the do-anything shell** — the arbitrary-shell capability is NOT exposed to the model in the shipped student build.
- **Screen viewing (if added at all)** — explicit per-session consent + visible indicator + on-device vision. Highest privacy liability in the plan; default OFF/deferred.
- Provenance on every artifact; local-first; student's own authorized session; clinical output through §4 enforcement.

## 8. Packaging & distribution
- electron-builder → **signed/notarized DMG + signed NSIS/MSI**; `electron-updater`. **Not app stores** (sandbox forbids audio/automation/background/screen).
- We own **Apple notarization + Windows signing** (+ SmartScreen reputation build).
- Heavy bundle (Python + Node + agent, hundreds of MB); **first-launch bootstrap reliability** across every student's machine is a real support burden (their own docs warn AV flags the bundled `uv` binary).

## 9. Build sequence
1. **Fork + reskin + signed build.** Private fork; brand skin; DeepSeek provider; get a signed DMG building; **strip multi-channel gateways + fence the shell**.
2. **Evidence skill + enforcement.** `pubmed_search`/`guidelines`/`openfda` as MCP; wire clinical routing through citation-drop + faithfulness + safety gate.
3. **Port study surfaces.** Bring the notes vault, 3D graph, and FSRS study (already built) into the UI.
4. **Browser automation.** Playwright MCP skill (read/organize; Canvas API-first).
5. **(Deferred, optional) screen viewing**, consent-gated.
6. **Sign, notarize, auto-update, distribute.**

## 10. Risk register (honest)
- **Distribution is the #1 unsolved business risk** — reaching students, not the tech (every dead study-tool died here).
- **Forking a fast-moving Python monorepo** = ongoing sync/maintenance burden in a non-primary language.
- **Heavy install + bootstrap reliability** across Mac/Windows/AV.
- **OpenClaw/do-anything DNA** — the rails must actually hold, or you inherit Einstein's ban risk.
- **Name/domain** — "Nemesis" `.com`/`.ai`/`.app` all taken (only `.school`/`.study` free), and "nemesis" (= enemy/downfall) reads adversarial, which cuts against "schools trust this."
- **Signing/notarization** cost + time.
- **Exit ramp:** eventually serve the `/api/*` contract from a **lighter backend (ours)** to shed the Python-agent weight — the UI is portable, so this stays open.

## 11. Open decisions (owner)
1. **Name + domain** (Nemesis flagged; want an ownable `.com`?).
2. **Free-tier AI**: provide-the-AI (we pay LLM) vs BYO-DeepSeek-key (they pay). Leaning BYO/tiny-quota free, generous-included paid.
3. **How far to fence the do-anything shell** (fully remove vs. gated).
4. **Screen viewing** in or out.

## 12. Execution status (2026-07-09)
- **Hermes installed + running on the owner's Mac** — `hermes` v0.18.2 at `~/.hermes/hermes-agent`; see [[pharmaorb-hermes-installed-local]] memory for the run/repair details. Install finished after a disk-full stall on the final launcher step.
- **DeepSeek wired + a live agent turn proven** — our key set in Hermes' `.env`; a one-shot run (`hermes -z … -m deepseek/deepseek-v4-flash`) returned a correct pharmacy answer (lisinopril cough → bradykinin → ARB). Balance at check: $19.23. So chassis + model + clinical reasoning work *today*.
- **Reskin kit built + verified** — `apps/nemesis-desktop/reskin/apply-nemesis-reskin.mjs`. `--check` confirms all anchors match Hermes v0.18.2; a dry apply swapped **211** brand strings (91 en + 101 zh + metadata/component anchors) while preserving every internal identifier (`window.hermesDesktop`, `@hermes/shared`, `HERMES_*`, `hermes-boot-*`, `Hermes*` types). Curated allow-list, not a global find-replace.
- **Chosen clone shape = re-applyable transform, not a subtree copy** — Hermes' `apps/desktop` depends on `@hermes/shared` + the workspace root; copying it here would dangle refs and kill upstream sync. So the durable clone is a **private git fork + this reskin script**, done when disk allows a real clone+build. Supersedes the hand-built `apps/desktop-agent` (its FSRS/vault/portal code becomes skills).
- **Hard gate = disk.** The owner's Mac is ~100% full; a Hermes build needs several GB of `node_modules` + Electron/browser toolchain. The build (and therefore the first *clickable* Nemesis window) waits on the owner freeing space. Everything above is disk-free.
