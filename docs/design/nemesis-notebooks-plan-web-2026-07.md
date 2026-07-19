# Notebooks Phase 1 (Web) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Ship cloud-backed **Notebooks** on the web — create/list/rename/delete notebooks, add sources (Library notes + pasted text), per-notebook instructions, and project-scoped chats in **general** mode.

**Architecture:** Two new RLS-per-user Supabase tables (`notebooks`, `notebook_sources`) mirroring the proven `projects`/`project_sources` shape. A new `app/(workspace)/notebooks` area in `apps/web` reads/writes them with the browser Supabase client (RLS scopes rows to `auth.uid()`; no explicit user filter on reads). Notebook chats run through the existing `nemesis-llm` client (`chat-api.ts`) with the notebook's **instructions** injected into the system message and its source list surfaced for light context; transcripts persist to `localStorage` keyed by notebook id (same as today's web chat). Grounded mode + uploads are Phase 2.

**Tech Stack:** Next.js app-router, React, Supabase (`@supabase/supabase-js`, untyped client + defensive `toX(raw)` guards), Tailwind v4 `[data-workspace]` token layer, the existing `nemesis-llm` chat client, Vitest (if configured) / hand-run parsers.

**Spec:** `docs/design/nemesis-notebooks-2026-07.md`

## Global Constraints

