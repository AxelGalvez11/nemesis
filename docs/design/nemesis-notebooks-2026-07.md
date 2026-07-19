# Nemesis Notebooks (NotebookLM-style projects) — design spec

**Date:** 2026-07-18
**Status:** Approved design (shape), pre-implementation. Next step: per-surface implementation plans.
**Owner decisions baked in:** name = **Notebooks**; chats have a per-chat **grounded/general** toggle; sources = **Library notes/folders + new uploads**; **cloud-first, general mode first** (grounded search is Phase 2); Notebooks is a new top-level area; the existing main Chat, Library, and Study are untouched.

---

## 1. Goal (plain English)

A **Notebook** is a workspace built around a set of **sources** (your own materials) plus its **own chats**. You drop in the PDFs, docs, and Library notes for a class or topic, give the notebook a short **instruction** ("you're my pharmacology tutor, keep to my slides"), and then chat with it. Each chat has a switch:

- **General** — normal, flexible help that also knows your instructions (ships first).
- **Grounded** — answers **only** from that notebook's sources, with citations, and says "that's not in your sources" instead of guessing (Phase 2 — the NotebookLM behavior).

This is the honest, study-native version of ChatGPT/Claude Projects: a container that ties *sources + instructions + scoped chats* (and later scheduled tasks + memory) together, living in the cloud so it works on web, desktop, and (read) phone.

## 2. What stays the same (non-negotiable)

- The **main Chat** experience is unchanged. Notebooks are a separate area.
- **Library** and **Study** are unchanged. A notebook can *reference* Library notes, but it does not move or alter them.
- Notebook chats are **scoped to their notebook** (same discipline as the note/card mini-chat): they never appear in the main Sessions list. Implemented via a distinct session `source` (`notebook:<id>`) excluded from the recents sidebar — see [[nemesis-mini-chat]] for the proven pattern.

## 3. The experience

- A **Notebooks** tab (web + desktop) next to Chat / Library / Study.
- **Notebooks list** — cards (name, description, last-updated), a "New notebook" button, and search. Mirrors the Claude Projects grid the owner shared.
- **Notebook page** — the Claude project layout in our skin:
  - Center: a **composer** + the notebook's **chats** (recents), each chat carrying the grounded/general toggle.
  - Side rail: **Sources** (add from Library / upload), **Instructions** (edit), and later **Scheduled** and **Memory**.
- **Empty state** — "Add sources and start a chat about them."

## 4. Data model (cloud-first, Supabase)

All server-readable (not E2EE), per the owner's 2026-07-18 privacy decision (see [[nemesis-cloud-first-pivot]]). Per-user, RLS `user_id = auth.uid()`, mirroring `readable_library_documents`.

- **`notebooks`** — `id uuid pk`, `user_id`, `name text`, `description text`, `instructions text` (the per-notebook system prompt; nullable), `created_at`, `updated_at` (server trigger). RLS owner-all.
- **`notebook_sources`** — `id uuid pk`, `notebook_id fk`, `user_id`, `kind text` (`'library'` | `'upload'`), `title text`, and the pointer:
  - library source → `library_path text` (references the user's `readable_library_documents.path`; a *reference*, no copy).
  - upload source → `storage_path text` (a file in a new Supabase Storage bucket `notebook-uploads`, path `<user_id>/<notebook_id>/<uuid>-<filename>`), `mime_type`, `byte_size`.
  - `added_at`. `unique(notebook_id, kind, library_path/storage_path)`. RLS owner-all.
- **Chats:** notebook chats are ordinary backend/cloud chat sessions tagged `source = 'notebook:<notebook_id>'`. No new chat table — reuse the session system, scoped by source (excluded from recents like `note-chat`). The notebook's `instructions` are injected as a system-prompt prefix on each turn.
- **Storage:** bucket `notebook-uploads`, private, RLS by `user_id` path prefix. Web uploads directly; desktop uploads via the same authenticated path.
- **(Phase 2 only)** `notebook_source_chunks` — `source_id fk`, `chunk_index`, `content text`, `embedding vector` (pgvector, already in stack), for grounded retrieval. Not built in Phase 1.

## 5. Chats — general mode (Phase 1)

- **Web:** the existing cloud chat client (`lib/workspace/chat-api.ts` → `nemesis-llm`), with the notebook's `instructions` prepended and (general mode) the source *titles* listed for light context. No retrieval yet.
- **Desktop:** the existing gateway chat, `session.create` with `source: 'notebook:<id>'`, instructions injected. Bonus: the desktop's local agent can read a referenced Library note directly via `@file:` (the note's vault path), so desktop general-mode chat is already somewhat source-aware — but this is not the strict grounded mode.
- **The grounded/general toggle renders in Phase 1** but "grounded" is disabled with a "coming soon" affordance until Phase 2, so the UI contract is stable.

