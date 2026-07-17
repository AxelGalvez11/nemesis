# Skills Bar + Dictation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two composer upgrades in the Ask page — (A) rebrand the "+" menu's "Playbooks" section into "Skills" with two real one-click recipes (Slides, Systematic review) plus an honest "Journal club — Soon" entry, and (B) turn the disabled mic button into working browser speech-to-text dictation.

**Architecture:** Skills are pure data (a discriminated `action` the menu switches on — no functions-in-data), extending the existing `apps/web/lib/playbooks.ts`. The Systematic review skill arms a new client-only depth id (`structured_review`) that the research fn already accepts, so no edge-function change is needed. The Slides skill arms Deep research AND records a per-run "export to slides" intent keyed by turn index; when that run's report completes, the client auto-exports it to PowerPoint via the existing `downloadReportExport` helper, falling back to a neutral inline note on any failure. Dictation uses the browser Web Speech API with feature detection, an inline TS type shim, and SSR-safe support detection — no backend, no new dependencies.

**Tech Stack:** Next.js 15 (React 19, `"use client"`), TypeScript, the shared `@nemesis/shared` contract (untouched), the existing `downloadReportExport` export helper, and the Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`).

## Global Constraints

- **FROZEN:** `supabase/functions/ask/**` — never edited. The research edge function (`supabase/functions/research/**`) is also **not** touched: `startResearch` already forwards any `ReportMode` string (verified) so `structured_review` reaches it unchanged.
- **`@nemesis/shared` is NOT edited.** `ReportMode` already includes `"structured_review"` (packages/shared/src/research.ts:113, verified). No Deno test tasks are needed because no shared/edge code changes.
- **No new npm dependencies.** Dictation uses the built-in browser Web Speech API only.
- **Honesty rule (owner standing rule):** never assert a gate, cost, or capability that does not exist. In particular: **the PPTX export route is NOT Pro-gated server-side.** `apps/web/app/api/reports/[id]/export/pptx/route.ts` only calls `verifyBearer` → 401; there is no `ppt_export_enabled` / entitlement / 403 check (verified against origin/main). The Pro gate is upstream — `deep` is `pro:true`, and a non-Pro user's run dies at `startResearch` with `proGate` before the report ever completes. So the slides failure note must be **neutral** ("Couldn't export slides automatically — open the report to download."), never "Slides export is Pro".
- **Web gate:** `npm run build` from `apps/web` (Next build runs typecheck). This is the only required gate.
- **Commits:** conventional (`feat:` / `fix:`), on branch `feat/skills-dictation` (off `origin/main`). Attribution is disabled globally.
- **Plain-English owner summaries** per repo `CLAUDE.md` (code/commits stay technical).
- **Icons:** only names present in `apps/web/components/icons.tsx` may be used. Verified available: `doc`, `sparkle`, `check`, `bell`, `mic`, `card`, `lock`, `shield`, `plus`, `message`. There is no "slides"/"present" icon — reuse `doc` (already used for report chips) for Slides and Systematic review; use `message` for Journal club.

---

## File Structure

| File | Responsibility | Change |
|------|----------------|--------|
| `apps/web/lib/playbooks.ts` | Pure data: the 4 existing recipes (`PLAYBOOKS`) + the new `SKILLS` array (discriminated `action`) | Modify |
| `apps/web/app/app/ask/page.tsx` | The Ask composer + submit routing + research-run cards; the "+" menu; the mic button | Modify |
| `apps/web/app/styles/shell.css` | Composer styling; add the mic recording state (`.tool.rec` + pulse keyframe) | Modify |

No new files. Extending `playbooks.ts` (over a new `skills.ts`) honors "prefer editing existing" and YAGNI — the two data shapes are small and closely related.

---

## Task 1: Skills data + "+" menu restructure

Rename the menu's "Playbooks" section to "Skills" and render three skill entries: **Slides** (arms Deep research + a slides-export intent), **Systematic review** (arms the `structured_review` depth), and **Journal club — Soon** (disabled). The four existing curated recipes stay, moved under a separate "Playbooks" sub-label below Skills so the menu reads Skills → Playbooks → filters. This task wires the CLICK behavior for Skills up to `setMode` + the two refs, which are added in Tasks 2 and 3; to keep Task 1 independently buildable, this task adds the refs and their consumption points as stubs (`setMode("deep")` for Slides, `setMode("structured_review")` for Systematic review) and Tasks 2–3 fill in the routing that makes those modes actually run.

**Files:**
- Modify: `apps/web/lib/playbooks.ts`
- Modify: `apps/web/app/app/ask/page.tsx` (Composer's "+" menu, ~lines 655–663; Composer signature; new props)
- Modify: `apps/web/app/styles/shell.css` (no new class needed here — reuses `.acct-menu .menu-label`, `.acct-menu .sep`, existing `role="menuitem"` styling)

**Interfaces:**
- Consumes: the `Composer` component's existing props (`setQuestion`, `taRef`, `setMode`) and `PLAYBOOKS` from `@/lib/playbooks`.
- Produces:
  - `SKILLS: readonly Skill[]` where `interface Skill { id: string; title: string; desc: string; action: SkillAction }` and `type SkillAction = "slides" | "structured_review" | "soon"`.
  - `Composer` gains two new props: `armSlides: () => void` and `armSystematicReview: () => void`. Task 3 defines `armSlides` (arms Deep research + the slides intent ref); Task 2 defines `armSystematicReview` (arms the `structured_review` mode). In Task 1 these are passed as thin closures over `setMode` so the menu builds and behaves sensibly on its own.

- [ ] **Step 1: Add the `SKILLS` data to `playbooks.ts`**

Append the following to `apps/web/lib/playbooks.ts` (keep the existing `Playbook` interface and `PLAYBOOKS` export exactly as-is; this ADDS below them). Pure data only — the menu decides what each `action` does.

```typescript
// Skills — the same "one click seeds a proven recipe" idea as Playbooks, but a Skill produces a
// DELIVERABLE (a slide deck, a systematic-review report) rather than only seeding a question. Pure
// data: `action` is a tag the composer switches on; there is no function here, no fetch. "soon" is an
// honest not-yet-built entry (disabled in the menu), matching the app's other coming-soon rows.
export type SkillAction = "slides" | "structured_review" | "soon";

export interface Skill {
  id: string;
  title: string; // menu row label
  desc: string;  // short right-aligned hint
  action: SkillAction;
}

export const SKILLS: readonly Skill[] = [
  {
    id: "slides",
    title: "Slides",
    desc: "deep research → PowerPoint",
    action: "slides",
  },
  {
    id: "systematic-review",
    title: "Systematic review",
    desc: "documented method + tables",
    action: "structured_review",
  },
  {
    id: "journal-club",
    title: "Journal club",
    desc: "Soon",
    action: "soon",
  },
] as const;
```

- [ ] **Step 2: Import `SKILLS` in `ask/page.tsx`**

Change the existing import line (currently `import { PLAYBOOKS } from "@/lib/playbooks";`, ask/page.tsx:21):

```typescript
import { PLAYBOOKS, SKILLS } from "@/lib/playbooks";
```

- [ ] **Step 3: Add the two "arm" props to `ComposerProps`**

In the `ComposerProps` interface (ask/page.tsx ~lines 583–598), add two props right after `setModeOpen`:

```typescript
  modeOpen: boolean;
  setModeOpen: Dispatch<SetStateAction<boolean>>;
  // A Skill click arms a deliverable recipe. Kept as callbacks (not raw setMode) because arming
  // Slides / Systematic review touches refs on the page, not just the mode — see Tasks 2 and 3.
  armSlides: () => void;
  armSystematicReview: () => void;
  error: string | null;
```

- [ ] **Step 4: Destructure the new props in `Composer`**

Change the `Composer` function signature (ask/page.tsx:603):

```typescript
function Composer({ question, setQuestion, taRef, autoGrow, submit, busy, mode, setMode, modeOpen, setModeOpen, armSlides, armSystematicReview, error, welcome }: ComposerProps) {
```

- [ ] **Step 5: Replace the "Playbooks" menu section with "Skills" + "Playbooks"**

In the "+" tools menu, replace the current Playbooks block (ask/page.tsx:654–663, from the `<div className="sep" role="separator" />` immediately above `{/* Playbooks (the Manus pattern)... */}` through the closing of the `PLAYBOOKS.map(...)` — i.e. these exact lines):

```tsx
              <div className="sep" role="separator" />
              {/* Playbooks (the Manus pattern): curated one-click recipes — seed the question AND arm
                  the right tool. Moved here from the welcome screen so the landing stays calm. */}
              <div className="menu-label" aria-hidden="true">Playbooks</div>
              {PLAYBOOKS.map((p) => (
                <button key={p.id} type="button" role="menuitem" title={p.question}
                  onClick={() => { setMode(p.tool); setQuestion(p.question); setPlusOpen(false); taRef.current?.focus(); }}>
                  <Icon name="doc" size={14} /><span style={{ flex: 1 }}>{p.title}</span>
                </button>
              ))}
