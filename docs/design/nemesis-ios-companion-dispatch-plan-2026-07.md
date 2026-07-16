# Nemesis iOS Companion — Dispatch + Push Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an iPhone companion that works like Claude Code's phone dispatch — the student sends a task from their phone, the Nemesis desktop agent runs it on their Mac, and the phone gets live status plus a push notification when the result is ready for review.

**Architecture:** Three pieces. (1) Cloud: three new Supabase tables (`devices`, `agent_missions`, `mission_events`) with row-level security — the shared mailbox both devices read and write. No new edge function needed for v1: both clients talk straight to the database under RLS, and the desktop sends push notifications through Expo's free push API (which needs no server secret — the device token itself is the permission). (2) Desktop: a small "mission dispatcher" service in the existing Electron app that polls for queued missions, claims one atomically, runs it through the agent, streams events back, and fires the push. (3) Mobile: the existing Expo app in `apps/mobile` (currently PharmaOrb-branded), rebranded to Nemesis and given three new things — a missions screen, a live mission detail view, and push-notification registration.

**Tech Stack:** Supabase (Postgres + RLS + Realtime), Expo SDK 56 / React Native 0.85 / expo-router (already in repo), expo-notifications + Expo Push API, Electron main-process TypeScript service (raw `fetch` against PostgREST, matching `nemesis-account.ts` style), EAS Build + TestFlight.

## Global Constraints

- Supabase project ref: `qyjmivntajbigjswhahb` (URL `https://qyjmivntajbigjswhahb.supabase.co`).
- Monorepo work on branch `feat/ios-dispatch` in `~/Desktop/AIcodingProjects/nemesis`. Desktop work on branch `feat/mission-dispatcher` in `~/Desktop/AIcodingProjects/nemesis-desktop-public`. Never commit on `main` in either repo (pushing nemesis `main` auto-deploys the web app).
- Do NOT touch deploy flags on `nemesis-llm`, `nemesis-search`, `nemesis-media` (they require `verify_jwt=false`; redeploying them with defaults causes a prod outage — see memory `nemesis-verify-jwt-deploy-trap`).
- Desktop electron tests run with `npx tsx --test <file>`. The desktop repo commits tsc-emitted `.js` next to `.ts` — run `npm run build` and commit the regenerated `.js` with the `.ts` (memory `nemesis-desktop-js-shadows-tsx`).
- Mobile pure-logic tests also run with `npx tsx --test`. UI is verified by `pnpm typecheck` plus a simulator/dev-build run.
- The agent must never auto-submit schoolwork. Missions produce drafts/results for the student to review — no exceptions.
- All owner-facing summaries in plain English.
- App identity defaults (Phase 0 confirms before first TestFlight upload — bundle ID is permanent once submitted): name **Nemesis**, iOS bundle ID **com.enternemesis.mobile**, scheme **nemesis**.

---

## Phase 0 — Owner decisions (blocking, ~10 minutes of owner time)

Nothing below can reach TestFlight without these. Code tasks 1–8 can proceed in parallel with defaults.

- [ ] **D1 — App identity.** Confirm app name "Nemesis" and bundle ID `com.enternemesis.mobile`. The bundle ID becomes permanent in App Store Connect after first upload.
- [ ] **D2 — Apple credentials.** Owner runs `npx eas login` + `npx eas credentials` once in `apps/mobile` (interactive; needs the Apple Developer account already used for Mac notarization). EAS generates and stores the push key (APNs) automatically. No secrets are pasted into code or chat.
- [ ] **D3 — Metering posture.** Dispatched missions run on the desktop agent and bill tokens exactly like a typed chat message (student meter). Confirm that's acceptable for v1 (recommended: yes — identical to typing the same request on the Mac).
- [ ] **D4 — Scope confirmation.** v1 phone app = missions + push + review. The old PharmaOrb evidence screens (`compare.tsx` etc.) stay in the codebase but are removed from navigation. Full evidence/chat parity returns in a later phase.

---

## Phase 1 — Cloud: dispatch tables (repo `nemesis`, branch `feat/ios-dispatch`)

### Task 1: Migration — devices, agent_missions, mission_events

**Files:**
- Create: `supabase/migrations/20260716T00_agent_dispatch.sql`

**Interfaces:**
- Produces: tables `public.devices`, `public.agent_missions`, `public.mission_events` with the exact columns below. Every later task reads/writes these columns by name — do not rename.