- Work in this worktree: `/Users/axelgalvez/Desktop/AIcodingProjects/nemesis-notebooks` (branch `feat/notebooks` off `origin/main`). The local main tree is stale — never plan against it.
- **Fresh tables, not reuse.** Do NOT touch `projects` / `project_sources` / `conversations` (orphaned pre-rebrand code + a pending prune task + mobile-shared rows). Copy the CRUD *shape* from `apps/web/lib/api.ts`, renamed.
- **Design against the LIVE schema** (verified via Supabase MCP `list_tables`, project `qyjmivntajbigjswhahb`), NOT the worktree's `supabase/migrations/*.sql` (confirmed drift: files ≠ applied ledger; `readable_library_documents` isn't even in-tree). Apply the new migration via MCP `apply_migration`, never `supabase db push` from here.
- **Applying the prod migration is a PROD CLOUD CHANGE → per-ask owner OK at execution.** Do not apply during planning.
- Additive only: new tables, RLS `owner` (`auth.uid() = user_id`) `for all`, `revoke all ... from anon`. Never alter existing tables.
- **Phase 1 sources = `library` + `text` only.** No file uploads, no Storage bucket, no PDF/doc extraction (Phase 2, with grounded mode).
- **Grounded mode is OUT.** The grounded/general toggle renders, but `grounded` is disabled with a "Soon" affordance so the UI contract is stable.
- Untyped Supabase client (no generated types file exists) — every network row goes through a hand-written `toX(raw: unknown)` guard; reuse the `isMissingRelation` (PGRST205) graceful-degradation helper pattern.
- Plain-English, **no emojis** in UI copy (Nemesis voice). Files stay focused (<800 lines); split components under `components/workspace/notebooks/`.
- Commit style: `feat(notebooks): …`, no attribution footer. Commit the `.tsx`/`.ts` (web app has no committed `.js` shadows — that's a desktop-only trap).

---

## File Structure

**Create:**
- `supabase/migrations/<YYYYMMDDTNN>_notebooks.sql` — the two tables (exact name resolved at apply time against the live ledger; the SQL is applied via MCP regardless).
- `apps/web/lib/workspace/notebooks-api.ts` — CRUD + defensive parsers (`Notebook`, `NotebookSource`, `toNotebook`, `toNotebookSource`, `listNotebooks`, `createNotebook`, `updateNotebook`, `deleteNotebook`, `listSources`, `addLibrarySource`, `addTextSource`, `deleteSource`).
- `apps/web/lib/workspace/notebooks-api.test.ts` — unit tests for the pure parsers/guards.
- `apps/web/lib/workspace/notebook-chat.ts` — per-notebook chat store (`localStorage`, keyed by notebook id) + `buildNotebookWireMessages(instructions, sourceNames, history, userText)` (the instructions/source injection). Mirrors `lib/workspace/sessions-store.ts` + `chat-api.ts`.
- `apps/web/lib/workspace/notebook-chat.test.ts` — unit tests for the wire-message builder + store keying.
- `apps/web/components/workspace/notebooks/notebooks-sidebar.tsx` — the notebooks list + "New notebook".
- `apps/web/components/workspace/notebooks/notebooks-main.tsx` — the detail pane (sources panel, instructions editor, chat).
- `apps/web/components/workspace/notebooks/notebook-chat-panel.tsx` — the chat surface with the general/grounded toggle.
- `apps/web/components/workspace/notebooks/notebooks-store.ts` — a `useSyncExternalStore` store for the selected notebook + list (mirrors `library-cloud-store.ts`).
- `apps/web/app/(workspace)/notebooks/page.tsx` — thin page: `return (<><NotebooksSidebar/><NotebooksMain/></>)`.

**Modify:**
- `apps/web/components/workspace/shell/chat-sidebar.tsx` — add one `SIDEBAR_NAV` entry (`{ id: "notebooks", label: "Notebooks", codicon: "notebook", route: "/notebooks" }`).

**Reference only (copy patterns, do not modify):**
- `apps/web/lib/api.ts:1405-1573` — `createProject`/`updateProject`/`deleteProject`/`createProjectSource`/`deleteProjectSource` (the CRUD shape to rename), `isMissingRelation` (`:1081`), `toProjectSource` (`:1505`).
- `apps/web/lib/workspace/library-cloud-store.ts` — the `useSyncExternalStore` + `useAuth` + `isPreviewMode` store shape, and `useCloudLibrary()` (the Library-source picker's data).
- `apps/web/lib/workspace/chat-api.ts` — `sendChatTurn`, `buildWireMessages`, `CHAT_SYSTEM_PROMPT`, `trimHistory` (the injection point is `buildWireMessages`).
- `apps/web/lib/workspace/sessions-store.ts` — the `localStorage` chat-store shape to key by notebook id.
- `apps/web/app/(workspace)/library/page.tsx` + `components/workspace/library/*` — the two-pane page pattern.
- `supabase/migrations/20260623000000_projects.sql` + `20260706000000_project_sources.sql` — the table+RLS+trigger shape to mirror.

---

## Task 1: Cloud migration — `notebooks` + `notebook_sources`

**Files:** Apply via MCP `apply_migration` (name `notebooks`). Also save the SQL to `supabase/migrations/<ts>_notebooks.sql` for the repo record.

**PROD CLOUD CHANGE — get the per-ask owner OK before applying.** First run MCP `list_tables` to confirm `notebooks`/`notebook_sources` don't already exist and to read the live `projects` shape.

- [ ] **Step 1: Confirm live schema** — MCP `list_tables` (schemas: `public`); verify no `notebooks` table yet.
- [ ] **Step 2: The migration SQL**

```sql
-- Notebooks — NotebookLM-style projects: sources + instructions + scoped chats.
-- ADDITIVE + NON-DESTRUCTIVE. Fresh tables (not the legacy projects/*), server-readable,
-- RLS per-user. Phase 1 sources = library refs + pasted text (no uploads/storage yet).

create table if not exists public.notebooks (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name         text not null,
  description  text,
  instructions text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
alter table public.notebooks enable row level security;
drop policy if exists notebooks_owner on public.notebooks;
create policy notebooks_owner on public.notebooks
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
revoke all on public.notebooks from anon;
create index if not exists notebooks_user_idx on public.notebooks (user_id, updated_at desc);

drop trigger if exists notebooks_updated_at_trigger on public.notebooks;
create trigger notebooks_updated_at_trigger
  before update on public.notebooks
  for each row execute function core_sources_set_updated_at();

create table if not exists public.notebook_sources (
  id           uuid primary key default gen_random_uuid(),
  notebook_id  uuid not null references public.notebooks (id) on delete cascade,
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind         text not null check (kind in ('library', 'text')),
  name         text not null,
  -- library: nullable snapshot of the note text (Phase 2 grounding may re-fetch live). text: the pasted body.
  content      text,
  -- library sources only: the readable_library_documents.path this references.
  library_path text,
  bytes        int,
  created_at   timestamptz not null default now()
);
alter table public.notebook_sources enable row level security;
drop policy if exists notebook_sources_owner on public.notebook_sources;
create policy notebook_sources_owner on public.notebook_sources
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
revoke all on public.notebook_sources from anon;
create index if not exists notebook_sources_notebook_idx on public.notebook_sources (notebook_id, created_at desc);
```

- [ ] **Step 3: Verify** — MCP `execute_sql`: confirm both tables exist, RLS enabled, `notebooks_owner`/`notebook_sources_owner` policies are `cmd=ALL` `roles={authenticated}`, and `anon` has no grants (mirror the `readable_library_documents` verification from [[nemesis-cloud-first-pivot]]).
- [ ] **Step 4: Commit** the `.sql` record: `git add supabase/migrations/<ts>_notebooks.sql && git commit -m "feat(notebooks): notebooks + notebook_sources tables (RLS per-user)"`.

---

## Task 2: `notebooks-api.ts` — CRUD + parsers

**Files:** Create `apps/web/lib/workspace/notebooks-api.ts` + `.test.ts`.

**Interfaces (Produces):**
- `type Notebook = { id: string; name: string; description: string | null; instructions: string | null; updatedAt: string }`
- `type NotebookSource = { id: string; notebookId: string; kind: 'library' | 'text'; name: string; content: string | null; libraryPath: string | null }`
- `toNotebook(raw: unknown): Notebook | null`, `toNotebookSource(raw: unknown): NotebookSource | null`
- `listNotebooks(): Promise<Notebook[]>`, `createNotebook(name): Promise<Notebook | null>`, `updateNotebook(id, patch: {name?; description?; instructions?}): Promise<void>`, `deleteNotebook(id): Promise<void>`
- `listSources(notebookId): Promise<NotebookSource[]>`, `addLibrarySource(notebookId, path, title, content): Promise<NotebookSource | null>`, `addTextSource(notebookId, name, content): Promise<NotebookSource | null>`, `deleteSource(id): Promise<void>`

- [ ] **Step 1: Write failing tests** for the pure guards (they're the only Supabase-free logic):

```ts
import { describe, expect, it } from "vitest";
import { toNotebook, toNotebookSource } from "./notebooks-api";

describe("notebooks parsers", () => {
  it("toNotebook: valid row", () => {
    const n = toNotebook({ id: "n1", name: "Cardio", description: null, instructions: "quiz me", updated_at: "2026-07-18" });
    expect(n).toEqual({ id: "n1", name: "Cardio", description: null, instructions: "quiz me", updatedAt: "2026-07-18" });
  });
  it("toNotebook: rejects missing id/name", () => {
    expect(toNotebook({ name: "x" })).toBeNull();
    expect(toNotebook({ id: "n1" })).toBeNull();
    expect(toNotebook(null)).toBeNull();
  });
  it("toNotebookSource: library row keeps path", () => {
    const s = toNotebookSource({ id: "s1", notebook_id: "n1", kind: "library", name: "ACE", content: "body", library_path: "Pharm/ACE.md" });
    expect(s).toEqual({ id: "s1", notebookId: "n1", kind: "library", name: "ACE", content: "body", libraryPath: "Pharm/ACE.md" });
  });
  it("toNotebookSource: rejects unknown kind", () => {
    expect(toNotebookSource({ id: "s1", notebook_id: "n1", kind: "file", name: "x" })).toBeNull();
  });
});
```

- [ ] **Step 2: Run** `cd apps/web && npx vitest run lib/workspace/notebooks-api.test.ts` — expect FAIL (module missing).
- [ ] **Step 3: Implement `notebooks-api.ts`** — copy the exact shape of `api.ts`'s project CRUD (get session → `user_id`; `supabase.from("notebooks").insert(...).select(...).maybeSingle()`; RLS handles scoping; defensive `toX`). `addLibrarySource` inserts `{ notebook_id, user_id, kind: 'library', name: title, content, library_path: path }`. `updateNotebook` uses the split-write pattern (name/description first, then instructions separately) for graceful-degradation. Guard `isPreviewMode` returns (see `library-cloud-store.ts`).
- [ ] **Step 4: Run** the test — expect PASS.
- [ ] **Step 5: Commit** `feat(notebooks): cloud CRUD + parsers`.

---

## Task 3: `notebook-chat.ts` — local chat store + instruction injection

**Files:** Create `apps/web/lib/workspace/notebook-chat.ts` + `.test.ts`.

**Interfaces (Produces):**
- `buildNotebookWireMessages(opts: { instructions: string | null; sourceNames: string[]; history: SessionMessage[]; userText: string }): WireMsg[]` — like `chat-api.buildWireMessages` but the system message = `CHAT_SYSTEM_PROMPT` + (instructions ? "\n\nProject instructions: …" ) + (sourceNames.length ? "\n\nThis notebook's sources: …" ).
- A `localStorage`-backed store keyed `nemesis.web.notebook-chat.<notebookId>.v1` with the same `useSyncExternalStore` shape as `sessions-store.ts` (load/append/clear).

- [ ] **Step 1: Write failing tests** for the wire builder:

```ts
import { describe, expect, it } from "vitest";
import { buildNotebookWireMessages } from "./notebook-chat";

describe("notebook wire messages", () => {
  it("injects instructions + source names into the system message", () => {
    const msgs = buildNotebookWireMessages({ instructions: "Quiz me hard.", sourceNames: ["ACE inhibitors", "Beta blockers"], history: [], userText: "hi" });
    expect(msgs[0].role).toBe("system");
    expect(msgs[0].content).toMatch(/Quiz me hard\./);
    expect(msgs[0].content).toMatch(/ACE inhibitors/);
    expect(msgs.at(-1)).toEqual({ role: "user", content: "hi" });
  });
  it("omits the instruction/source lines when empty", () => {
    const msgs = buildNotebookWireMessages({ instructions: null, sourceNames: [], history: [], userText: "hi" });
    expect(msgs[0].content).not.toMatch(/Project instructions/);
    expect(msgs[0].content).not.toMatch(/sources:/i);
  });
});
```

- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Implement** — reuse `trimHistory` + `CHAT_SYSTEM_PROMPT` from `chat-api.ts`; the store mirrors `sessions-store.ts` (per-notebook key). The actual turn send reuses `sendChatTurn`'s transport but with `buildNotebookWireMessages` — extract or parameterize: add `sendChatTurn`-parity `sendNotebookTurn(uid, opts, signal)` that posts `{ messages: buildNotebookWireMessages(opts), model: CHAT_MODEL }` to `LLM_BASE`. (Refactor `chat-api.ts` minimally to export the transport, or duplicate the ~15-line fetch — prefer exporting `postChatCompletion(uid, wireMessages, signal)` from `chat-api.ts` and having both callers use it.)
- [ ] **Step 4: Run** — expect PASS.
- [ ] **Step 5: Commit** `feat(notebooks): local per-notebook chat store + instruction injection`.

---

## Task 4: Notebooks UI — sidebar + detail (sources, instructions, chat)

**Files:** Create `components/workspace/notebooks/{notebooks-store.ts, notebooks-sidebar.tsx, notebooks-main.tsx, notebook-chat-panel.tsx}`.

- [ ] **Step 1: `notebooks-store.ts`** — a `useSyncExternalStore` store (mirror `library-cloud-store.ts`) holding `{ status, notebooks: Notebook[], selectedId, sources: NotebookSource[] }`, driven off `useAuth().session`, calling `listNotebooks`/`listSources`. Preview-seed a demo notebook for the dev-preview harness.
- [ ] **Step 2: `notebooks-sidebar.tsx`** — the list (name + updated), a "New notebook" button (prompts a name → `createNotebook` → select it), select-on-click. Two-pane aside styled `bg-(--ui-sidebar-surface-background)`.
- [ ] **Step 3: `notebooks-main.tsx`** — the detail pane for the selected notebook: a header (name, rename, delete), a **Sources** panel (list sources; "Add from Library" opens a picker over `useCloudLibrary().notes` → `addLibrarySource`; "Add text" opens a textarea → `addTextSource`; remove), an **Instructions** editor (textarea → `updateNotebook({instructions})` debounced), and `<NotebookChatPanel/>`. Empty state: "Add sources and start a chat about them."
- [ ] **Step 4: `notebook-chat-panel.tsx`** — the chat: transcript + composer, the **general/grounded** segmented toggle (grounded disabled + "Soon" tooltip), calls `sendNotebookTurn` with the notebook's instructions + `sources.map(s => s.name)`; persists to the per-notebook local store.
- [ ] **Step 5: Typecheck** `cd apps/web && npx tsc --noEmit` — clean.
- [ ] **Step 6: Commit** `feat(notebooks): notebook list + detail (sources, instructions, chat)`.

---

## Task 5: Route + nav entry

**Files:** Create `app/(workspace)/notebooks/page.tsx`; modify `components/workspace/shell/chat-sidebar.tsx`.

- [ ] **Step 1: The page** (thin, per the Library template):

```tsx
import { NotebooksMain } from "@/components/workspace/notebooks/notebooks-main";
import { NotebooksSidebar } from "@/components/workspace/notebooks/notebooks-sidebar";

export default function NotebooksPage() {
  return (
    <div className="flex h-full min-h-0 overflow-hidden bg-(--ui-editor-surface-background)">
      <NotebooksSidebar />
      <NotebooksMain />
    </div>
  );
}
```

- [ ] **Step 2: Nav entry** — in `chat-sidebar.tsx` `SIDEBAR_NAV`, add `{ id: "notebooks", label: "Notebooks", codicon: "notebook", route: "/notebooks" }` after `library` (verify `notebook` is a valid `@vscode/codicons` id once deps are installed; fall back to `"book"` if not).
- [ ] **Step 3: Build + verify render** — `cd apps/web && npm run build` (or the dev-preview harness). Confirm `/notebooks` mounts inside `WorkspaceShell`, the nav item appears + routes, 0 console errors. Screenshot via the dev-preview harness if wired.
- [ ] **Step 4: Commit** `feat(notebooks): /notebooks route + sidebar nav`.

---

## Task 6: Gates + PR

- [ ] **Step 1: Gates** — `cd apps/web && npx tsc --noEmit && npm run lint && npm run build` (and `npx vitest run lib/workspace/notebooks-*.test.ts` for the unit tests). All green.
- [ ] **Step 2: Manual (real cloud session)** — create a notebook, add a Library note + a pasted-text source, set an instruction, chat in general mode; confirm the reply reflects the instruction and the notebook persists on reload (RLS-scoped to the account).
- [ ] **Step 3: Open PR** `feat(notebooks): Notebooks Phase 1 (web) — cloud projects with Library/text sources, instructions, general chats`. Note in the PR: fresh tables (not the legacy `projects`), uploads + grounded mode are Phase 2, chats are local (per-notebook) for now.

---

## Self-Review notes (author)

- **Spec coverage:** notebooks CRUD (Task 2/4), sources = Library + text (Task 2/4), instructions (Task 2/4), scoped general chats (Task 3/4), route+nav (Task 5), cloud schema (Task 1). Grounded mode, uploads, storage, scheduled, memory = deferred by design.
- **Deviations from the spec (approved refinements, per the reuse finding + advisor):** (a) fresh `notebooks`/`notebook_sources` instead of reusing `projects`; (b) Phase 1 sources are Library + pasted text only — **file uploads + Storage bucket move to Phase 2** with grounded mode (spec §4/§6 listed uploads in Phase 1); (c) Phase 1 chats persist to `localStorage` (per-notebook), not a cloud table. Confirm the uploads-timing with the owner (their original ask emphasized PDFs).
- **Risk:** the `nemesis-llm` client is device-key auth + non-streaming; notebook chat reuses it verbatim, so no new auth surface. The only refactor is exporting a shared `postChatCompletion` from `chat-api.ts` (keep it minimal to avoid disturbing the main chat).
- **Migration drift:** design against live schema (MCP), apply via `apply_migration`, owner OK — do NOT `db push`.
