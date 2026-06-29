# PharmaOrb Product Ecosystem Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn PharmaOrb into one evidence OS with three connected surfaces: web research workspace, mobile capture/alerts companion, and supervised research agent.

**Architecture:** Build shared product primitives first: projects, paper library, capture items, agent jobs, and entitlements all attach to one account and one evidence backend. Web remains the primary workspace; mobile and agent feed work into the same project/library/watchlist model instead of creating separate data silos.

**Tech Stack:** Next.js App Router, Expo/React Native, TypeScript shared package, Supabase/Postgres/RLS, existing evidence broker, existing reports/export stack, future Playwright-based browser agent.

---

## Current Repo Anchors

- Web app: `apps/web`
- Mobile app: `apps/mobile`
- Shared domain package: `packages/shared/src`
- Supabase migrations: `supabase/migrations`
- Existing projects: `supabase/migrations/20260623000000_projects.sql`
- Existing conversations: `supabase/migrations/20260607001303_conversations.sql`
- Existing research reports: `supabase/migrations/0123_evidence_reports_entitlements.sql`, `supabase/functions/research`
- Existing watchlists/monitoring: `supabase/functions/watch`, `supabase/functions/watch-digest`
- Evidence broker branch additions: `apps/web/lib/evidence`, `apps/web/app/api/v1/evidence/search/route.ts`, `supabase/migrations/20260629040206_evidence_api_cache.sql`

## Product Direction

PharmaOrb should be branded as one ecosystem:

```text
PharmaOrb Web App      = research workspace
PharmaOrb Mobile       = capture, alerts, quick answers
PharmaOrb Agent/Desktop = supervised research operator
```

The user should not feel like they are buying three products. They should feel like they have one evidence operating system with specialized entry points.

## Task 1: Shared Product Surface Contract

**Files:**
- Create: `packages/shared/src/product-ecosystem.ts`
- Create: `packages/shared/src/product-ecosystem.test.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Write the failing contract test**

```ts
import assert from "node:assert/strict";
import {
  productSurfaces,
  planTiers,
  canUseSurface,
  defaultSurfaceForJob,
} from "./product-ecosystem";

assert.deepEqual(productSurfaces, ["web", "mobile", "agent"]);
assert.deepEqual(planTiers, ["free", "web_pro", "researcher", "agent", "agent_pro", "teams", "enterprise"]);

assert.equal(canUseSurface("free", "web"), true);
assert.equal(canUseSurface("free", "agent"), false);
assert.equal(canUseSurface("agent", "agent"), true);
assert.equal(defaultSurfaceForJob("scan_label"), "mobile");
assert.equal(defaultSurfaceForJob("evidence_table_extraction"), "agent");
assert.equal(defaultSurfaceForJob("literature_review"), "web");

console.log("product ecosystem contract tests passed");
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
cd packages/shared
pnpm exec tsx src/product-ecosystem.test.ts
```

Expected: fail with `Cannot find module './product-ecosystem'`.

- [ ] **Step 3: Implement the shared contract**

```ts
export const productSurfaces = ["web", "mobile", "agent"] as const;
export type ProductSurface = (typeof productSurfaces)[number];

export const planTiers = [
  "free",
  "web_pro",
  "researcher",
  "agent",
  "agent_pro",
  "teams",
  "enterprise",
] as const;
export type ProductPlanTier = (typeof planTiers)[number];

export const researchJobTypes = [
  "evidence_chat",
  "literature_review",
  "paper_library",
  "scan_label",
  "capture_article",
  "watchlist_alert",
  "evidence_table_extraction",
  "pdf_summarization",
  "zotero_organization",
  "portal_import",
  "report_drafting",
] as const;
export type ResearchJobType = (typeof researchJobTypes)[number];

const surfaceAccess: Record<ProductPlanTier, ProductSurface[]> = {
  free: ["web", "mobile"],
  web_pro: ["web", "mobile"],
  researcher: ["web", "mobile"],
  agent: ["web", "mobile", "agent"],
  agent_pro: ["web", "mobile", "agent"],
  teams: ["web", "mobile", "agent"],
  enterprise: ["web", "mobile", "agent"],
};

