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
// and GLM_API_KEY (Z.ai — premium tier + DeepSeek failover target; GLM_MODEL picks
// the model used for direct-GLM requests without one and for the failover retry,
// default 'glm-5.2'). GEMINI_API_KEY also lives in the vault but is RESERVED for
// image generation (owner decision 2026-07-14) — it plays no part in chat.
import { createClient } from 'jsr:@supabase/supabase-js@2'

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

// High-effort turns on a paying plan route to the premium v4-pro model — measured
// ~80% blind-preferred over fast-tier deep-thinking on hard clinical questions
// (2026-07-17) — but with a hard timeout and automatic fall-back to v4-flash
// deep-thinking, because v4-pro runs ~2x slower and fails a minority of the time.
// Kill without a deploy: supabase secrets set PRO_HIGH_MODE=off
const PRO_HIGH_MODE = (Deno.env.get('PRO_HIGH_MODE') ?? 'on') === 'on'
const PRO_MODEL = 'deepseek-v4-pro'
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
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })

/**
 * DeepSeek retires the 'deepseek-chat'/'deepseek-reasoner' aliases on 2026-07-24.
 * Mirror of resolveDeepSeekModel in supabase/functions/ask/llm.ts — map to the durable
 * V4 names plus the `thinking` mode selector, so desktop clients keep working after the
 * aliases die. A client-supplied body.thinking always wins over this default.
 *
 * Any OTHER model id maps to deepseek-v4-flash instead of passing through: the upstream
 * engine's deep defaults still name third-party models (e.g. anthropic/claude-opus-4.6
 * in agent_init) and a sub-agent path that misses the configured model would otherwise
 * surface DeepSeek's raw 400 ("supported API model names are...") to the student. We
 * bill/provide the model, so the valve — not the client — owns the final model name.
 */
function resolveModel(model: string): { model: string; thinking?: { type: 'disabled' | 'enabled' } } {
  const m = model.toLowerCase()

  if (m === 'deepseek-chat') return { model: 'deepseek-v4-flash', thinking: { type: 'disabled' } }
  if (m === 'deepseek-reasoner') return { model: 'deepseek-v4-flash', thinking: { type: 'enabled' } }
  if (m.includes('v4-flash')) return { model, thinking: { type: 'disabled' } }
  // Premium routing is server-owned. A client cannot bypass the plan +
  // high-effort gate below by naming v4-pro directly; it receives Flash with
  // thinking instead. This protects the product's gross-margin budget while
  // preserving a strong answer.
  if (m.includes('v4-pro')) return { model: 'deepseek-v4-flash', thinking: { type: 'enabled' } }

  return { model: 'deepseek-v4-flash', thinking: { type: 'disabled' } }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
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
  dailyLimit: number
  used: number
  periodStart: string
  monthlyLimit: number
  monthlyUsed: number
  monthStart: string
}

