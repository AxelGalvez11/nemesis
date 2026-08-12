// nemesis-llm — the metering valve between Nemesis desktop and the model provider.
//
// Routes (single function):
//   POST /nemesis-llm/device-key           Authorization: Bearer <supabase user JWT>
//     → mints a long-lived device key (plaintext returned once; SHA-256 stored).
//   POST /nemesis-llm/v1/chat/completions  Authorization: Bearer <device key (nmk_...)>
//     → validates key → plan (subscriptions) → daily token budget (plan_entitlements
//       'nemesis_llm_daily_tokens' + usage_counters 'nemesis_llm_tokens') → forwards to
//       DeepSeek with the SERVER-side key → records usage_events → returns/streams.
//       Models requested as 'glm*' route straight to GLM — the premium "highest"
//       answer mode, allowed for the pro/max plans only. Otherwise, if the DeepSeek
//       call throws or comes back out of balance (402, or an error body containing
//       "Insufficient Balance") and GLM_API_KEY is set, the same request is retried
//       once on GLM (every plan — that path is outage insurance, not a perk).
//   GET  /nemesis-llm/v1/models            Authorization: Bearer <device key>
//     → static model list (keeps OpenAI-compatible clients happy).
//   GET  /nemesis-llm/usage            Authorization: Bearer <device key>
//     → today's plan/limit/used/remaining for the desktop Account & usage card.
// FOUR consumers ride this one function — chat, device-key mint, models list,
// AND the settings usage card. Regression-check all four when rewriting routes.
//
// Deploy with verify_jwt=false (custom auth is implemented here: JWT for minting,
// device keys for completions). Secrets used: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
// (platform-injected), DEEPSEEK_API_KEY (already set for the ask/research functions),
// and GLM_API_KEY (Z.ai — premium tier + first DeepSeek failover target; GLM_MODEL picks
// the model used for direct-GLM requests without one and for the failover retry,
// default 'glm-5.2'). GEMINI_API_KEY also lives in the vault but is RESERVED for
// image generation (owner decision 2026-07-14) — it plays no part in chat.
import { createClient } from 'jsr:@supabase/supabase-js@2'

import { chooseModel, signalsFromBody, stripDeepSeekOnlyFields } from '../_shared/model-routing.ts'
import { classifyWork, escalationCandidate } from '../_shared/work-class.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const DEEPSEEK_KEY = Deno.env.get('DEEPSEEK_API_KEY') ?? ''
const DEEPSEEK_BASE = 'https://api.deepseek.com'
const GLM_KEY = Deno.env.get('GLM_API_KEY') ?? ''
const GLM_MODEL = Deno.env.get('GLM_MODEL') ?? 'glm-5.2'
// GLM-for-High kill switch — OFF by default (owner call 2026-07-14 evening).
// The answer mode is per-session sticky, so a High-parked Pro user would ride
// 2-4x-priced GLM on every agentic step (enough to sink that user's margin),
// and the quality premium over DeepSeek deep thinking is unmeasured — students
// never see model names. Flip on for an eval with:
//   supabase secrets set GLM_HIGH_MODE=on   (no code deploy needed)
// GLM remains the automatic DeepSeek-outage failover regardless of this flag.
const GLM_HIGH_MODE = (Deno.env.get('GLM_HIGH_MODE') ?? 'off') === 'on'
const GLM_BASE = 'https://api.z.ai/api/paas/v4'
// Additional OpenAI-compatible outage fallbacks. These are deliberately behind
// DeepSeek and GLM rather than a user-facing model picker: one Nemesis identity,
// multiple server-owned providers. Every endpoint/model can be overridden
// without a deploy because provider regions and model aliases evolve.
const QWEN_KEY = Deno.env.get('QWEN_API_KEY') ?? Deno.env.get('DASHSCOPE_API_KEY') ?? ''
const QWEN_BASE = Deno.env.get('QWEN_BASE_URL') ?? 'https://dashscope-us.aliyuncs.com/compatible-mode/v1'
const QWEN_MODEL = Deno.env.get('QWEN_MODEL') ?? 'qwen3.7-plus'
const KIMI_KEY = Deno.env.get('KIMI_API_KEY') ?? Deno.env.get('MOONSHOT_API_KEY') ?? ''
const KIMI_BASE = Deno.env.get('KIMI_BASE_URL') ?? 'https://api.moonshot.ai/v1'
const KIMI_MODEL = Deno.env.get('KIMI_MODEL') ?? 'kimi-k3'
const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? ''
const ANTHROPIC_BASE = Deno.env.get('ANTHROPIC_BASE_URL') ?? 'https://api.anthropic.com/v1'
const ANTHROPIC_MODEL = Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-sonnet-4-6'

// High-effort turns on a paying plan route to the premium v4-pro model — measured
// ~80% blind-preferred over fast-tier deep-thinking on hard clinical questions
// (2026-07-17) — but with a hard timeout and automatic fall-back to v4-flash
// deep-thinking, because v4-pro runs ~2x slower and fails a minority of the time.
// Kill without a deploy: supabase secrets set PRO_HIGH_MODE=off
const PRO_HIGH_MODE = (Deno.env.get('PRO_HIGH_MODE') ?? 'on') === 'on'
// The ONLY way to pin a model by hand, and it is a server secret rather than a
// plan or a header a browser could copy. Unset by default, which refuses every
// override — an investigation opts in with `supabase secrets set DEBUG_ROUTE_KEY=…`
// and the requests that use it are logged.
const DEBUG_ROUTE_KEY = Deno.env.get('DEBUG_ROUTE_KEY') ?? ''
// PRO_MODEL now lives in _shared/model-routing.ts, beside the gate that picks it.
const PRO_TIMEOUT_MS = 45_000