```

with (Skills section first, then the existing Playbooks recipes under their own sub-label):

```tsx
              <div className="sep" role="separator" />
              {/* Skills: one-click DELIVERABLE recipes. Slides arms Deep research + a slides-export
                  intent (auto-exports the finished report to PowerPoint — see submit()/ResearchRunCard).
                  Systematic review arms the documented-method report mode. "soon" entries are honest
                  disabled rows (same treatment as the search filters below). */}
              <div className="menu-label" aria-hidden="true">Skills</div>
              {SKILLS.map((s) => (
                s.action === "soon" ? (
                  <button key={s.id} type="button" role="menuitem" disabled>
                    <Icon name="message" size={14} /><span style={{ flex: 1 }}>{s.title}</span><small style={{ color: "var(--text-3)" }}>{s.desc}</small>
                  </button>
                ) : (
                  <button key={s.id} type="button" role="menuitem"
                    onClick={() => {
                      if (s.action === "slides") armSlides();
                      else armSystematicReview();
                      setPlusOpen(false);
                      taRef.current?.focus();
                    }}>
                    <Icon name="doc" size={14} /><span style={{ flex: 1 }}>{s.title}</span><small style={{ color: "var(--text-3)" }}>{s.desc}</small>
                  </button>
                )
              ))}
              <div className="sep" role="separator" />
              {/* Playbooks (the Manus pattern): curated one-click recipes — seed the question AND arm
                  the right tool. */}
              <div className="menu-label" aria-hidden="true">Playbooks</div>
              {PLAYBOOKS.map((p) => (
                <button key={p.id} type="button" role="menuitem" title={p.question}
                  onClick={() => { setMode(p.tool); setQuestion(p.question); setPlusOpen(false); taRef.current?.focus(); }}>
                  <Icon name="doc" size={14} /><span style={{ flex: 1 }}>{p.title}</span>
                </button>
              ))}
