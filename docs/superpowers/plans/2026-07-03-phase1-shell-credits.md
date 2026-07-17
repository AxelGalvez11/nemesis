# Phase 1 Shell Completeness + Visible Credits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the app shell feel complete — persist the sidebar collapse, fix two narrow-screen overflow bugs, wire the decorative sidebar search to actually filter recent chats — and add a Manus-style, display-only "credits" surface (a topbar chip, a modal, and a Settings tab) that honestly shows what the user has used today and how many permanent slots they hold.

**Architecture:** All changes are frontend-only. A new PURE helper in `packages/shared` (`buildCreditsSummary`) turns the existing entitlement + usage + count snapshots into a display model; a new React component (`CreditsPanel` wrapping a reusable `CreditsBreakdown` inner list) renders it in a modal and in Settings; the topbar gains a chip that opens the modal. To fix the account-footer going stale after each ask, we add a `usageVersion`/`bumpUsage()` refresh signal to the existing `AppChromeContext` (mirroring the `bumpChats` pattern already in the file). No billing logic, no new database tables, no edge-function changes.

**Tech Stack:** TypeScript, React 18 (Next.js App Router, `"use client"` components), CSS (`apps/web/app/styles/shell.css`), Deno tests for `packages/shared` (std@0.224.0 assert).

## Global Constraints

- Branch: `feat/shell-credits` off `origin/main`, built in the worktree `/Users/axelgalvez/Desktop/AIcodingProjects/PharmaBro/.claude/worktrees/workspace-parity`.
- FROZEN — do NOT touch: `supabase/functions/ask/**`. No edge-function changes of any kind.
- Display-only: NO billing changes, NO new database tables, NO migrations, NO new RPCs. The credits surface only reads the existing `get_my_entitlements` / `get_my_usage` RPCs and the existing `fetchWatches()` / `fetchMissions()` list endpoints.
- Graceful degradation: every fetch used by the credits panel must `.catch()` to a null/empty fallback so one failing call never blanks the panel or crashes the shell. Never render `NaN`.
- Follow existing conventions: modal = `.confirm-overlay` / `.confirm-card` pattern (see `apps/web/components/DataSourcesPanel.tsx`); entitlement reads use the `typeof v === "number" && Number.isFinite(v) ? v : d` guard (see `packages/shared/src/watch-entitlements.ts`), never bare `Number()`; plain-English, honest copy.
- Entitlement matrix (for display copy only — do NOT hardcode limits into logic; read them from the snapshot): `ask_daily_limit` 10/100/250/500/1000, `deep_research_daily_limit` 0/0/3/10/50, `watch_limit` 1/10/50/200/1000, `mission_limit` 0/0/5/20/50 (free/plus/pro/professional/enterprise). `evidence_brief_daily` has ZERO consumers — do NOT display it.
- Honest cost model (for copy): Ask (fast or thorough) = 1 ask/day unit; Deep research / Discovery / Lab draft / Mission run = 1 deep-research/day unit; Watch = 1 permanent slot; Scheduled mission = 1 permanent slot. Scope/plan pre-steps cost nothing.
- Conventional commits (`feat:` / `fix:` / `refactor:`).
- Shared tests run with Deno: `deno test --allow-env packages/shared/src/<file>.test.ts` (verified working; type-checks by default — no `--no-check`).
- Web verification gate = `npm run build` (there is no web test harness).
- Repo tsconfig has `noUncheckedIndexedAccess: true` — indexing arrays/records can yield `undefined`; guard accordingly.
- `main` auto-deploys to production on every push (project `pharma-bro-web` → app.pharmaorb.app). Merging this branch to `main` ships it live. The final merge is OWNER-GATED.

---

## File Structure

**Create:**
- `packages/shared/src/credits.ts` — PURE `buildCreditsSummary()` + the `CreditsSummary` type.
- `packages/shared/src/credits.test.ts` — Deno unit tests for the helper.
- `apps/web/components/CreditsPanel.tsx` — the modal (fetches fresh on open) + the reusable `CreditsBreakdown` inner list (shared with Settings).

**Modify:**
- `packages/shared/src/index.ts` — barrel-export `credits.ts`.
- `apps/web/app/styles/shell.css` — add `flex-wrap: wrap` to two selectors (overflow fix) + new `.credits-*` classes.
- `apps/web/components/AppShell.tsx` — persist rail collapse; wire the search; add the topbar credits chip; add `usageVersion`/`bumpUsage()` to the chrome context so the footer + chip re-read after each ask.
- `apps/web/app/app/scheduled/page.tsx` — remove the now-redundant inline `style={{ flexWrap: "wrap" }}` (base CSS gains wrap).
- `apps/web/components/SettingsSurface.tsx` — add a `"usage"` section rendering `<CreditsBreakdown>`.
- `apps/web/app/app/settings/page.tsx` — add `"usage"` to the section allow-list so `?section=usage` deep-links work.

---

### Task 1: Rail collapse persistence + two overflow-bug CSS fixes

**Files:**
- Modify: `apps/web/components/AppShell.tsx:83` (the `railCollapsed` state) and `apps/web/components/AppShell.tsx:205-209` (the `toggleRail` callback)
- Modify: `apps/web/app/styles/shell.css:983` (`.proj-section-head`) and `apps/web/app/styles/shell.css:1287` (`.watch-add`)
- Modify: `apps/web/app/app/scheduled/page.tsx:142` (remove inline flex-wrap patch)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: nothing other tasks depend on. (`railCollapsed` remains a boolean in AppShell exactly as before; only its initial value + persistence-on-toggle change.)

**Context the implementer needs:**
- On `origin/main`, `AppShell.tsx:83` reads: `const [railCollapsed, setRailCollapsed] = useState(false);` — collapse state is NOT persisted, so it resets to expanded on every reload.
- `toggleRail` (L205-209) branches on the live breakpoint: at ≤720px it toggles the mobile drawer; otherwise it flips `railCollapsed`. We persist ONLY the desktop-collapse flip, keyed `"rail-collapsed"` with `"1"`/`"0"`.
- The tablet band (721–1100px) force-collapses the rail via CSS (`shell.css:799`) — leave that CSS untouched; it does not read the flag.
- `.proj-section-head` (L983) and `.watch-add` (L1287) are `display: flex` with no `flex-wrap`, so their children clip on narrow screens. `.proj-section-head` is used by `scheduled/page.tsx` and `projects/[id]/page.tsx`; `.watch-add` is used by both too. `scheduled/page.tsx:142` self-patches its `.watch-add` with an inline `style={{ flexWrap: "wrap" }}` — once the base CSS wraps, that inline patch is redundant and should be removed. `projects/[id]/page.tsx` uses `.watch-add` with NO inline patch, so the CSS fix is what protects it (no page edit needed there).

- [ ] **Step 1: Make `railCollapsed` initialize from localStorage (guarded for SSR)**

In `apps/web/components/AppShell.tsx`, replace the state initializer on L83.

Find:
```tsx
  const [railCollapsed, setRailCollapsed] = useState(false);
```

Replace with:
```tsx
  // Persisted across reloads so the sidebar stays where the user left it (ChatGPT/Manus behavior).
  // Lazy initializer so we read localStorage exactly once, and only in the browser (SSR-safe).
  const [railCollapsed, setRailCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("rail-collapsed") === "1";
  });
```

- [ ] **Step 2: Persist the flag whenever the desktop collapse toggles**