- [ ] **Step 1: Write the migration file**

```sql
-- 20260716T00_agent_dispatch.sql
-- Dispatch mailbox: phone queues missions, desktop claims + runs them,
-- events stream status back. All rows owned by one user; RLS everywhere.

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('desktop', 'ios', 'android', 'web')),
  name text not null default '',
  expo_push_token text,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, kind, name)
);

create table public.agent_missions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  prompt text not null check (char_length(prompt) between 1 and 20000),
  target text not null default 'desktop' check (target in ('desktop')),
  status text not null default 'queued'
    check (status in ('queued','claimed','running','needs_review','done','failed','cancelled')),
  result_summary text,
  claimed_by uuid references public.devices(id) on delete set null,
  created_by uuid references public.devices(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index agent_missions_user_status_idx
  on public.agent_missions (user_id, status, created_at desc);

create table public.mission_events (
  id bigint generated always as identity primary key,
  mission_id uuid not null references public.agent_missions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('status','log','result','error')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index mission_events_mission_idx
  on public.mission_events (mission_id, id);

alter table public.devices enable row level security;
alter table public.agent_missions enable row level security;
alter table public.mission_events enable row level security;

create policy devices_own on public.devices
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy missions_own on public.agent_missions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy mission_events_own on public.mission_events
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Phone subscribes live to events + mission status flips.
alter publication supabase_realtime add table public.mission_events;
alter publication supabase_realtime add table public.agent_missions;
```

- [ ] **Step 2: Apply the migration**

Use the Supabase MCP `apply_migration` tool with name `agent_dispatch` and the SQL above (project `qyjmivntajbigjswhahb`). Do NOT deploy any edge functions in this step.

- [ ] **Step 3: Verify RLS is on and anon sees nothing**

Run via Supabase MCP `execute_sql`:

```sql
select relname, relrowsecurity from pg_class
where relname in ('devices','agent_missions','mission_events');
```

Expected: three rows, all `relrowsecurity = true`.

Then confirm the anon role has no default grants bypass (memory `pharmabro-supabase-anon-default-grant` — that gotcha applies to SECURITY DEFINER functions; we use none here, but verify):

```sql
select grantee, privilege_type from information_schema.role_table_grants
where table_name = 'agent_missions' and grantee in ('anon','authenticated');
```

Expected: rows exist for `authenticated` (normal PostgREST access, filtered by RLS). If `anon` has INSERT/UPDATE, run `revoke insert, update, delete on public.agent_missions from anon;` and repeat for the other two tables.

- [ ] **Step 4: Commit**

```bash
cd ~/Desktop/AIcodingProjects/nemesis
git checkout -b feat/ios-dispatch
git add supabase/migrations/20260716T00_agent_dispatch.sql
git commit -m "feat(cloud): agent dispatch tables (devices, missions, events) with RLS + realtime"
```

---

## Phase 2 — Desktop: mission dispatcher (repo `nemesis-desktop-public`, branch `feat/mission-dispatcher`)

The desktop app's main process gains a background service. Style guide: mirror the existing `electron/update-remote.ts` + `electron/update-remote.test.ts` pattern — pure logic in a module with injected `fetch`, wired in `main.ts`.

### Task 2: Dispatcher core (poll → claim → run → report)

**Files:**
- Create: `apps/desktop/electron/mission-dispatcher.ts`
- Test: `apps/desktop/electron/mission-dispatcher.test.ts`

**Interfaces:**
- Consumes: Postgres tables from Task 1 via PostgREST (`/rest/v1/agent_missions`, `/rest/v1/mission_events`, `/rest/v1/devices`).
- Produces: `createMissionDispatcher(deps): { tick(): Promise<void>, start(intervalMs: number): void, stop(): void }` where `deps = { supabaseUrl: string, anonKey: string, getAccessToken: () => Promise<string | null>, getDeviceId: () => Promise<string>, runMission: (prompt: string, onLog: (line: string) => void) => Promise<{ ok: boolean, summary: string }>, notifyPhone: (missionId: string, title: string, body: string) => Promise<void>, fetchImpl?: typeof fetch }`. Task 3 implements `runMission`; Task 4 implements `notifyPhone`; Task 5 wires all three into `main.ts`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/desktop/electron/mission-dispatcher.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createMissionDispatcher } from './mission-dispatcher'