```

- [ ] **Step 6: Pass thin-closure `armSlides` / `armSystematicReview` from the page (temporary — refined in Tasks 2 & 3)**

The `<Composer ... />` element is rendered inside the `composer` memoized JSX in `AskPage` (ask/page.tsx:445–450). Add the two props. In Task 1 they are simple `setMode` closures so the menu behaves; Task 2 replaces `armSystematicReview`'s body and Task 3 replaces `armSlides`'s body. Change:

```tsx
      <Composer
        question={question} setQuestion={setQuestion} taRef={taRef} autoGrow={autoGrow}
        submit={submit} busy={busy} mode={mode} setMode={setMode}
        modeOpen={modeOpen} setModeOpen={setModeOpen} error={latest?.err ?? null}
        welcome={!hasThread}
      />
```

to:

```tsx
      <Composer
        question={question} setQuestion={setQuestion} taRef={taRef} autoGrow={autoGrow}
        submit={submit} busy={busy} mode={mode} setMode={setMode}
        modeOpen={modeOpen} setModeOpen={setModeOpen}
        armSlides={armSlides} armSystematicReview={armSystematicReview}
        error={latest?.err ?? null}
        welcome={!hasThread}
      />
```

- [ ] **Step 7: Add the temporary `armSlides` / `armSystematicReview` definitions in `AskPage`**

Add these two `useCallback`s in `AskPage`, immediately BEFORE the `const hasThread = turns.length > 0;` line (ask/page.tsx:431). These are the Task-1 stubs — Task 2 and Task 3 replace their bodies.

```tsx
  // Skill: Systematic review — arm the documented-method report mode (Task 2 keeps this body).
  const armSystematicReview = useCallback(() => { setMode("structured_review"); }, []);
  // Skill: Slides — arm Deep research (Task 3 adds the slides-export intent alongside this).
  const armSlides = useCallback(() => { setMode("deep"); }, []);
```

Note: `setMode("structured_review")` will not typecheck until Task 2 adds that id to `MODES`. Implement Task 1 and Task 2 together (they are trivially coupled through the mode id); commit after Task 2's build passes. Do the same for Slides once Task 3 lands. This step's commit therefore happens at the end of Task 2.

- [ ] **Step 8: Build gate (deferred to end of Task 2)**

Because Step 7 references the `structured_review` mode id introduced in Task 2, run the build after Task 2:

Run: `cd apps/web && npm run build`
Expected: PASS (no type errors, page compiles).

---

## Task 2: Systematic-review mode plumbing (client only)

Add a `structured_review` depth id to the client `MODES` union, route it through `submit()` so it starts a research run with `mode: "structured_review"`, and give it honest labels wherever the other report modes are labelled. The research edge function already accepts `"structured_review"` (verified) so nothing server-side changes. The `structured_review` id is deliberately NOT added to the depth-dial `.filter` whitelist, so it stays a Skill-only arm (the dial keeps showing fast/thorough/auto).

**Files:**
- Modify: `apps/web/app/app/ask/page.tsx` (`MODES` array ~lines 42–49; `submit()` research branch ~lines 361–369; `launchResearch` `feature` ternary ~line 261; `ResearchRunCard` `modeLabel` ~lines 927–931; the `armSystematicReview` stub from Task 1)

**Interfaces:**
- Consumes: `ReportMode` (from `@nemesis/shared`, already imported) — the union value `"structured_review"` is already valid.
- Produces: a `MODES` entry with `id: "structured_review"`, which makes `(typeof MODES)[number]["id"]` include it, so `setMode("structured_review")` typechecks everywhere.

- [ ] **Step 1: Add the `structured_review` entry to `MODES`**

In the `MODES` array (ask/page.tsx:42–49), add one entry after the `deep` entry (line 46) and before `discovery`:

```typescript
  { id: "deep", label: "Deep research", live: true, pro: true, hint: "A multi-step, fully cited report — pools comparable studies into a computed estimate when the evidence supports it (Pro)" },
  { id: "structured_review", label: "Systematic review", live: true, pro: true, hint: "A documented-method evidence review: what was searched, what was included, and cited findings in tables (Pro)" },
  { id: "discovery", label: "Discovery", live: true, pro: true, hint: "Finds research gaps, claim cards, hypotheses, and next-study designs (Pro)" },