const jobSurface: Record<ResearchJobType, ProductSurface> = {
  evidence_chat: "web",
  literature_review: "web",
  paper_library: "web",
  scan_label: "mobile",
  capture_article: "mobile",
  watchlist_alert: "mobile",
  evidence_table_extraction: "agent",
  pdf_summarization: "agent",
  zotero_organization: "agent",
  portal_import: "agent",
  report_drafting: "agent",
};

export function canUseSurface(plan: ProductPlanTier, surface: ProductSurface): boolean {
  return surfaceAccess[plan].includes(surface);
}

export function defaultSurfaceForJob(job: ResearchJobType): ProductSurface {
  return jobSurface[job];
}
```

- [ ] **Step 4: Export from shared package**

Add to `packages/shared/src/index.ts`:

```ts
export * from "./product-ecosystem";
```

- [ ] **Step 5: Run tests**

Run:

```bash
cd packages/shared
pnpm exec tsx src/product-ecosystem.test.ts
pnpm test
```

Expected: product ecosystem contract test passes; existing shared tests stay green.

## Task 2: Unified Research Artifacts Schema

**Files:**
- Create: `supabase/migrations/<timestamp>_research_artifacts_and_agent_jobs.sql`

- [ ] **Step 1: Create the migration**

Run:

```bash
pnpm supabase migration new research_artifacts_and_agent_jobs
```

Expected: Supabase CLI creates a timestamped migration under `supabase/migrations/`.

- [ ] **Step 2: Add shared artifact tables**

Use this SQL in the generated migration:

```sql
create table if not exists public.research_artifacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  surface text not null check (surface in ('web', 'mobile', 'agent')),
  artifact_type text not null check (
    artifact_type in (
      'paper',
      'pdf',
      'screenshot',
      'label_scan',
      'voice_note',
      'url',
      'dataset',
      'figure',
      'protocol',
      'draft',
      'zotero_item',
      'agent_output'
    )
  ),
  title text not null,
  source_url text,
  storage_path text,
  text_content text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agent_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  job_type text not null check (
    job_type in (
      'evidence_table_extraction',
      'pdf_summarization',
      'zotero_organization',
      'portal_import',
      'report_drafting',
      'study_monitoring'
    )
  ),
  status text not null default 'draft' check (
    status in ('draft', 'awaiting_approval', 'running', 'blocked', 'completed', 'failed', 'cancelled')
  ),
  user_prompt text not null,
  approved_scope jsonb not null default '{}'::jsonb,
  output_artifact_id uuid references public.research_artifacts(id) on delete set null,
  audit_log jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists research_artifacts_user_created_idx
  on public.research_artifacts (user_id, created_at desc);
create index if not exists research_artifacts_project_idx
  on public.research_artifacts (project_id, created_at desc)
  where project_id is not null;
create index if not exists research_artifacts_metadata_gin_idx
  on public.research_artifacts using gin (metadata);
create index if not exists agent_jobs_user_status_idx
  on public.agent_jobs (user_id, status, created_at desc);

alter table public.research_artifacts enable row level security;
alter table public.agent_jobs enable row level security;

create policy research_artifacts_owner on public.research_artifacts
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy agent_jobs_owner on public.agent_jobs
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on table public.research_artifacts, public.agent_jobs to authenticated;
grant select, insert, update, delete on table public.research_artifacts, public.agent_jobs to service_role;

drop trigger if exists research_artifacts_updated_at_trigger on public.research_artifacts;
create trigger research_artifacts_updated_at_trigger
  before update on public.research_artifacts
  for each row execute function public.core_sources_set_updated_at();

drop trigger if exists agent_jobs_updated_at_trigger on public.agent_jobs;
create trigger agent_jobs_updated_at_trigger
  before update on public.agent_jobs
  for each row execute function public.core_sources_set_updated_at();