const URL_BASE = 'https://example.supabase.co'

function fakeFetch(queue: Array<{ match: (url: string, init?: RequestInit) => boolean, respond: () => Response }>) {
  const calls: Array<{ url: string, init?: RequestInit }> = []
  const impl = (async (url: any, init?: RequestInit) => {
    calls.push({ url: String(url), init })
    const hit = queue.find((q) => q.match(String(url), init))
    if (!hit) return new Response('[]', { status: 200 })
    return hit.respond()
  }) as typeof fetch
  return { impl, calls }
}

const baseDeps = () => ({
  supabaseUrl: URL_BASE,
  anonKey: 'anon',
  getAccessToken: async () => 'jwt-123',
  getDeviceId: async () => 'device-1',
  notifyCalls: [] as string[],
})

test('tick claims a queued mission, runs it, reports result and notifies', async () => {
  const d = baseDeps()
  const mission = { id: 'm1', title: 'Summarize PHCY 1205 slides', prompt: 'do it', status: 'queued' }
  const { impl, calls } = fakeFetch([
    { // 1. poll for queued missions
      match: (u, i) => u.includes('/rest/v1/agent_missions') && (i?.method ?? 'GET') === 'GET',
      respond: () => new Response(JSON.stringify([mission]), { status: 200 }),
    },
    { // 2. atomic claim (PATCH ... &status=eq.queued) returns the claimed row
      match: (u, i) => u.includes('status=eq.queued') && i?.method === 'PATCH',
      respond: () => new Response(JSON.stringify([{ ...mission, status: 'claimed' }]), { status: 200 }),
    },
    { // 3+ everything else (event inserts, final status PATCH) succeeds
      match: () => true,
      respond: () => new Response('[]', { status: 201 }),
    },
  ])
  const dispatcher = createMissionDispatcher({
    ...d,
    fetchImpl: impl,
    runMission: async (_prompt, onLog) => { onLog('working'); return { ok: true, summary: 'Draft ready: 40 cards' } },
    notifyPhone: async (id) => { d.notifyCalls.push(id) },
  })
  await dispatcher.tick()

  const patches = calls.filter((c) => c.init?.method === 'PATCH')
  assert.equal(patches.length >= 2, true) // claim + final status
  const finalPatch = JSON.parse(String(patches[patches.length - 1].init?.body))
  assert.equal(finalPatch.status, 'needs_review')
  assert.equal(finalPatch.result_summary, 'Draft ready: 40 cards')
  assert.deepEqual(d.notifyCalls, ['m1'])
})

test('tick does nothing when claim loses the race (empty PATCH result)', async () => {
  const d = baseDeps()
  let ran = false
  const { impl } = fakeFetch([
    { match: (u, i) => (i?.method ?? 'GET') === 'GET', respond: () => new Response(JSON.stringify([{ id: 'm1', prompt: 'p', title: 't', status: 'queued' }]), { status: 200 }) },
    { match: (u, i) => i?.method === 'PATCH', respond: () => new Response('[]', { status: 200 }) },
  ])
  const dispatcher = createMissionDispatcher({
    ...d, fetchImpl: impl,
    runMission: async () => { ran = true; return { ok: true, summary: 's' } },
    notifyPhone: async () => {},
  })
  await dispatcher.tick()
  assert.equal(ran, false)
})

test('runMission failure marks mission failed and still notifies', async () => {
  const d = baseDeps()
  const { impl, calls } = fakeFetch([
    { match: (u, i) => (i?.method ?? 'GET') === 'GET', respond: () => new Response(JSON.stringify([{ id: 'm2', prompt: 'p', title: 't', status: 'queued' }]), { status: 200 }) },
    { match: (u, i) => i?.method === 'PATCH' && u.includes('status=eq.queued'), respond: () => new Response(JSON.stringify([{ id: 'm2', status: 'claimed' }]), { status: 200 }) },
    { match: () => true, respond: () => new Response('[]', { status: 201 }) },
  ])
  const dispatcher = createMissionDispatcher({
    ...d, fetchImpl: impl,
    runMission: async () => { throw new Error('agent crashed') },
    notifyPhone: async (id) => { d.notifyCalls.push(id) },
  })
  await dispatcher.tick()
  const patches = calls.filter((c) => c.init?.method === 'PATCH')
  const finalPatch = JSON.parse(String(patches[patches.length - 1].init?.body))
  assert.equal(finalPatch.status, 'failed')
  assert.deepEqual(d.notifyCalls, ['m2'])
})