```

(`composerModeLabel` just lowercases `label`, so the armed dial button will read "systematic review" with no further change — verified in `lib/ask-mode-label.ts`.)

- [ ] **Step 2: Route `structured_review` through the `submit()` research branch**

In `submit()`, change the report-mode guard (ask/page.tsx:361):

```typescript
    if (mode === "deep" || mode === "discovery" || mode === "lab_draft") {
```

to include `structured_review`:

```typescript
    if (mode === "deep" || mode === "structured_review" || mode === "discovery" || mode === "lab_draft") {
```

- [ ] **Step 3: Map the new mode to its runMode**

In the same branch, change the `runMode` line (ask/page.tsx:369):

```typescript
      const runMode: ReportMode = mode === "lab_draft" ? "lab_draft" : mode === "discovery" ? "discovery" : "meta";
```

to:

```typescript
      const runMode: ReportMode = mode === "lab_draft" ? "lab_draft" : mode === "discovery" ? "discovery" : mode === "structured_review" ? "structured_review" : "meta";
```

- [ ] **Step 4: Honest feature label in `launchResearch`**

In `launchResearch` (ask/page.tsx:261), change the `feature` ternary:

```typescript
      const feature = runMode === "discovery" ? "Discovery" : runMode === "lab_draft" ? "Lab draft" : "Deep research";
```

to:

```typescript
      const feature = runMode === "discovery" ? "Discovery" : runMode === "lab_draft" ? "Lab draft" : runMode === "structured_review" ? "Systematic review" : "Deep research";
```

- [ ] **Step 5: Honest card label in `ResearchRunCard`**

In `ResearchRunCard` (ask/page.tsx:927–931), change the `modeLabel`:

```typescript
  const modeLabel = card.mode === "lab_draft"
    ? "Lab draft (beta)"
    : card.mode === "discovery"
    ? "Discovery"
    : "Deep research";
```

to:

```typescript
  const modeLabel = card.mode === "lab_draft"
    ? "Lab draft (beta)"
    : card.mode === "discovery"
    ? "Discovery"
    : card.mode === "structured_review"
    ? "Systematic review"
    : "Deep research";
```

- [ ] **Step 6: Finalize the `armSystematicReview` body (already correct from Task 1)**

Confirm `armSystematicReview` in `AskPage` (added in Task 1, Step 7) reads exactly:

```tsx
  const armSystematicReview = useCallback(() => { setMode("structured_review"); }, []);
```

No change needed — it typechecks now that `MODES` includes the id.

- [ ] **Step 7: Build gate**

Run: `cd apps/web && npm run build`
Expected: PASS. `setMode("structured_review")` now typechecks; clicking Skills → "Systematic review" arms the dial (button shows "systematic review"), and the next send starts a research run whose card reads "Systematic review running…".

- [ ] **Step 8: Commit (Tasks 1 + 2)**

```bash
git add apps/web/lib/playbooks.ts apps/web/app/app/ask/page.tsx
git commit -m "feat(web): Skills menu section + Systematic review report mode (client)"
```

---

## Task 3: Slides auto-export intent

The Slides skill arms Deep research AND records a per-run intent so that, when THAT run's report completes, the client auto-exports it to PowerPoint. The intent is keyed by turn index (a `Set<number>`), consumed on every submit to avoid cross-submit staleness (the research branch never sets `busy`, so a user can start a second run before the first finishes). On completion, `downloadReportExport(savedReportId, "pptx", "vancouver")` runs; on any failure (or a missing `savedReportId`) a neutral inline note appears on that turn — never a "Pro" claim (the route is not Pro-gated; see Global Constraints).

**Files:**
- Modify: `apps/web/app/app/ask/page.tsx` (import; `Turn` interface ~lines 573–581; new refs in `AskPage`; `armSlides` body; `submit()` top-of-function intent capture; the turn map's `ResearchRunCard` `onComplete` + a note render)

**Interfaces:**
- Consumes: `downloadReportExport(reportId: string, format: "pdf" | "docx" | "pptx", style: "vancouver" | "ama"): Promise<void>` from `@/lib/api` (verified signature). The `persistResearchTurn` callback already provides `result: { savedReportId: string | null; sources: number }` in `onComplete` — reuse that same `r` object.
- Produces: `slidesIntentRef: RefObject<Set<number>>` (turn indices wanting slides export) and `slidesArmedRef: RefObject<boolean>` (armed-but-not-yet-submitted flag). Adds `slidesNote?: string` to the `Turn` interface for the inline result note.

- [ ] **Step 1: Import `downloadReportExport`**

Extend the existing `@/lib/api` import (ask/page.tsx:9) — it currently ends `...type ResearchRunRow, type SavedResearchCard } from "@/lib/api";`. Add `downloadReportExport` to the named imports:

```typescript
import { askQuestion, createConversation, downloadReportExport, fetchConversationTurns, fetchProject, fetchResearchReport, fetchResearchRun, planResearchPreview, saveResearchTurn, saveTurn, scopeResearch, startResearch, type AskQuotaError, type ResearchRunRow, type SavedResearchCard } from "@/lib/api";
```

- [ ] **Step 2: Add `slidesNote` to the `Turn` interface**

In the `Turn` interface (ask/page.tsx:573–581), add one field after `thinkSecs`:

```typescript
interface Turn {
  q: string;
  a: AskResponse | null;
  err: string | null;
  research?: ResearchCard; // present when this turn is a deep-research run instead of a chat answer
  scope?: ScopeTurnState;  // present while clarifying questions await answers
  scoping?: boolean;       // brief: the scope step is running before we know if clarification is needed
  thinkSecs?: number;      // wall-clock seconds the engine spent before this turn's answer arrived ("Thought for Xs")
  slidesNote?: string;     // set when a Slides-skill run finished: either a "opening PowerPoint" note or a neutral fallback
}
```

- [ ] **Step 3: Add the two refs in `AskPage`**

Add these two refs alongside the other refs near the top of `AskPage` — put them right after `const bottomRef = useRef<HTMLDivElement>(null);` (ask/page.tsx:118):

```tsx
  // Slides skill: `slidesArmedRef` is set when the user clicks Skills → Slides but hasn't sent yet.
  // On the next submit we consume it and, for a research run, record THAT turn's index in
  // `slidesIntentRef` so the completed report auto-exports to PowerPoint. Keyed by index (not a single
  // boolean) so two concurrent runs — the research branch never sets `busy` — don't cross wires.
  const slidesArmedRef = useRef(false);
  const slidesIntentRef = useRef<Set<number>>(new Set());
```

- [ ] **Step 4: Replace the `armSlides` body**

Replace the Task-1 stub `armSlides` (ask/page.tsx, added in Task 1 Step 7) with the real body that also arms the slides flag:

```tsx
  // Skill: Slides — arm Deep research AND flag "export this run's report to PowerPoint when it's done".
  // Consumed on the next submit (see submit()); if the user instead picks a plain depth, the flag is
  // still cleared on that submit, so it never leaks into an unrelated run.
  const armSlides = useCallback(() => { setMode("deep"); slidesArmedRef.current = true; }, []);
```

- [ ] **Step 5: Consume the slides flag at the top of `submit()` and record the intent in the research branch**

At the very top of `submit()`, right after the guard `if (!text || busy || loadingChat) return;` (ask/page.tsx:355) and before `phCapture("ask_submitted", { mode });`, capture and clear the flag so EVERY submit consumes it (kills cross-submit staleness):

```typescript
    if (!text || busy || loadingChat) return;
    // Consume the Slides arm on every submit (so it can't go stale across sends). Only a research run
    // records it below; a plain ask clears it and moves on.
    const wantSlides = slidesArmedRef.current;
    slidesArmedRef.current = false;
    phCapture("ask_submitted", { mode });
```

Then, inside the research branch, immediately after `const ridx = turns.length;` (ask/page.tsx:371), record the intent for this turn when slides was armed:

```typescript
      const ridx = turns.length;
      if (wantSlides) slidesIntentRef.current.add(ridx);
```

- [ ] **Step 6: Auto-export on completion + neutral fallback note**

In the turn map, the research card is rendered as (ask/page.tsx:523–524):

```tsx
                  ) : t.research ? (
                    <ResearchRunCard card={t.research} onComplete={(r) => void persistResearchTurn(i, t.q, t.research!.mode, r)} />
                  ) : t.a ? (
```

Replace that `onComplete` with one that also fires the slides export (persist stays best-effort and first), and add a `slidesNote` render line right after the card:

```tsx
                  ) : t.research ? (
                    <>
                      <ResearchRunCard
                        card={t.research}
                        onComplete={(r) => {
                          void persistResearchTurn(i, t.q, t.research!.mode, r);
                          // Slides skill: if THIS turn asked for slides, export its report to PowerPoint
                          // once. `downloadReportExport` needs the saved report id; if it's missing (no
                          // report row) or the download throws, show a neutral fallback — the report is
                          // already saved and the "Report ready" card links to it for a manual export.
                          if (slidesIntentRef.current.has(i)) {
                            slidesIntentRef.current.delete(i);
                            if (r.savedReportId) {
                              setTurns((prev) => prev.map((x, j) => (j === i ? { ...x, slidesNote: "Opening your slides — check your downloads." } : x)));
                              void downloadReportExport(r.savedReportId, "pptx", "vancouver").catch(() => {
                                setTurns((prev) => prev.map((x, j) => (j === i ? { ...x, slidesNote: "Couldn’t export slides automatically — open the report to download." } : x)));
                              });
                            } else {
                              setTurns((prev) => prev.map((x, j) => (j === i ? { ...x, slidesNote: "Couldn’t export slides automatically — open the report to download." } : x)));
                            }
                          }
                        }}
                      />
                      {t.slidesNote ? <p className="tmpl-note">{t.slidesNote}</p> : null}
                    </>
                  ) : t.a ? (
```

(`.tmpl-note` is the existing small-note class already used for research errors on line 533 — no new CSS.)

- [ ] **Step 7: Build gate**

Run: `cd apps/web && npm run build`
Expected: PASS. Manually reason through: Skills → Slides arms the dial to "deep research"; sending starts a Deep research run; on completion the report auto-downloads as `.pptx` and the turn shows "Opening your slides — check your downloads."; if the export throws, the note switches to the neutral fallback.

- [ ] **Step 8: Commit**

```bash
git add apps/web/app/app/ask/page.tsx
git commit -m "feat(web): Slides skill — auto-export finished deep-research report to PowerPoint"
```

---

## Task 4: Dictation (browser speech-to-text)

Turn the disabled mic button into working dictation via the Web Speech API. Feature-detect: unsupported browsers keep the disabled button with an honest tip. On click, toggle listening; interim + final transcripts append into the question textarea; a visual recording state (red pulsing dot) shows on the button; a second click, silence-driven end, or an error stops it; a permission-denied error shows an honest inline note. Because `SpeechRecognition` is not in the TypeScript DOM lib and `next build` typechecks, a minimal inline type shim is included. Support is detected in a `useEffect` (init state `false`) so server and first client render agree — no hydration mismatch.

**Files:**
- Modify: `apps/web/app/app/ask/page.tsx` (a new `useDictation` hook near the top-level helpers; the mic button JSX in `Composer` ~lines 726–728; a dictation note render; a `<style>`-free CSS class added in Task 5)
- Modify: `apps/web/app/styles/shell.css` (Task 5 adds `.tool.rec` + the pulse keyframe)

**Interfaces:**
- Consumes: `setQuestion` (already a Composer prop) to append transcripts; `taRef` for focus (optional).
- Produces: a `useDictation(setQuestion, getBaseText)` hook returning `{ supported: boolean; listening: boolean; error: string | null; toggle: () => void }`. `getBaseText` returns the current textarea value at start so finals accumulate onto it.

- [ ] **Step 1: Add the Web Speech API type shim and the `useDictation` hook**

Add this block near the other top-level helpers in `ask/page.tsx` — a good spot is immediately after the `pillName` helper (ask/page.tsx:69), before `export default function AskPageRoute()`:

```typescript
// ── Dictation (Web Speech API) ────────────────────────────────────────────────────────────────────
// SpeechRecognition isn't in the TS DOM lib, so we declare the minimal surface we use. No `any`.
interface SpeechRecognitionAlternativeLike { readonly transcript: string; }
interface SpeechRecognitionResultLike { readonly isFinal: boolean; readonly length: number; readonly [index: number]: SpeechRecognitionAlternativeLike; }
interface SpeechRecognitionResultListLike { readonly length: number; readonly [index: number]: SpeechRecognitionResultLike; }
interface SpeechRecognitionEventLike { readonly resultIndex: number; readonly results: SpeechRecognitionResultListLike; }
interface SpeechRecognitionErrorEventLike { readonly error: string; }
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;
function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

// Dictation hook: feature-detected on the client (init `false` so SSR and first client render agree —
// no hydration mismatch). `toggle` starts/stops recognition; finals accumulate onto the text present
// when recording began (`getBaseText`), and the live interim is shown appended. Permission errors
// surface as an honest note. The recognizer is aborted on unmount.
function useDictation(setQuestion: Dispatch<SetStateAction<string>>, getBaseText: () => string) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const baseRef = useRef("");     // textarea text captured when recording started
  const finalsRef = useRef("");   // finalized transcript accumulated this session

  useEffect(() => { setSupported(getSpeechRecognitionCtor() !== null); }, []);

  useEffect(() => () => { recRef.current?.abort(); }, []); // stop cleanly if we unmount mid-dictation

  const toggle = useCallback(() => {
    if (listening) { recRef.current?.stop(); return; }
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) { setError("Dictation isn’t supported in this browser."); return; }
    const rec = new Ctor();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = true;
    baseRef.current = getBaseText();
    finalsRef.current = "";
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const text = r[0]?.transcript ?? "";
        if (r.isFinal) finalsRef.current += text;
        else interim += text;
      }
      const base = baseRef.current;
      const joiner = base && !/\s$/.test(base) ? " " : "";
      setQuestion(`${base}${joiner}${finalsRef.current}${interim}`.trimStart());
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setError("Microphone access is blocked — allow it in your browser to dictate.");
      } else if (e.error === "no-speech") {
        setError(null); // benign: user just didn't speak
      } else {
        setError("Dictation stopped unexpectedly. Try again.");
      }
    };
    rec.onend = () => { setListening(false); recRef.current = null; };
    recRef.current = rec;
    setError(null);
    try { rec.start(); setListening(true); }
    catch { setError("Couldn’t start dictation. Try again."); setListening(false); recRef.current = null; }
  }, [listening, setQuestion, getBaseText]);

  return { supported, listening, error, toggle };
}
```

- [ ] **Step 2: Wire the hook into `Composer` and replace the mic button**

In `Composer`, call the hook near the other hooks (right after `const [sourcesOpen, setSourcesOpen] = useState(false);`, ask/page.tsx:611):

```tsx
  const [sourcesOpen, setSourcesOpen] = useState(false); // the "Data sources" modal
  const dictation = useDictation(setQuestion, () => question);
