# Cloud-first phone — build spec (2026-07-20)

Owner ask: iPhone app stops mirroring the Mac and becomes a pure cloud client, matching the
web app. Owner decisions: (1) Mac-dispatch sessions are REMOVED from the phone (home becomes
chat, like web); (2) build the shared CLOUD CALENDAR (web + phone, one store).

Repo worktree for ALL edits: `/Users/axelgalvez/Desktop/AIcodingProjects/nemesis-mobile-glass`
(branch `feat/cloud-first-phone`). Web code = `apps/web`, phone = `apps/mobile`.

## 0. Hard constraints

- **OTA-safe**: `apps/mobile/package.json` dependencies MUST NOT change (fingerprint must stay
  `6c6246c6…` = build 18). Unused deps (expo-camera etc.) stay installed. Pure JS/TS only.
- No `next dev` locally (kernel panics this Mac). Verify web with `tsc`/build/tests only.
- Plain-English UI copy; never "Hermes"; no emojis in product copy.
- Subagents: do NOT run `git commit`; orchestrator commits.
- Phone subscription screen stays info-only (Apple IAP rules) — no purchase buttons/links.

## 1. New cloud tables (migration `supabase/migrations/20260720210000_cloud_chat_calendar.sql`)

- `chat_threads`: id uuid pk default gen_random_uuid(), user_id default auth.uid() FK cascade,
  title (≤200, default 'New chat'), pinned bool default false, created_at, updated_at.
- `chat_messages`: id uuid pk, thread_id FK chat_threads cascade, user_id, role
  ('user'|'assistant'|'system'), content (≤60000), meta jsonb (holds `{sources?, outputs?}`,
  size-checked), created_at. Messages are immutable (no update grant).
- `calendar_events`: id uuid pk, user_id, title (1–300), date DATE (web model uses local
  `yyyy-mm-dd` string — serialize/parse as plain date, never timezone-shift), time text?,
  kind ('assignment'|'exam'|'rotation'|'class'|'other'), course?, note?, source
  ('agent'|'manual', default 'manual'), created_at, updated_at.
- RLS pattern (copy library tables): owner-only `(select auth.uid()) = user_id` for
  authenticated, `revoke all from anon, authenticated` then explicit grants. Indexes:
  threads `(user_id, updated_at desc)`, messages `(thread_id, created_at)`,
  events `(user_id, date)`.

## 2. Existing cloud tables the phone plugs into (already in prod, web uses them)

- Library: `readable_library_documents` — user_id, path, kind, title, content, deleted,
  updated_at, created_at. Folder tree derives from `path` segments.
- Study: `study_decks` (name uses `Group::Subgroup` convention), `study_cards` (front/back,
  card_type basic|reversed|cloze|image_occlusion, due_at, interval_days, repetitions, lapses,
  suspended), grading via RPC `grade_study_card(p_card_id, p_grade)` — server computes next
  due + writes `study_review_logs`. Client scheduler math lives in
  `apps/web/lib/workspace/study-scheduler.ts`; count logic in `study-cloud-store.ts`.

## 3. Auth from the phone

`apps/mobile/src/api/chat.ts` already mints `nmk_` device keys (`POST {LLM_BASE}/device-key`
with Supabase access token; SecureStore per-uid). Reuse for: LLM calls, and web search —
phone calls the edge function DIRECTLY: `POST {SUPABASE_URL}/functions/v1/nemesis-search/v2/search`
with `Authorization: Bearer nmk_…` (same target the web's `/api/workspace/search` proxies to;
native fetch has no CORS). Supabase table access uses the normal supabase-js client (RLS).

## 4. Web: sessions store → cloud (`apps/web/lib/workspace/sessions-store.ts`)