const COUNTER_KEY = 'nemesis_llm_tokens'
const ENTITLEMENT_KEY = 'nemesis_llm_daily_tokens'
// Monthly ceiling — the economic wall behind the daily cap, so a user can't cost
// daily_cap × 30. Reads plan_entitlements 'nemesis_llm_monthly_tokens'; counts a
// separate usage_counters bucket keyed 'nemesis_llm_tokens_month' (period = 1st of
// the month). Absent entitlement → FALLBACK_MONTHLY_TOKENS (never blocks silently).
const MONTHLY_ENTITLEMENT_KEY = 'nemesis_llm_monthly_tokens'
const MONTHLY_COUNTER_KEY = 'nemesis_llm_tokens_month'
const FALLBACK_MONTHLY_TOKENS = 750_000
// Emit one nemesis_cap_warning event when a user first crosses this fraction of
// either the daily or the monthly cap (an early signal, not a block).
const CAP_WARN_FRACTION = 0.85
const ACTIVE = new Set(['active', 'trialing', 'past_due'])
const FALLBACK_DAILY_TOKENS = 25_000 // free-tier default when no entitlement row
// Bound per-request memory and provider exposure. Edge isolates scale out, but
// one unbounded JSON body can still consume a large share of a 256 MB worker,
// making otherwise-independent users contend with it.
const MAX_REQUEST_BYTES = 2_000_000
const MAX_MESSAGES = 200
const MAX_MESSAGE_BYTES = 1_250_000
const MAX_COMPLETION_TOKENS = 32_000
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })

// ── Cost attribution (PostHog LLM analytics) ────────────────────────────────
// Every completion also reports what it COST US and WHICH app spent it. This is a
// different ledger from the student meter below: the meter counts discounted tokens
// against a plan cap, this counts dollars against our provider bill.
// The project token is PUBLISHABLE (it already ships inside the web bundle) and is
// write-only — it is not a secret. Override per-environment with POSTHOG_KEY.
const POSTHOG_KEY = Deno.env.get('POSTHOG_KEY') ?? 'phc_xcEjfTB3a2ftyzsw7oEAkpiBXRThWWjA3D5BcPBj36ht'
const POSTHOG_HOST = Deno.env.get('POSTHOG_HOST') ?? 'https://us.i.posthog.com'

/** MIRROR of supabase/functions/_shared/llm-cost.ts (this function deploys as ONE
 *  self-contained file). That copy is canonical and carries the tests — change both.
 *  Prices in USD per 1M tokens, read off the providers' own pages on PRICE_REV. */
const PRICE_REV = '2026-07-24'
const PRICES: Record<string, { inputPerM: number; cachedInputPerM: number; outputPerM: number }> = {
  'deepseek-v4-flash': { cachedInputPerM: 0.0028, inputPerM: 0.14, outputPerM: 0.28 },
  'deepseek-v4-pro': { cachedInputPerM: 0.003625, inputPerM: 0.435, outputPerM: 0.87 },
  'glm-5.2': { cachedInputPerM: 0.26, inputPerM: 1.4, outputPerM: 4.4 }
}

/** Dollar cost of one completion, or null when the model isn't priced — an unlisted
 *  model must report as UNPRICED, never as $0.00, or it silently reads as free. */
function costUsd(
  model: string,
  split: { promptTokens: number; completionTokens: number; cacheHitTokens: number }
): number | null {
  const price = PRICES[model.toLowerCase()]
  if (!price) return null

  const prompt = Math.max(0, split.promptTokens)
  const cached = Math.min(Math.max(0, split.cacheHitTokens), prompt)
  const missed = prompt - cached
  const output = Math.max(0, split.completionTokens)
  const usd =
    (missed * price.inputPerM + cached * price.cachedInputPerM + output * price.outputPerM) / 1_000_000

  return Math.round(usd * 1e9) / 1e9
}

/** Which app is calling. The explicit header wins; the device-key label is the
 *  fallback that makes existing installs attributable with no client update. */
function resolveClient(header: string | null, keyLabel: string | null): string {
  const declared = (header ?? '').trim().toLowerCase()
  if (declared === 'web' || declared === 'ios' || declared === 'desktop') return declared

  const label = keyLabel ?? ''
  if (/iphone|ipad|ios/i.test(label)) return 'ios'
  if (/web/i.test(label)) return 'web'
  if (/desktop|mac/i.test(label)) return 'desktop'

  return 'unknown'
}

/** Keep a background promise alive past the response. Metering runs un-awaited so
 *  the student never waits on it, but the runtime can tear the isolate down the
 *  moment a streamed response closes — and a streamed chat is nearly every chat, so
 *  without this the cost report is exactly the thing that gets cut. */
function keepAlive(work: Promise<unknown>): void {
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void } }).EdgeRuntime

  if (typeof runtime?.waitUntil === 'function') runtime.waitUntil(work)
}