```

Then replace the disabled mic button (ask/page.tsx:726–728):

```tsx
        <button className="tool" type="button" data-tip="Voice — coming soon" aria-label="Voice input" disabled>
          <Icon name="mic" size={18} />
        </button>
```

with the working (or honestly-disabled) button:

```tsx
        <button
          className={`tool${dictation.listening ? " rec" : ""}`}
          type="button"
          data-tip={dictation.supported ? (dictation.listening ? "Stop dictation" : "Dictate") : "Dictation not supported in this browser"}
          aria-label={dictation.listening ? "Stop dictation" : "Dictate"}
          aria-pressed={dictation.listening}
          disabled={!dictation.supported}
          onClick={dictation.toggle}
        >
          <Icon name="mic" size={18} />
        </button>
```

- [ ] **Step 3: Surface a dictation error note**

The `Composer` already renders an `error` line (`{error ? <div className="err">{error}</div> : null}`, ask/page.tsx:733). Add the dictation error beneath it (a mic-permission problem is distinct from an ask error, so it gets its own line). Change:

```tsx
      {error ? <div className="err">{error}</div> : null}
      <div className="composer-disclaimer">{POINT_OF_USE_DISCLAIMER}</div>
```

to:

```tsx
      {error ? <div className="err">{error}</div> : null}
      {dictation.error ? <div className="err">{dictation.error}</div> : null}
      <div className="composer-disclaimer">{POINT_OF_USE_DISCLAIMER}</div>