comment on table public.research_artifacts is
  'Unified user-owned research artifacts captured from web, mobile, or agent surfaces.';
comment on table public.agent_jobs is
  'Supervised research-operator jobs with user-approved scope and audit log.';
```

- [ ] **Step 3: Run migration lint**

Run:

```bash
pnpm supabase db lint --local --fail-on error
```

Expected: pass when local Supabase is running. If local DB is not running, record the connection error and run against a preview DB before deployment.

## Task 3: Web Paper Library And Artifact API

**Files:**
- Create: `apps/web/lib/research-artifacts/types.ts`
- Create: `apps/web/lib/research-artifacts/types.test.ts`
- Create: `apps/web/app/api/research-artifacts/route.ts`
- Create: `apps/web/app/app/library/page.tsx`
- Modify: `apps/web/components/AppShell.tsx`

- [ ] **Step 1: Add artifact type tests**

```ts
import assert from "node:assert/strict";
import { artifactTypes, captureSurfaces } from "./types";

assert.ok(artifactTypes.includes("paper"));
assert.ok(artifactTypes.includes("label_scan"));
assert.ok(artifactTypes.includes("agent_output"));
assert.deepEqual(captureSurfaces, ["web", "mobile", "agent"]);

console.log("research artifact type tests passed");
```

- [ ] **Step 2: Implement artifact constants**

```ts
export const captureSurfaces = ["web", "mobile", "agent"] as const;
export type CaptureSurface = (typeof captureSurfaces)[number];

export const artifactTypes = [
  "paper",
  "pdf",
  "screenshot",
  "label_scan",
  "voice_note",
  "url",
  "dataset",
  "figure",
  "protocol",
  "draft",
  "zotero_item",
  "agent_output",
] as const;
export type ArtifactType = (typeof artifactTypes)[number];
```

- [ ] **Step 3: Add authenticated artifact route**

Create `apps/web/app/api/research-artifacts/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { userClient, verifyBearer } from "@/lib/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = await verifyBearer(req);
  if (!auth.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const supabase = userClient(auth.accessToken);
  const { data, error } = await supabase
    .from("research_artifacts")
    .select("id,project_id,surface,artifact_type,title,source_url,created_at,metadata")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ artifacts: data ?? [] });
}
```

- [ ] **Step 4: Add web library page**

Create `apps/web/app/app/library/page.tsx`:

```tsx
export default function LibraryPage() {
  return (
    <main className="app-main app-main--reading">
      <section className="surface-panel">
        <p className="eyebrow">Library</p>
        <h1>Research artifacts</h1>
        <p className="muted">
          Papers, PDFs, captures, scans, drafts, and agent outputs will appear here across web, mobile, and agent workflows.
        </p>
      </section>
    </main>
  );
}
```

- [ ] **Step 5: Add navigation**

Modify `apps/web/components/AppShell.tsx` to include a `Library` navigation item pointing at `/app/library`, following the existing sidebar pattern.

- [ ] **Step 6: Verify web app**

Run:

```bash
cd apps/web
pnpm exec tsx lib/research-artifacts/types.test.ts
pnpm --filter @pharmaorb/web typecheck
pnpm --filter @pharmaorb/web build
```

Expected: tests, typecheck, and build pass.

## Task 4: Mobile Capture MVP

**Files:**
- Create: `apps/mobile/src/api/researchArtifacts.ts`
- Create: `apps/mobile/src/api/researchArtifacts.test.ts`
- Create: `apps/mobile/src/features/capture/CaptureDraft.ts`
- Modify: `apps/mobile/src/api/types.ts`

- [ ] **Step 1: Write capture API test**

```ts
import assert from "node:assert/strict";
import { buildArtifactPayload } from "./researchArtifacts";

const payload = buildArtifactPayload({
  artifactType: "label_scan",
  title: "Supplement label",
  textContent: "Creatine monohydrate 5g",
  metadata: { barcode: "123" },
});