/** Fire one $ai_generation into PostHog's LLM analytics. Never throws and never
 *  blocks the student's answer — a cost report going missing must not break chat. */
async function reportCost(props: Record<string, unknown>, distinctId: string): Promise<void> {
  if (!POSTHOG_KEY) return

  try {
    await fetch(`${POSTHOG_HOST}/i/v0/e/`, {
      body: JSON.stringify({
        api_key: POSTHOG_KEY,
        event: '$ai_generation',
        // No prompt or completion TEXT is ever sent — token counts and money only.
        properties: { distinct_id: distinctId, ...props }
      }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST'
    })
  } catch {
    /* analytics is never load-bearing */
  }
}

// The alias map and the premium-lane gate that stood here now live together in
// _shared/model-routing.ts, because they were never really two decisions: which
// model answers depends on the requested alias AND on what the plan may reach,
// and splitting them across a helper and three inline plan comparisons is how
// `enterprise` came to be unreachable in one of them.
//
// 🔴 THE CLIENT'S MODEL NAME IS NOW IGNORED ENTIRELY (except `glm*`, a separate
// product surface a caller opts into by name). It used to select the thinking
// mode: `deepseek-chat` meant off, `deepseek-reasoner` meant on — a cheaper
// version of the same problem as `reasoning_effort`, since either way the
// browser was choosing what the turn cost. Both aliases still arrive from every
// shipped build; both are now dropped on the floor, and work-class.ts decides.

// CORS — the web app (browser) calls this function cross-origin; without these
// headers the browser blocks the device-key mint and chat before they run (native
// Mac/phone clients aren't subject to CORS, which is why only the web broke). Auth
// rides the Authorization header (not cookies), so a wildcard origin is safe here.
// This block was hot-deployed straight to production and lived only in the running
// function until 2026-07-24 — deploying any build without it takes the web app down.
const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  // x-nemesis-client carries the cost-attribution tag; leave it out of this list and
  // the browser rejects the whole chat request at preflight.
  'Access-Control-Allow-Headers': 'authorization, content-type, x-nemesis-client',
  'Access-Control-Max-Age': '86400'
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json', ...CORS },
    status
  })
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
}

/** Mint a device key for the signed-in user (JWT auth). */
async function mintDeviceKey(req: Request): Promise<Response> {
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')

  if (!jwt) {
    return json({ error: 'missing bearer token' }, 401)
  }

  const { data: userData, error } = await admin.auth.getUser(jwt)

  if (error || !userData?.user) {
    return json({ error: 'invalid or expired token' }, 401)
  }

  const raw = crypto.getRandomValues(new Uint8Array(24))
  const key = `nmk_${[...raw].map(b => b.toString(16).padStart(2, '0')).join('')}`
  const keyHash = await sha256Hex(key)
  const label = (await req.json().catch(() => ({})))?.label ?? 'Nemesis desktop'

  const { error: insertError } = await admin
    .from('device_keys')
    .insert({ key_hash: keyHash, label, user_id: userData.user.id })

  if (insertError) {
    return json({ error: 'could not store device key' }, 500)
  }

  return json({ key })
}

interface KeyContext {
  userId: string
  plan: string
  /** The subscription plan EXACTLY as stored, before the collapse to 'free'.
   *  Only the capability resolver reads this; everything else wants `plan`. */
  rawPlan: string
  /** The RAW subscription status. Carried alongside rawPlan because the
   *  entitlement resolver reads status FIRST — a cancelled Max is a cancelled
   *  account, and a plan string that has already been collapsed to 'free'
   *  cannot tell "never paid" apart from "stopped paying". */
  status: string
  dailyLimit: number
  used: number
  periodStart: string
  monthlyLimit: number
  monthlyUsed: number
  monthStart: string
  /** The label the client minted this key with ("Nemesis Web" / "Nemesis iPhone" /
   *  "Nemesis desktop") — the fallback signal for cost attribution. */
  label: string | null
}