test('tick is a no-op when signed out', async () => {
  const { impl, calls } = fakeFetch([])
  const dispatcher = createMissionDispatcher({
    supabaseUrl: URL_BASE, anonKey: 'anon',
    getAccessToken: async () => null,
    getDeviceId: async () => 'device-1',
    fetchImpl: impl,
    runMission: async () => ({ ok: true, summary: 's' }),
    notifyPhone: async () => {},
  })
  await dispatcher.tick()
  assert.equal(calls.length, 0)
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd ~/Desktop/AIcodingProjects/nemesis-desktop-public/apps/desktop
git checkout -b feat/mission-dispatcher
npx tsx --test electron/mission-dispatcher.test.ts
```

Expected: FAIL — `Cannot find module './mission-dispatcher'`.

- [ ] **Step 3: Implement the dispatcher**

```ts
// apps/desktop/electron/mission-dispatcher.ts
// Background service: pulls queued missions from Supabase, claims one
// atomically, runs it through the agent, streams events, notifies the phone.
// Raw PostgREST fetch on purpose — matches nemesis-account.ts, no new deps.

type RunResult = { ok: boolean; summary: string }

export type MissionDispatcherDeps = {
  supabaseUrl: string
  anonKey: string
  getAccessToken: () => Promise<string | null>
  getDeviceId: () => Promise<string>
  runMission: (prompt: string, onLog: (line: string) => void) => Promise<RunResult>
  notifyPhone: (missionId: string, title: string, body: string) => Promise<void>
  fetchImpl?: typeof fetch
}

type MissionRow = { id: string; title: string; prompt: string; status: string }

export function createMissionDispatcher(deps: MissionDispatcherDeps) {
  const doFetch = deps.fetchImpl ?? fetch
  let timer: ReturnType<typeof setInterval> | null = null
  let busy = false

  const rest = async (path: string, token: string, init?: RequestInit) => {
    const res = await doFetch(`${deps.supabaseUrl}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: deps.anonKey,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
        ...(init?.headers ?? {}),
      },
    })
    if (!res.ok) throw new Error(`postgrest ${res.status} on ${path}`)
    const text = await res.text()
    return text ? JSON.parse(text) : []
  }

  // RLS requires user_id on inserts; read it from the JWT payload.
  const userIdFromToken = (token: string): string =>
    JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('utf8')).sub

  const emit = (token: string, missionId: string, event: { type: string; payload: Record<string, unknown> }) =>
    rest('mission_events', token, {
      method: 'POST',
      body: JSON.stringify({ mission_id: missionId, user_id: userIdFromToken(token), ...event }),
    }).catch(() => {}) // event loss is tolerable; status PATCH is the source of truth

  async function tick(): Promise<void> {
    if (busy) return
    const token = await deps.getAccessToken()
    if (!token) return
    busy = true
    try {
      const queued = (await rest(
        'agent_missions?status=eq.queued&target=eq.desktop&order=created_at.asc&limit=1',
        token,
      )) as MissionRow[]
      if (!queued.length) return
      const mission = queued[0]
      const deviceId = await deps.getDeviceId()

      // Atomic claim: only wins if the row is still queued.
      const claimed = (await rest(
        `agent_missions?id=eq.${mission.id}&status=eq.queued`,
        token,
        { method: 'PATCH', body: JSON.stringify({ status: 'claimed', claimed_by: deviceId, updated_at: new Date().toISOString() }) },
      )) as MissionRow[]
      if (!claimed.length) return // another device won the race

      await rest(`agent_missions?id=eq.${mission.id}`, token, {
        method: 'PATCH', body: JSON.stringify({ status: 'running', updated_at: new Date().toISOString() }),
      })
      await emit(token, mission.id, { type: 'status', payload: { status: 'running' } })

      let outcome: RunResult
      try {
        outcome = await deps.runMission(mission.prompt, (line) => {
          void emit(token, mission.id, { type: 'log', payload: { line } })
        })
      } catch (err) {
        outcome = { ok: false, summary: err instanceof Error ? err.message : 'mission failed' }
      }

      const finalStatus = outcome.ok ? 'needs_review' : 'failed'
      await rest(`agent_missions?id=eq.${mission.id}`, token, {
        method: 'PATCH',
        body: JSON.stringify({ status: finalStatus, result_summary: outcome.summary, updated_at: new Date().toISOString() }),
      })
      await emit(token, mission.id, {
        type: outcome.ok ? 'result' : 'error',
        payload: { summary: outcome.summary },
      })
      await deps.notifyPhone(
        mission.id,
        outcome.ok ? 'Ready for review' : 'Mission failed',
        `${mission.title}: ${outcome.summary}`.slice(0, 170),
      ).catch(() => {})
    } finally {
      busy = false
    }
  }

  return {
    tick,
    start(intervalMs: number) {
      if (timer) return
      timer = setInterval(() => { void tick() }, intervalMs)
    },
    stop() {
      if (timer) { clearInterval(timer); timer = null }
    },
  }
}
```

For the test file: fake JWTs must have a decodable payload segment — build the token in `baseDeps` as `` `x.${Buffer.from(JSON.stringify({ sub: 'user-1' })).toString('base64')}.y` `` instead of the literal `'jwt-123'`.

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx tsx --test electron/mission-dispatcher.test.ts
```

Expected: 4 passing.

- [ ] **Step 5: Build + commit (include emitted .js)**

```bash
npm run build
git add electron/mission-dispatcher.ts electron/mission-dispatcher.test.ts dist/ 2>/dev/null || git add electron/
git commit -m "feat(desktop): mission dispatcher core — poll, atomic claim, run, report"
```

### Task 3: Mission runner — wire to the real agent

**Files:**
- Create: `apps/desktop/electron/mission-runner.ts`
- Test: `apps/desktop/electron/mission-runner.test.ts`

**Interfaces:**
- Produces: `createMissionRunner(gateway): (prompt: string, onLog: (line: string) => void) => Promise<{ ok: boolean, summary: string }>` — the exact `runMission` shape Task 2 consumes.
- Consumes: the desktop's existing agent gateway. Recon required first (10 min): read `apps/desktop/src/app/gateway/` and `apps/desktop/src/hermes.ts` to find how the chat UI opens a session and sends a message (the same path a typed chat message takes). The runner starts a fresh agent session, sends the mission prompt prefixed with the standing header below, forwards streamed assistant text lines to `onLog`, and resolves with the final assistant message as `summary` (truncated to 500 chars).

Standing prompt header (verbatim, prepended to every mission prompt):

```text
[Dispatched from the student's phone. Work autonomously; do not wait for replies.
Produce a draft/result for review. Never submit anything to a school portal.]
```

- [ ] **Step 1: Recon — identify the gateway send/stream API and paste the 3 relevant signatures into the test file as a comment.**
- [ ] **Step 2: Write a failing test** that fakes the gateway object (same three methods you found) and asserts: prompt arrives with the standing header, streamed chunks reach `onLog`, final message becomes `summary`, a gateway error resolves `{ ok: false }` rather than throwing.
- [ ] **Step 3: Implement `createMissionRunner` against the real gateway API.**
- [ ] **Step 4: `npx tsx --test electron/mission-runner.test.ts` — expected PASS.**
- [ ] **Step 5: Commit** `feat(desktop): mission runner bridges dispatcher to agent gateway`.

### Task 4: Push sender (Expo Push API)

**Files:**
- Create: `apps/desktop/electron/expo-push.ts`
- Test: `apps/desktop/electron/expo-push.test.ts`

**Interfaces:**
- Produces: `createPhoneNotifier(deps): (missionId: string, title: string, body: string) => Promise<void>` where `deps = { supabaseUrl, anonKey, getAccessToken, fetchImpl? }` — the exact `notifyPhone` shape Task 2 consumes.
- Behavior: reads the user's own `devices` rows (`kind=eq.ios`, `expo_push_token=not.is.null`) via PostgREST under RLS, then POSTs to `https://exp.host/--/api/v2/push/send` with body `[{ to: <token>, title, body, data: { missionId } }]`. Expo's push endpoint needs no API key — possession of the push token is the capability. No tokens, no-op. Never throws (log and swallow; push is best-effort).

- [ ] **Step 1: Write failing test** — fake fetch; case A: one iOS device row → exactly one exp.host POST with correct `to`/`title`/`body`/`data.missionId`; case B: zero rows → zero exp.host calls; case C: exp.host 500 → resolves without throwing.
- [ ] **Step 2: Run — expected FAIL (module missing).**
- [ ] **Step 3: Implement (≈40 lines, same `rest` helper pattern as Task 2).**
- [ ] **Step 4: Run — expected PASS.**
- [ ] **Step 5: Commit** `feat(desktop): expo push notifier for mission completion`.

### Task 5: Wire dispatcher into main process + register desktop device

**Files:**
- Modify: `apps/desktop/electron/main.ts` (after app-ready + account restore; follow how existing background services like the updater are started there)
- Create: `apps/desktop/electron/device-registration.ts` + `.test.ts`

**Interfaces:**
- Consumes: Task 2 `createMissionDispatcher`, Task 3 `createMissionRunner`, Task 4 `createPhoneNotifier`, plus the existing account/session accessor in `apps/desktop/src/nemesis-account.ts` (exports `SUPABASE_URL`; the session/access-token getter is nearby — recon its exact export name during implementation and use it for `getAccessToken`).
- `device-registration.ts` produces: `ensureDesktopDevice(deps): Promise<string>` — upserts `devices` row (`kind: 'desktop'`, `name: os.hostname()`, `on_conflict=user_id,kind,name`), caches the returned id in `userData/device-id.json`, returns it. This is Task 2's `getDeviceId`.
- Wiring: `dispatcher.start(30_000)` when a session exists; `dispatcher.stop()` on sign-out. Poll only while app is running — closed Mac = missions stay queued (by design; phone copy explains this in Task 9).

- [ ] **Step 1: TDD `device-registration.ts`** (failing test: upsert POST body + cached-id reuse; then implement; then pass).
- [ ] **Step 2: Wire in `main.ts`** — construct deps, start/stop with session lifecycle.
- [ ] **Step 3: Manual smoke:** `npm run dev`, sign in, insert a fake queued mission via Supabase MCP `execute_sql` (`insert into agent_missions (user_id, title, prompt) values ('<your-user-uuid>', 'smoke', 'Say hello and stop.');`), watch it flip `queued → running → needs_review` within ~60s and confirm a `mission_events` result row exists.
- [ ] **Step 4: `npm run build`, commit** `feat(desktop): start mission dispatcher with session lifecycle`.

---

## Phase 3 — Mobile: Nemesis companion (repo `nemesis`, branch `feat/ios-dispatch`)

### Task 6: Rebrand + navigation skeleton

**Files:**
- Modify: `apps/mobile/app.json` — `name: "Nemesis"`, `slug: "nemesis"`, `scheme: "nemesis"`, `ios.bundleIdentifier: "com.enternemesis.mobile"` (Phase 0 D1 values), bump `version` to `0.1.0`.
- Modify: `apps/mobile/src/app/_layout.tsx` — route missions as the home screen; remove `compare` from navigation (file stays).
- Replace: `apps/mobile/assets/images/icon.png` with the current Nemesis logo (same source image used in the desktop repo + landing; export 1024×1024).

- [ ] **Step 1: Apply config changes; `pnpm --filter @pharmabro/mobile typecheck` passes.**
- [ ] **Step 2: Commit** `feat(mobile): rebrand to Nemesis, missions-first navigation`.

### Task 7: Missions API module

**Files:**
- Create: `apps/mobile/src/api/missions.ts`
- Test: `apps/mobile/src/api/missions.test.ts` (pure helpers only; run `npx tsx --test src/api/missions.test.ts`)

**Interfaces:**
- Consumes: `supabase` client from `apps/mobile/src/api/supabase.ts` (already exists), tables from Task 1.
- Produces:

```ts
export type Mission = {
  id: string; title: string; prompt: string; status:
    'queued'|'claimed'|'running'|'needs_review'|'done'|'failed'|'cancelled';
  result_summary: string | null; created_at: string; updated_at: string;
}
export type MissionEvent = { id: number; mission_id: string; type: 'status'|'log'|'result'|'error'; payload: Record<string, unknown>; created_at: string }

export function titleFromPrompt(prompt: string): string          // first line, trimmed, ≤80 chars, fallback 'New mission'
export function statusLabel(m: Mission, desktopOnline: boolean): string
// 'Waiting for your Mac' (queued & !desktopOnline) | 'Queued' | 'Running on your Mac'
// | 'Ready for review' | 'Done' | 'Failed' | 'Cancelled'
export async function createMission(prompt: string): Promise<Mission>       // insert with user_id from auth.getUser(), title via titleFromPrompt
export async function listMissions(): Promise<Mission[]>                    // newest first, limit 50
export async function markReviewed(id: string): Promise<void>               // needs_review -> done
export async function cancelMission(id: string): Promise<void>              // queued -> cancelled (only if still queued)
export function subscribeMission(id: string, onEvent: (e: MissionEvent) => void, onStatus: (m: Mission) => void): () => void
// supabase.channel realtime on mission_events INSERT (filter mission_id) + agent_missions UPDATE (filter id); returns unsubscribe
export async function isDesktopOnline(): Promise<boolean>                   // devices row kind='desktop' with last_seen_at within 5 min
```

- [ ] **Step 1: Failing tests for the two pure helpers** (`titleFromPrompt`: multiline → first line, 200-char line → 80 chars + '…', empty → 'New mission'; `statusLabel`: all seven statuses plus the queued/offline branch).
- [ ] **Step 2: Run `npx tsx --test src/api/missions.test.ts` — FAIL.**
- [ ] **Step 3: Implement the module** (pure helpers + supabase calls as specced above; `subscribeMission` uses `supabase.channel(\`mission-\${id}\`).on('postgres_changes', ...)`).
- [ ] **Step 4: Tests PASS + `pnpm --filter @pharmabro/mobile typecheck` clean.**
- [ ] **Step 5: Commit** `feat(mobile): missions api — create/list/subscribe/review`.

### Task 8: Screens — mission list, composer, live detail

**Files:**
- Create: `apps/mobile/src/app/index.tsx` (mission list + composer — home screen)
- Create: `apps/mobile/src/app/mission/[id].tsx` (live detail)
- Reuse: components from `apps/mobile/src/components/ui.tsx`, theme tokens from `src/theme/tokens.ts` (monochrome + red accent — match desktop identity, no emojis anywhere in UI copy).

Home screen behavior: text field ("What should Nemesis work on?") + send button → `createMission`, optimistic prepend; list rows show title, `statusLabel(m, desktopOnline)`, relative time; tap → detail; pull-to-refresh → `listMissions`; poll `isDesktopOnline()` every 60s while focused.

Detail screen behavior: header (title + status), scrolling event feed via `subscribeMission` merged with initial fetch of the last 200 `mission_events` for the id (direct supabase select, ascending); when status is `needs_review` show `result_summary` in a highlighted card with buttons **Mark reviewed** (`markReviewed`) and **Copy result**; `queued` shows **Cancel** (`cancelMission`); unsubscribe on unmount.

- [ ] **Step 1: Build both screens.**
- [ ] **Step 2: Verify:** `pnpm --filter @pharmabro/mobile typecheck`, then `pnpm --filter @pharmabro/mobile start` → iOS simulator: sign in, send "Say hello and stop." with desktop app running (Task 5) → watch live flip to Ready for review, mark reviewed.
- [ ] **Step 3: Commit** `feat(mobile): missions home + live mission detail`.

### Task 9: Push registration

**Files:**
- Modify: `apps/mobile/package.json` — add `expo-notifications` (`npx expo install expo-notifications`)
- Create: `apps/mobile/src/lib/push.ts`
- Modify: `apps/mobile/src/auth/AuthProvider.tsx` — call `registerForPush()` after a session exists
- Modify: `apps/mobile/app.json` — add `"expo-notifications"` to plugins

**Interfaces:**
- Produces: `registerForPush(): Promise<void>` — request permission (soft-fail if denied); `Notifications.getExpoPushTokenAsync()`; upsert into `devices` (`kind: 'ios'`, `name: Device.deviceName ?? 'iPhone'`, `expo_push_token`, `on_conflict: 'user_id,kind,name'`). Also set a foreground handler (show banner) and a response handler that routes taps to `/mission/[id]` via `data.missionId` (expo-router `router.push`).
- Copy rule: when a mission is created while `isDesktopOnline()` is false, the composer shows a small note: "Your Mac is offline — this will start when Nemesis opens there." (This is the honest answer to closed-laptop dispatch; cloud execution is a later phase.)

- [ ] **Step 1: Implement + typecheck.**
- [ ] **Step 2: Commit** `feat(mobile): push registration + notification deep-link to mission`.
- [ ] Note: push tokens do not work in the simulator or Expo Go — full verification happens in Task 10 on a physical iPhone.

### Task 10: Dev build, device test, TestFlight

Requires Phase 0 D1 + D2 complete. Owner present for the two interactive EAS commands.

- [ ] **Step 1:** `cd apps/mobile && npx eas build --profile development --platform ios` (first run walks through credentials; APNs key auto-created).
- [ ] **Step 2:** Install the dev build on the owner's iPhone (QR from EAS), sign in.
- [ ] **Step 3: End-to-end acceptance:** phone dispatches "Make 5 flashcards from my latest lecture notes" → Mac (app open) picks it up ≤30s → live logs on phone → push arrives on iPhone lock screen → tap opens mission detail → Mark reviewed. Screenshot each stage for the owner.
- [ ] **Step 4:** `npx eas build --profile production --platform ios` then `npx eas submit --platform ios` → TestFlight internal testing.
- [ ] **Step 5: Commit any config deltas; open PRs** in both repos (desktop PR + monorepo PR reference each other; plain-English descriptions).

---

## Explicitly out of scope (separate plans, in order)

1. **Cloud-target missions** (run research/chat missions in cloud when the Mac is offline) — needs a worker + metering call, builds on the same tables (`target` gains `'cloud'`).
2. **LMS event pipeline** (ICS calendar ingestion → email triggers → Chrome extension → sweeps) — the architecture audit doc; events land as pushes through the same `devices` table.
3. **Approval center v2** (structured diffs/artifacts on the phone, not just text summaries) and **study review on phone** (FSRS state sync).
4. **Android** — Expo makes it near-free later; do not test/ship it in v1.

## Risks

- **Bundle ID is forever** — hence Phase 0 D1 before any upload.
- **Realtime on RLS tables**: Supabase realtime respects RLS for `postgres_changes`, but only with the publication set up as in Task 1; if events don't stream, check `supabase_realtime` publication membership first.
- **Poll-based desktop claim** (30s) is deliberate v1 simplicity; upgrade path is Supabase Realtime in the main process, not shorter polls.
- **App Store review**: a login-required utility app is normally fine, but reviewers need a demo account — prepare one before submit.
- **Meter**: each mission bills like a desktop chat (D3). No new metering code needed in v1 since execution reuses the desktop agent path.

## Design parity with the desktop (added 2026-07-16, owner ask)

The goal is one visual identity, two platforms — not a pixel-copy of the desktop
window onto a phone.

**Mechanism: a shared token file.** The desktop's entire look is already variables
in `apps/desktop/src/styles.css`: theme seeds (`themes/presets.ts` — the `mono` and
`nemesis` presets), the accent-mix percentages, `--radius-scalar` (now 1.0), spacing,
and type sizes. Task 6.5 (new): a small script (`scripts/export-design-tokens.mjs`
in nemesis-desktop-public) parses those into `packages/design-tokens/tokens.json`
committed to the `nemesis` monorepo; `apps/mobile/src/theme/` consumes it as the
single source for its React Native styles. Change a token on desktop → regenerate →
the phone moves with it. No hand-copied hex values anywhere in mobile code.

**Typography: free parity.** Desktop UI font = the system stack (SF Pro on Mac).
iOS renders SF Pro natively — the phone matches by default. JetBrains Mono (bundled
on desktop for code) ships in the mobile app via expo-font for code snippets only.

**Rules that carry over as tokens/tests, not vibes:** monochrome surfaces with ONE
crimson accent; chrome (tab bar, headers) strictly neutral — the same
no-accent-wash rule the desktop sidebars just adopted (PR #14); dark + light derived
from the same seeds; radius scale from the same dial.

**Component mapping (role, not pixels):** desktop sidebar → iOS bottom tab bar;
session list → missions list; composer → mission composer; approval/review cards
reuse the desktop's card grammar (1px neutral stroke, 8px-scale radius, quiet
elevation). Navigation stays platform-native (expo-router stacks/tabs) so the app
feels like an iPhone app wearing the same uniform, not an embedded website.

**Verification ritual:** before TestFlight, a side-by-side screenshot sheet
(desktop screen vs phone screen per surface) reviewed against the token sheet;
any hex value in mobile source that isn't from tokens.json fails review.