In `apps/web/components/AppShell.tsx`, update the `toggleRail` callback (L205-209).

Find:
```tsx
  const toggleRail = useCallback(() => {
    setMobileEvidenceOpen(false);
    if (mqMatch("(max-width: 720px)")) setMobileNavOpen((v) => !v);
    else setRailCollapsed((v) => !v);
  }, []);
```

Replace with:
```tsx
  const toggleRail = useCallback(() => {
    setMobileEvidenceOpen(false);
    if (mqMatch("(max-width: 720px)")) setMobileNavOpen((v) => !v);
    else
      setRailCollapsed((v) => {
        const next = !v;
        if (typeof window !== "undefined") window.localStorage.setItem("rail-collapsed", next ? "1" : "0");
        return next;
      });
  }, []);
```

- [ ] **Step 3: Add `flex-wrap: wrap` to `.proj-section-head` (overflow fix)**

In `apps/web/app/styles/shell.css`, update L983.

Find:
```css
.proj-section-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
```

Replace with:
```css
.proj-section-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
```

- [ ] **Step 4: Add `flex-wrap: wrap` to `.watch-add` (overflow fix)**

In `apps/web/app/styles/shell.css`, update L1287.

Find:
```css
.watch-add { position: relative; display: flex; align-items: center; gap: 10px; margin: 6px 0 8px; padding: 9px 13px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); transition: border-color 0.15s; }
```

Replace with:
```css
.watch-add { position: relative; display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin: 6px 0 8px; padding: 9px 13px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); transition: border-color 0.15s; }
```

- [ ] **Step 5: Remove the now-redundant inline flex-wrap patch from the scheduled page**

In `apps/web/app/app/scheduled/page.tsx`, update L142.

Find:
```tsx
      <div className="watch-add" style={{ flexWrap: "wrap" }}>
```

Replace with:
```tsx
      <div className="watch-add">
```

- [ ] **Step 6: Build to verify no type/lint/CSS breakage**

Run: `npm run build`
Expected: PASS (build completes; the web app compiles). No new TypeScript or lint errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web/components/AppShell.tsx apps/web/app/styles/shell.css apps/web/app/app/scheduled/page.tsx
git commit -m "fix(web): persist sidebar collapse + wrap proj-section-head/watch-add on narrow screens"
```

---

### Task 2: Wire the sidebar search to filter Recent chats

**Files:**
- Modify: `apps/web/components/AppShell.tsx` — add a `chatQuery` state; add `onChange` + a filter over `chats`; render a three-way conditional for the Recent chats list; change the placeholder + aria-label.

**Interfaces:**
- Consumes: the existing `chats` state (`ConversationSummary[]`, each row has a string `title`) and the existing `.search` markup at `AppShell.tsx:380-383`.
- Produces: nothing other tasks depend on.

**Context the implementer needs:**
- On `origin/main`, the search input (L380-383) is decorative — no `value`/`onChange`:
  ```tsx
  <div className="search">
    <Icon name="search" size={15} />
    <input placeholder="Search chats & drugs" aria-label="Search chats and drugs" />
  </div>
  ```
- The Recent chats list (L401-451) is a TWO-way conditional today: `chats.length === 0 ? <"appear here" empty state> : chats.map(...)`. Adding a filter introduces a THIRD case: a non-empty query that matches nothing (while `chats` itself is non-empty) must show a quiet "No chats match" note styled like the `.r-label` rows, and clearing the query restores the full list. Honest scope: this filters chats only — NOT drugs, NO new routes.
- `ConversationSummary` rows have `id`, `title`, `pinned`, `project_id` (all used in the existing map). We filter by `title` (case-insensitive substring).

- [ ] **Step 1: Add the query state**

In `apps/web/components/AppShell.tsx`, add a state hook near the other rail state (immediately after the `const [chats, setChats] = useState<ConversationSummary[]>([]);` line, L98).

Find:
```tsx
  const [chats, setChats] = useState<ConversationSummary[]>([]);
```

Replace with:
```tsx
  const [chats, setChats] = useState<ConversationSummary[]>([]);
  // Sidebar search: a client-side filter over the loaded Recent chats (title substring). Honest scope —
  // this searches saved chats only, not the drug catalog.
  const [chatQuery, setChatQuery] = useState("");
```

- [ ] **Step 2: Wire the input (value + onChange, new placeholder + aria-label)**

In `apps/web/components/AppShell.tsx`, update the search input (L380-383).

Find:
```tsx
          <div className="search">
            <Icon name="search" size={15} />
            <input placeholder="Search chats & drugs" aria-label="Search chats and drugs" />
          </div>
```

Replace with:
```tsx
          <div className="search">
            <Icon name="search" size={15} />
            <input
              value={chatQuery}
              onChange={(e) => setChatQuery(e.target.value)}
              placeholder="Search chats"
              aria-label="Search chats"
            />
          </div>