/** Resolve a device key to its user + plan + today's usage. */
async function resolveKey(deviceKey: string): Promise<KeyContext | Response> {
  if (!deviceKey.startsWith('nmk_')) {
    return json({ error: 'invalid device key' }, 401)
  }

  const keyHash = await sha256Hex(deviceKey)
  const { data: keyRow } = await admin
    .from('device_keys')
    .select('user_id,revoked,label')
    .eq('key_hash', keyHash)
    .maybeSingle()

  if (!keyRow || keyRow.revoked) {
    return json({ error: 'unknown or revoked device key' }, 403)
  }

  void admin.from('device_keys').update({ last_used_at: new Date().toISOString() }).eq('key_hash', keyHash)

  const { data: sub } = await admin
    .from('subscriptions')
    .select('plan,status')
    .eq('user_id', keyRow.user_id)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // The plan used for LIMITS is still collapsed to 'free' when the
  // subscription is not entitling — that keeps the daily/monthly caps exactly
  // where they were. The RAW pair travels on so the capability resolver can
  // make the model decision from both halves rather than from a collapsed
  // string that has already forgotten why it says 'free'.
  const rawPlan = typeof sub?.plan === 'string' ? sub.plan : ''
  const rawStatus = typeof sub?.status === 'string' ? sub.status : ''
  const plan = rawPlan && rawStatus && ACTIVE.has(rawStatus) ? rawPlan : 'free'

  // Daily + monthly entitlements in one round trip.
  const { data: ents } = await admin
    .from('plan_entitlements')
    .select('entitlement_key,value_json')
    .eq('plan_code', plan)
    .in('entitlement_key', [ENTITLEMENT_KEY, MONTHLY_ENTITLEMENT_KEY])

  const entValue = (key: string): number | undefined => {
    const row = ents?.find(e => e.entitlement_key === key)
    return typeof row?.value_json === 'number' ? row.value_json : undefined
  }

  const dailyLimit = entValue(ENTITLEMENT_KEY) ?? FALLBACK_DAILY_TOKENS
  const monthlyLimit = entValue(MONTHLY_ENTITLEMENT_KEY) ?? FALLBACK_MONTHLY_TOKENS

  const now = new Date()
  const periodStart = now.toISOString().slice(0, 10) // YYYY-MM-DD
  const monthStart = `${now.toISOString().slice(0, 7)}-01` // YYYY-MM-01

  const { data: counters } = await admin
    .from('usage_counters')
    .select('counter_key,period_start,used')
    .eq('user_id', keyRow.user_id)
    .in('counter_key', [COUNTER_KEY, MONTHLY_COUNTER_KEY])
    .in('period_start', [periodStart, monthStart])

  const usedFor = (counterKey: string, period: string): number =>
    counters?.find(c => c.counter_key === counterKey && c.period_start === period)?.used ?? 0

  return {
    dailyLimit,
    label: typeof keyRow.label === 'string' ? keyRow.label : null,
    monthStart,
    monthlyLimit,
    monthlyUsed: usedFor(MONTHLY_COUNTER_KEY, monthStart),
    periodStart,
    // The COLLAPSED billing plan, unchanged: limits, metering metadata and the
    // /usage card all read this, and a cancelled account must report 'free'
    // rather than the plan it used to hold.
    plan,
    rawPlan,
    status: rawStatus,
    used: usedFor(COUNTER_KEY, periodStart),
    userId: keyRow.user_id
  }
}

/** Cache-hit input tokens are metered at 10% of face value. An agent conversation
 *  re-sends its whole unchanged history on every step; DeepSeek serves that prefix
 *  from cache and bills us ~2% of the miss price, so charging the student's daily
 *  budget full price for replayed context drained half a Max cap on two ordinary
 *  chats (owner call 2026-07-16: meter cache hits at a fraction, like we're billed). */
const CACHE_HIT_WEIGHT = 0.1

/** One completion's provider-reported token counts. `total` is what the student meter
 *  charges against; `prompt`/`completion` are what the PROVIDER BILL is computed from
 *  (output tokens cost 2-3x input, so a total alone can't produce a dollar figure).
 *  Any field the provider didn't report arrives as 0. */
interface UsageSplit {
  total: number
  prompt: number
  completion: number
  cacheHit: number
}

/** Record spent tokens against today's counter + the event ledger, and report what the
 *  call cost us. `cacheHit` is the provider-reported prompt_cache_hit_tokens (0 when
 *  the provider doesn't report it — GLM failover, missing usage chunk — which bills at
 *  full weight). `client` is which app spent it; `latencyMs` is wall-clock for the call. */
async function recordUsage(
  ctx: KeyContext,
  usage: UsageSplit,
  model: string,
  client: string,
  latencyMs: number
): Promise<void> {
  const raw = Math.max(1, Math.round(usage.total))
  const cacheHit = Math.min(Math.max(0, Math.round(usage.cacheHit)), raw)
  const spent = Math.max(1, raw - cacheHit + Math.ceil(cacheHit * CACHE_HIT_WEIGHT))
  // The provider bill. When the usage chunk was missing entirely we only have an
  // estimated total, so the split is unknown — attribute it all to input rather than
  // invent an output share, and mark it estimated so the report can exclude it.
  const estimated = usage.prompt <= 0 && usage.completion <= 0
  const promptTokens = estimated ? raw - cacheHit : Math.max(0, Math.round(usage.prompt))
  const completionTokens = estimated ? 0 : Math.max(0, Math.round(usage.completion))
  const usd = costUsd(model, { cacheHitTokens: cacheHit, completionTokens, promptTokens })

  // The same facts to PostHog, where they land in LLM analytics as a generation and
  // can be sliced by app without anyone writing SQL. usd is OURS (computed from the
  // provider's published prices), so PostHog doesn't guess it from a model name.
  keepAlive(
    reportCost(
      {
        $ai_cache_read_input_tokens: cacheHit,
        $ai_input_tokens: promptTokens,
        $ai_latency: Math.round(latencyMs) / 1000,
        $ai_model: model,
        $ai_output_tokens: completionTokens,
        $ai_provider:
          model.toLowerCase().startsWith('glm') ? 'z.ai'
            : model.toLowerCase().startsWith('qwen') ? 'alibaba'
              : model.toLowerCase().startsWith('kimi') ? 'moonshot'
                : model.toLowerCase().startsWith('claude') ? 'anthropic'
                  : 'deepseek',
        $ai_total_cost_usd: usd ?? undefined,
        $ai_trace_id: crypto.randomUUID(),
        client,
        cost_estimated: estimated,
        // Unpriced = a model missing from the price list. Counted, never treated as $0.
        cost_unpriced: usd === null,
        metered_tokens: spent,
        plan: ctx.plan,
        price_rev: PRICE_REV
      },
      ctx.userId
    )
  )

  // One RPC performs both counter increments and the audit event in one
  // transaction. `used = used + spent` is concurrency-safe; the former
  // read-then-upsert shape lost increments when the same account ran two chats
  // at once and cost three database round trips per completion.
  const { data: totals, error: meterError } = await admin.rpc('record_nemesis_llm_usage', {
    p_cost_credits: Math.ceil(spent / 1000),
    p_daily_limit: ctx.dailyLimit,
    p_daily_period: ctx.periodStart,
    p_metadata: {
      cache_hit_tokens: cacheHit,
      client,
      cost_estimated: estimated,
      cost_usd: usd,
      model,
      price_rev: PRICE_REV,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      tokens: spent,
      tokens_raw: raw
    },
    p_month_period: ctx.monthStart,
    p_monthly_limit: ctx.monthlyLimit,
    p_spent: spent,
    p_user_id: ctx.userId
  })

  if (meterError) {
    console.error('nemesis usage meter failed', meterError.message)
    return
  }

  // Fire a single early-warning event the first time this spend pushes the user
  // past CAP_WARN_FRACTION of the daily or monthly cap (crossed = below before,
  // at/above now), so a heavy account surfaces before it's a surprise bill.
  const recorded = totals && typeof totals === 'object' ? totals as Record<string, unknown> : {}
  const dailyAfter = typeof recorded.daily_used === 'number' ? recorded.daily_used : ctx.used + spent
  const monthlyAfter = typeof recorded.monthly_used === 'number' ? recorded.monthly_used : ctx.monthlyUsed + spent
  void maybeWarnCap(ctx, 'daily', Math.max(0, dailyAfter - spent), dailyAfter, ctx.dailyLimit, ctx.periodStart)
  void maybeWarnCap(ctx, 'monthly', Math.max(0, monthlyAfter - spent), monthlyAfter, ctx.monthlyLimit, ctx.monthStart)
}