assert.equal(payload.artifact_type, "label_scan");
assert.equal(payload.surface, "mobile");
assert.equal(payload.title, "Supplement label");
assert.equal(payload.text_content, "Creatine monohydrate 5g");

console.log("mobile research artifact tests passed");
```

- [ ] **Step 2: Implement payload builder**

```ts
export function buildArtifactPayload(input: {
  artifactType: "screenshot" | "label_scan" | "voice_note" | "url";
  title: string;
  textContent?: string;
  sourceUrl?: string;
  metadata?: Record<string, unknown>;
}) {
  return {
    surface: "mobile" as const,
    artifact_type: input.artifactType,
    title: input.title,
    text_content: input.textContent ?? null,
    source_url: input.sourceUrl ?? null,
    metadata: input.metadata ?? {},
  };
}
```

- [ ] **Step 3: Add capture draft type**

```ts
export interface CaptureDraft {
  kind: "screenshot" | "label_scan" | "voice_note" | "url";
  title: string;
  text: string | null;
  sourceUrl: string | null;
  createdAt: string;
}
```

- [ ] **Step 4: Verify mobile tests**

Run:

```bash
cd apps/mobile
pnpm exec tsx src/api/researchArtifacts.test.ts
```

Expected: pass.

## Task 5: Agent Job MVP

**Files:**
- Create: `apps/web/lib/agent-jobs/types.ts`
- Create: `apps/web/lib/agent-jobs/types.test.ts`
- Create: `apps/web/app/api/agent-jobs/route.ts`
- Create: `apps/web/app/app/agent/page.tsx`
- Modify: `apps/web/components/AppShell.tsx`

- [ ] **Step 1: Add agent job safety tests**

```ts
import assert from "node:assert/strict";
import { requiresApproval, allowedAgentJobTypes } from "./types";

assert.ok(allowedAgentJobTypes.includes("evidence_table_extraction"));
assert.equal(requiresApproval("portal_import"), true);
assert.equal(requiresApproval("report_drafting"), false);

console.log("agent job type tests passed");
```

- [ ] **Step 2: Implement agent job safety model**

```ts
export const allowedAgentJobTypes = [
  "evidence_table_extraction",
  "pdf_summarization",
  "zotero_organization",
  "portal_import",
  "report_drafting",
  "study_monitoring",
] as const;

export type AgentJobType = (typeof allowedAgentJobTypes)[number];

export function requiresApproval(jobType: AgentJobType): boolean {
  return jobType === "portal_import" || jobType === "zotero_organization";
}
```

- [ ] **Step 3: Add authenticated agent job route**

Create `apps/web/app/api/agent-jobs/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { userClient, verifyBearer } from "@/lib/server";
import { requiresApproval, type AgentJobType } from "@/lib/agent-jobs/types";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const auth = await verifyBearer(req);
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json()) as { job_type?: AgentJobType; user_prompt?: string; project_id?: string };
  if (!body.job_type || !body.user_prompt?.trim()) {
    return NextResponse.json({ error: "missing_job_type_or_prompt" }, { status: 400 });
  }

  const supabase = userClient(auth.accessToken);
  const status = requiresApproval(body.job_type) ? "awaiting_approval" : "draft";
  const { data, error } = await supabase
    .from("agent_jobs")
    .insert({
      user_id: auth.user.id,
      project_id: body.project_id ?? null,
      job_type: body.job_type,
      status,
      user_prompt: body.user_prompt.trim(),
    })
    .select("id,status,job_type,created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ job: data });
}
```

- [ ] **Step 4: Add agent page**

Create `apps/web/app/app/agent/page.tsx`:

```tsx
export default function AgentPage() {
  return (
    <main className="app-main app-main--reading">
      <section className="surface-panel">
        <p className="eyebrow">Research Operator</p>
        <h1>Agent jobs</h1>
        <p className="muted">
          Draft supervised jobs for evidence table extraction, PDF summarization, Zotero organization, portal imports, report drafting, and study monitoring.
        </p>
      </section>
    </main>
  );
}
```

- [ ] **Step 5: Verify web app**

Run:

```bash
cd apps/web
pnpm exec tsx lib/agent-jobs/types.test.ts
pnpm --filter @pharmaorb/web typecheck
pnpm --filter @pharmaorb/web build
```

Expected: tests, typecheck, and build pass.

## Task 6: Entitlement Ladder

**Files:**
- Modify: `packages/shared/src/entitlements.ts`
- Modify: `packages/shared/src/entitlements.test.ts`
- Modify: `supabase/migrations/0122_entitlements_usage_stripe.sql` or create a new additive migration

- [ ] **Step 1: Add entitlement tests**

```ts
import assert from "node:assert/strict";
import { getPlanEntitlements } from "./entitlements";