```

- [ ] **Step 4: Build gate**

Run: `cd apps/web && npm run build`
Expected: PASS (the type shim satisfies the typecheck; no `any`). In a Chromium browser the mic button becomes active; clicking it turns on the red pulsing state (Task 5 CSS) and spoken words stream into the box.

- [ ] **Step 5: Commit (after Task 5 CSS lands — see Task 5 Step 3)**

The recording visual needs the CSS from Task 5, so the dictation commit is made at the end of Task 5.

---

## Task 5: Recording-state CSS + final verify + PR

Add the mic recording visual (a red, pulsing button) to `shell.css`, run the full build gate, then open the PR (merge is owner-gated).

**Files:**
- Modify: `apps/web/app/styles/shell.css` (add `.tool.rec` + a `dot-pulse` keyframe near the existing `.tool` rules, ~line 636)

**Interfaces:**
- Consumes: `--danger` and `--acid-rgb` CSS variables (both verified present in `globals.css` across all three themes).
- Produces: `.tool.rec` styling that the dictation button opts into via `className={\`tool${dictation.listening ? " rec" : ""}\`}` (Task 4).

- [ ] **Step 1: Add the recording-state CSS**

In `apps/web/app/styles/shell.css`, immediately after the existing `.tool:disabled { opacity: 0.4; cursor: not-allowed; }` rule (line 636), add:

```css
/* Dictation recording state: the mic button glows danger-red with a soft pulse while listening, so
   it reads as clearly "live" without a separate indicator. Uses the same tokens as other alerts. */
.tool.rec { color: var(--danger); background: rgba(var(--acid-rgb), 0.08); }
.tool.rec svg { animation: dot-pulse 1.15s ease-in-out infinite; }
@keyframes dot-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
@media (prefers-reduced-motion: reduce) { .tool.rec svg { animation: none; } }
```

- [ ] **Step 2: Build gate**

Run: `cd apps/web && npm run build`
Expected: PASS.

- [ ] **Step 3: Commit dictation + CSS together (Task 4 + Task 5)**

```bash
git add apps/web/app/app/ask/page.tsx apps/web/app/styles/shell.css
git commit -m "feat(web): mic dictation via Web Speech API + recording state"
```

- [ ] **Step 4: Full verification pass**

Run: `cd apps/web && npm run build`
Expected: PASS (clean build, no type errors, no lint failures).

Then eyeball-verify against origin/main that nothing frozen changed:

Run: `git diff --stat origin/main...HEAD`
Expected: only `apps/web/lib/playbooks.ts`, `apps/web/app/app/ask/page.tsx`, and `apps/web/app/styles/shell.css` appear. Confirm `supabase/functions/**` and `packages/shared/**` are absent.

- [ ] **Step 5: Push the branch**

```bash
git push -u origin feat/skills-dictation
```

- [ ] **Step 6: Open the PR (do NOT merge — merge is owner-gated)**

```bash
gh pr create --base main --head feat/skills-dictation \
  --title "feat(web): Skills menu (Slides + Systematic review) and mic dictation" \
  --body "$(cat <<'EOF'
## What this does (plain English)

Two upgrades to the chat's composer (the box where you type your question):

1. **A "Skills" menu.** The "+" button's old "Playbooks" list is now split into **Skills** (one-click recipes that make a deliverable) and the existing Playbooks (recipes that just fill in a good question). Two real Skills:
   - **Slides** — runs a Deep research report and, when it's done, automatically downloads it as a PowerPoint deck.
   - **Systematic review** — runs a report in a documented-method style (what was searched, what was included, findings in tables).
   - **Journal club** is listed as "Soon" (honestly disabled) so people can see it's coming.

2. **Working voice dictation.** The microphone button — previously greyed out — now lets you talk instead of type. Your words stream into the box as you speak; the button glows red while listening. Browsers that don't support it keep the button disabled with a clear tooltip, and a blocked microphone shows a plain note explaining how to allow it.

## Honesty notes
- The PowerPoint export is **not** falsely presented as a Pro-only feature — the route isn't Pro-gated; the Pro gate is upstream on Deep research itself. If an auto-export ever fails, the app shows a neutral "open the report to download" note, and the report is already saved with a manual export button.
- Dictation is browser-native (no data leaves for a new service, no new dependency).

## Scope
- Client-only. The frozen `/ask` function and the research edge function are untouched (the "Systematic review" mode is a value the research function already accepts). `@nemesis/shared` is untouched.

## Test plan
- [x] `npm run build` (apps/web) passes.
- [ ] Manual: "+" → Skills shows Slides / Systematic review / Journal club (Soon).
- [ ] Manual: Slides → send a question → report completes → `.pptx` downloads + note appears.
- [ ] Manual: Systematic review → send → run card reads "Systematic review running…".
- [ ] Manual (Chromium): mic button active → click → red pulse → spoken words fill the box → second click stops.
- [ ] Manual (Firefox/unsupported): mic button disabled with "Dictation not supported in this browser" tip.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR created against `main`. **Stop here — the owner reviews and merges.**

---

## Self-Review

**1. Spec coverage:**

| Spec requirement | Task |
|------------------|------|
| Rebrand "Playbooks" section to "Skills" | Task 1 Step 5 |
| Slides skill (real) | Task 1 (menu) + Task 3 (auto-export) |
| Systematic review skill (real) | Task 1 (menu) + Task 2 (mode plumbing) |
| Journal club — "Soon" (disabled, matches existing pattern) | Task 1 Steps 1 & 5 |
| Keep the 4 existing recipes | Task 1 Step 5 (Playbooks sub-label retained) |
| Skills data shape (pure, `{id,title,desc,action}`) | Task 1 Step 1 |
| Menu height sanity (`.tools-menu` scroll cap) | Reuses existing `.tools-menu { max-height: min(58vh, 460px); overflow-y: auto; }` — no change, verified present |
| `structured_review` armed ONLY via skill (dial untouched) | Task 2 (not added to depth-dial `.filter` whitelist) |
| Map `structured_review` in submit()'s runMode ternary | Task 2 Step 3 |
| Slides arms deep + one-shot slides intent (ref) | Task 3 Steps 3–5 |
| Auto-export at ResearchRunCard onComplete via `downloadReportExport(id,"pptx","vancouver")` | Task 3 Step 6 |
| Honest note on export failure (NOT "Pro") | Task 3 Step 6 + Global Constraints |
| Enable mic: Web Speech API, feature-detect, SSR-safe | Task 4 Steps 1–2 |
| Interim+final into textarea; visual rec state; stop on 2nd click/silence/final | Task 4 Steps 1–2 + Task 5 |
| Permission-denied → honest inline note; lang "en-US"; no backend/deps | Task 4 Steps 1 & 3 |
| Unsupported → disabled button + "Dictation not supported in this browser" | Task 4 Step 2 |
| Verify + PR (merge owner-gated) | Task 5 Steps 4–6 |
| Frozen `supabase/functions/ask/**` untouched; shared untouched | Global Constraints + Task 5 Step 4 |
| Gate = `npm run build` | Every task's build step |

No gaps.

**2. Placeholder scan:** No "TBD"/"TODO"/"handle edge cases"/"similar to Task N" — every code step shows full old→new blocks. The one deferred item (Task 1 Step 7's `structured_review` reference) is explicitly explained and its build/commit moved to Task 2, not left vague.

**3. Type consistency:**
- `SkillAction = "slides" | "structured_review" | "soon"` (Task 1) — the menu switches on all three (`"soon"` → disabled row; `"slides"` → `armSlides`; else → `armSystematicReview`). Consistent.
- `armSlides` / `armSystematicReview`: declared in `ComposerProps` (Task 1 Step 3), destructured (Step 4), passed from page (Step 6), defined as `useCallback`s (Step 7 → refined in Tasks 2 & 3). Names match across all four.
- `MODES` id `"structured_review"` (Task 2 Step 1) flows into `(typeof MODES)[number]["id"]`, so `setMode("structured_review")` (Task 1 Step 7 / Task 2 Step 6) typechecks. `runMode` ternary (Task 2 Step 3) maps it to `ReportMode` `"structured_review"` — a valid union member (verified in shared). `launchResearch` `feature` (Step 4) and `ResearchRunCard` `modeLabel` (Step 5) both add the matching `"Systematic review"` arm.
- `slidesArmedRef: boolean`, `slidesIntentRef: Set<number>` (Task 3 Step 3); `wantSlides` consumed top-of-submit (Step 5); `slidesIntentRef.current.add(ridx)` in the research branch (Step 5) and `.has(i)/.delete(i)` in `onComplete` (Step 6) — same ref, index-keyed, consistent.
- `downloadReportExport(r.savedReportId, "pptx", "vancouver")` (Task 3 Step 6) matches the verified signature `(reportId: string, format: "pdf"|"docx"|"pptx", style: "vancouver"|"ama")`; `r.savedReportId` is the exact field name from `persistResearchTurn`'s `result` param and `ResearchRunCard`'s `onComplete` payload.
- `useDictation` returns `{ supported, listening, error, toggle }` (Task 4 Step 1), all four consumed in the mic button + error line (Steps 2–3). `.tool.rec` class (Task 5) matches the `${dictation.listening ? " rec" : ""}` toggle (Task 4 Step 2).

All consistent. Plan is ready to execute.