/** Emit one nemesis_cap_warning event the moment usage crosses the warn line for a
 *  window. Idempotent per (user, window, period) via a unique-ish event: we only
 *  insert on the crossing tick, so at most one lands per period. */
async function maybeWarnCap(
  ctx: KeyContext,
  window: 'daily' | 'monthly',
  before: number,
  after: number,
  limit: number,
  period: string
): Promise<void> {
  if (limit <= 0) return
  const line = limit * CAP_WARN_FRACTION
  if (before >= line || after < line) return // only the crossing tick

  await admin.from('usage_events').insert({
    cost_credits: 0,
    counter_key: COUNTER_KEY,
    event_type: 'nemesis_cap_warning',
    metadata: { after, limit, plan: ctx.plan, pct: Math.round((after / limit) * 100), window },
    period_start: period,
    user_id: ctx.userId
  })
}

/** POST body to a provider's chat/completions endpoint. Network failures (and, when
 *  timeoutMs is set, a timeout) resolve to null — never throw — so the caller can
 *  decide whether to fail over. The timeout is how the slow v4-pro lane bounds its
 *  wait before falling back to the fast tier. */
async function callProvider(
  base: string,
  key: string,
  body: Record<string, unknown>,
  timeoutMs?: number
): Promise<Response | null> {
  const controller = timeoutMs ? new AbortController() : undefined
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : undefined

  try {
    return await fetch(`${base}/chat/completions`, {
      body: JSON.stringify(body),
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      method: 'POST',
      signal: controller?.signal
    })
  } catch {
    return null
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/** True when an upstream response means the PROVIDER is unusable right now — the
 *  trigger for a GLM failover retry. Covers out-of-balance (402 / "Insufficient
 *  Balance"), a dead or suspended server key (401/403 — e.g. DeepSeek's
 *  "Authentication Fails (governor)"), provider-side rate limiting (429), and 5xx.
 *  Request-shaped errors (400/404/422) stay with the caller: they would fail on any
 *  provider. Clones before reading the body so a response that turns out NOT to be
 *  a failover trigger is still intact for the normal response path. */
async function isProviderUnusable(res: Response): Promise<boolean> {
  if (res.status === 401 || res.status === 402 || res.status === 403 || res.status === 429 || res.status >= 500) {
    return true
  }

  if (res.ok) {
    return false
  }

  const text = await res.clone().text().catch(() => '')
  return /insufficient balance/i.test(text)
}

interface ProviderFallback {
  base: string
  key: string
  model: string
}

const SECONDARY_FALLBACKS: ProviderFallback[] = [
  { base: QWEN_BASE, key: QWEN_KEY, model: QWEN_MODEL },
  { base: KIMI_BASE, key: KIMI_KEY, model: KIMI_MODEL },
  { base: ANTHROPIC_BASE, key: ANTHROPIC_KEY, model: ANTHROPIC_MODEL }
]

/** Continue an outage across the extra providers the owner configured. All
 * three expose OpenAI-compatible chat/completions APIs, including streaming
 * and tool calls, so the valve can preserve the client contract byte-for-byte.
 * A request error is not retried; only an unusable provider reaches here. */
async function callSecondaryFallbacks(
  body: Record<string, unknown>
): Promise<{ model: string; response: Response } | null> {
  // 🔴 STRIPS THE MESSAGES TOO, not just the top-level selectors. This used to
  // delete `thinking`/`reasoning`/`reasoning_effort` and hand over a history
  // still carrying `reasoning_content` on every assistant turn we echoed back
  // to DeepSeek — a field none of these providers defined. It also meant the
  // model's private reasoning travelled to a third party during an outage,
  // which is exactly when nobody is watching.
  const clean = stripDeepSeekOnlyFields(body)

  let last: { model: string; response: Response } | null = null
  for (const provider of SECONDARY_FALLBACKS) {
    if (!provider.key) continue
    clean.model = provider.model
    const response = await callProvider(provider.base, provider.key, clean)
    if (!response) continue
    last = { model: provider.model, response }
    if (!(await isProviderUnusable(response))) return last
  }
  return last
}

async function chatCompletions(req: Request): Promise<Response> {
  if (!DEEPSEEK_KEY && !GLM_KEY && !SECONDARY_FALLBACKS.some(provider => provider.key)) {
    return json({ error: 'model provider key not configured on the server' }, 500)
  }

  const declaredBytes = Number(req.headers.get('content-length') ?? '0')
  if (Number.isFinite(declaredBytes) && declaredBytes > MAX_REQUEST_BYTES) {
    return json({ error: 'chat request is too large' }, 413)
  }

  const deviceKey = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const ctx = await resolveKey(deviceKey)

  if (ctx instanceof Response) {
    return ctx
  }

  // Which app is spending. Header first, key label as the fallback; neither → 'unknown'
  // (never 'web' — a default would quietly inflate one app with everyone else's spend).
  const client = resolveClient(req.headers.get('x-nemesis-client'), ctx.label)
  const startedAt = Date.now()

  if (ctx.used >= ctx.dailyLimit) {
    return json(
      { error: { code: 'daily_token_budget_exhausted', message: `Daily token budget reached for the ${ctx.plan} plan. Upgrade or try again tomorrow.` } },
      429
    )
  }

  if (ctx.monthlyUsed >= ctx.monthlyLimit) {
    return json(
      { error: { code: 'monthly_token_budget_exhausted', message: `Monthly token budget reached for the ${ctx.plan} plan. It resets on the 1st — upgrade for a higher ceiling.` } },
      429
    )
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null

  if (!body || !Array.isArray(body.messages)) {
    return json({ error: 'invalid chat.completions body' }, 400)
  }
  if (body.messages.length > MAX_MESSAGES) {
    return json({ error: `chat history exceeds ${MAX_MESSAGES} messages` }, 413)
  }
  if (JSON.stringify(body.messages).length > MAX_MESSAGE_BYTES) {
    return json({ error: 'chat history is too large' }, 413)
  }

  if (typeof body.max_tokens === 'number') {
    body.max_tokens = Math.max(1, Math.min(MAX_COMPLETION_TOKENS, Math.floor(body.max_tokens)))
  }
  if (typeof body.max_completion_tokens === 'number') {
    body.max_completion_tokens = Math.max(1, Math.min(MAX_COMPLETION_TOKENS, Math.floor(body.max_completion_tokens)))
  }

  const requested = typeof body.model === 'string' ? body.model : 'deepseek-chat'

  // 🔴🔴 THE CLIENT NO LONGER HAS A VOTE (owner 2026-08-06: "The client must not
  // be trusted to authorize an expensive model by sending effort: high").
  //
  // What stood here read High out of three body encodings — reasoning.effort,
  // reasoning_effort, thinking.effort — and used it to open the premium lane.
  // Two things were wrong with that. It was a spending decision taken by whoever
  // held the device key, changeable with one line of JSON. And no client had
  // actually sent it since the composer's effort pill was removed (phone #369,
  // web 2026-07-31): both surfaces pin Medium and Medium strips it, so the lane
  // it guarded was already dead. Audited across web chat, web notebooks, phone
  // chat, phone notebooks and the gateway on 2026-08-06.
  //
  // The server now judges the turn from the student's own words. Every effort
  // encoding is DELETED rather than read, so a body carrying one is treated
  // exactly like a body that does not — which is what makes the hostile-body
  // test in model-routing.test.ts able to assert byte-identical choices.
  const signals = signalsFromBody(body, req.headers.get('x-nemesis-caps'))
  const classified = classifyWork(signals)
  delete body.reasoning
  delete body.reasoning_effort
  delete body.thinking

  // A debug override so a model can be pinned while investigating. Gated on a
  // server secret no client holds — not on a plan, not on a copyable header.
  // Unset by default, which refuses every override.
  const overrideModel = DEBUG_ROUTE_KEY && req.headers.get('x-nemesis-debug-key') === DEBUG_ROUTE_KEY
    ? (req.headers.get('x-nemesis-debug-model') ?? '')
    : ''

  // 🔴 ONE DECISION, IN ONE PLACE (owner 2026-08-06). What stood here was
  // `ctx.plan === 'pro' || ctx.plan === 'max'`, written three times over. Every
  // production subscription is `enterprise` — neither string — so the premium
  // reasoning lane was unreachable by every account including the owner's, and
  // nothing failed: the fast model simply answered, which looks identical to
  // the right model answering. See _shared/model-routing.ts.
  const choice = chooseModel({
    glmConfigured: Boolean(GLM_KEY),
    glmHighMode: GLM_HIGH_MODE,
    glmModel: GLM_MODEL,
    plan: ctx.rawPlan,
    proHighMode: PRO_HIGH_MODE,
    reason: classified.reason,
    requestedModel: requested,
    status: ctx.status,
    workClass: classified.workClass
  })
  const useGlm = choice.lane === 'glm'
  const proUpgrade = choice.lane === 'pro'
  let model = overrideModel || choice.model
  body.model = model

  // What the server chose and why: slugs and counts only, never a word the
  // student typed and never any reasoning. This is the line that makes "which
  // model actually answered" answerable from the logs instead of assumed.
  console.log('route_choice', JSON.stringify({
    class: choice.workClass,
    client,
    downgraded: choice.downgraded,
    lane: choice.lane,
    model,
    override: Boolean(overrideModel),
    reason: choice.reason,
    thinking: choice.thinking?.type ?? 'default'
  }))

  // Watched, deliberately NOT acted on: a turn that drew on two or more sources
  // while the prompt read as ordinary. Promoting there would move the
  // conversation to a different model mid-turn, carrying the first model's
  // `reasoning_content` — untested against any provider. Counted instead, so the
  // question gets settled from production rather than argued about.
  if (escalationCandidate(signals.toolNames, choice.workClass)) {
    console.log('route_escalation_candidate', JSON.stringify({ class: choice.workClass, reason: choice.reason, tools: signals.toolNames.length }))
  }

  // A plan string nobody mapped grants nothing, and must not do so quietly —
  // silence is exactly how `enterprise` went unrecognised. Sanitised by
  // construction: the plan code and the surface, no user id and no email.
  if (choice.capabilities.unrecognisedPlan) {
    console.error('entitlement_unknown_plan', JSON.stringify({ plan: choice.capabilities.unrecognisedPlan, surface: 'nemesis-llm' }))
  }

  // Neither GLM nor v4-pro takes a thinking selector; the fast model always gets
  // the one the server chose. Deliberately NOT `if (body.thinking === undefined)`
  // any more: that clause let a client keep its own selector, which is the same
  // client-picks-the-spend path as `reasoning_effort` wearing a different name.
  // Everything the client sent was deleted above, so this is the only writer.
  if (!choice.dropEffortSelectors && choice.thinking) {
    body.thinking = choice.thinking
  }

  const streaming = body.stream === true

  if (streaming) {
    // Ask the provider to append a final usage chunk so metering stays exact.
    body.stream_options = { ...(body.stream_options as object | undefined), include_usage: true }
  }

  let upstream: Response | null = null

  if (useGlm) {
    if (!GLM_KEY) {
      return json({ error: 'GLM provider key not configured on the server' }, 500)
    }

    // GLM 5.2 is the premium "highest" answer mode — Agent Pro and Max plans only
    // (owner pricing decision 2026-07-14). The automatic DeepSeek-outage failover
    // below is deliberately NOT gated: uptime insurance covers every plan.
    // Asks for the CAPABILITY, not for two plan strings. This is the check that
    // told every enterprise account the highest answer mode was not theirs.
    if (!choice.capabilities.highestReasoningTier) {
      return json(
        { error: { code: 'plan_required', message: 'The highest answer mode needs the Agent Pro or Max plan.' } },
        403
      )
    }

    upstream = await callProvider(GLM_BASE, GLM_KEY, stripDeepSeekOnlyFields(body))
  } else if (proUpgrade) {
    // Premium lane: v4-pro with a hard timeout. If it's slow or errors, fall back to
    // the fast tier's own deep-thinking (same provider, reliable) — the student still
    // gets a strong answer, just faster. A full DeepSeek outage then drops to the GLM
    // failover below like any other turn.
    upstream = DEEPSEEK_KEY ? await callProvider(DEEPSEEK_BASE, DEEPSEEK_KEY, body, PRO_TIMEOUT_MS) : null

    if (!upstream || (await isProviderUnusable(upstream))) {
      model = 'deepseek-v4-flash'
      body.model = model
      body.thinking = { type: 'enabled' }
      upstream = DEEPSEEK_KEY ? await callProvider(DEEPSEEK_BASE, DEEPSEEK_KEY, body) : null
    }

    if (GLM_KEY && (!upstream || (await isProviderUnusable(upstream)))) {
      model = GLM_MODEL
      body.model = GLM_MODEL
      delete body.thinking
      upstream = await callProvider(GLM_BASE, GLM_KEY, stripDeepSeekOnlyFields(body))
    }
  } else {
    upstream = DEEPSEEK_KEY ? await callProvider(DEEPSEEK_BASE, DEEPSEEK_KEY, body) : null

    // Failover: DeepSeek unreachable, out of balance, key-dead, or rate-limited —
    // retry once on GLM. `thinking` is a DeepSeek-only selector, so it's stripped
    // before the retry goes out.
    if (GLM_KEY && (!upstream || (await isProviderUnusable(upstream)))) {
      model = GLM_MODEL
      body.model = GLM_MODEL
      delete body.thinking
      upstream = await callProvider(GLM_BASE, GLM_KEY, stripDeepSeekOnlyFields(body))
    }
  }

  // GLM may itself be unavailable, or may not be configured. Continue through
  // Qwen, Kimi, and Anthropic if their server-side keys exist. This is only
  // uptime insurance; ordinary traffic retains the established routing/cost
  // posture above.
  if (!upstream || (await isProviderUnusable(upstream))) {
    const fallback = await callSecondaryFallbacks(body)
    if (fallback) {
      model = fallback.model
      upstream = fallback.response
    }
  }

  if (!upstream) {
    return json({ error: 'model provider unreachable' }, 502)
  }

  if (!streaming) {
    const data = await upstream.json().catch(() => null)
    const num = (field: string): number => (data?.usage?.[field] as number | undefined) ?? 0
    keepAlive(recordUsage(
      ctx,
      {
        cacheHit: num('prompt_cache_hit_tokens'),
        completion: num('completion_tokens'),
        prompt: num('prompt_tokens'),
        total: num('total_tokens') || 1000
      },
      model,
      client,
      Date.now() - startedAt
    ))

    return json(data ?? { error: 'upstream returned no body' }, upstream.status)
  }

  // Streaming: pass bytes through untouched while scanning for the final usage chunk.
  // prompt/completion are scanned alongside the total because the provider BILL needs
  // the split (output tokens cost 2-3x input) even though the meter only needs a total.
  let tail = ''
  let usageTokens = 0
  let cacheHitTokens = 0
  let promptTokens = 0
  let completionTokens = 0
  const decoder = new TextDecoder()

  const lastNumber = (haystack: string, re: RegExp): number | null => {
    const matches = haystack.match(re)

    if (!matches?.length) {
      return null
    }

    const digits = matches[matches.length - 1].match(/(\d+)$/)

    return digits ? Number(digits[1]) : null
  }

  const meter = new TransformStream<Uint8Array, Uint8Array>({
    flush() {
      // The length/4 fallback has no usage chunk to read cache data from — bill it
      // at full weight rather than guessing a discount, and with no prompt/completion
      // split, which recordUsage marks as an ESTIMATED cost rather than a measured one.
      keepAlive(recordUsage(
        ctx,
        {
          cacheHit: usageTokens ? cacheHitTokens : 0,
          completion: usageTokens ? completionTokens : 0,
          prompt: usageTokens ? promptTokens : 0,
          total: usageTokens || Math.max(500, Math.round(tail.length / 4))
        },
        model,
        client,
        Date.now() - startedAt
      ))
    },
    transform(chunk, controller) {
      controller.enqueue(chunk)
      tail = (tail + decoder.decode(chunk, { stream: true })).slice(-8000)
      usageTokens = lastNumber(tail, /"total_tokens"\s*:\s*(\d+)/g) ?? usageTokens
      cacheHitTokens = lastNumber(tail, /"prompt_cache_hit_tokens"\s*:\s*(\d+)/g) ?? cacheHitTokens
      promptTokens = lastNumber(tail, /"prompt_tokens"\s*:\s*(\d+)/g) ?? promptTokens
      completionTokens = lastNumber(tail, /"completion_tokens"\s*:\s*(\d+)/g) ?? completionTokens
    }
  })

  return new Response(upstream.body?.pipeThrough(meter) ?? null, {
    headers: {
      'Cache-Control': 'no-cache',
      'Content-Type': upstream.headers.get('Content-Type') ?? 'text/event-stream',
      ...CORS
    },
    status: upstream.status
  })
}

Deno.serve(async (req: Request) => {
  // CORS preflight — the browser fires an OPTIONS before the real POST/GET.
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS })
  }

  const path = new URL(req.url).pathname

  if (req.method === 'POST' && path.endsWith('/device-key')) {
    return mintDeviceKey(req)
  }

  if (req.method === 'POST' && path.endsWith('/chat/completions')) {
    return chatCompletions(req)
  }

  if (req.method === 'GET' && path.endsWith('/models')) {
    const deviceKey = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    const ctx = await resolveKey(deviceKey)

    if (ctx instanceof Response) {
      return ctx
    }

    return json({
      data: [
        { id: 'deepseek-chat', object: 'model', owned_by: 'nemesis' },
        { id: 'deepseek-reasoner', object: 'model', owned_by: 'nemesis' },
        { id: 'deepseek-v4-flash', object: 'model', owned_by: 'nemesis' },
        { id: 'deepseek-v4-pro', object: 'model', owned_by: 'nemesis' },
        { id: GLM_MODEL, object: 'model', owned_by: 'nemesis' }
      ],
      object: 'list'
    })
  }

  // Today's budget for the in-app Account & usage view (desktop fetchUsage()).
  // LOAD-BEARING: the settings page's allowance card reads this; it was dropped
  // once by a rewrite and the card sat on its unavailable state for everyone.
  // Returns 200 even when the budget is exhausted — used/remaining ARE the answer.
  if (req.method === 'GET' && path.endsWith('/usage')) {
    const deviceKey = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    const ctx = await resolveKey(deviceKey)

    if (ctx instanceof Response) {
      return ctx
    }

    return json({
      daily_limit: ctx.dailyLimit,
      // Monthly figures are additive — existing desktop clients read only the daily
      // fields and ignore these until a build surfaces them.
      monthly_limit: ctx.monthlyLimit,
      monthly_remaining: Math.max(0, ctx.monthlyLimit - ctx.monthlyUsed),
      monthly_used: ctx.monthlyUsed,
      period_start: ctx.periodStart,
      plan: ctx.plan,
      remaining: Math.max(0, ctx.dailyLimit - ctx.used),
      used: ctx.used
    })
  }

  return json({ error: 'not found' }, 404)
})