- Keep the store's public API + `useSyncExternalStore` shape IDENTICAL so components don't change.
- Hydrate synchronously from the existing localStorage cache, then async refresh from
  `chat_threads`/`chat_messages`; write-through (fire-and-forget with one retry) on every
  mutation: thread upsert on first message, message insert per turn (assistant message inserted
  once complete, never streaming partials), pin/rename = thread update, delete = hard delete row.
- One-time migration: per-uid flag key `nemesis.web.sessions.cloudmigrated.v1:<uid>` — upload
  existing local sessions (threads + messages, preserving timestamps) once, then set flag.
- Refresh triggers: initial load + `visibilitychange`→visible. No Realtime subscription in v1.
- previewMode and signed-out: pure-local behavior exactly as today (no Supabase calls).
- Message ids: client-generated UUIDs (`crypto.randomUUID`); insert with explicit id + all
  timestamps so the cloud row mirrors local exactly.

## 5. Web: calendar → cloud (`apps/web/lib/workspace/calendar-model.ts` + calendar components)

- Swap localStorage persistence for `calendar_events` rows (per-event rows replace the
  whole-file write; the agent-vs-manual merge rule becomes unnecessary — keep `source:'agent'`
  events read-only in UI). Keep localStorage as offline/warm cache.
- One-time upload of existing local events (flag `nemesis.web.calendar.cloudmigrated.v1:<uid>`).
- CalendarEvent TS shape unchanged (`date` stays `yyyy-mm-dd` string in the app layer).

## 6. Phone: chat → cloud + parity (`apps/mobile/src/lib/chat-threads.ts`, `api/chat.ts`,
   `app/(tabs)/chat.tsx`)

- Cloud thread store: same tables/semantics as §4 (upload-once migration of the local
  `chat-threads-v2-<uid>.json`, offline cache file stays for instant open + offline read;
  pin/delete/rename go to cloud; list refresh on open + app foreground).
- **Streaming**: `import { fetch as expoFetch } from "expo/fetch"` (SDK 56, no new dep) with
  `stream: true`; port the SSE parser from `apps/web/lib/workspace/chat-stream.ts`
  (split lines, `data:` prefixed JSON, `choices[0].delta.content`, ignore `[DONE]`).
  Render deltas into the assistant bubble as they arrive (keep the existing FadeIn).
- **Routing**: port `classifyChatRequest` from `apps/web/lib/workspace/chat-routing.ts`
  (model deepseek-chat vs deepseek-reasoner + searchWeb decision + reasoning_effort) — extract
  shared logic into the mobile tree as a faithful copy (`src/lib/chat-routing.ts`), keep in
  sync comment pointing at the web original.
- **Web search**: when router says search, call nemesis-search (§3), feed results into the
  prompt the same way `chat-api.ts::searchWebContext` does on web; persist sources into the
  assistant message's `meta.sources`; render a compact tappable "Sources" list under the
  assistant message (opens in browser).
- System prompt: adopt the web `CHAT_SYSTEM_PROMPT` so shared threads sound the same.
- Errors map to friendly copy (budget / auth / unreachable) like web `chatErrorKind`.

## 7. Phone: Library + Graph + note → cloud library

- New `apps/mobile/src/api/cloudLibrary.ts`: list (id, path, title, updated_at, created_at,
  kind — `deleted=false`), fetch single doc content by id/path; cache last list + opened
  docs to the existing offline cache layer so offline read keeps working.
- `library.tsx`: same UI; rows from cloud paths (folder tree from path segments). "Created"
  sort options now ENABLED (created_at exists in cloud). Read-only stays; the "…" FAB keeps
  Search/Sort; New note/New folder now say they happen on the web app (until phone editing).
- `note.tsx`: renders cloud doc; `[[wikilinks]]` resolve against cloud paths/titles.
- `graph.tsx`: `lib/note-graph.ts` input = cloud notes (path + content wikiliniks). Same UI.
- Empty state (no pairing anymore): "Your library lives in your account. Create notes on the
  web app and they appear here." + Refresh.

## 8. Phone: Study → cloud