/** Resolve a device key to its user + plan + today's usage. */
async function resolveKey(deviceKey: string): Promise<KeyContext | Response> {
  if (!deviceKey.startsWith('nmk_')) {
    return json({ error: 'invalid device key' }, 401)
  }

  const keyHash = await sha256Hex(deviceKey)
  const { data: keyRow } = await admin
    .from('device_keys')
    .select('user_id,revoked')
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

  let plan = sub?.plan && sub.status && ACTIVE.has(sub.status) ? sub.plan : 'free'

  // Free accounts remain on the bounded freemium tier. A paid subscription may
  // still be `trialing`, but account age alone never grants the full Pro budget.

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
    monthStart,
    monthlyLimit,
    monthlyUsed: usedFor(MONTHLY_COUNTER_KEY, monthStart),
    periodStart,
    plan,
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

/** Record spent tokens against today's counter + the event ledger. `cacheHitTokens`
 *  is the provider-reported prompt_cache_hit_tokens (0 when the provider doesn't
 *  report it — GLM failover, missing usage chunk — which bills at full weight). */
async function recordUsage(ctx: KeyContext, tokens: number, cacheHitTokens: number, model: string): Promise<void> {
  const raw = Math.max(1, Math.round(tokens))
  const cacheHit = Math.min(Math.max(0, Math.round(cacheHitTokens)), raw)
  const spent = Math.max(1, raw - cacheHit + Math.ceil(cacheHit * CACHE_HIT_WEIGHT))
  const nowIso = new Date().toISOString()

  await admin.from('usage_counters').upsert(
    {
      counter_key: COUNTER_KEY,
      limit_snapshot: ctx.dailyLimit,
      period_end: ctx.periodStart,
      period_start: ctx.periodStart,
      updated_at: nowIso,
      used: ctx.used + spent,
      user_id: ctx.userId
    },
    { onConflict: 'user_id,counter_key,period_start' }
  )

  // Monthly bucket — the same spent amount against the 1st-of-month counter.
  await admin.from('usage_counters').upsert(
    {
      counter_key: MONTHLY_COUNTER_KEY,
      limit_snapshot: ctx.monthlyLimit,
      period_end: ctx.monthStart,
      period_start: ctx.monthStart,
      updated_at: nowIso,
      used: ctx.monthlyUsed + spent,
      user_id: ctx.userId
    },
    { onConflict: 'user_id,counter_key,period_start' }
  )

  await admin.from('usage_events').insert({
    cost_credits: Math.ceil(spent / 1000),
    counter_key: COUNTER_KEY,
    event_type: 'nemesis_llm_completion',
    // tokens = what the meter charged; tokens_raw/cache_hit_tokens keep the full
    // picture auditable (and let us re-tune CACHE_HIT_WEIGHT from real data).
    metadata: { cache_hit_tokens: cacheHit, model, tokens: spent, tokens_raw: raw },
    period_start: ctx.periodStart,
    user_id: ctx.userId
  })

  // Fire a single early-warning event the first time this spend pushes the user
  // past CAP_WARN_FRACTION of the daily or monthly cap (crossed = below before,
  // at/above now), so a heavy account surfaces before it's a surprise bill.
  void maybeWarnCap(ctx, 'daily', ctx.used, ctx.used + spent, ctx.dailyLimit, ctx.periodStart)
  void maybeWarnCap(ctx, 'monthly', ctx.monthlyUsed, ctx.monthlyUsed + spent, ctx.monthlyLimit, ctx.monthStart)
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

async function chatCompletions(req: Request): Promise<Response> {
  if (!DEEPSEEK_KEY && !GLM_KEY) {
    return json({ error: 'model provider key not configured on the server' }, 500)
  }

  const deviceKey = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const ctx = await resolveKey(deviceKey)

  if (ctx instanceof Response) {
    return ctx
  }

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

  const requested = typeof body.model === 'string' ? body.model : 'deepseek-chat'
  let useGlm = requested.toLowerCase().startsWith('glm')

  // High answer mode rides the premium GLM lane for Agent Pro / Max (owner routing
  // decision 2026-07-14): Instant and Medium stay on DeepSeek; a High-effort turn is
  // upgraded to GLM when the plan qualifies. Students picking High are NOT errored —
  // they keep DeepSeek's own deep thinking. Effort is read from every encoding the
  // desktop backend can emit (OpenRouter-style reasoning.effort, flat reasoning_effort,
  // DeepSeek-style thinking.effort).
  const effortHigh =
    ((body.reasoning as { effort?: string } | undefined)?.effort ??
      (body.reasoning_effort as string | undefined) ??
      (body.thinking as { effort?: string } | undefined)?.effort) === 'high'
  const glmUpgrade = GLM_HIGH_MODE && !useGlm && effortHigh && Boolean(GLM_KEY) && (ctx.plan === 'pro' || ctx.plan === 'max')

  if (glmUpgrade) useGlm = true

  // The mix (2026-07-17): a High-effort turn on Agent Pro / Max routes to the
  // premium v4-pro model — unless GLM is the chosen High lane. The hard timeout +
  // fast-tier fallback live in the DeepSeek branch below (v4-pro is ~2x slower and
  // fails a minority of the time). Students on lighter plans keep fast deep-thinking.
  const proUpgrade = PRO_HIGH_MODE && !useGlm && effortHigh && (ctx.plan === 'pro' || ctx.plan === 'max')

  const resolved = useGlm
    ? { model: glmUpgrade ? GLM_MODEL : requested }
    : proUpgrade
      ? { model: PRO_MODEL } // v4-pro reasons natively — no thinking selector
      : resolveModel(requested)
  let model = resolved.model
  body.model = model

  if (glmUpgrade || proUpgrade) {
    // Neither GLM nor v4-pro takes the DeepSeek/OpenRouter effort selectors — drop them.
    delete body.thinking
    delete body.reasoning
    delete body.reasoning_effort
  }

  if (!useGlm && !proUpgrade && resolved.thinking && body.thinking === undefined) {
    body.thinking = resolved.thinking
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
    if (ctx.plan !== 'pro' && ctx.plan !== 'max') {
      return json(
        { error: { code: 'plan_required', message: 'The highest answer mode needs the Agent Pro or Max plan.' } },
        403
      )
    }

    upstream = await callProvider(GLM_BASE, GLM_KEY, body)
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
      upstream = await callProvider(GLM_BASE, GLM_KEY, body)
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
      upstream = await callProvider(GLM_BASE, GLM_KEY, body)
    }
  }

  if (!upstream) {
    return json({ error: 'model provider unreachable' }, 502)
  }

  if (!streaming) {
    const data = await upstream.json().catch(() => null)
    const tokens = (data?.usage?.total_tokens as number | undefined) ?? 1000
    const cacheHit = (data?.usage?.prompt_cache_hit_tokens as number | undefined) ?? 0
    void recordUsage(ctx, tokens, cacheHit, model)

    return json(data ?? { error: 'upstream returned no body' }, upstream.status)
  }

  // Streaming: pass bytes through untouched while scanning for the final usage chunk.
  let tail = ''
  let usageTokens = 0
  let cacheHitTokens = 0
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
      // at full weight rather than guessing a discount.
      void recordUsage(ctx, usageTokens || Math.max(500, Math.round(tail.length / 4)), usageTokens ? cacheHitTokens : 0, model)
    },
    transform(chunk, controller) {
      controller.enqueue(chunk)
      tail = (tail + decoder.decode(chunk, { stream: true })).slice(-8000)
      usageTokens = lastNumber(tail, /"total_tokens"\s*:\s*(\d+)/g) ?? usageTokens
      cacheHitTokens = lastNumber(tail, /"prompt_cache_hit_tokens"\s*:\s*(\d+)/g) ?? cacheHitTokens
    }
  })

  return new Response(upstream.body?.pipeThrough(meter) ?? null, {
    headers: {
      'Cache-Control': 'no-cache',
      'Content-Type': upstream.headers.get('Content-Type') ?? 'text/event-stream'
    },
    status: upstream.status
  })
}

Deno.serve(async (req: Request) => {
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
