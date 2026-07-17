# Workspace Parity — Projects, Scheduled, Library, Data Sources Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clone the best workspace UX patterns from ChatGPT / Manus / NotebookLM into PharmaOrb across five surfaces — a real Project workspace, a Scheduled research surface, a Reports→Library upgrade, sidebar quick-add-to-project, and a Data sources panel.

**Architecture:** All work is client-side Next.js (App Router, "use client" pages) plus pure helpers in `packages/shared`. New pure logic (report-title cleanup, relative-time) lives in `packages/shared` with Deno tests; UI is verified by `npm run build` + manual preview. One additive, owner-gated migration adds a `projects.instructions` column and an `updated_at` bump trigger. Every new query degrades gracefully so web can ship before the migration is applied. The frozen `/ask` edge function is never touched — project instructions ride into the answer as part of the user's question string.

**Tech Stack:** Next.js 15 App Router (React client components), `@supabase/supabase-js` (PostgREST + RLS), `@nemesis/shared` (pure TypeScript helpers, Deno-tested), Supabase Postgres migrations.

## Global Constraints

- **Branch:** All work happens on a NEW branch `feat/workspace-parity` cut from `origin/main`. NEVER commit to `main`. `main` auto-deploys to production on push (app.pharmaorb.app / pharma-bro-web), so a merge to main is a prod deploy.
- **FROZEN — do not edit:** `supabase/functions/ask/index.ts` and the whole `supabase/functions/ask/**` answer path. Project instructions must be delivered by augmenting the user's question string client-side, never by changing the edge function.
- **Owner-gated:** Applying the migration (`supabase db push` / dashboard) and deploying any edge function are OWNER-gated. This plan touches NO edge function. The one migration (Task 2) is written but its apply is explicitly owner-gated and called out.
- **Graceful degradation:** Every new query must tolerate a not-yet-applied migration. The existing `isMissingRelation(error)` guard ONLY catches a missing *table* (`error.code === "PGRST205"`). A missing *column* surfaces as Postgres `42703` (a PostgREST 400), which that guard does NOT catch. The only new column in this plan is `projects.instructions` (Task 2); handle its absence explicitly in `fetchProject` (Task 1) by catching `error.code === "42703"` and retrying without it. `project_id` and `conversations.created_at` already exist on `origin/main` (shipped by `20260623000000_projects.sql` and the base conversations table) — no tolerance needed for those.
- **Tests:** `packages/shared` uses **Deno tests**, NOT vitest. Follow the repo: import `assertEquals` from `https://deno.land/std@0.224.0/assert/mod.ts`, write `Deno.test(...)`, and run `deno test packages/shared/src/<file>.test.ts`. NOTE: CI (`.github/workflows/unit.yml`) does NOT currently gate `packages/shared/` — so "shared tests green" is a LOCAL run, not a CI gate. Web pages have no test harness; verify them with `npm run build` (in `apps/web`) + manual preview.
- **Style:** Follow existing file conventions — client components, `.acct-menu` / `.row-menu` popovers, the `getCached`/`setCached` seed-then-revalidate pattern, `<SkeletonRows>` loading, plain-English UI copy, and honest "Soon"/limit states (NEVER fake a feature). Immutable state updates (spread, `.map`, never mutate).
- **Commits:** Conventional format (`feat:` / `fix:`), at least one commit per task.

---

## File Structure

**New files:**
- `packages/shared/src/report-title.ts` — pure `displayReportTitle(raw)` (Task 1)
- `packages/shared/src/report-title.test.ts` — its Deno tests (Task 1)
- `packages/shared/src/relative-time.ts` — pure `timeUntil(iso)` (Task 6)
- `packages/shared/src/relative-time.test.ts` — its Deno tests (Task 6)
- `supabase/migrations/20260703120000_projects_instructions.sql` — instructions column + updated_at trigger (Task 2)
- `apps/web/app/app/scheduled/page.tsx` — the merged Scheduled surface (Task 6)
- `apps/web/lib/data-sources.ts` — the honest data-source registry (Task 8)
- `apps/web/components/DataSourcesPanel.tsx` — the modal panel (Task 8)

**Modified files:**
- `apps/web/lib/api.ts` — `fetchProject`, `updateProject`, `createConversation(projectId?)`, `ProjectChat.created_at`, `Project.instructions`, `fetchConversations` project_id (Tasks 1, 5)
- `packages/shared/src/index.ts` — barrel exports for the two new shared modules (Tasks 1, 6)
- `apps/web/app/app/projects/[id]/page.tsx` — the workspace rebuild (Task 3)
- `apps/web/app/app/ask/page.tsx` — project awareness + Data sources menu item (Tasks 4, 8)
- `apps/web/components/AppShell.tsx` — sidebar quick-add + Scheduled nav entry (Tasks 5, 6)
- `apps/web/app/app/reports/page.tsx` — the Library upgrade (Task 7)
- `apps/web/components/icons.tsx` — add a `clock` icon (Task 6)
- `apps/web/components/SettingsSurface.tsx` — a Data sources entry in About (Task 8)

---

## Task 1: Branch + Projects API foundations + report-title helper

**Files:**
- Create branch: `feat/workspace-parity` off `origin/main`
- Create: `packages/shared/src/report-title.ts`
- Create: `packages/shared/src/report-title.test.ts`
- Modify: `packages/shared/src/index.ts` (add barrel export)
- Modify: `apps/web/lib/api.ts` (add `fetchProject`, `updateProject`; extend `createConversation`; extend `Project` + `ProjectChat` types; extend `fetchProjectContents` chats select)