```

- [ ] **Step 3: Compute the filtered list once, above the return's JSX**

In `apps/web/components/AppShell.tsx`, add the derived list next to the other pre-render derived values (right after `const initials = email.slice(0, 2).toUpperCase();`, which is just above `return (` around L366).

Find:
```tsx
  const initials = email.slice(0, 2).toUpperCase();

  return (
```

Replace with:
```tsx
  const initials = email.slice(0, 2).toUpperCase();
  // Filter Recent chats by title (case-insensitive substring). Empty query → the full list.
  const q = chatQuery.trim().toLowerCase();
  const visibleChats = q ? chats.filter((c) => c.title.toLowerCase().includes(q)) : chats;

  return (
```

- [ ] **Step 4: Replace the two-way Recent-chats conditional with a three-way one**

In `apps/web/components/AppShell.tsx`, update the Recent chats block (L401-451). Change the render source from `chats` to `visibleChats`, and add the "No chats match" branch. Note: the per-row `.map` body is UNCHANGED — only the outer conditional and the mapped array change.

Find:
```tsx
            <div className="r-label">Recent chats</div>
            {chats.length === 0 ? (
              <div className="hist" style={{ color: "var(--text-2)", cursor: "default" }}>
                <span style={{ fontSize: 12 }}>Your saved chats appear here</span>
              </div>
            ) : (
              chats.map((c) => (
```

Replace with:
```tsx
            <div className="r-label">Recent chats</div>
            {chats.length === 0 ? (
              <div className="hist" style={{ color: "var(--text-2)", cursor: "default" }}>
                <span style={{ fontSize: 12 }}>Your saved chats appear here</span>
              </div>
            ) : visibleChats.length === 0 ? (
              <div className="r-label" style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
                No chats match
              </div>
            ) : (
              visibleChats.map((c) => (
```

- [ ] **Step 5: Build to verify the wiring compiles**

Run: `npm run build`
Expected: PASS. No new TypeScript errors (the input is now controlled; `visibleChats` is typed `ConversationSummary[]`).

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/AppShell.tsx
git commit -m "feat(web): wire sidebar search to filter recent chats by title"
```

---

### Task 3: `buildCreditsSummary` PURE helper + Deno tests

**Files:**
- Create: `packages/shared/src/credits.ts`
- Create: `packages/shared/src/credits.test.ts`
- Modify: `packages/shared/src/index.ts` — barrel export.

**Interfaces:**
- Consumes: `EntitlementSnapshot`, `UsageSnapshot` from `./entitlements.ts` (already exported from the barrel). Relevant shapes:
  - `EntitlementSnapshot = { plan: PlanCode; entitlements: { ask_daily_limit?: number; watchlist_limit?: number; stripe_plus_enabled?: boolean; [key: string]: unknown } }`. NOTE: `deep_research_daily_limit`, `watch_limit`, `mission_limit` are NOT declared keys — they arrive through the `[key: string]: unknown` index signature and MUST be read with a `typeof v === "number" && Number.isFinite(v)` guard (never `Number(...)`, which yields `NaN` on `undefined`).
  - `UsageSnapshot = { plan: PlanCode; counters: { ask_daily?: UsageCounter; [key: string]: UsageCounter | undefined } }` where `UsageCounter = { used: number; limit: number | null; period_start: string; period_end: string }`. The `deep_research_daily` counter, when present, comes through the index signature.
- Produces (later tasks — CreditsPanel, CreditsBreakdown — rely on these exact names/types):
  - `interface CreditsSummary { plan: string; daily: Array<{ key: "ask" | "deep_research"; label: string; used: number; limit: number }>; slots: Array<{ key: "watches" | "missions"; label: string; used: number; limit: number }>; }`
  - `function buildCreditsSummary(input: { snapshot: EntitlementSnapshot | null; usage: UsageSnapshot | null; watchCount: number | null; missionCount: number | null }): CreditsSummary`

**Behavior spec (encode exactly):**
- `plan` = `snapshot?.plan ?? "free"`.
- `daily` entries, in order `ask` then `deep_research`:
  - Prefer the usage counter (`usage.counters.ask_daily` / `usage.counters.deep_research_daily`) for BOTH `used` and `limit`. A counter's `limit` may be `null`; when it is, fall back to the entitlement limit.
  - When the counter is missing entirely, fall back to `used: 0` and the entitlement limit (`ask_daily_limit` / `deep_research_daily_limit`).
  - An entry is INCLUDED whenever a numeric limit resolves (from counter or entitlement). `deep_research` with a resolved limit of `0` is KEPT (free/plus show `0/0`, a Pro-gated feature the UI marks). Omit an entry ONLY when no numeric limit resolves at all (both counter-limit and entitlement-limit are null/undefined/non-finite).
  - Labels: `ask` → `"Ask"`, `deep_research` → `"Deep research"`.
- `slots` entries, in order `watches` then `missions`:
  - `used` = the passed-in count (`watchCount` / `missionCount`). `limit` = the entitlement (`watch_limit` / `mission_limit`).
  - Omit an entry when BOTH its count is `null` (unknown — the list fetch failed) AND its limit does not resolve. If the count is known (a number, incl. `0`) OR a limit resolves, include it (`used` defaults to `0` when the count is null but a limit resolved; `limit` defaults to `0` when the limit is missing but the count is known).
  - Labels: `watches` → `"Monitors"`, `missions` → `"Scheduled"`.
- Never emit `NaN` for any `used`/`limit`.

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/credits.test.ts`:

```ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildCreditsSummary } from "./credits.ts";
import type { EntitlementSnapshot, UsageSnapshot } from "./entitlements.ts";

// A full Pro snapshot: usage counters present for both daily meters; watch/mission limits + counts known.
Deno.test("full pro snapshot maps every daily meter and slot", () => {
  const snapshot: EntitlementSnapshot = {
    plan: "pro",
    entitlements: {
      ask_daily_limit: 250,
      deep_research_daily_limit: 3,
      watch_limit: 50,
      mission_limit: 5,
    },
  };
  const usage: UsageSnapshot = {
    plan: "pro",
    counters: {
      ask_daily: { used: 12, limit: 250, period_start: "", period_end: "" },
      deep_research_daily: { used: 1, limit: 3, period_start: "", period_end: "" },
    },
  };
  const s = buildCreditsSummary({ snapshot, usage, watchCount: 4, missionCount: 2 });
  assertEquals(s.plan, "pro");
  assertEquals(s.daily, [
    { key: "ask", label: "Ask", used: 12, limit: 250 },
    { key: "deep_research", label: "Deep research", used: 1, limit: 3 },
  ]);
  assertEquals(s.slots, [
    { key: "watches", label: "Monitors", used: 4, limit: 50 },
    { key: "missions", label: "Scheduled", used: 2, limit: 5 },
  ]);
});

// Free plan: deep_research + mission limits are 0. Both are KEPT (0/0), never dropped.
Deno.test("free plan keeps the 0-limit deep-research meter and scheduled slot", () => {
  const snapshot: EntitlementSnapshot = {
    plan: "free",
    entitlements: {
      ask_daily_limit: 10,
      deep_research_daily_limit: 0,
      watch_limit: 1,
      mission_limit: 0,
    },
  };
  const usage: UsageSnapshot = {
    plan: "free",
    counters: { ask_daily: { used: 3, limit: 10, period_start: "", period_end: "" } },
  };
  const s = buildCreditsSummary({ snapshot, usage, watchCount: 0, missionCount: 0 });
  assertEquals(s.daily, [
    { key: "ask", label: "Ask", used: 3, limit: 10 },
    { key: "deep_research", label: "Deep research", used: 0, limit: 0 },
  ]);
  assertEquals(s.slots, [
    { key: "watches", label: "Monitors", used: 0, limit: 1 },
    { key: "missions", label: "Scheduled", used: 0, limit: 0 },
  ]);
});

// Missing usage: fall back to entitlement limits with used 0 (no NaN).
Deno.test("missing usage falls back to entitlement limits with used 0", () => {
  const snapshot: EntitlementSnapshot = {
    plan: "plus",
    entitlements: {
      ask_daily_limit: 100,
      deep_research_daily_limit: 0,
      watch_limit: 10,
      mission_limit: 0,
    },
  };
  const s = buildCreditsSummary({ snapshot, usage: null, watchCount: 2, missionCount: 0 });
  assertEquals(s.daily, [
    { key: "ask", label: "Ask", used: 0, limit: 100 },
    { key: "deep_research", label: "Deep research", used: 0, limit: 0 },
  ]);
  assertEquals(s.slots, [
    { key: "watches", label: "Monitors", used: 2, limit: 10 },
    { key: "missions", label: "Scheduled", used: 0, limit: 0 },
  ]);
});

// Null counts (list fetch failed) AND no resolvable limit → that slot is omitted, never NaN.
Deno.test("null counts with no limit omit the slot", () => {
  const snapshot: EntitlementSnapshot = {
    plan: "free",
    entitlements: { ask_daily_limit: 10 }, // no deep/ watch/ mission keys at all
  };
  const s = buildCreditsSummary({ snapshot, usage: null, watchCount: null, missionCount: null });
  // deep_research has no counter and no entitlement limit → omitted.
  assertEquals(s.daily, [{ key: "ask", label: "Ask", used: 0, limit: 10 }]);
  // both slots: count null AND limit missing → omitted.
  assertEquals(s.slots, []);
});

// A fully-null input must not throw and must not emit NaN.
Deno.test("all-null input degrades to an empty-but-valid summary", () => {
  const s = buildCreditsSummary({ snapshot: null, usage: null, watchCount: null, missionCount: null });
  assertEquals(s.plan, "free");
  assertEquals(s.daily, []);
  assertEquals(s.slots, []);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `deno test --allow-env packages/shared/src/credits.test.ts`
Expected: FAIL — module `./credits.ts` does not exist (or `buildCreditsSummary` is not exported).

- [ ] **Step 3: Write the implementation**

Create `packages/shared/src/credits.ts`:

```ts
// Visible credits (Manus-style usage surface) — PURE. Turns the existing entitlement + usage + count
// snapshots into a small display model. DISPLAY-ONLY: reads what the backend already reports; it does
// not decide, enforce, or charge anything. The topbar chip, the credits modal, and the Settings "Usage"
// section all render from this one shape so the numbers are identical everywhere.
//
// Entitlement keys other than ask_daily_limit arrive through EntitlementSnapshot's `[key: string]:
// unknown` index signature, so they are read with the same finite-number guard used by
// watch-entitlements.ts / missions.ts — never bare Number(), which would yield NaN on undefined.

import type { EntitlementSnapshot, UsageSnapshot } from "./entitlements.ts";

export interface CreditsSummary {
  plan: string;
  /** Per-day meters that reset (Ask, Deep research). */
  daily: Array<{ key: "ask" | "deep_research"; label: string; used: number; limit: number }>;
  /** Permanent slots that free up on delete (Monitors, Scheduled). */
  slots: Array<{ key: "watches" | "missions"; label: string; used: number; limit: number }>;
}

/** A finite number, or undefined. Mirrors the guard in watch-entitlements.ts. */
function finite(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

export function buildCreditsSummary(input: {
  snapshot: EntitlementSnapshot | null;
  usage: UsageSnapshot | null;
  watchCount: number | null;
  missionCount: number | null;
}): CreditsSummary {
  const { snapshot, usage, watchCount, missionCount } = input;
  const ent = snapshot?.entitlements ?? {};
  const counters = usage?.counters ?? {};

  const daily: CreditsSummary["daily"] = [];

  // Ask meter. Prefer the counter's used/limit; fall back to the entitlement limit; keep only if a
  // numeric limit resolves at all.
  {
    const c = counters.ask_daily;
    const limit = finite(c?.limit) ?? finite(ent.ask_daily_limit);
    if (limit !== undefined) {
      daily.push({ key: "ask", label: "Ask", used: finite(c?.used) ?? 0, limit });
    }
  }

  // Deep-research meter. Same rule; a resolved limit of 0 is KEPT (Pro-gated 0/0 the UI marks).
  {
    const c = counters.deep_research_daily;
    const limit = finite(c?.limit) ?? finite(ent.deep_research_daily_limit);
    if (limit !== undefined) {
      daily.push({ key: "deep_research", label: "Deep research", used: finite(c?.used) ?? 0, limit });
    }
  }

  const slots: CreditsSummary["slots"] = [];

  // Monitors slot. Include when the count is known (a number, incl. 0) OR a limit resolves.
  {
    const limit = finite(ent.watch_limit);
    if (watchCount !== null || limit !== undefined) {
      slots.push({ key: "watches", label: "Monitors", used: watchCount ?? 0, limit: limit ?? 0 });
    }
  }

  // Scheduled slot. Same rule; free/plus resolve a limit of 0 and show 0/0.
  {
    const limit = finite(ent.mission_limit);
    if (missionCount !== null || limit !== undefined) {
      slots.push({ key: "missions", label: "Scheduled", used: missionCount ?? 0, limit: limit ?? 0 });
    }
  }

  return { plan: snapshot?.plan ?? "free", daily, slots };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `deno test --allow-env packages/shared/src/credits.test.ts`
Expected: PASS — `ok | 5 passed | 0 failed`.

- [ ] **Step 5: Barrel-export the module**

In `packages/shared/src/index.ts`, append the export at the end of the file (after the `./relative-time.ts` export on the last line).

Find:
```ts
// Relative "time until" ("in 2 h" / "in 3 d" / "due now") for the Scheduled surface. PURE.
export * from "./relative-time.ts";
```

Replace with:
```ts
// Relative "time until" ("in 2 h" / "in 3 d" / "due now") for the Scheduled surface. PURE.
export * from "./relative-time.ts";

// Visible credits (Manus-style usage surface): PURE display model over the existing entitlement + usage
// + watch/mission counts. Display-only — reads what the backend reports, never enforces or charges.
export * from "./credits.ts";
```

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/credits.ts packages/shared/src/credits.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): buildCreditsSummary display model for the visible-credits surface"
```

---

### Task 4: `CreditsPanel` modal + reusable `CreditsBreakdown` + topbar chip + footer-staleness fix

**Files:**
- Create: `apps/web/components/CreditsPanel.tsx` (exports both `CreditsPanel` and `CreditsBreakdown`)
- Modify: `apps/web/app/styles/shell.css` — add `.credits-*` classes at the end of the file.
- Modify: `apps/web/components/AppShell.tsx` — extend the chrome context with `usageVersion`/`bumpUsage`; make the entitlements effect depend on `usageVersion`; add the topbar chip that opens the panel.
- Modify: `apps/web/app/app/ask/page.tsx:135` and `apps/web/app/app/ask/page.tsx:417` — call `bumpUsage()` after the post-answer usage refetch.

**Interfaces:**
- Consumes: `buildCreditsSummary`, `CreditsSummary` from `@nemesis/shared` (Task 3). `fetchEntitlements`, `fetchUsage`, `fetchWatches`, `fetchMissions` from `@/lib/api` (all already exist; return `EntitlementSnapshot`, `UsageSnapshot`, `WatchSummary[]`, `MissionSummary[]` respectively). `Icon` from `@/components/icons` (`sparkle` and `card` icon names exist). The account-footer `plan` state in `AppShell` (`{ plan: string; used: number; limit: number }`).
- Produces (Task 5 depends on this EXACT name + signature):
  - `function CreditsBreakdown({ summary }: { summary: CreditsSummary }): JSX.Element` — the inner list (no modal chrome), rendered by BOTH the modal and the Settings section.
  - `function CreditsPanel({ open, onClose }: { open: boolean; onClose: () => void }): JSX.Element | null` — the modal; fetches fresh on open.

**Context the implementer needs:**
- Modal pattern (mirror `apps/web/components/DataSourcesPanel.tsx` exactly): outer `<div className="confirm-overlay" role="presentation" onClick={onClose}>`, inner `<div className="confirm-card" role="dialog" aria-modal="true" aria-label="..." onClick={(e) => e.stopPropagation()} style={{...}}>`, a `<h3 className="confirm-title">`, and a `<div className="confirm-actions">` footer with a `<button className="confirm-cancel">`. Return `null` when `!open`.
- On `origin/main`, `AppChromeValue` (interface L17-26) currently has: `railCollapsed, toggleRail, evidenceCollapsed, toggleEvidence, openEvidence, setEvidence, setTopbar, bumpChats`. The default context object (L27-36) and the `ctx = useMemo(...)` (L339-341, both the value object AND the dependency array) mirror that list. `chatsVersion` is PRIVATE local state (L99) and is deliberately NOT in the context — only `bumpChats` (L116) is exposed. We follow that precedent EXACTLY: add `usageVersion` as private local state, expose only `bumpUsage`.
- The entitlements/plan effect (L254-267) currently depends on `[session]`, so the account footer (`{plan.plan} · {plan.used}/{plan.limit} today`, L466-468) goes stale after each ask. Adding `usageVersion` to its dep array makes it re-read when the ask page bumps.
- The topbar JSX is inside `<div className="topbar">` (L477+); the theme toggle button is `<button className="icon-btn" onClick={toggleTheme} ...>` right after `<div className="spacer" />` (L488). We insert the credits chip just before the theme toggle.
- The ask page already destructures from chrome (`const { setEvidence, setTopbar, openEvidence, bumpChats } = chrome;`, L135) and refetches usage after an answer (`void fetchUsage().catch(() => {});`, L417). We add `bumpUsage` to that destructure and call it in the same `.then`.

- [ ] **Step 1: Add the `.credits-*` CSS classes**

In `apps/web/app/styles/shell.css`, append to the END of the file (after the last line, the `.watch-delete-confirm:hover` rule at L1323).

Find:
```css
.watch-delete-confirm { color: #fff; background: var(--danger); border-color: var(--danger); }
.watch-delete-confirm:hover { filter: brightness(1.07); }
```

Replace with:
```css
.watch-delete-confirm { color: #fff; background: var(--danger); border-color: var(--danger); }
.watch-delete-confirm:hover { filter: brightness(1.07); }

/* Visible credits: the topbar chip (a Manus-style "N left" pill) + the modal/Settings breakdown rows.
   Display-only — a calm, quiet surface, never an upsell scream. */
.credits-chip { display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 11px; border: 1px solid var(--line); border-radius: 999px; background: var(--surface); color: var(--text-2); font-family: var(--font); font-size: 13px; cursor: pointer; transition: border-color 0.15s, color 0.15s; }
.credits-chip:hover { border-color: var(--line-2); color: var(--text); }
.credits-chip svg { color: var(--acid); flex: none; }
.credits-chip b { font-weight: 600; color: var(--text); }
.credits-group { margin-top: 14px; }
.credits-group-label { font-family: var(--mono); font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-3); margin-bottom: 8px; }
.credits-row { display: grid; grid-template-columns: 1fr auto; align-items: baseline; column-gap: 12px; padding: 7px 0; }
.credits-row + .credits-row { border-top: 1px solid var(--line); }
.credits-row-label { font-size: 13.5px; color: var(--text); }
.credits-row-note { font-size: 12px; color: var(--text-3); margin-left: 8px; }
.credits-row-count { font-family: var(--mono); font-size: 12.5px; color: var(--text-2); white-space: nowrap; }
.credits-bar { grid-column: 1 / -1; height: 4px; margin-top: 6px; border-radius: 999px; background: var(--surface-2); overflow: hidden; }
.credits-bar > span { display: block; height: 100%; background: var(--acid); border-radius: 999px; }
.credits-foot { font-size: 12px; color: var(--text-3); line-height: 1.6; margin-top: 14px; }
.credits-foot a { color: var(--acid-dim); }
```

- [ ] **Step 2: Create the `CreditsPanel` + `CreditsBreakdown` component**

Create `apps/web/components/CreditsPanel.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { buildCreditsSummary, type CreditsSummary } from "@nemesis/shared";
import { fetchEntitlements, fetchMissions, fetchUsage, fetchWatches } from "@/lib/api";

// The inner list — plan name, a "Today" group (resettable daily meters) and a "Slots" group (permanent
// monitors/scheduled). Rendered by BOTH the modal (CreditsPanel) and the Settings "Usage" section, so the
// numbers read identically everywhere. Pure presentation over the display model built in shared.
export function CreditsBreakdown({ summary }: { summary: CreditsSummary }) {
  const planLabel = summary.plan.charAt(0).toUpperCase() + summary.plan.slice(1);
  return (
    <div>
      <p className="muted" style={{ fontSize: 13, margin: "0 0 4px" }}>
        You're on the <b>{planLabel}</b> plan.
      </p>

      {summary.daily.length > 0 ? (
        <div className="credits-group">
          <div className="credits-group-label">Today · resets daily</div>
          {summary.daily.map((row) => {
            // A deep-research meter capped at 0 means the feature is Pro-gated on this plan — say so plainly.
            const gated = row.key === "deep_research" && row.limit === 0;
            const pct = row.limit > 0 ? Math.min(100, Math.round((row.used / row.limit) * 100)) : 0;
            return (
              <div className="credits-row" key={row.key}>
                <span className="credits-row-label">
                  {row.label}
                  {gated ? <span className="credits-row-note">Pro feature</span> : null}
                </span>
                <span className="credits-row-count">{row.used}/{row.limit}</span>
                <span className="credits-bar" aria-hidden="true"><span style={{ width: `${pct}%` }} /></span>
              </div>
            );
          })}
        </div>
      ) : null}

      {summary.slots.length > 0 ? (
        <div className="credits-group">
          <div className="credits-group-label">Slots · free up when you delete one</div>
          {summary.slots.map((row) => {
            const pct = row.limit > 0 ? Math.min(100, Math.round((row.used / row.limit) * 100)) : 0;
            return (
              <div className="credits-row" key={row.key}>
                <span className="credits-row-label">{row.label}</span>
                <span className="credits-row-count">{row.used}/{row.limit}</span>
                <span className="credits-bar" aria-hidden="true"><span style={{ width: `${pct}%` }} /></span>
              </div>
            );
          })}
        </div>
      ) : null}

      <p className="credits-foot">
        Daily counts reset at midnight UTC where marked; slots free up when you delete one.{" "}
        <a href="/app/billing">See plans</a>
      </p>
    </div>
  );
}

// The modal. Fetches fresh on open so the numbers are current; each fetch degrades to a null/empty
// fallback so one failing call never blanks the panel. Reuses the confirm-overlay/confirm-card pattern
// (mirrors DataSourcesPanel).
export function CreditsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [summary, setSummary] = useState<CreditsSummary | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setSummary(null);
    void Promise.all([
      fetchEntitlements().catch(() => null),
      fetchUsage().catch(() => null),
      fetchWatches().catch(() => null),
      fetchMissions().catch(() => null),
    ]).then(([snapshot, usage, watches, missions]) => {
      if (!alive) return;
      setSummary(
        buildCreditsSummary({
          snapshot,
          usage,
          watchCount: watches ? watches.length : null,
          missionCount: missions ? missions.length : null,
        }),
      );
    });
    return () => {
      alive = false;
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="confirm-overlay" role="presentation" onClick={onClose}>
      <div
        className="confirm-card"
        role="dialog"
        aria-modal="true"
        aria-label="Your credits"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 460, textAlign: "left", maxHeight: "80vh", overflowY: "auto" }}
      >
        <h3 className="confirm-title">Your credits</h3>
        {summary ? (
          <CreditsBreakdown summary={summary} />
        ) : (
          <p className="muted" style={{ fontSize: 13, margin: "8px 0" }}>Loading…</p>
        )}
        <div className="confirm-actions" style={{ marginTop: 12 }}>
          <button type="button" className="confirm-cancel" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Extend the chrome context — interface, default, and expose `bumpUsage`**

In `apps/web/components/AppShell.tsx`, add `bumpUsage` to the `AppChromeValue` interface (L17-26).

Find:
```tsx
interface AppChromeValue {
  railCollapsed: boolean;
  toggleRail: () => void;
  evidenceCollapsed: boolean;
  toggleEvidence: () => void;
  openEvidence: () => void;
  setEvidence: (node: ReactNode | null) => void;
  setTopbar: (node: ReactNode | null) => void;
  bumpChats: () => void;
}
```

Replace with:
```tsx
interface AppChromeValue {
  railCollapsed: boolean;
  toggleRail: () => void;
  evidenceCollapsed: boolean;
  toggleEvidence: () => void;
  openEvidence: () => void;
  setEvidence: (node: ReactNode | null) => void;
  setTopbar: (node: ReactNode | null) => void;
  bumpChats: () => void;
  bumpUsage: () => void;
}
```

Then add `bumpUsage` to the default context object (L27-36).

Find:
```tsx
const AppChromeContext = createContext<AppChromeValue>({
  railCollapsed: false,
  toggleRail: () => {},
  evidenceCollapsed: false,
  toggleEvidence: () => {},
  openEvidence: () => {},
  setEvidence: () => {},
  setTopbar: () => {},
  bumpChats: () => {},
});
```

Replace with:
```tsx
const AppChromeContext = createContext<AppChromeValue>({
  railCollapsed: false,
  toggleRail: () => {},
  evidenceCollapsed: false,
  toggleEvidence: () => {},
  openEvidence: () => {},
  setEvidence: () => {},
  setTopbar: () => {},
  bumpChats: () => {},
  bumpUsage: () => {},
});
```

- [ ] **Step 4: Add the private `usageVersion` state + `bumpUsage` callback + panel-open state**

In `apps/web/components/AppShell.tsx`, add state next to `chatsVersion` (L99). Find:
```tsx
  const [chats, setChats] = useState<ConversationSummary[]>([]);
  const [chatsVersion, setChatsVersion] = useState(0);
```

Replace with:
```tsx
  const [chats, setChats] = useState<ConversationSummary[]>([]);
  const [chatsVersion, setChatsVersion] = useState(0);
  // Bumped after each ask so the account footer + credits chip re-read usage (they'd otherwise go stale —
  // AppShell reads usage once on mount). Private local state; only bumpUsage() is exposed on the context.
  const [usageVersion, setUsageVersion] = useState(0);
  // Whether the credits modal (opened from the topbar chip) is showing.
  const [creditsOpen, setCreditsOpen] = useState(false);
```

Then add the `bumpUsage` callback next to `bumpChats` (L116). Find:
```tsx
  const bumpChats = useCallback(() => setChatsVersion((v) => v + 1), []);
```

Replace with:
```tsx
  const bumpChats = useCallback(() => setChatsVersion((v) => v + 1), []);
  const bumpUsage = useCallback(() => setUsageVersion((v) => v + 1), []);
```

- [ ] **Step 5: Make the entitlements/plan effect re-read on `usageVersion`**

In `apps/web/components/AppShell.tsx`, update the plan effect's dependency array (L254-267 region). The effect body is unchanged — only the dep array gains `usageVersion`.

Find:
```tsx
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [session]);

  // Load the rail's saved-chat history (refreshes when the chat page bumps after creating one).
```

Replace with:
```tsx
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [session, usageVersion]);

  // Load the rail's saved-chat history (refreshes when the chat page bumps after creating one).
```

- [ ] **Step 6: Add `bumpUsage` to the `ctx` useMemo (value AND deps)**

In `apps/web/components/AppShell.tsx`, update the `ctx = useMemo(...)` block (L339-342).

Find:
```tsx
  const ctx = useMemo<AppChromeValue>(
    () => ({ railCollapsed, toggleRail, evidenceCollapsed, toggleEvidence, openEvidence, setEvidence, setTopbar, bumpChats }),
    [railCollapsed, toggleRail, evidenceCollapsed, toggleEvidence, openEvidence, setEvidence, setTopbar, bumpChats],
  );
```

Replace with:
```tsx
  const ctx = useMemo<AppChromeValue>(
    () => ({ railCollapsed, toggleRail, evidenceCollapsed, toggleEvidence, openEvidence, setEvidence, setTopbar, bumpChats, bumpUsage }),
    [railCollapsed, toggleRail, evidenceCollapsed, toggleEvidence, openEvidence, setEvidence, setTopbar, bumpChats, bumpUsage],
  );
```

- [ ] **Step 7: Import `CreditsPanel` at the top of AppShell**

In `apps/web/components/AppShell.tsx`, add the import next to the `SettingsSurface` import (L12).

Find:
```tsx
import { SettingsSurface } from "./SettingsSurface";
```

Replace with:
```tsx
import { SettingsSurface } from "./SettingsSurface";
import { CreditsPanel } from "./CreditsPanel";
```

- [ ] **Step 8: Add the topbar chip (before the theme toggle) + render the modal**

In `apps/web/components/AppShell.tsx`, insert the chip button just before the theme-toggle button in the topbar (L487-490 region). `remaining` uses the SAME `plan` state the footer reads, so it re-reads via the `usageVersion` dep from Step 5.

Find:
```tsx
            <div className="spacer" />
            <button className="icon-btn" onClick={toggleTheme} data-tip="Switch theme" aria-label="Switch theme (light, grey, dark)">
              <Icon name={theme === "light" ? "moon" : "sun"} />
            </button>
```

Replace with:
```tsx
            <div className="spacer" />
            <button
              className="credits-chip"
              onClick={() => setCreditsOpen(true)}
              data-tip="Your credits"
              aria-label={`Your credits — ${Math.max(0, plan.limit - plan.used)} asks left today`}
            >
              <Icon name="sparkle" size={15} />
              <b>{Math.max(0, plan.limit - plan.used)}</b>
            </button>
            <button className="icon-btn" onClick={toggleTheme} data-tip="Switch theme" aria-label="Switch theme (light, grey, dark)">
              <Icon name={theme === "light" ? "moon" : "sun"} />
            </button>
```

Then render the modal. Add it alongside the other overlays — immediately after the closing `</main>` and before the evidence panel block (the `{hasEvidence ? (` block at L500 region). Find:
```tsx
          <div className={pageClass}>{children}</div>
        </main>

        {/* ── evidence (page-injected) — a right-side drawer at ≤1100px ── */}
```

Replace with:
```tsx
          <div className={pageClass}>{children}</div>
        </main>

        <CreditsPanel open={creditsOpen} onClose={() => setCreditsOpen(false)} />

        {/* ── evidence (page-injected) — a right-side drawer at ≤1100px ── */}
```

- [ ] **Step 9: Call `bumpUsage()` after the ask page's post-answer usage refetch**

In `apps/web/app/app/ask/page.tsx`, add `bumpUsage` to the chrome destructure (L135).

Find:
```tsx
  const { setEvidence, setTopbar, openEvidence, bumpChats } = chrome;
```

Replace with:
```tsx
  const { setEvidence, setTopbar, openEvidence, bumpChats, bumpUsage } = chrome;
```

Then call it after the usage refetch (L417).

Find:
```tsx
      void fetchUsage().catch(() => {});
```

Replace with:
```tsx
      void fetchUsage().catch(() => {});
      bumpUsage(); // refresh the shell's account footer + credits chip after this ask consumed a unit
```

- [ ] **Step 10: Build to verify the whole wiring compiles**

Run: `npm run build`
Expected: PASS. No new TypeScript errors — `CreditsPanel`/`CreditsBreakdown` typecheck against `@nemesis/shared`, the context adds `bumpUsage` consistently in interface + default + memo, and the ask page's destructure resolves.

- [ ] **Step 11: Commit**

```bash
git add apps/web/components/CreditsPanel.tsx apps/web/app/styles/shell.css apps/web/components/AppShell.tsx apps/web/app/app/ask/page.tsx
git commit -m "feat(web): visible credits chip + modal, and refresh account footer after each ask"
```

---

### Task 5: Settings "Usage" section

**Files:**
- Modify: `apps/web/components/SettingsSurface.tsx` — add `"usage"` to the `SettingsSection` type + the `SECTIONS` array; render a `<CreditsBreakdown>` body that fetches on section-open.
- Modify: `apps/web/app/app/settings/page.tsx` — add `"usage"` to the route's `SECTIONS` allow-list so `?section=usage` deep-links resolve.

**Interfaces:**
- Consumes: `CreditsBreakdown` from `@/components/CreditsPanel` (Task 4) — exact signature `CreditsBreakdown({ summary }: { summary: CreditsSummary })`. `buildCreditsSummary`, `CreditsSummary` from `@nemesis/shared`. `fetchEntitlements`, `fetchUsage`, `fetchWatches`, `fetchMissions` from `@/lib/api`.
- Produces: nothing other tasks depend on.

**Context the implementer needs:**
- On `origin/main`, `SettingsSurface.tsx` has `export type SettingsSection = "general" | "account" | "billing" | "about";` (L19) and a `SECTIONS` array (L21-26): `general`/`account`/`billing`/`about`, each `{ id, label, icon }`. Each section renders as `{section === "..." ? <block> : null}`. Adding `"usage"` requires updating BOTH the union type (TS error otherwise) AND the array, then adding a render block.
- The route page (`settings/page.tsx`) has its OWN `const SECTIONS = ["general", "account", "billing", "about"] as const;` (L4) used to validate `?section=`. If `"usage"` is missing there, `?section=usage` falls through to `"general"`. Add it there too.
- Place `usage` between `billing` and `about` (per the spec). The `card` icon exists in `icons.tsx` and reads well for a usage/credits meter.
- The Settings surface must fetch its own copy of the data (it is not passed a summary). Use the same `Promise.all([...].catch(...))` graceful pattern as `CreditsPanel`.

- [ ] **Step 1: Add `"usage"` to the `SettingsSection` union type**

In `apps/web/components/SettingsSurface.tsx`, update L19.

Find:
```tsx
export type SettingsSection = "general" | "account" | "billing" | "about";
```

Replace with:
```tsx
export type SettingsSection = "general" | "account" | "billing" | "usage" | "about";
```

- [ ] **Step 2: Add the `usage` entry to `SECTIONS` (between billing and about)**

In `apps/web/components/SettingsSurface.tsx`, update the `SECTIONS` array (L21-26).

Find:
```tsx
const SECTIONS: { id: SettingsSection; label: string; icon: string }[] = [
  { id: "general", label: "General", icon: "settings" },
  { id: "account", label: "Account", icon: "user" },
  { id: "billing", label: "Billing", icon: "card" },
  { id: "about", label: "About", icon: "shield" },
];
```

Replace with:
```tsx
const SECTIONS: { id: SettingsSection; label: string; icon: string }[] = [
  { id: "general", label: "General", icon: "settings" },
  { id: "account", label: "Account", icon: "user" },
  { id: "billing", label: "Billing", icon: "card" },
  { id: "usage", label: "Usage", icon: "card" },
  { id: "about", label: "About", icon: "shield" },
];
```

- [ ] **Step 3: Import the fetchers, the shared builder, and `CreditsBreakdown`**

In `apps/web/components/SettingsSurface.tsx`, add imports next to the existing panel imports (after the `DataSourcesPanel` import, L10). Also add `useEffect` to the React import (L4 currently imports only `useState`).

Find:
```tsx
import { useRouter } from "next/navigation";
import { useState } from "react";
```

Replace with:
```tsx
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
```

Then find:
```tsx
import { DataSourcesPanel } from "@/components/DataSourcesPanel";
```

Replace with:
```tsx
import { DataSourcesPanel } from "@/components/DataSourcesPanel";
import { CreditsBreakdown } from "@/components/CreditsPanel";
import { buildCreditsSummary, type CreditsSummary } from "@nemesis/shared";
import { fetchEntitlements, fetchMissions, fetchUsage, fetchWatches } from "@/lib/api";
```

- [ ] **Step 4: Fetch the credits summary when the Usage section is active**

In `apps/web/components/SettingsSurface.tsx`, add a state + effect inside the component, next to the existing `sourcesOpen` state (L37).

Find:
```tsx
  const [section, setSection] = useState<SettingsSection>(initialSection);
  const [sourcesOpen, setSourcesOpen] = useState(false);
```

Replace with:
```tsx
  const [section, setSection] = useState<SettingsSection>(initialSection);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  // Credits summary for the Usage section. Fetched when that section is shown; each call degrades to
  // null/empty so one failure never blanks the panel (same graceful pattern as the topbar modal).
  const [credits, setCredits] = useState<CreditsSummary | null>(null);

  useEffect(() => {
    if (section !== "usage") return;
    let alive = true;
    setCredits(null);
    void Promise.all([
      fetchEntitlements().catch(() => null),
      fetchUsage().catch(() => null),
      fetchWatches().catch(() => null),
      fetchMissions().catch(() => null),
    ]).then(([snapshot, usage, watches, missions]) => {
      if (!alive) return;
      setCredits(
        buildCreditsSummary({
          snapshot,
          usage,
          watchCount: watches ? watches.length : null,
          missionCount: missions ? missions.length : null,
        }),
      );
    });
    return () => {
      alive = false;
    };
  }, [section]);
```

- [ ] **Step 5: Render the Usage section body (between billing and about)**

In `apps/web/components/SettingsSurface.tsx`, insert the render block between the billing block and the about block (after the `{section === "billing" ? ... }` line, L96).

Find:
```tsx
        {section === "billing" ? <BillingPanel checkoutStatus={checkoutStatus} /> : null}

        {section === "about" ? (
```

Replace with:
```tsx
        {section === "billing" ? <BillingPanel checkoutStatus={checkoutStatus} /> : null}

        {section === "usage" ? (
          <section className="card">
            <h2 style={{ marginBottom: 4 }}>Usage</h2>
            <p className="muted" style={{ fontSize: 13, margin: "0 0 16px" }}>What you've used today and the slots you hold. Display only — nothing here charges you.</p>
            {credits ? <CreditsBreakdown summary={credits} /> : <p className="muted" style={{ fontSize: 13 }}>Loading…</p>}
          </section>
        ) : null}

        {section === "about" ? (
```

- [ ] **Step 6: Add `"usage"` to the route page's section allow-list**

In `apps/web/app/app/settings/page.tsx`, update the `SECTIONS` const (L4) so `?section=usage` resolves.

Find:
```tsx
const SECTIONS = ["general", "account", "billing", "about"] as const;
```

Replace with:
```tsx
const SECTIONS = ["general", "account", "billing", "usage", "about"] as const;
```

- [ ] **Step 7: Build to verify Settings + deep-link compile**

Run: `npm run build`
Expected: PASS. No new TypeScript errors — the `SettingsSection` union, the route allow-list, and the `CreditsBreakdown` import all line up.

- [ ] **Step 8: Commit**

```bash
git add apps/web/components/SettingsSurface.tsx apps/web/app/app/settings/page.tsx
git commit -m "feat(web): add Settings > Usage section reusing the credits breakdown"
```

---

### Task 6: Full verification + PR (owner-gated merge)

**Files:**
- No source changes. Runs the full test + build gate, pushes the branch, opens the PR.

**Interfaces:**
- Consumes: everything from Tasks 1-5.
- Produces: a PR into `main`.

**Context the implementer needs:**
- Shared tests are Deno; the web gate is `npm run build`. There is no web unit-test harness.
- `main` auto-deploys to production on merge. The final merge is OWNER-GATED — do NOT merge without explicit owner approval. Say this explicitly in the PR body.
- Commit style is conventional commits; the branch already carries the per-task commits.

- [ ] **Step 1: Run the shared unit tests (green gate for the helper)**

Run: `deno test --allow-env packages/shared/src/credits.test.ts`
Expected: PASS — `ok | 5 passed | 0 failed`.

- [ ] **Step 2: Run the existing shared suite for the touched files to confirm no regressions**

Run: `deno test --allow-env packages/shared/src/`
Expected: PASS across all shared test files (adding `credits.ts` + its barrel export must not break any sibling module).

- [ ] **Step 3: Build the web app (the web gate)**

Run: `npm run build`
Expected: PASS — the Next.js build completes with no new type or lint errors.

- [ ] **Step 4: Confirm the frozen edge function was not touched**

Run: `git diff origin/main...HEAD --name-only -- supabase/functions/ask/`
Expected: EMPTY output (no files under the frozen path changed).

- [ ] **Step 5: Push the branch**

```bash
git push -u origin feat/shell-credits
```

- [ ] **Step 6: Open the PR**

```bash
gh pr create --base main --head feat/shell-credits \
  --title "feat(web): shell polish + visible credits — persistent sidebar, wired search, credits chip/panel/usage tab" \
  --body "$(cat <<'EOF'
## What this does (plain English)

This is the "shell completeness" pass — small things that make the app feel finished — plus a new, honest place to see how much of your daily allowance you've used.

**1. The sidebar remembers whether it's collapsed.** Before, collapsing the left sidebar was forgotten on every page reload. Now it stays how you left it (saved in your browser).

**2. Two narrow-screen layout bugs are fixed.** On the Scheduled and Project pages, a couple of rows used to get cut off on smaller windows. They now wrap onto a second line instead of clipping. (We also removed a one-off inline patch that's no longer needed, since the base styling now handles it everywhere.)

**3. The sidebar search box actually works now.** It was decorative before. Now typing in it filters your recent chats by title as you type, and shows a quiet "No chats match" note when nothing fits. Clearing it brings the full list back. It searches your saved chats only (not drugs) — the label now says exactly that.

**4. A visible "credits" surface — how much you've used today.** A small pill in the top bar shows how many Ask questions you have left today. Clicking it opens a panel that lays out: today's Ask and Deep-research counts (with a "Pro feature" note where Deep research isn't included on your plan), and your permanent Monitors and Scheduled slots. The exact same breakdown also lives under Settings → Usage (deep-linkable at /app/settings?section=usage).

Two honesty guarantees baked in:
- **This is display-only.** It reads the numbers the backend already reports. It does not change billing, add any database tables, or touch the answer engine. Nothing here charges you.
- **It never shows a broken number.** If any single lookup fails, that row is simply left out — the panel never crashes or shows a blank.

We also fixed a small staleness bug: the account footer's "used/limit today" now refreshes right after each question instead of only on first load.

## Scope guardrails honored
- FROZEN `supabase/functions/ask/**` untouched (verified: `git diff` over that path is empty).
- No billing changes, no new tables, no migrations, no edge-function changes.

## Test plan
- [x] Shared: `deno test --allow-env packages/shared/src/credits.test.ts` (5 tests: full Pro, free-plan 0/0 kept, missing-usage fallback, null-count omission, all-null graceful).
- [x] Shared suite: `deno test --allow-env packages/shared/src/` — no regressions.
- [x] Web: `npm run build` — passes.
- [ ] Manual (post-merge preview): collapse sidebar → reload → stays collapsed; type in sidebar search → recent chats filter; narrow the window on Scheduled/Project pages → rows wrap; click the topbar chip → panel opens with today's counts + slots; Settings → Usage shows the same; ask a question → footer + chip decrement.

## Deploy note
`main` auto-deploys to production (app.pharmaorb.app). **Merging this PR ships it live.** This merge is owner-gated — please review and merge when you're ready.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: the PR is created and its URL is printed.

- [ ] **Step 7: Report the PR URL to the owner and STOP**

Do NOT merge. Post the PR URL back to the owner with a one-line plain-English summary and note that merging is their call (it deploys to production).

---

## Self-Review

**1. Spec coverage** — every spec item maps to a task:
- Rail collapse persistence (localStorage `"rail-collapsed"`, lazy init, write on toggle, tablet CSS untouched) → Task 1 Steps 1-2.
- Two overflow bugs (`.proj-section-head` + `.watch-add` gain `flex-wrap: wrap`) + remove the scheduled inline patch → Task 1 Steps 3-5.
- Wire sidebar search (query state, onChange, case-insensitive title filter, "No chats match" quiet note, clear restores, placeholder → "Search chats", no drug search/routes) → Task 2.
- `packages/shared/src/credits.ts` `buildCreditsSummary` with the exact `CreditsSummary` shape, counter-then-entitlement fallback, deep-research 0/0 kept, omit-when-unresolvable, never-NaN + 4-plus Deno tests + barrel export → Task 3.
- `CreditsPanel` modal (confirm-overlay pattern, Promise.all with per-fetch `.catch`), topbar sparkle chip showing `remaining = max(0, limit - used)` from the footer's `plan` state, footer-staleness fix via `usageVersion`/`bumpUsage` mirroring `bumpChats` and the ask-page call → Task 4.
- Settings "Usage" section between billing and about, reusing `CreditsBreakdown`, `?section=usage` wiring → Task 5.
- Build + deno verification + owner-gated PR with plain-English body → Task 6.

**2. Placeholder scan** — no TBD/TODO/"handle edge cases"/"similar to Task N" left; every code step shows complete code. The one `TODO`-shaped item (the manual post-merge checklist in the PR body) is an intentional human test plan, not an implementation gap.

**3. Type consistency** — verified end to end:
- `CreditsSummary` fields (`plan`, `daily[{key,label,used,limit}]`, `slots[{key,label,used,limit}]`) are identical in the Task 3 type, the Task 3 tests, and the Task 4/5 consumers.
- `buildCreditsSummary(input: { snapshot; usage; watchCount; missionCount })` signature identical across Task 3 (def + tests) and Tasks 4-5 (callers pass `watchCount: watches ? watches.length : null` etc.).
- `CreditsBreakdown({ summary }: { summary: CreditsSummary })` name + prop identical in Task 4 (export) and Task 5 (import).
- `CreditsPanel({ open, onClose })` matches the AppShell render call in Task 4.
- `AppChromeValue.bumpUsage: () => void` added consistently to the interface, the default context object, and the `ctx` useMemo (value + deps) in Task 4; the ask page destructures the same name.
- `SettingsSection` union (`| "usage"`), the `SECTIONS` array entry, and the route allow-list all gain `"usage"` in Task 5 — no orphan.
- Icon names used (`sparkle`, `card`, `search`) are all present in `icons.tsx` on `origin/main`.
- Entitlement index-signature keys (`deep_research_daily_limit`, `watch_limit`, `mission_limit`) read via the `finite()` guard, never `Number()` — matches the `noUncheckedIndexedAccess` + `unknown` typing and the never-NaN rule.

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-07-03-phase1-shell-credits.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