## 6. Sources (Phase 1)

- **Add from Library:** a picker over the user's readable library (web reads `readable_library_documents`; desktop reads its vault, which syncs to the same cloud rows). Selecting a note/folder writes a `notebook_sources` row of `kind='library'` referencing the path.
- **Upload:** a file input (PDF / docx / txt / md). The file goes to the `notebook-uploads` bucket and a `notebook_sources` row of `kind='upload'`. Phase 1 stores + lists uploads; **text extraction + chunking is Phase 2** (needed only for grounded retrieval).
- Remove source = delete the row (and the storage object for uploads).

## 7. Platforms & sync

- **Web (`apps/web`, main repo):** full Phase 1 — list/create notebooks, sources (Library refs + upload), instructions, general chats. This is the growth surface and ships first.
- **Desktop (`nemesis-desktop-public`):** a Notebooks route reading/writing the same cloud tables (the desktop is cloud-CONNECTED per the pivot); general chats via the gateway tagged `notebook:<id>`.
- **Phone:** read-only view of notebooks + their chats in a later mobile release (out of Phase 1; iOS is a separate effort — do not modify it here).

## 8. Phase 1 scope

**In Phase 1:**
- `notebooks` + `notebook_sources` tables + `notebook-uploads` bucket (prod migration, additive).
- Web + desktop: notebooks list/create/rename/delete, add sources (Library ref + upload), edit instructions, project-scoped **general** chats.
- The grounded/general toggle present (grounded disabled/"soon").
- Scoped-session hiding from the recents sidebar (reuse the `note-chat` exclusion pattern).

**Deferred (explicit):**
- **Phase 2 — Grounded mode:** upload text-extraction + chunking + pgvector embeddings + retrieval-augmented answers with citations (the heavy RAG piece). Requires the cloud "search over my sources" engine.
- **Phase 3 — Scheduled tasks per notebook:** reuse the existing scheduler; recurring runs scoped to a notebook.
- **Phase 4 — Memory per notebook** + saving generated decks/notes/summaries back into the notebook (ties to Study/Library).
- Phone (read-only) notebooks — a later mobile release.
- Sharing / collaboration.

## 9. Testing

- **Cloud:** migration applies cleanly; RLS verified (owner-all, anon denied) the way `readable_library_documents` was; a write to `notebook_sources` accepted under prod RLS.
- **Web:** component tests for the notebooks list, notebook page, source add (Library ref + upload), instructions edit; a test asserting a notebook chat request carries the notebook's instructions and is tagged `notebook:<id>`.
- **Desktop:** unit tests for the notebook store/context (same DI style as the mini-chat store); scoped-session hiding covered like `note-chat`.
- **Owner-side (real build):** create a notebook, add a Library note + upload a PDF, set an instruction, chat in general mode, confirm the chat is absent from the main Sessions list.

## 10. Risks & open questions

- **Cloud-agent write posture:** Phase 1 notebook chats are chat-only (general) — no write actions — so the current read-only cloud engine is sufficient. Write actions (make a deck from this notebook) fold into Phase 4 + the cloud-mission-write foundation (see [[nemesis-cloud-first-pivot]] §5.1).
- **Grounded retrieval quality (Phase 2)** is the real product risk (chunking, citation accuracy) — deliberately isolated into its own phase so Phase 1 ships without it.
- **Two codebases:** Phase 1 is one design but two implementation plans (web plan + desktop plan), sharing the cloud schema — same split the mini-chat used.
- **Naming collision:** "Notebooks" must not be confused with Library notes in copy — the tab and empty states should make the sources+chat framing obvious.
- **Upload types:** Phase 1 accepts common study formats (PDF/docx/txt/md); slide decks (pptx) and images are a fast-follow (extraction complexity).

## 11. Build order

1. **Cloud schema + storage** (migration; the shared foundation).
2. **Web Notebooks Phase 1** (growth surface first).
3. **Desktop Notebooks Phase 1** (cloud-connected).
4. **Phase 2 grounded** (RAG) → **Phase 3 scheduled** → **Phase 4 memory/outputs**.