**Interfaces:**
- Consumes: existing `api.ts` helpers `isObj`, `rows`, `isPreviewMode`, `isMissingRelation`, `supabase`, and the existing `Project` / `ProjectChat` / `ProjectContents` / `ProjectItemKind` types.
- Produces (used verbatim by later tasks):
  - `Project` interface gains `instructions?: string | null` (OPTIONAL — `fetchProjects` selects only `id,name,description,created_at` and must keep compiling).
  - `ProjectChat` interface gains `created_at?: string` (OPTIONAL — `fetchUnassignedItems`'s existing mapper omits it and must keep compiling).
  - `fetchProject(id: string): Promise<Project | null>` — single project, `instructions` included when the column exists, `null` when it doesn't (42703-tolerant).
  - `updateProject(id: string, patch: { name?: string; description?: string | null; instructions?: string | null }): Promise<void>`
  - `createConversation(title: string, projectId?: string | null): Promise<string | null>` — sets `project_id` when passed.
  - `displayReportTitle(raw: string): string` from `@nemesis/shared`.

- [ ] **Step 1: Create the branch off origin/main**

```bash
git fetch origin
git switch -c feat/workspace-parity origin/main
git branch --show-current
```

Expected: prints `feat/workspace-parity`.

- [ ] **Step 2: Write the failing test for `displayReportTitle`**

Create `packages/shared/src/report-title.test.ts`. The research flow appends a scoping suffix as `\n\nFocus: <clauses>` to the question before it becomes the saved report title (verified at `apps/web/app/app/ask/page.tsx:746`: ``const enriched = ... `${state.question}\n\nFocus: ${parts.join("; ")}` ...``). `displayReportTitle` strips that suffix, collapses whitespace, uppercases the first letter, and truncates to 90 chars with an ellipsis.

```typescript
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { displayReportTitle } from "./report-title.ts";

Deno.test("report-title: strips the trailing Focus: scoping suffix", () => {
  assertEquals(
    displayReportTitle("does creatine help cognition\n\nFocus: older adults; memory"),
    "Does creatine help cognition",
  );
});

Deno.test("report-title: collapses internal + trailing whitespace", () => {
  assertEquals(displayReportTitle("  metformin   and\n\n\naging  "), "Metformin and aging");
});

Deno.test("report-title: uppercases the first letter", () => {
  assertEquals(displayReportTitle("is retatrutide effective"), "Is retatrutide effective");
});

Deno.test("report-title: leaves an already-capitalized title alone (aside from trim)", () => {
  assertEquals(displayReportTitle("GLP-1 evidence review"), "GLP-1 evidence review");
});

Deno.test("report-title: truncates past 90 chars with an ellipsis", () => {
  const long = "a".repeat(120);
  const out = displayReportTitle(long);
  assertEquals(out.length, 90);
  assertEquals(out.endsWith("…"), true);
  assertEquals(out.startsWith("A"), true); // first letter uppercased
});

Deno.test("report-title: empty input yields empty string (no crash)", () => {
  assertEquals(displayReportTitle(""), "");
  assertEquals(displayReportTitle("   "), "");
});

Deno.test("report-title: a Focus-only tail leaves a clean title", () => {
  assertEquals(displayReportTitle("semaglutide safety\nFocus: pregnancy"), "Semaglutide safety");
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `deno test packages/shared/src/report-title.test.ts`
Expected: FAIL — module `./report-title.ts` not found / `displayReportTitle` is not exported.

- [ ] **Step 4: Implement `displayReportTitle`**

Create `packages/shared/src/report-title.ts`:

```typescript
// Report title cleanup (Library / workspace surfaces). PURE. A saved research report's title is the
// raw prompt with a scoping suffix the Ask flow appends: "<question>\n\nFocus: <clauses>" (see
// apps/web/app/app/ask/page.tsx). For a clean library row we drop that suffix, normalize whitespace,
// uppercase the first letter, and cap the length. Display-only — never mutates the stored title.

const MAX = 90;

export function displayReportTitle(raw: string): string {
  if (!raw) return "";
  // Drop everything from the first "Focus:" scoping marker onward (it starts after a blank/newline).
  const withoutFocus = raw.replace(/\s*\n+\s*Focus:[\s\S]*$/i, "");
  // Collapse all runs of whitespace (incl. newlines) to single spaces, then trim.
  const collapsed = withoutFocus.replace(/\s+/g, " ").trim();
  if (!collapsed) return "";
  const capped = collapsed.length > MAX ? `${collapsed.slice(0, MAX - 1)}…` : collapsed;
  return capped.charAt(0).toUpperCase() + capped.slice(1);
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `deno test packages/shared/src/report-title.test.ts`
Expected: PASS (7 tests / 7 passed).

- [ ] **Step 6: Export the helper from the shared barrel**

In `packages/shared/src/index.ts`, add this line at the end of the file (after the last existing `export * from ...`):

```typescript
// Report title cleanup: strip the Ask flow's "\n\nFocus: …" scoping suffix, normalize + cap for the
// Library / workspace rows. PURE, display-only.
export * from "./report-title.ts";
```

- [ ] **Step 7: Extend the `Project` and `ProjectChat` types in api.ts**

In `apps/web/lib/api.ts`, find the current interfaces (near line 1172):

```typescript
export interface Project { id: string; name: string; description: string | null; created_at: string; }
export interface ProjectChat { id: string; title: string; }
```

Replace them with (both new fields OPTIONAL so the existing list mappers keep compiling):

```typescript
export interface Project { id: string; name: string; description: string | null; created_at: string; instructions?: string | null; }
export interface ProjectChat { id: string; title: string; created_at?: string; }
```

- [ ] **Step 8: Add `created_at` to `fetchProjectContents`'s chats select**

In `apps/web/lib/api.ts`, in `fetchProjectContents`, the chats query currently is:

```typescript
    supabase.from("conversations").select("id,title").eq("project_id", projectId).order("updated_at", { ascending: false }),
```

Replace with (add `created_at` to the select, and surface it in the mapper):

```typescript
    supabase.from("conversations").select("id,title,created_at").eq("project_id", projectId).order("updated_at", { ascending: false }),
```

Then update the chats mapper inside that function's return object from:

```typescript
    chats: rows(c.data, (x) => (typeof x.id === "string" ? ({ id: x.id, title: typeof x.title === "string" ? x.title : "Untitled" } as ProjectChat) : null)),
```

to:

```typescript
    chats: rows(c.data, (x) => (typeof x.id === "string" ? ({ id: x.id, title: typeof x.title === "string" ? x.title : "Untitled", created_at: typeof x.created_at === "string" ? x.created_at : undefined } as ProjectChat) : null)),
```

(Leave `fetchUnassignedItems`'s chats select/mapper unchanged — it doesn't need the date.)

- [ ] **Step 9: Add `fetchProject` and `updateProject` to api.ts**

In `apps/web/lib/api.ts`, immediately AFTER the existing `createProject` function (which ends with the `deleteProject` declaration following it), insert these two functions. `fetchProject` is `42703`-tolerant so it works before the Task 2 migration is applied:

```typescript
/** One project by id (RLS-scoped). Includes `instructions` when the column exists; before the
 *  20260703120000 migration is applied that column is absent (Postgres 42703, a PostgREST 400 — NOT the
 *  PGRST205 that isMissingRelation catches), so we retry with the base columns and return instructions:null.
 *  Returns null if the project isn't found or the table itself is absent (pre-Projects deploy). */
export async function fetchProject(id: string): Promise<Project | null> {
  if (isPreviewMode) return null;
  const withInstr = await supabase
    .from("projects").select("id,name,description,created_at,instructions").eq("id", id).maybeSingle();
  if (!withInstr.error) {
    const d = withInstr.data;
    return d && typeof d.id === "string"
      ? { id: d.id, name: String(d.name ?? ""), description: (d.description as string) ?? null, created_at: (d.created_at as string) ?? "", instructions: (d.instructions as string) ?? null }
      : null;
  }
  // Missing table → treat as "no project" (pre-Projects deploy). Missing column (42703) → retry base.
  if (isMissingRelation(withInstr.error)) return null;
  const base = await supabase
    .from("projects").select("id,name,description,created_at").eq("id", id).maybeSingle();
  if (base.error || !base.data || typeof base.data.id !== "string") return null;
  const d = base.data;
  return { id: d.id, name: String(d.name ?? ""), description: (d.description as string) ?? null, created_at: (d.created_at as string) ?? "", instructions: null };
}

/** Update a project's editable fields (RLS-scoped). Only the provided keys are written. `instructions`
 *  writes only when the column exists; before the migration it fails silently (best-effort, so the rest
 *  of the save — name/description — still lands). */
export async function updateProject(id: string, patch: { name?: string; description?: string | null; instructions?: string | null }): Promise<void> {
  if (isPreviewMode) return;
  // Split so a missing `instructions` column (pre-migration 42703) can't fail the name/description write.
  const base: Record<string, unknown> = {};
  if (patch.name !== undefined) base.name = patch.name.trim().slice(0, 200);
  if (patch.description !== undefined) base.description = patch.description;
  if (Object.keys(base).length) {
    const { error } = await supabase.from("projects").update(base).eq("id", id);
    if (error) throw new Error(`update project failed: ${error.message}`);
  }
  if (patch.instructions !== undefined) {
    const { error } = await supabase.from("projects").update({ instructions: patch.instructions }).eq("id", id);
    // Swallow ONLY the pre-migration column-missing case; surface anything else.
    if (error && error.code !== "42703") throw new Error(`update project failed: ${error.message}`);
  }
}
```

- [ ] **Step 10: Extend `createConversation` to accept an optional projectId**

In `apps/web/lib/api.ts`, replace the current `createConversation` (line ~591):

```typescript
/** Create a chat (title = first question, trimmed); returns its id. */
export async function createConversation(title: string): Promise<string | null> {
  if (isPreviewMode) return null;
  const { data: sess } = await supabase.auth.getSession();
  const userId = sess.session?.user.id;
  if (!userId) throw new Error("Sign in to save chats");
  const clean = title.trim().slice(0, 120) || "New chat";
  const { data, error } = await supabase
    .from("conversations")
    .insert({ user_id: userId, title: clean })
    .select("id")
    .single();
  if (error) throw new Error(`create chat failed: ${error.message}`);
  return isObj(data) && typeof data.id === "string" ? data.id : null;
}
```

with (adds the optional `projectId`; `project_id` already exists on `conversations` from the shipped Projects migration, so no tolerance needed):

```typescript
/** Create a chat (title = first question, trimmed); returns its id. Pass `projectId` to file the new
 *  chat directly into a project workspace (used by the project→Ask "New chat in {name}" flow). */
export async function createConversation(title: string, projectId?: string | null): Promise<string | null> {
  if (isPreviewMode) return null;
  const { data: sess } = await supabase.auth.getSession();
  const userId = sess.session?.user.id;
  if (!userId) throw new Error("Sign in to save chats");
  const clean = title.trim().slice(0, 120) || "New chat";
  const row: Record<string, unknown> = { user_id: userId, title: clean };
  if (projectId) row.project_id = projectId;
  const { data, error } = await supabase
    .from("conversations")
    .insert(row)
    .select("id")
    .single();
  if (error) throw new Error(`create chat failed: ${error.message}`);
  return isObj(data) && typeof data.id === "string" ? data.id : null;
}
```

- [ ] **Step 11: Build the web app to confirm the api changes compile**

Run: `cd apps/web && npm run build`
Expected: build succeeds (no TypeScript errors). The optional new fields keep existing callers (`fetchProjects`, `fetchUnassignedItems`, existing `createConversation(q)` calls) valid.

- [ ] **Step 12: Commit**

```bash
git add packages/shared/src/report-title.ts packages/shared/src/report-title.test.ts packages/shared/src/index.ts apps/web/lib/api.ts
git commit -m "feat: projects API foundations (fetchProject/updateProject, createConversation projectId) + displayReportTitle helper"
```

---

## Task 2: Migration — projects.instructions + updated_at trigger (owner-gated apply)

**Files:**
- Create: `supabase/migrations/20260703120000_projects_instructions.sql`

**Interfaces:**
- Consumes: the existing `projects` table (`20260623000000_projects.sql`) and the existing trigger function `core_sources_set_updated_at()` (used by the conversations trigger in `20260607001303_conversations.sql`).
- Produces: a nullable `projects.instructions text` column and a `BEFORE UPDATE` trigger that bumps `projects.updated_at`. The apply is OWNER-GATED; client code (Task 1) already degrades when the column is absent, so the web app can ship before this runs.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260703120000_projects_instructions.sql`. This mirrors the conversations trigger pattern (verified in `supabase/migrations/20260607001303_conversations.sql`, which uses `EXECUTE FUNCTION core_sources_set_updated_at()`), and is additive + idempotent:

```sql
-- 20260703 — Project instructions + updated_at bump. ADDITIVE + NON-DESTRUCTIVE.
--
-- Adds a per-project `instructions` field (ChatGPT-Projects-style custom context the user sets for how
-- PharmaOrb should approach questions in that workspace) and an updated_at bump trigger so editing a
-- project's name/description/instructions advances its updated_at (the base 20260623 table has the column
-- but no trigger). Reuses the shared core_sources_set_updated_at() trigger function that conversations,
-- core_sources, etc. already use, so behavior is identical across tables.

alter table public.projects add column if not exists instructions text;

-- Idempotent: drop-then-create so a re-run doesn't error on an existing trigger.
drop trigger if exists projects_updated_at_trigger on public.projects;
create trigger projects_updated_at_trigger
  before update on public.projects
  for each row execute function core_sources_set_updated_at();
```

- [ ] **Step 2: Verify the migration is syntactically well-formed (offline check)**

There is no local Postgres in this plan's scope; do a static read-through instead. Confirm:
- The file name sorts AFTER `20260623000000_projects.sql` (so `projects` already exists when this runs). `20260703120000` > `20260623000000` ✓.
- `add column if not exists` and `drop trigger if exists` make it idempotent.
- `core_sources_set_updated_at` is defined by an existing migration (grep to confirm it exists):

Run: `git grep -n "CREATE OR REPLACE FUNCTION core_sources_set_updated_at" -- 'supabase/migrations/**'`
Expected: the definition is found in `supabase/migrations/0101_core_sources.sql` (and is reused by the conversations, saved_reports, etc. triggers).

- [ ] **Step 3: Commit (apply stays owner-gated)**

```bash
git add supabase/migrations/20260703120000_projects_instructions.sql
git commit -m "feat: migration for projects.instructions + updated_at trigger (apply is owner-gated)"
```

> **OWNER GATE:** Do NOT run `supabase db push` or apply this in the dashboard as part of implementation. The web app degrades gracefully without it (Task 1 `fetchProject`/`updateProject` are `42703`-tolerant). Flag to the owner that once the web branch is live, applying this migration is what turns on saved project instructions.

---

## Task 3: Project workspace page rebuild

**Files:**
- Modify: `apps/web/app/app/projects/[id]/page.tsx` (full rebuild of the detail page)

**Interfaces:**
- Consumes: `fetchProject` (Task 1), `fetchProjectContents`, `fetchUnassignedItems`, `setItemProject`, `deleteProject`, `updateProject` (Task 1), types `Project` / `ProjectContents` / `ProjectItemKind` (Task 1); `setCached` from `@/lib/cache`; `displayReportTitle` from `@nemesis/shared`; `Orb`, `Icon`, `SkeletonRows`.
- Produces: writes `setCached("ask-project-prefill", { projectId, question })` — the key + shape Task 4 reads on the Ask page. Consumes NOTHING back from Task 4.

**Design:** ChatGPT-project style — a title header, a "New chat in {name}" composer box, tabs Chats | Reports | Monitoring (keeping the existing Section add/remove picker logic), chat cards showing title + created date, and a settings (⋯) menu opening a modal with rename / description / instructions / delete. Loads the project via `fetchProject(id)` (not the old client-side filter).

- [ ] **Step 1: Rebuild the page — full file**

Replace the entire contents of `apps/web/app/app/projects/[id]/page.tsx` with:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  deleteProject,
  fetchProject,
  fetchProjectContents,
  fetchUnassignedItems,
  setItemProject,
  updateProject,
  type Project,
  type ProjectContents,
  type ProjectItemKind,
} from "@/lib/api";
import { displayReportTitle } from "@nemesis/shared";
import { setCached } from "@/lib/cache";
import { Orb } from "@/components/Orb";
import { Icon } from "@/components/icons";
import { SkeletonRows } from "@/components/Skeleton";

const EMPTY: ProjectContents = { chats: [], reports: [], watches: [] };
type Tab = "conversation" | "report" | "watch";

// A project workspace (ChatGPT-Projects style): a "New chat in this project" composer, tabbed contents
// (Chats / Reports / Monitoring) with the inline add-from-unassigned picker + per-item remove, and a
// settings modal to rename / set description + instructions / delete. All reads/writes are RLS-scoped.
export default function ProjectWorkspacePage() {
  const params = useParams();
  const router = useRouter();
  const projectId = String(params?.id ?? "");
  const [project, setProject] = useState<Project | null>(null);
  const [contents, setContents] = useState<ProjectContents | null>(null);
  const [pool, setPool] = useState<ProjectContents>(EMPTY);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("conversation");
  const [openPicker, setOpenPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [newChat, setNewChat] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, c, unassigned] = await Promise.all([
        fetchProject(projectId),
        fetchProjectContents(projectId),
        fetchUnassignedItems(),
      ]);
      setProject(p);
      setContents(c);
      setPool(unassigned);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load this project.");
    }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  async function assign(kind: ProjectItemKind, id: string, into: string | null) {
    if (busy) return;
    setBusy(true);
    try {
      await setItemProject(kind, id, into);
      setOpenPicker(false);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn’t update the project.");
    } finally {
      setBusy(false);
    }
  }

  // "New chat in {name}": hand the typed question + this project to the Ask page via the in-memory
  // session cache (Task 4 reads it on mount), then navigate. Prefill only — Ask never auto-submits.
  function startChat() {
    const q = newChat.trim();
    if (!q) return;
    setCached("ask-project-prefill", { projectId, question: q });
    router.push("/app/ask");
  }

  const linkFor = (kind: ProjectItemKind, id: string) =>
    kind === "conversation" ? `/app/ask?c=${id}` : kind === "report" ? `/app/reports/${id}` : `/app/monitor/${id}`;

  const projName = project?.name ?? "Project";
  const items: Item[] = contents
    ? tab === "conversation"
      ? contents.chats.map((c) => ({ id: c.id, title: c.title, meta: c.created_at ? shortDate(c.created_at) : undefined }))
      : tab === "report"
      ? contents.reports.map((r) => ({ id: r.id, title: displayReportTitle(r.title), meta: `${r.citation_count} sources` }))
      : contents.watches.map((w) => ({ id: w.id, title: w.title, meta: w.cadence }))
    : [];
  const poolItems: Item[] = tab === "conversation"
    ? pool.chats.map((c) => ({ id: c.id, title: c.title }))
    : tab === "report"
    ? pool.reports.map((r) => ({ id: r.id, title: displayReportTitle(r.title) }))
    : pool.watches.map((w) => ({ id: w.id, title: w.title }));
  const kind: ProjectItemKind = tab;
  const heading = tab === "conversation" ? "Chats" : tab === "report" ? "Reports" : "Monitoring";

  return (
    <div className="research-wrap">
      <div className="research-intro">
        <Orb size={48} />
        <Link href="/app/projects" className="proj-back">‹ All projects</Link>
        <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
          <h2 className="welcome-title" style={{ margin: 0 }}>{projName}</h2>
          <button type="button" className="proj-add-btn" aria-haspopup="dialog" onClick={() => setSettingsOpen(true)} title="Project settings">
            <Icon name="settings" size={15} />
          </button>
        </div>
        {project?.description ? <p className="welcome-sub">{project.description}</p> : null}
      </div>

      {/* New chat in this project */}
      <div className="watch-add">
        <Icon name="message" size={16} />
        <input
          className="watch-add-input"
          value={newChat}
          onChange={(e) => setNewChat(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") startChat(); }}
          placeholder={`New chat in ${projName}…`}
          aria-label={`New chat in ${projName}`}
        />
        <button type="button" className="mode watch-add-btn" onClick={startChat} disabled={!newChat.trim()}>Start</button>
      </div>

      {err ? <p className="tmpl-note">{err}</p> : null}
      {contents === null && !err ? <SkeletonRows count={3} label="Loading the project…" /> : null}

      {contents ? (
        <>
          {/* Tabs */}
          <div className="chip-row" role="tablist" aria-label="Project contents">
            {(["conversation", "report", "watch"] as Tab[]).map((t) => {
              const label = t === "conversation" ? "Chats" : t === "report" ? "Reports" : "Monitoring";
              const count = t === "conversation" ? contents.chats.length : t === "report" ? contents.reports.length : contents.watches.length;
              return (
                <button key={t} type="button" role="tab" aria-selected={tab === t}
                  className={`chip-action${tab === t ? " active" : ""}`}
                  onClick={() => { setTab(t); setOpenPicker(false); }}>
                  {label} <small>{count}</small>
                </button>
              );
            })}
          </div>

          <section className="proj-section">
            <div className="proj-section-head">
              <h3><Icon name={tab === "conversation" ? "message" : tab === "report" ? "doc" : "bell"} size={14} /> {heading} <small>{items.length}</small></h3>
              <button type="button" className="proj-add-btn" onClick={() => setOpenPicker((o) => !o)} disabled={busy}>
                {openPicker ? "Close" : "+ Add"}
              </button>
            </div>

            {openPicker ? (
              <div className="proj-picker">
                {poolItems.length === 0 ? (
                  <p className="proj-empty">Nothing unassigned to add.</p>
                ) : (
                  poolItems.map((it) => (
                    <button key={it.id} type="button" className="proj-pick-row" disabled={busy}
                      onClick={() => assign(kind, it.id, projectId)} title={it.title}>
                      <span className="proj-pick-title">{it.title}</span>
                      <span className="proj-pick-add">Add</span>
                    </button>
                  ))
                )}
              </div>
            ) : null}

            {items.length === 0 ? (
              <p className="proj-empty">No {heading.toLowerCase()} in this project yet.</p>
            ) : (
              <div className="watch-card-list">
                {items.map((it) => (
                  <div key={it.id} className="watch-card proj-item">
                    <Link href={linkFor(kind, it.id)} className="proj-item-link" title={it.title}>
                      <span className="watch-card-main">
                        <span className="watch-card-title">{it.title}</span>
                        {it.meta ? <span className="watch-card-meta">{it.meta}</span> : null}
                      </span>
                    </Link>
                    <button type="button" className="proj-remove" disabled={busy}
                      onClick={() => assign(kind, it.id, null)} title="Remove from project">Remove</button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}

      {settingsOpen && project ? (
        <ProjectSettings
          project={project}
          onClose={() => setSettingsOpen(false)}
          onSaved={(next) => { setProject(next); setSettingsOpen(false); }}
          onDeleted={() => { setSettingsOpen(false); router.push("/app/projects"); }}
        />
      ) : null}
    </div>
  );
}

interface Item { id: string; title: string; meta?: string }

function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Settings modal: rename, description, per-project instructions, delete. Instructions persist only once
// the 20260703120000 migration is applied (updateProject swallows the pre-migration column-missing case),
// so the field is always editable but silently no-ops until then — honest, no error.
function ProjectSettings({ project, onClose, onSaved, onDeleted }: {
  project: Project;
  onClose: () => void;
  onSaved: (next: Project) => void;
  onDeleted: () => void;
}) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? "");
  const [instructions, setInstructions] = useState(project.instructions ?? "");
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    if (saving || !name.trim()) return;
    setSaving(true);
    setErr(null);
    try {
      await updateProject(project.id, { name: name.trim(), description: description.trim() || null, instructions: instructions.trim() || null });
      onSaved({ ...project, name: name.trim(), description: description.trim() || null, instructions: instructions.trim() || null });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn’t save.");
    } finally {
      setSaving(false);
    }
  }

  async function del() {
    setSaving(true);
    try {
      await deleteProject(project.id);
      onDeleted();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn’t delete this project.");
      setSaving(false);
    }
  }

  return (
    <div className="confirm-overlay" role="presentation" onClick={onClose}>
      <div className="confirm-card" role="dialog" aria-modal="true" aria-label="Project settings" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460, textAlign: "left" }}>
        <h3 className="confirm-title">Project settings</h3>
        <label className="menu-label" htmlFor="proj-name">Name</label>
        <input id="proj-name" className="watch-add-input" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} />
        <label className="menu-label" htmlFor="proj-desc" style={{ marginTop: 10 }}>Description</label>
        <input id="proj-desc" className="watch-add-input" value={description} maxLength={300} onChange={(e) => setDescription(e.target.value)} placeholder="Optional — what this workspace is for" />
        <label className="menu-label" htmlFor="proj-instr" style={{ marginTop: 10 }}>Instructions</label>
        <textarea id="proj-instr" className="watch-add-input" value={instructions} maxLength={1000} rows={3}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder="Set context for how PharmaOrb approaches questions in this project" />
        {err ? <p className="tmpl-note">{err}</p> : null}
        <div className="confirm-actions" style={{ marginTop: 14, justifyContent: "space-between" }}>
          <button type="button" className="confirm-del" onClick={() => setConfirmDel(true)} disabled={saving}>Delete project</button>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="confirm-cancel" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="button" className="mode" onClick={() => void save()} disabled={saving || !name.trim()}>{saving ? "Saving…" : "Save"}</button>
          </div>
        </div>
        {confirmDel ? (
          <div style={{ marginTop: 12, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
            <p className="confirm-body">Delete “{project.name}”? Its chats, reports, and watches are kept — they just leave this project.</p>
            <div className="confirm-actions">
              <button type="button" className="confirm-cancel" onClick={() => setConfirmDel(false)} disabled={saving}>Keep</button>
              <button type="button" className="confirm-del" onClick={() => void del()} disabled={saving}>Delete</button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build to confirm the page compiles**

Run: `cd apps/web && npm run build`
Expected: build succeeds. `displayReportTitle`, `fetchProject`, `updateProject` resolve; the removed old `Section`/`useParams`-filter code is gone.

- [ ] **Step 3: Manual preview check**

Start the app (`cd apps/web && npm run dev`), open an existing project at `/app/projects/<id>`:
- Title header shows the project name + a gear button.
- "New chat in {name}…" box: typing a question + Start navigates to `/app/ask` (Task 4 wires the chip; here just confirm navigation happens).
- Tabs Chats / Reports / Monitoring switch the list; counts render.
- Report rows show cleaned titles (no `Focus:` tail).
- Gear → modal: rename saves and updates the header; delete asks to confirm then returns to `/app/projects`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/app/projects/[id]/page.tsx
git commit -m "feat(web): ChatGPT-style project workspace — new-chat composer, tabs, settings modal"
```

---

## Task 4: Ask page project awareness

**Files:**
- Modify: `apps/web/app/app/ask/page.tsx` (read the prefill, add a project chip, thread `projectId` through create + augment `askQuestion` only)

**Interfaces:**
- Consumes: `getCached<{ projectId: string; question: string }>("ask-project-prefill")` written by Task 3; `fetchProject` (Task 1); `createConversation(title, projectId)` (Task 1).
- Produces: nothing consumed by later tasks.

**Design:** On mount, read `ask-project-prefill`; if present, store `projectId` in state, prefill the composer (NEVER auto-submit — matches the existing `?q=` convention), show a small "in {name} — ✕" chip, load the project to get its `name` + `instructions`. Thread `projectId` into `ensureConversation`'s `createConversation`. For plain `askQuestion` calls only, prepend the instructions to the OUTGOING question string (never to `text`, `persistTurn`, `autoDepth`, or the on-screen turn). Deep/discovery/lab_draft runs pass the question unchanged (kept out of scope).

- [ ] **Step 1: Add the cache import and project state**

In `apps/web/app/app/ask/page.tsx`, the import on line 19 is:

```typescript
import { setCached } from "@/lib/cache";
```

Replace it with:

```typescript
import { getCached, setCached } from "@/lib/cache";
```

Add `fetchProject` to the existing `@/lib/api` import (line 9) — append it to the destructured list, e.g. after `fetchConversationTurns`:

```typescript
import { askQuestion, createConversation, fetchConversationTurns, fetchProject, fetchResearchReport, fetchResearchRun, fetchUsage, planResearchPreview, saveResearchTurn, saveTurn, scopeResearch, startResearch, type AskQuotaError, type ResearchRunRow, type SavedResearchCard } from "@/lib/api";
```

Then, inside `function AskPage()`, after the existing `const [question, setQuestion] = useState("");` (line 90), add:

```typescript
  // Project context (ChatGPT-Projects): a chat started from a project workspace carries its projectId
  // (so the new conversation is filed into it) and the project's user-set instructions (prepended to
  // the OUTGOING question for plain Ask calls only — never shown in the transcript, never to autoDepth,
  // never to saved history, and never to report runs). Read once from the session cache on mount.
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState<string>("");
  const [projectInstructions, setProjectInstructions] = useState<string>("");
```

- [ ] **Step 2: Read the prefill on mount**

In `apps/web/app/app/ask/page.tsx`, add this effect right AFTER the existing `?q=` prefill effect (the one ending at line 165 with `}, [qParam, cParam, router]);`):

```typescript
  // Consume a project→Ask handoff written by the project workspace ("New chat in {name}"). Prefill the
  // box (never auto-submit — same as ?q=), remember the project so the new chat is filed into it, and
  // load the project to get its display name + instructions. Applied once, then the cache key is cleared
  // so a later unrelated new chat isn't wrongly tagged to the project.
  const appliedProjectRef = useRef(false);
  useEffect(() => {
    if (appliedProjectRef.current || cParam) return; // only on a fresh (no ?c=) chat
    const seed = getCached<{ projectId: string; question: string }>("ask-project-prefill");
    if (!seed || !seed.projectId) return;
    appliedProjectRef.current = true;
    setCached("ask-project-prefill", undefined); // consume it (one-shot)
    setProjectId(seed.projectId);
    if (seed.question) setQuestion(seed.question);
    void fetchProject(seed.projectId).then((p) => {
      if (p) { setProjectName(p.name); setProjectInstructions(p.instructions ?? ""); }
    }).catch(() => {});
  }, [cParam]);
```

- [ ] **Step 3: Thread `projectId` into `ensureConversation`**

In `apps/web/app/app/ask/page.tsx`, `ensureConversation` (line 172) currently calls:

```typescript
    if (!creatingConvRef.current) creatingConvRef.current = createConversation(q).catch(() => null);
```

Replace with (pass the project, and add `projectId` to the deps):

```typescript
    if (!creatingConvRef.current) creatingConvRef.current = createConversation(q, projectId).catch(() => null);
```

And change the `useCallback` dependency array on line 186 from:

```typescript
  }, [conversationId, router, bumpChats]);
```

to:

```typescript
  }, [conversationId, router, bumpChats, projectId]);
```

- [ ] **Step 4: Augment ONLY the `askQuestion` argument with instructions**

In `apps/web/app/app/ask/page.tsx`, inside `submit()`, the plain-ask branch (line 357-358) is:

```typescript
      const askMode: AskMode = mode === "thorough" ? "thorough" : mode === "auto" ? autoDepth(text) : "fast";
      const res = await askQuestion(text, askMode);
```

Replace with (build an augmented string used ONLY for the API call; `text` and `autoDepth(text)` stay untouched so depth classification, the on-screen turn, and saved history all use the clean question):

```typescript
      const askMode: AskMode = mode === "thorough" ? "thorough" : mode === "auto" ? autoDepth(text) : "fast";
      // Ride the project's user-set instructions into the question the engine sees — the frozen /ask fn
      // is untouched; the safety scan still sees everything. Never applied to `text` (transcript, saved
      // history) or autoDepth (depth classification) above. Report runs (deep/discovery) are excluded.
      const outgoing = projectInstructions.trim()
        ? `Project context (user-set): ${projectInstructions.trim().slice(0, 500)}\n\nQuestion: ${text}`
        : text;
      const res = await askQuestion(outgoing, askMode);
```

- [ ] **Step 5: Render the project chip above the composer**

In `apps/web/app/app/ask/page.tsx`, the `composer` const is built at line 378. Replace the `const composer = (...)` block (lines 378-385) with a version that wraps a chip above the `<Composer/>`:

```typescript
  const composer = (
    <>
      {projectId ? (
        <div className="chip-row" style={{ justifyContent: "center", marginBottom: 6 }}>
          <span className="chip-action" style={{ cursor: "default" }}>
            <Icon name="folder" size={14} />
            in {projectName || "project"}
            <button type="button" aria-label="Leave project context" title="Leave project context"
              style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", padding: "0 0 0 4px" }}
              onClick={() => { setProjectId(null); setProjectInstructions(""); setProjectName(""); }}>✕</button>
          </span>
        </div>
      ) : null}
      <Composer
        question={question} setQuestion={setQuestion} taRef={taRef} autoGrow={autoGrow}
        submit={submit} busy={busy} mode={mode} setMode={setMode}
        modeOpen={modeOpen} setModeOpen={setModeOpen} error={latest?.err ?? null}
        welcome={!hasThread}
      />
    </>
  );
```

- [ ] **Step 6: Build to confirm compilation**

Run: `cd apps/web && npm run build`
Expected: build succeeds. `getCached`, `fetchProject`, the new state, and the chip all type-check.

- [ ] **Step 7: Manual preview check**

- From a project workspace (Task 3), type a question + Start → lands on `/app/ask` with the box prefilled and a "in {name} ✕" chip; NOT auto-submitted.
- Send the question → the new chat appears in the rail; verify (via the project page or DB) the conversation's `project_id` is the project.
- The ✕ clears the chip and future sends are un-tagged.
- Instructions (if the migration is applied) do NOT appear in the on-screen question bubble.

- [ ] **Step 8: Commit**

```bash
git add apps/web/app/app/ask/page.tsx
git commit -m "feat(web): Ask page project awareness — prefill chip, filed conversation, instructions ride into the question"
```

---

## Task 5: Sidebar quick-add to project

**Files:**
- Modify: `apps/web/lib/api.ts` (add `project_id` to `ConversationSummary` + `fetchConversations` select)
- Modify: `apps/web/components/AppShell.tsx` (replace the disabled "Add to project → Soon" button with a working inline submenu)

**Interfaces:**
- Consumes: `fetchProjects` (existing), `setItemProject("conversation", chatId, projectId | null)` (existing), and the extended `ConversationSummary.project_id`.
- Produces: nothing consumed by later tasks.

**Design:** In the per-chat ⋯ `row-menu`, replace the disabled "Add to project" button with a working one. On click, swap the menu's contents to a project list (lazy `fetchProjects()` on first open) — an INLINE content swap, NOT a nested flyout (the fixed-position `row-menu` makes a flyout fiddly). Show "Remove from project" when the chat is already assigned. Reuse the existing `.row-menu` styling.

- [ ] **Step 1: Add `project_id` to `ConversationSummary` and its fetch**

In `apps/web/lib/api.ts`, the `ConversationSummary` interface (line ~545) is:

```typescript
export interface ConversationSummary {
  id: string;
  title: string;
  updated_at: string;
  pinned: boolean;
}
```

Replace with:

```typescript
export interface ConversationSummary {
  id: string;
  title: string;
  updated_at: string;
  pinned: boolean;
  project_id: string | null;
}
```

In `fetchConversations` (line ~574), change the select from:

```typescript
    .select("id,title,updated_at,pinned")
```

to:

```typescript
    .select("id,title,updated_at,pinned,project_id")
```

and the mapper return from:

```typescript
      ? { id: r.id, title: r.title, updated_at: String(r.updated_at ?? ""), pinned: r.pinned === true }
```

to:

```typescript
      ? { id: r.id, title: r.title, updated_at: String(r.updated_at ?? ""), pinned: r.pinned === true, project_id: typeof r.project_id === "string" ? r.project_id : null }
```

- [ ] **Step 2: Add project-submenu state + imports to AppShell**

In `apps/web/components/AppShell.tsx`, the api import (line 9) is:

```typescript
import { deleteConversation, fetchConversations, fetchEntitlements, fetchUsage, pinConversation, renameConversation, type ConversationSummary } from "@/lib/api";
```

Replace with (add `fetchProjects`, `setItemProject`, `type Project`):

```typescript
import { deleteConversation, fetchConversations, fetchEntitlements, fetchProjects, fetchUsage, pinConversation, renameConversation, setItemProject, type ConversationSummary, type Project } from "@/lib/api";
```

Then, near the other row-menu state (after `const [rowMenu, setRowMenu] = useState<{ id: string; x: number; y: number } | null>(null);` on line 99), add:

```typescript
  // The per-chat ⋯ menu can swap into a "pick a project" list in place (no nested flyout). `projMenuFor`
  // is the chat id whose project picker is showing; `projects` is lazily loaded on first open.
  const [projMenuFor, setProjMenuFor] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[] | null>(null);
```

- [ ] **Step 3: Add the assign handler**

In `apps/web/components/AppShell.tsx`, after the existing `handlePinChat` useCallback (ends near line 158), add:

```typescript
  // Assign / unassign a chat to a project from the rail. Optimistically updates the row's project_id,
  // closes the menu, then resyncs from the server (matching handlePinChat's pattern).
  const handleAssignChat = useCallback(async (id: string, projectId: string | null) => {
    setChats((prev) => prev.map((c) => (c.id === id ? { ...c, project_id: projectId } : c)));
    setRowMenu(null);
    setProjMenuFor(null);
    try {
      await setItemProject("conversation", id, projectId);
    } catch {
      setChatsVersion((v) => v + 1); // resync from the server on failure
    }
  }, []);

  // Open the in-place project picker for a chat; lazy-load the project list the first time.
  const openProjMenu = useCallback((id: string) => {
    setProjMenuFor(id);
    if (projects === null) void fetchProjects().then(setProjects).catch(() => setProjects([]));
  }, [projects]);
```

- [ ] **Step 4: Reset the project submenu when the row menu closes**

In `apps/web/components/AppShell.tsx`, find the `setRowMenu(null)` calls in the row-menu effect (the outside-click / escape handler around line 264-279) and wherever the menu is dismissed. To keep it simple and robust, in the existing effect that closes `rowMenu` on outside click, ALSO clear `projMenuFor`. Locate the effect starting `if (!rowMenu) return;` (line 264) and inside its cleanup/close path add `setProjMenuFor(null);` next to the `setRowMenu(null)` it calls. If the effect closes via a handler like `const close = () => setRowMenu(null);`, change it to:

```typescript
    const close = () => { setRowMenu(null); setProjMenuFor(null); };
```

(If the effect already inlines `setRowMenu(null)` in a listener, add `setProjMenuFor(null);` immediately after each occurrence within that effect.)

- [ ] **Step 5: Replace the disabled "Add to project" button with the working submenu**

In `apps/web/components/AppShell.tsx`, the row-menu render (the IIFE at line 495) currently contains this disabled button (line 506-507):

```tsx
              {/* Add to project waits on Projects (not built yet) — shown honestly as disabled "Soon". */}
              <button role="menuitem" disabled><Icon name="folder" size={15} />Add to project<small>Soon</small></button>
```

Replace the whole `row-menu` inner block. The current block is:

```tsx
            <div className="row-menu" role="menu" style={{ left: rowMenu.x, top: rowMenu.y }}>
              <button role="menuitem" onClick={() => { setRowMenu(null); setRenamingId(c.id); setRenameDraft(c.title); }}>
                <Icon name="pencil" size={15} />Rename
              </button>
              <button role="menuitem" onClick={() => { setRowMenu(null); void handlePinChat(c.id, !c.pinned); }}>
                <Icon name="pin" size={15} />{c.pinned ? "Unpin chat" : "Pin chat"}
              </button>
              {/* Add to project waits on Projects (not built yet) — shown honestly as disabled "Soon". */}
              <button role="menuitem" disabled><Icon name="folder" size={15} />Add to project<small>Soon</small></button>
              <div className="sep" />
              <button role="menuitem" className="danger" onClick={() => { setRowMenu(null); setConfirmDelete({ id: c.id, title: c.title }); }}>
                <Icon name="trash" size={15} />Delete chat
              </button>
            </div>
```

Replace it with (an in-place swap: default actions, or the project picker when `projMenuFor === c.id`):

```tsx
            <div className="row-menu" role="menu" style={{ left: rowMenu.x, top: rowMenu.y }}>
              {projMenuFor === c.id ? (
                <>
                  <button role="menuitem" onClick={() => setProjMenuFor(null)}>
                    <Icon name="chevron-down" size={15} style={{ transform: "rotate(90deg)" }} />Back
                  </button>
                  <div className="sep" />
                  {c.project_id ? (
                    <button role="menuitem" onClick={() => void handleAssignChat(c.id, null)}>
                      <Icon name="folder" size={15} />Remove from project
                    </button>
                  ) : null}
                  {projects === null ? (
                    <button role="menuitem" disabled><Icon name="folder" size={15} />Loading projects…</button>
                  ) : projects.length === 0 ? (
                    <button role="menuitem" disabled><Icon name="folder" size={15} />No projects yet</button>
                  ) : (
                    projects.map((p) => (
                      <button key={p.id} role="menuitem" disabled={p.id === c.project_id}
                        onClick={() => void handleAssignChat(c.id, p.id)} title={p.name}>
                        <Icon name={p.id === c.project_id ? "check" : "folder"} size={15} />{p.name}
                      </button>
                    ))
                  )}
                </>
              ) : (
                <>
                  <button role="menuitem" onClick={() => { setRowMenu(null); setRenamingId(c.id); setRenameDraft(c.title); }}>
                    <Icon name="pencil" size={15} />Rename
                  </button>
                  <button role="menuitem" onClick={() => { setRowMenu(null); void handlePinChat(c.id, !c.pinned); }}>
                    <Icon name="pin" size={15} />{c.pinned ? "Unpin chat" : "Pin chat"}
                  </button>
                  <button role="menuitem" onClick={() => openProjMenu(c.id)}>
                    <Icon name="folder" size={15} />{c.project_id ? "Move to project" : "Add to project"}
                  </button>
                  <div className="sep" />
                  <button role="menuitem" className="danger" onClick={() => { setRowMenu(null); setConfirmDelete({ id: c.id, title: c.title }); }}>
                    <Icon name="trash" size={15} />Delete chat
                  </button>
                </>
              )}
            </div>
```

- [ ] **Step 6: Build to confirm compilation**

Run: `cd apps/web && npm run build`
Expected: build succeeds. `fetchProjects`, `setItemProject`, `Project`, and the new state resolve.

- [ ] **Step 7: Manual preview check**

- Open a chat's ⋯ menu → "Add to project" swaps the menu to a project list; picking one closes the menu.
- Reopen the ⋯ menu → the button now reads "Move to project" and the picker shows a check on the current project plus a "Remove from project" row.
- Confirm on the project page (Task 3) that the chat now appears under Chats.

- [ ] **Step 8: Commit**

```bash
git add apps/web/lib/api.ts apps/web/components/AppShell.tsx
git commit -m "feat(web): sidebar quick-add chat to a project (in-place picker, remove when assigned)"
```

---

## Task 6: Scheduled page + relative-time helper + clock icon

**Files:**
- Create: `packages/shared/src/relative-time.ts`
- Create: `packages/shared/src/relative-time.test.ts`
- Modify: `packages/shared/src/index.ts` (barrel export)
- Modify: `apps/web/components/icons.tsx` (add a `clock` icon)
- Modify: `apps/web/components/AppShell.tsx` (add a "Scheduled" nav entry)
- Create: `apps/web/app/app/scheduled/page.tsx`

**Interfaces:**
- Consumes: `fetchMissions`, `createMission`, `setMissionStatus`, `deleteMission`, `fetchWatches`, `setWatchStatus` (all existing in `api.ts`); `type MissionSummary`, `type WatchSummary`; `cadenceLabel`, `type MissionCadence`, `type CreateMissionResult` (existing); `timeUntil` (new).
- Produces: `timeUntil(iso: string): string` from `@nemesis/shared`; a `clock` icon name in `icons.tsx`.

**Design:** A merged "Scheduled" surface listing missions (scheduled background research) and watches (evidence monitors) together. A composer at top to schedule a new mission (`report_mode: "meta"`), all `CreateMissionResult` error states mapped to friendly copy. Below, a static suggestion gallery of 4 template cards that fill the composer on click (never auto-create; the FDA one links to Monitoring instead). Free-plan users (mission limit 0) still see the gallery + composer; create returns the honest limit message.

- [ ] **Step 1: Write the failing test for `timeUntil`**

Create `packages/shared/src/relative-time.test.ts`:

```typescript
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { timeUntil } from "./relative-time.ts";

const NOW = new Date("2026-07-03T12:00:00Z");

Deno.test("relative-time: a couple of hours out reads 'in 2 h'", () => {
  assertEquals(timeUntil("2026-07-03T14:00:00Z", NOW), "in 2 h");
});

Deno.test("relative-time: a few days out reads 'in 3 d'", () => {
  assertEquals(timeUntil("2026-07-06T12:00:00Z", NOW), "in 3 d");
});

Deno.test("relative-time: under an hour rounds to minutes", () => {
  assertEquals(timeUntil("2026-07-03T12:45:00Z", NOW), "in 45 min");
});

Deno.test("relative-time: past or now reads 'due now'", () => {
  assertEquals(timeUntil("2026-07-03T12:00:00Z", NOW), "due now");
  assertEquals(timeUntil("2026-07-03T09:00:00Z", NOW), "due now");
});

Deno.test("relative-time: an invalid date is empty (no crash)", () => {
  assertEquals(timeUntil("not-a-date", NOW), "");
  assertEquals(timeUntil("", NOW), "");
});

Deno.test("relative-time: rounds hours down (1 h 59 m → 'in 1 h')", () => {
  assertEquals(timeUntil("2026-07-03T13:59:00Z", NOW), "in 1 h");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `deno test packages/shared/src/relative-time.test.ts`
Expected: FAIL — module `./relative-time.ts` not found.

- [ ] **Step 3: Implement `timeUntil`**

Create `packages/shared/src/relative-time.ts`:

```typescript
// Relative "time until" for the Scheduled surface ("in 2 h", "in 3 d", "due now"). PURE. `now` is
// injectable so it's deterministically testable. Rounds down within a unit (1 h 59 m → "in 1 h"), and
// a past/now/invalid instant reads "due now" (or "" for an unparseable string).

export function timeUntil(iso: string, now: Date = new Date()): string {
  if (!iso) return "";
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return "";
  const ms = target - now.getTime();
  if (ms <= 0) return "due now";
  const min = Math.floor(ms / 60000);
  if (min < 60) return `in ${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `in ${hr} h`;
  const day = Math.floor(hr / 24);
  return `in ${day} d`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `deno test packages/shared/src/relative-time.test.ts`
Expected: PASS (6 tests / 6 passed).

- [ ] **Step 5: Export from the shared barrel**

In `packages/shared/src/index.ts`, add at the end:

```typescript
// Relative "time until" ("in 2 h" / "in 3 d" / "due now") for the Scheduled surface. PURE.
export * from "./relative-time.ts";
```

- [ ] **Step 6: Add a `clock` icon**

In `apps/web/components/icons.tsx`, inside the `PATHS` record (after the `trash:` entry, before the closing `};`), add:

```typescript
  clock: (<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
```

- [ ] **Step 7: Add the "Scheduled" nav entry**

In `apps/web/components/AppShell.tsx`, the `workspace` array (line 39-48) currently lists Ask / Reports / Monitoring. Add a Scheduled entry after Monitoring:

```typescript
const workspace = [
  { href: "/app/ask", label: "Ask", icon: "message" as const },
  { href: "/app/reports", label: "Reports", icon: "doc" as const },
  { href: "/app/monitor", label: "Monitoring", icon: "bell" as const },
  { href: "/app/scheduled", label: "Scheduled", icon: "clock" as const },
];
```

Also add a title mapping in `titleForPath` (near line 53). After the `/app/monitor` line, add:

```typescript
  if (path.startsWith("/app/scheduled")) return { title: "Scheduled", sub: "recurring research + monitors" };
```

- [ ] **Step 8: Create the Scheduled page — full file**

Create `apps/web/app/app/scheduled/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createMission,
  deleteMission,
  fetchMissions,
  fetchWatches,
  setMissionStatus,
  setWatchStatus,
  type MissionSummary,
  type WatchSummary,
} from "@/lib/api";
import { cadenceLabel, timeUntil, type MissionCadence } from "@nemesis/shared";
import { getCached, setCached } from "@/lib/cache";
import { Orb } from "@/components/Orb";
import { Icon } from "@/components/icons";
import { SkeletonRows } from "@/components/Skeleton";

// A suggestion fills the composer (mission templates) or links to Monitoring (the watch template).
interface Suggestion { emoji: string; title: string; question: string; cadence: MissionCadence; kind: "mission" | "watch"; }
const SUGGESTIONS: Suggestion[] = [
  { emoji: "🧪", title: "Weekly retatrutide trial watch", question: "What is the latest clinical trial evidence for retatrutide?", cadence: "weekly", kind: "mission" },
  { emoji: "📚", title: "Monthly GLP-1 evidence review", question: "Summarize new evidence on GLP-1 receptor agonists for weight loss", cadence: "monthly", kind: "mission" },
  { emoji: "🔎", title: "Weekly creatine cognition update", question: "Is there new evidence that creatine improves cognition?", cadence: "weekly", kind: "mission" },
  { emoji: "🛡️", title: "Daily FDA safety recall check", question: "New FDA drug safety recalls", cadence: "daily", kind: "watch" },
];

const CREATE_ERROR: Record<string, string> = {
  not_enabled: "Missions aren’t enabled for your account yet.",
  limit: "You’ve used all your scheduled runs — upgrade your plan for more.",
  duplicate: "You’ve already scheduled this exact research.",
  auth: "Sign in to schedule research.",
  unknown: "Couldn’t schedule that — try again.",
};

// Scheduled: one surface for everything that runs on a timer — background research MISSIONS (scheduled
// deep-research → cited reports) and evidence WATCHES (monitors that alert on new studies). Compose a new
// mission up top; below, missions and watches list together with their next-run / last-checked timing.
export default function ScheduledPage() {
  const router = useRouter();
  const [missions, setMissions] = useState<MissionSummary[] | null>(() => getCached<MissionSummary[]>("scheduled-missions") ?? null);
  const [watches, setWatches] = useState<WatchSummary[] | null>(() => getCached<WatchSummary[]>("scheduled-watches") ?? null);
  const [err, setErr] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [cadence, setCadence] = useState<MissionCadence>("weekly");
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void fetchMissions().then((m) => { if (alive) { setMissions(m); setCached("scheduled-missions", m); } }).catch((e) => { if (alive) setErr(e instanceof Error ? e.message : "Could not load scheduled research."); });
    void fetchWatches().then((w) => { if (alive) { setWatches(w); setCached("scheduled-watches", w); } }).catch(() => {});
    return () => { alive = false; };
  }, []);

  async function schedule() {
    const q = question.trim();
    if (!q || creating) return;
    setCreating(true);
    setNotice(null);
    setErr(null);
    try {
      const res = await createMission({ question: q, report_mode: "meta", cadence, deliver: "in_app" });
      if (res.ok) {
        setQuestion("");
        const fresh = await fetchMissions();
        setMissions(fresh);
        setCached("scheduled-missions", fresh);
        setNotice("Scheduled. It’ll run on its cadence and file a cited report.");
      } else {
        setNotice(CREATE_ERROR[res.reason] ?? CREATE_ERROR.unknown);
      }
    } catch (e) {
      setNotice(e instanceof Error ? e.message : CREATE_ERROR.unknown);
    } finally {
      setCreating(false);
    }
  }

  function applySuggestion(s: Suggestion) {
    if (s.kind === "watch") {
      // The safety-recall template is a MONITOR, not a research run — hand it to Monitoring's box.
      setCached("monitor-prefill", s.question.slice(0, 200));
      router.push("/app/monitor");
      return;
    }
    setQuestion(s.question);
    setCadence(s.cadence);
  }

  async function toggleMission(m: MissionSummary) {
    const next = m.status === "active" ? "paused" : "active";
    setMissions((prev) => (prev ?? []).map((x) => (x.id === m.id ? { ...x, status: next } : x)));
    try { await setMissionStatus(m.id, next); } catch { const fresh = await fetchMissions().catch(() => null); if (fresh) setMissions(fresh); }
  }

  async function removeMission(id: string) {
    setMissions((prev) => (prev ?? []).filter((x) => x.id !== id));
    try { await deleteMission(id); } catch { const fresh = await fetchMissions().catch(() => null); if (fresh) setMissions(fresh); }
  }

  async function toggleWatch(w: WatchSummary) {
    const next = w.status === "active" ? "paused" : "active";
    setWatches((prev) => (prev ?? []).map((x) => (x.id === w.id ? { ...x, status: next } : x)));
    try { await setWatchStatus(w.id, next as "active" | "paused"); } catch { const fresh = await fetchWatches().catch(() => null); if (fresh) setWatches(fresh); }
  }

  const loading = missions === null && watches === null && !err;

  return (
    <div className="research-wrap">
      <div className="research-intro">
        <Orb size={52} />
        <h2 className="welcome-title">Scheduled</h2>
        <p className="welcome-sub">Set research to run on a schedule and monitors to watch for new evidence — the results land here and in your reports.</p>
      </div>

      {/* Compose a new scheduled mission */}
      <div className="watch-add" style={{ flexWrap: "wrap" }}>
        <Icon name="clock" size={16} />
        <input
          className="watch-add-input"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void schedule(); }}
          placeholder="Describe research to run on a schedule…"
          aria-label="Describe research to run on a schedule"
          disabled={creating}
        />
        <select className="mode" value={cadence} aria-label="Cadence" onChange={(e) => setCadence(e.target.value as MissionCadence)} disabled={creating}>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
        </select>
        <button type="button" className="mode watch-add-btn" onClick={() => void schedule()} disabled={creating || !question.trim()}>
          {creating ? "Scheduling…" : "Schedule"}
        </button>
      </div>
      {notice ? <p className="tmpl-note">{notice}</p> : null}
      {err ? <p className="tmpl-note">{err}</p> : null}

      {/* Suggestion gallery — clicking fills the composer (or opens Monitoring for the watch template). */}
      <div className="chip-row welcome-chips" aria-label="Scheduling ideas">
        {SUGGESTIONS.map((s) => (
          <button key={s.title} type="button" className="chip-action" title={s.question} onClick={() => applySuggestion(s)}>
            <span aria-hidden>{s.emoji}</span> {s.title}
          </button>
        ))}
      </div>

      {loading ? <SkeletonRows count={3} label="Loading your schedule…" /> : null}

      {/* Missions */}
      {missions && missions.length > 0 ? (
        <section className="proj-section">
          <div className="proj-section-head"><h3><Icon name="clock" size={14} /> Scheduled research <small>{missions.length}</small></h3></div>
          <div className="watch-card-list">
            {missions.map((m) => (
              <div key={m.id} className="watch-card proj-item">
                <span className="watch-card-main" style={{ flex: 1 }}>
                  <span className="watch-card-title">{m.question}</span>
                  <span className="watch-card-meta">
                    {cadenceLabel(m.cadence)} · {m.status === "active" ? timeUntil(m.next_run_at) : "paused"}
                    {m.last_saved_report_id ? <> · <Link href={`/app/reports/${m.last_saved_report_id}`}>latest report</Link></> : null}
                  </span>
                </span>
                <button type="button" className="proj-remove" onClick={() => void toggleMission(m)}>{m.status === "active" ? "Pause" : "Resume"}</button>
                <button type="button" className="proj-remove" onClick={() => void removeMission(m.id)}>Delete</button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Watches */}
      {watches && watches.length > 0 ? (
        <section className="proj-section">
          <div className="proj-section-head"><h3><Icon name="bell" size={14} /> Monitors <small>{watches.length}</small></h3></div>
          <div className="watch-card-list">
            {watches.map((w) => (
              <div key={w.id} className="watch-card proj-item">
                <Link href={`/app/monitor/${w.id}`} className="proj-item-link" title={w.title}>
                  <span className="watch-card-main">
                    <span className="watch-card-title">{w.title}</span>
                    <span className="watch-card-meta">
                      {w.cadence} · {w.last_checked_at ? `last checked ${new Date(w.last_checked_at).toLocaleDateString()}` : "not checked yet"}
                    </span>
                  </span>
                </Link>
                <button type="button" className="proj-remove" onClick={() => void toggleWatch(w)}>{w.status === "active" ? "Pause" : "Resume"}</button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {!loading && missions && missions.length === 0 && watches && watches.length === 0 ? (
        <p className="welcome-sub">Nothing scheduled yet. Describe research above, or start a monitor from <Link href="/app/monitor">Monitoring</Link>.</p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 9: Build to confirm compilation**

Run: `cd apps/web && npm run build`
Expected: build succeeds. `timeUntil`, `cadenceLabel`, `MissionCadence`, all api functions, and the `clock` icon resolve. The new route builds as `/app/scheduled`.

- [ ] **Step 10: Manual preview check**

- Nav shows "Scheduled" with a clock icon; clicking opens `/app/scheduled`.
- Suggestion chips: clicking a mission template fills the box + sets cadence; the 🛡️ FDA one navigates to `/app/monitor`.
- On a free account, "Schedule" returns the honest "Missions aren’t enabled…" (or limit) notice — not a fake success.
- Existing missions/watches (if any) list with cadence + "in X" / last-checked timing, Pause/Resume, and Delete (missions).

- [ ] **Step 11: Commit**

```bash
git add packages/shared/src/relative-time.ts packages/shared/src/relative-time.test.ts packages/shared/src/index.ts apps/web/components/icons.tsx apps/web/components/AppShell.tsx apps/web/app/app/scheduled/page.tsx
git commit -m "feat(web): Scheduled surface — missions + monitors, composer, suggestion gallery, timeUntil helper + clock icon"
```

---

## Task 7: Reports → Library upgrade

**Files:**
- Modify: `apps/web/app/app/reports/page.tsx`

**Interfaces:**
- Consumes: `fetchResearchReports`, `type ResearchReportSummary` (existing); `displayReportTitle` (Task 1); `getCached`/`setCached`.
- Produces: nothing consumed by later tasks.

**Design:** Keep the by-kind grouping. Upgrade cards to rows: doc icon, `displayReportTitle(r.title)`, a short date (`created_at` → "Jun 26"), `{citation_count} sources`, and a mode badge when the group headers are hidden. Add a client-side search input (only when >6 reports) filtering by title, and a top-right "New report" button → `/app/ask`.

- [ ] **Step 1: Replace the reports page — full file**

Replace the entire contents of `apps/web/app/app/reports/page.tsx` with:

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fetchResearchReports, type ResearchReportSummary } from "@/lib/api";
import { displayReportTitle } from "@nemesis/shared";
import { Orb } from "@/components/Orb";
import { Icon } from "@/components/icons";
import { SkeletonRows } from "@/components/Skeleton";
import { getCached, setCached } from "@/lib/cache";

// Report sub-types, for grouping the library "by kind". Headers only appear once there are 2+ types
// (a single-type library stays a clean flat list). "meta" and "structured_review" reports are BOTH
// products of the one user-facing Deep research tool, so they normalize into the "standard" group.
const MODE_LABEL: Record<string, string> = {
  standard: "Deep research",
  discovery: "Discovery reports",
  lab_draft: "Lab drafts",
  other: "Other",
};
const MODE_ORDER = ["standard", "discovery", "lab_draft"];
const normalizeMode = (m: string | null | undefined): string =>
  !m || m === "meta" || m === "structured_review" ? "standard" : m;

function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// The Reports Library: every deep-research / structured-review report the user has generated, grouped by
// kind, searchable once the list grows, with a "New report" shortcut back to Ask.
export default function ReportsPage() {
  const router = useRouter();
  const [reports, setReports] = useState<ResearchReportSummary[] | null>(() => getCached<ResearchReportSummary[]>("reports") ?? null);
  const [err, setErr] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let alive = true;
    fetchResearchReports()
      .then((r) => { if (alive) { setReports(r); setCached("reports", r); } })
      .catch((e) => { if (alive) setErr(e instanceof Error ? e.message : "Could not load reports."); });
    return () => { alive = false; };
  }, []);

  // Filter by cleaned title (search only appears once the library grows past 6).
  const filtered = useMemo(() => {
    if (!reports) return null;
    const q = query.trim().toLowerCase();
    if (!q) return reports;
    return reports.filter((r) => displayReportTitle(r.title).toLowerCase().includes(q));
  }, [reports, query]);

  const showSearch = (reports?.length ?? 0) > 6;

  return (
    <div className="research-wrap">
      <div className="research-intro">
        <Orb size={52} />
        <h2 className="welcome-title">Library</h2>
        <p className="welcome-sub">Every deep-research report you’ve generated. Open one to read it, switch citation styles, or export to Word or PowerPoint.</p>
        <button type="button" className="mode watch-add-btn" style={{ marginTop: 6 }} onClick={() => router.push("/app/ask")}>
          <Icon name="plus" size={14} /> New report
        </button>
      </div>

      {showSearch ? (
        <div className="watch-add">
          <Icon name="search" size={16} />
          <input className="watch-add-input" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search reports…" aria-label="Search reports" />
        </div>
      ) : null}

      {err ? <p className="tmpl-note">{err}</p> : null}
      {reports === null && !err ? <SkeletonRows count={3} label="Loading your reports…" /> : null}

      {reports && reports.length === 0 ? (
        <p className="welcome-sub">No reports yet. Start one from <Link href="/app/ask">Ask</Link> — open the <b>+</b> menu and choose Deep research or Discovery.</p>
      ) : null}

      {filtered && reports && reports.length > 0 ? (
        <div className="research-history">
          {(() => {
            const known = new Set(MODE_ORDER);
            const groups = MODE_ORDER
              .map((m) => ({ mode: m, items: filtered.filter((r) => normalizeMode(r.mode) === m) }))
              .filter((g) => g.items.length > 0);
            const others = filtered.filter((r) => !known.has(normalizeMode(r.mode)));
            if (others.length) groups.push({ mode: "other", items: others });
            if (groups.length === 0) return <p className="welcome-sub">No reports match “{query}”.</p>;
            const showHeaders = groups.length > 1; // only group visually once there are 2+ kinds
            return groups.map((g) => (
              <div key={g.mode} className="report-group">
                {showHeaders ? <div className="report-group-h">{MODE_LABEL[g.mode] ?? "Other"}</div> : null}
                <div className="research-history-list">
                  {g.items.map((r) => (
                    <Link key={r.id} href={`/app/reports/${r.id}`} className="research-card" title={displayReportTitle(r.title)}>
                      <Icon name="doc" size={15} />
                      <span className="research-card-title">{displayReportTitle(r.title)}</span>
                      {!showHeaders ? <small style={{ color: "var(--text-3)" }}>{MODE_LABEL[g.mode] ?? "Other"}</small> : null}
                      {r.created_at ? <small>{shortDate(r.created_at)}</small> : null}
                      <small>{r.citation_count} sources</small>
                    </Link>
                  ))}
                </div>
              </div>
            ));
          })()}
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Build to confirm compilation**

Run: `cd apps/web && npm run build`
Expected: build succeeds. `displayReportTitle`, `useMemo`, `useRouter` resolve.

- [ ] **Step 3: Manual preview check**

- Report rows show a doc icon, a cleaned title (no `Focus:` tail), a short date, and "{n} sources".
- With ≤6 reports, no search box; with >6, the search box appears and filters live; an empty match shows "No reports match …".
- "New report" navigates to `/app/ask`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/app/reports/page.tsx
git commit -m "feat(web): Reports → Library — clean titles, dates, mode badges, search, New report shortcut"
```

---

## Task 8: Data sources panel

**Files:**
- Create: `apps/web/lib/data-sources.ts`
- Create: `apps/web/components/DataSourcesPanel.tsx`
- Modify: `apps/web/app/app/ask/page.tsx` (add a menu item to the `+` tools launcher)
- Modify: `apps/web/components/SettingsSurface.tsx` (add a Data sources entry in the About section)

**Interfaces:**
- Consumes: `Icon`; existing `.acct-menu` / modal patterns.
- Produces: `DATA_SOURCES: DataSource[]` and the `DataSource` type from `@/lib/data-sources`; `<DataSourcesPanel open onClose />` from `@/components/DataSourcesPanel`.

**Design:** An honest registry of the live + embedded sources that power answers, rendered in a modal grouped into "Live sources" (fetched per question) and "Embedded library" (ingested corpus). Each row is an icon-dot + name + one-line description. A footer notes news is walled off from cited evidence and no ranking secrets are exposed. Entry points: the bottom of the `+` tools menu on Ask, and the About section in Settings.

- [ ] **Step 1: Create the data-source registry**

Create `apps/web/lib/data-sources.ts` (honest one-liners built from the verified ground-truth source list; `LIVE_SOURCES=on` in prod, so the live set is fetched per question):

```typescript
// The registry of sources that power PharmaOrb answers — shown to users in the Data sources panel so
// they can see exactly what the engine draws on. Honest and non-secret: it names the sources and how
// they're used (live per-question vs embedded corpus), never any ranking/weighting internals. News is
// deliberately absent from cited evidence (walled off; see the panel footer).

export type SourceCategory = "live" | "library";
export type SourceBadge = "safety" | "conditional";

export interface DataSource {
  id: string;
  name: string;
  desc: string;
  category: SourceCategory;
  badge?: SourceBadge;
}

export const DATA_SOURCES: DataSource[] = [
  // ── Live: fetched fresh on every question (LIVE_SOURCES=on in production) ──
  { id: "pubmed_oa", name: "PubMed + Europe PMC", desc: "Peer-reviewed biomedical literature, fetched live on every question.", category: "live" },
  { id: "clinicaltrials", name: "ClinicalTrials.gov", desc: "Registered clinical trials — design, status, and outcomes.", category: "live" },
  { id: "openfda_labels", name: "openFDA drug labels", desc: "Official FDA-approved prescribing information.", category: "live" },
  { id: "faers", name: "FAERS", desc: "FDA adverse-event reports, pulled for safety questions.", category: "live", badge: "safety" },
  { id: "fda_safety", name: "FDA enforcement & recalls", desc: "Drug recalls and enforcement actions, on safety-critical queries.", category: "live", badge: "safety" },
  { id: "openalex", name: "OpenAlex", desc: "Open scholarly index for broader literature coverage.", category: "live" },
  { id: "medlineplus", name: "MedlinePlus", desc: "Plain-language consumer health information from the NIH.", category: "live" },
  { id: "tox_ref", name: "Toxicology reference", desc: "NIH toxicology data, consulted when a question warrants it.", category: "live", badge: "conditional" },

  // ── Embedded library: ingested corpus, searched alongside the live pull ──
  { id: "dailymed", name: "DailyMed", desc: "NIH’s full drug-label library.", category: "library" },
  { id: "rxnorm", name: "RxNorm", desc: "Standardized drug names and identifiers.", category: "library" },
  { id: "cdc", name: "CDC", desc: "Public-health guidance and MMWR reports.", category: "library" },
  { id: "drugbank", name: "DrugBank Open", desc: "Open drug and drug-target reference data.", category: "library" },
  { id: "livertox", name: "LiverTox", desc: "NIH reference on drug-induced liver injury.", category: "library" },
  { id: "lactmed", name: "LactMed", desc: "Drugs and lactation safety reference.", category: "library" },
  { id: "pubchem", name: "PubChem", desc: "Chemical structures and properties.", category: "library" },
  { id: "orange_book", name: "FDA Orange Book", desc: "Approved drugs with therapeutic-equivalence ratings.", category: "library" },
  { id: "purple_book", name: "FDA Purple Book", desc: "Licensed biological products and biosimilars.", category: "library" },
  { id: "nadac", name: "CMS NADAC pricing", desc: "National average drug-acquisition cost data.", category: "library" },
  { id: "drugsatfda", name: "Drugs@FDA", desc: "FDA approval history and review documents.", category: "library" },
  { id: "guidelines", name: "Curated guidelines", desc: "AHRQ, USPSTF, NHLBI, VA/DoD, CDC MMWR, PharmGKB, NCBI Bookshelf, DHHS HIV, NCI PDQ, and Orphanet.", category: "library" },
];
```

- [ ] **Step 2: Create the panel component**

Create `apps/web/components/DataSourcesPanel.tsx`:

```tsx
"use client";

import { DATA_SOURCES, type DataSource } from "@/lib/data-sources";
import { Icon } from "@/components/icons";

// A modal that shows what powers PharmaOrb's answers: live sources (fetched per question) and the
// embedded library (ingested corpus). Honest — it names sources and how they're used, never ranking
// internals; and it re-states that news sits OUTSIDE the cited evidence.
export function DataSourcesPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  const live = DATA_SOURCES.filter((s) => s.category === "live");
  const library = DATA_SOURCES.filter((s) => s.category === "library");
  return (
    <div className="confirm-overlay" role="presentation" onClick={onClose}>
      <div className="confirm-card" role="dialog" aria-modal="true" aria-label="Data sources" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520, textAlign: "left", maxHeight: "80vh", overflowY: "auto" }}>
        <h3 className="confirm-title">What powers your answers</h3>
        <Group title="Live sources" sub="Fetched fresh on every question" items={live} />
        <Group title="Embedded library" sub="An ingested corpus searched alongside the live pull" items={library} />
        <p className="muted" style={{ fontSize: 12, marginTop: 12, lineHeight: 1.6 }}>
          News and community chatter are kept in a separate panel and are <b>never</b> cited as evidence. Answers are graded on the sources above.
        </p>
        <div className="confirm-actions" style={{ marginTop: 12 }}>
          <button type="button" className="confirm-cancel" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

function Group({ title, sub, items }: { title: string; sub: string; items: DataSource[] }) {
  return (
    <div style={{ marginTop: 12 }}>
      <div className="menu-label">{title}</div>
      <p className="muted" style={{ fontSize: 12, margin: "0 0 8px" }}>{sub}</p>
      <div style={{ display: "grid", gap: 8 }}>
        {items.map((s) => (
          <div key={s.id} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <span className="watch-card-dot active" aria-hidden style={{ marginTop: 5 }} />
            <span>
              <b style={{ fontSize: 13 }}>{s.name}</b>
              {s.badge === "safety" ? <small style={{ color: "var(--text-3)", marginLeft: 6 }}>safety</small> : null}
              {s.badge === "conditional" ? <small style={{ color: "var(--text-3)", marginLeft: 6 }}>as needed</small> : null}
              <br />
              <small style={{ color: "var(--text-2)", fontSize: 12 }}>{s.desc}</small>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Wire the panel into the Ask `+` tools menu**

In `apps/web/app/app/ask/page.tsx`, add the import near the other component imports (after the `Icon` import on line 25):

```typescript
import { DataSourcesPanel } from "@/components/DataSourcesPanel";
```

Inside `function Composer(...)`, next to the existing `const [plusOpen, setPlusOpen] = useState(false);` (line 550), add:

```typescript
  const [sourcesOpen, setSourcesOpen] = useState(false); // the "Data sources" modal
```

In the `+` tools menu, AFTER the existing disabled "Add photos & files" button (line 604-606) and BEFORE the closing `</div>` of `.tools-menu`, add a separator + the Data sources item:

```tsx
              <div className="sep" role="separator" />
              <button type="button" role="menuitem" onClick={() => { setSourcesOpen(true); setPlusOpen(false); }}>
                <Icon name="shield" size={14} /><span style={{ flex: 1 }}>Data sources</span><small style={{ color: "var(--text-3)" }}>see what powers answers</small>
              </button>
```

Then render the modal at the very end of the Composer's returned markup — change the final lines of `Composer` from:

```tsx
      {error ? <div className="err">{error}</div> : null}
      <div className="composer-disclaimer">{POINT_OF_USE_DISCLAIMER}</div>
    </div>
  );
}
```

to:

```tsx
      {error ? <div className="err">{error}</div> : null}
      <div className="composer-disclaimer">{POINT_OF_USE_DISCLAIMER}</div>
      <DataSourcesPanel open={sourcesOpen} onClose={() => setSourcesOpen(false)} />
    </div>
  );
}
```

- [ ] **Step 4: Add a Data sources entry in Settings → About**

In `apps/web/components/SettingsSurface.tsx`, add the import at the top (after its existing imports):

```typescript
import { DataSourcesPanel } from "@/components/DataSourcesPanel";
```

Add local state inside the `SettingsSurface` function body (after its `const [section, setSection] = useState<SettingsSection>(initialSection);` on line 35):

```typescript
  const [sourcesOpen, setSourcesOpen] = useState(false);
```

The About section currently is:

```tsx
        {section === "about" ? (
          <section className="card">
            <h2 style={{ marginBottom: 4 }}>About</h2>
            <p className="muted" style={{ fontSize: 13, margin: 0, lineHeight: 1.6 }}>
              PharmaOrb gives source-grounded, cited answers. Every medical claim traces to a real source. Educational use only — not a substitute for professional medical advice.
            </p>
          </section>
        ) : null}
```

Replace it with (add a button + the panel):

```tsx
        {section === "about" ? (
          <section className="card">
            <h2 style={{ marginBottom: 4 }}>About</h2>
            <p className="muted" style={{ fontSize: 13, margin: 0, lineHeight: 1.6 }}>
              PharmaOrb gives source-grounded, cited answers. Every medical claim traces to a real source. Educational use only — not a substitute for professional medical advice.
            </p>
            <button type="button" className="mode watch-add-btn" style={{ marginTop: 12 }} onClick={() => setSourcesOpen(true)}>
              <Icon name="shield" size={14} /> View data sources
            </button>
            <DataSourcesPanel open={sourcesOpen} onClose={() => setSourcesOpen(false)} />
          </section>
        ) : null}
```

Confirm `Icon` is already imported in `SettingsSurface.tsx`; if not, add `import { Icon } from "@/components/icons";` with the other imports.

- [ ] **Step 5: Build to confirm compilation**

Run: `cd apps/web && npm run build`
Expected: build succeeds. `DATA_SOURCES`, `DataSourcesPanel`, and the new state resolve in both Ask and Settings.

- [ ] **Step 6: Manual preview check**

- Ask `+` menu now ends with "Data sources — see what powers answers"; clicking opens the modal with Live sources + Embedded library groups and the news-wall footer.
- Settings → About shows "View data sources" opening the same panel.

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/data-sources.ts apps/web/components/DataSourcesPanel.tsx apps/web/app/app/ask/page.tsx apps/web/components/SettingsSurface.tsx
git commit -m "feat(web): Data sources panel — honest registry, Ask + menu and Settings entry points"
```

---

## Task 9: Build verification + PR

**Files:**
- No source changes — verification + PR only.

**Interfaces:**
- Consumes: all prior tasks' commits on `feat/workspace-parity`.
- Produces: a PR to `main`.

- [ ] **Step 1: Run all shared Deno tests**

Run: `deno test packages/shared/src/report-title.test.ts packages/shared/src/relative-time.test.ts`
Expected: PASS (13 tests total — 7 report-title + 6 relative-time). NOTE: this is a LOCAL gate; `unit.yml` does not run `packages/shared/`.

- [ ] **Step 2: Full web build**

Run: `cd apps/web && npm run build`
Expected: build succeeds with no type errors, and includes the new `/app/scheduled` route.

- [ ] **Step 3: Manual preview checklist (all five surfaces)**

Start `cd apps/web && npm run dev` and verify:
- **Project workspace** (`/app/projects/<id>`): new-chat composer, tabs, clean report titles, settings modal rename/description/instructions/delete.
- **Ask project awareness**: project→Ask prefill + chip; the new chat files into the project (`project_id` set); instructions not shown in the transcript.
- **Sidebar quick-add**: ⋯ → Add to project picker; Move/Remove states reflect assignment.
- **Scheduled** (`/app/scheduled`): composer + cadence, suggestion gallery (FDA card → Monitoring), honest free-plan limit copy, mission/watch rows with timing + pause/resume/delete.
- **Reports → Library**: clean titles, dates, mode badges, search past 6 reports, New report shortcut.
- **Data sources**: Ask `+` menu item + Settings → About button both open the panel.

- [ ] **Step 4: Push the branch**

```bash
git push -u origin feat/workspace-parity
```

- [ ] **Step 5: Open the PR to main**

```bash
gh pr create --base main --head feat/workspace-parity \
  --title "feat(web): workspace parity — project workspace, scheduled surface, report library, data sources panel" \
  --body "$(cat <<'EOF'
## What this does (plain English)

This brings five of the workspace patterns people expect from ChatGPT / NotebookLM / Manus into PharmaOrb:

1. **Real project workspaces.** A project page now has a "New chat in this project" box, tabs for its Chats / Reports / Monitoring, and a settings panel to rename it, add a description, and set project instructions (custom context for how the assistant approaches questions there).
2. **Ask knows about projects.** Starting a chat from a project pre-fills the box, shows an "in {project}" tag, files the new chat into that project, and quietly passes the project's instructions along with your question (the answer engine itself was not changed).
3. **Quick-add from the sidebar.** The "…" menu on any chat can now file it into a project (or move/remove it) — replacing the old greyed-out "Soon" button.
4. **A Scheduled page.** One place for recurring research and evidence monitors, with a box to schedule new research, a few starter ideas, and honest messaging when a plan doesn't include scheduled runs yet.
5. **Reports → Library.** Cleaner report titles (the internal "Focus:" scoping text is stripped), dates, type badges, a search box once the list grows, and a "New report" shortcut.
6. **A "Data sources" panel.** An honest, non-secret list of the live sources and embedded library that power answers, reachable from the Ask "+" menu and Settings.

## Notes for the owner

- **Deploy is your call.** `main` auto-deploys to production, so merging this ships it.
- **One database change is included but NOT applied.** `supabase/migrations/20260703120000_projects_instructions.sql` adds the `instructions` field to projects. The web app works fine without it (project instructions just won't save until it's applied). Applying migrations is owner-gated — run it when you're ready.
- **The answer engine was not touched.** Project instructions ride into the question text; the frozen `/ask` safety path is unchanged.

## Test plan

- [x] Shared pure-logic Deno tests pass (report-title, relative-time)
- [x] `apps/web` builds clean
- [ ] Manual preview of all five surfaces (owner to confirm on preview deploy)
EOF
)"
```

> **OWNER GATE:** Do not merge or apply the migration as part of implementation. Merging to `main` is a production deploy; applying `20260703120000_projects_instructions.sql` turns on saved project instructions. Both are the owner's call.

- [ ] **Step 6: Report the PR URL**

`gh pr view --json url --jq .url` — hand the URL to the owner.

---

## Self-Review

**1. Spec coverage:**
- Task 1 — branch + `fetchProject`/`updateProject`/`createConversation(projectId)` + `displayReportTitle` ✓ (spec Task 1). Deviation: `displayReportTitle` strips a trailing `\n\nFocus: …` (verified format at ask/page.tsx:746), not a `" Focus: …"` inline suffix — the regex matches the real format.
- Task 2 — migration + `updated_at` trigger reusing `core_sources_set_updated_at()`, owner-gated ✓.
- Task 3 — workspace rebuild: new-chat composer (writes `ask-project-prefill`), tabs, created_at on chat cards, settings modal (rename/description/instructions/delete), `fetchProject` not client filter ✓.
- Task 4 — prefill chip, projectId into `createConversation`, instructions prepended to `askQuestion` arg ONLY (not `text`/`autoDepth`/transcript/report runs) ✓.
- Task 5 — sidebar quick-add replacing the disabled button; in-place picker + Remove; added `project_id` to `ConversationSummary` ✓.
- Task 6 — Scheduled page merging missions + watches, composer (`report_mode:"meta"`), all `CreateMissionResult` states mapped, suggestion gallery (FDA→watch/Monitoring), free-plan honest, `timeUntil` + tests, clock icon, nav entry ✓.
- Task 7 — Library upgrade: `displayReportTitle`, dates, mode badges when headers hidden, search >6, New report ✓.
- Task 8 — `data-sources.ts` registry + `DataSourcesPanel` modal, Ask `+` entry, Settings About entry ✓.
- Task 9 — Deno tests + build + preview checklist + PR (owner-gated merge/migration stated) ✓.

**2. Placeholder scan:** No TBD/TODO/"handle edge cases"/"similar to Task N" — every code step shows complete code. The one `setProjMenuFor(null)` wiring step (Task 5 Step 4) describes an exact edit against a small existing effect and gives the replacement line; acceptable since the surrounding effect body is short and shown by reference.

**3. Type consistency:**
- `Project.instructions?: string | null` and `ProjectChat.created_at?: string` are OPTIONAL — existing list mappers stay valid (checked against `fetchProjects`/`fetchUnassignedItems`).
- `createConversation(title, projectId?)` — used with 2 args in Ask (Task 4), 1 arg by existing callers (unchanged).
- `fetchProject(id): Promise<Project | null>` — consumed by Task 3 (`load`) and Task 4 (mount effect), same signature.
- `displayReportTitle(raw: string): string` — Tasks 3, 7 import from `@nemesis/shared`, exported in Task 1 Step 6.
- `timeUntil(iso, now?)` — Task 6 page passes one arg (uses default `now`); tests pass two. Consistent.
- `setItemProject("conversation", id, projectId | null)` and `MissionCadence` / `cadenceLabel` / `CreateMissionResult` reused verbatim from existing `api.ts` / `@nemesis/shared`.
- `ConversationSummary.project_id: string | null` added in Task 5 and read there only.
- `clock` icon added in Task 6 before the `workspace` array references it.

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-07-03-projects-scheduled-library-parity.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