assert.equal(getPlanEntitlements("free").agent_hours_monthly, 0);
assert.equal(getPlanEntitlements("web_pro").projects_limit > getPlanEntitlements("free").projects_limit, true);
assert.equal(getPlanEntitlements("agent").agent_hours_monthly, 10);
assert.equal(getPlanEntitlements("agent_pro").agent_hours_monthly, 30);

console.log("ecosystem entitlement tests passed");
```

- [ ] **Step 2: Add plan entitlement fields**

Extend entitlement output with:

```ts
agent_hours_monthly: number;
projects_limit: number;
library_items_limit: number;
mobile_capture_enabled: boolean;
agent_jobs_enabled: boolean;
team_projects_enabled: boolean;
```

- [ ] **Step 3: Add additive SQL seed update**

Create a new migration with rows for:

```text
free
web_pro
researcher
agent
agent_pro
teams
enterprise
```

Use existing `plans` and `plan_entitlements` table shapes from `0122_entitlements_usage_stripe.sql`.

- [ ] **Step 4: Verify**

Run:

```bash
cd packages/shared
pnpm exec tsx src/entitlements.test.ts
pnpm test
```

Expected: entitlement tests pass.

## Task 7: Product Surface UI Copy

**Files:**
- Modify: `apps/web/app/app/settings/page.tsx` or `apps/web/components/SettingsSurface.tsx`
- Modify: `apps/web/app/app/billing/page.tsx` or `apps/web/components/BillingPanel.tsx`
- Modify: `apps/web/README.md`

- [ ] **Step 1: Add billing copy**

Use this product ladder copy:

```text
Free: limited evidence search and chat.
Web Pro: projects, saved reports, watchlists, higher limits.
Researcher: PDFs, literature matrices, systematic review tools, advanced reports.
Agent: supervised browser/desktop research workflows and monthly agent hours.
Teams/Labs: shared libraries, audit logs, team projects, admin controls.
Enterprise: custom evidence infrastructure, compliance, SSO, private deployment, API/MCP scale.
```

- [ ] **Step 2: Add settings copy**

Settings should show connected surfaces:

```text
Web workspace
Mobile companion
Research operator
```

- [ ] **Step 3: Verify UI**

Run:

```bash
pnpm --filter @pharmaorb/web dev
```

Open:

```text
http://localhost:3100/app/settings
http://localhost:3100/app/billing
```

Expected: copy is clear, no text overlap on desktop or mobile widths.

## Recommended Build Order

1. Task 1: shared contract.
2. Task 2: shared schema.
3. Task 3: web library.
4. Task 6: entitlements.
5. Task 5: agent job drafts.
6. Task 4: mobile capture.
7. Task 7: UI copy.

This keeps the web workspace and backend as the foundation before mobile/agent surfaces expand.

## Verification Checklist

- [ ] Shared contract tests pass.
- [ ] Supabase migration lint passes or local DB blocker is documented.
- [ ] Web typecheck passes.
- [ ] Web build passes.
- [ ] Mobile capture tests pass.
- [ ] Billing/settings copy renders without overlap.
- [ ] New routes enforce authentication and RLS.
- [ ] Agent job route creates draft or approval-needed jobs, not autonomous execution.