- New `apps/mobile/src/api/cloudStudy.ts`: decks + cards + counts; grading calls RPC
  `grade_study_card` per grade (online required — if offline, block grading with a friendly
  note; the old Mac offline queue is retired).
- `study.tsx`: groups from `Name::Subgroup` deck names (replaces course folders); per-deck
  New/Learn/Due counts ported from web `study-cloud-store.ts` logic; same collapse animations.
- `review.tsx`: reveal/grade flow unchanged; card_type handling: basic + reversed = Q/A,
  cloze = existing cloze reveal; image_occlusion = graceful fallback card ("Open on web for
  image cards") — do NOT attempt image rendering v1.

## 9. Phone: calendar → cloud

- `calendar.tsx` reads `calendar_events`; same Daily/Monthly/Yearly UI. Add minimal event
  create/edit/delete sheet (title, date, optional time, kind, course, note) matching web
  fields; `source:'agent'` events read-only. Offline: cached read-only.

## 10. Phone: removals (missions, pairing, vault)

- Delete routes: `/pair`, `/mission/[id]`; home `/` becomes the chat screen (redirect to
  `/chat`). Drawer: remove the Sessions section; Chats list + New chat remain.
- Remove all use of `api/librarySync.ts` (pairing, E2EE cache, Realtime vault channel),
  `api/missions.ts`, `api/reviewEvents.ts`, mission push deep-links (unknown push routes →
  open home). Delete dead files where no longer imported — but DEPS UNCHANGED (§0).
- Settings: remove "Calendar sync" (ICS) row for now — it was pairing-fed; cloud ICS feed is
  a follow-up. Remove any "Pair with your Mac" empty states app-wide.

## 11. Phone: settings port (web parity where honest)

- Keep sheet structure; add: General (language, tone, nickname, occupation — stored on device,
  same fields as web; both platforms' wiring into the AI is a follow-up), Notifications
  (study reminders / product updates toggles — stored, wiring follow-up), Usage (real: GET
  `{LLM_BASE}/usage` with device key — credits/plan summary like web), Appearance (exists),
  Security & login (email, sign out, delete account — exists). Skip Keyboard/Storage/Voice.
  Subscription stays info-only.

## 12. Ship order + gates

1. Migration applied to prod (additive; advisor check after).
2. Gates: `apps/mobile` tsc + Deno tests + `expo export` + fingerprint == build 18;
   `apps/web` tsc + tests + `next build` if feasible in worktree.
3. PR → owner OK → merge (web auto-deploys) + EAS OTA publish (recipe in ship-ops memory).

## 12b. Amendments made during the build (accepted deviations)

- **Shared-browser cache convention** (added mid-build after two builders independently
  flagged cross-account contamination): all web localStorage caches are scoped per-uid
  (`<base>:<uid>`); the pre-cloud legacy blob at the old unscoped key is claimed ONCE
  globally by the first account to sign in, uploaded, then deleted; AuthProvider sweeps
  `nemesis.web.sessions.*`, `nemesis.web.calendar.*`, and `nemesis_device_key_v1_*` from
  localStorage on SIGNED_OUT. Mobile caches were already per-uid files.
- **§4 "hydrate synchronously" is superseded**: per-uid keys mean hydration waits one tick
  for the signed-in uid (effect-deferred). Accepted — masked by the workspace loading gate.
- Sessions store kept its per-uid one-time-upload flag; calendar dropped its equivalent.
  Both are idempotent-safe; divergence accepted as a cosmetic cleanup follow-up.

## 13. Out of scope this round (say so in the report)

- ICS "Add to iPhone Calendar" rebuild on cloud; phone note EDITING; phone attachments;
  image-occlusion rendering on phone; offline grading queue; Realtime live sync (v1 =
  refresh on open/focus); Mac→cloud vault content migration (desktop-side project);
  wiring General personalization into the AI (both platforms); web system-prompt copy
  still referencing Mac missions.
