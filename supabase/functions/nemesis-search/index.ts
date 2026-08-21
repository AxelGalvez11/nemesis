// nemesis-search — the metering valve between Nemesis desktop and web search/scrape.
//
// The desktop's agent speaks the Firecrawl API natively (its provider is pointed at
// this function via FIRECRAWL_API_URL, with the student's device key as the "api key"),
// so this function implements the two Firecrawl v2 routes the agent actually calls and
// forwards them to the real Firecrawl with the SERVER-side key:
//
//   POST /nemesis-search/v2/search   Authorization: Bearer <device key (nmk_...)>
//     → validates key → plan (subscriptions) → daily + monthly unit budgets
//       (plan_entitlements 'nemesis_search_daily_units'/'nemesis_search_monthly_units'
//       + usage_counters 'nemesis_search_units'/'nemesis_search_units_month') → tries
//       Brave first (llm/context — model-ready extracts), then Tavily, then Linkup,
//       then Firecrawl (first to answer wins) → records usage_events. All four are
//       translated to Firecrawl's response shape.
//   POST /nemesis-search/v2/scrape   Authorization: Bearer <device key>
//     → same gate, forwards to Firecrawl's /v2/scrape (no scrape role for Tavily/Linkup).
//       One search or one scrape = one unit.
//
// Device keys are the SAME identity nemesis-llm mints and validates (device_keys table,
// SHA-256 at rest) — one device, one identity, two metered services.
//
// Deploy with verify_jwt=false (custom device-key auth here). Secrets: SUPABASE_URL /
// SUPABASE_SERVICE_ROLE_KEY (platform-injected), FIRECRAWL_API_KEY (server-side upstream
// key; when unset — and no fallback provider is configured either — this returns 503
// with a plain explanation instead of leaking the gap to students as a cryptic parse
// error), BRAVE_API_KEY (the primary for /v2/search since 2026-08-06),
// TAVILY_API_KEY (the quality-first primary from 2026-08-04, now the fallback behind
// Brave), and LINKUP_API_KEY (the cheaper fallback that sits between Tavily and
// Firecrawl). Every provider key is read HERE, server-side — none of them exists on
// the Vercel side, which only forwards to this function.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { braveCanAnswer, braveContextParams, braveContextToWeb, BRAVE_MAX_URLS } from './brave.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const FIRECRAWL_KEY = Deno.env.get('FIRECRAWL_API_KEY') ?? ''
const TAVILY_KEY = Deno.env.get('TAVILY_API_KEY') ?? ''
const LINKUP_KEY = Deno.env.get('LINKUP_API_KEY') ?? ''
// Read under BOTH names on purpose. `Deno.env.get` is case- and name-sensitive, and
// this project has already lost a wired provider to a secret stored under a name the
// code did not ask for — the failure is silent, because a missing key is
// indistinguishable from "provider declined" in the fallback chain.
const BRAVE_KEY = Deno.env.get('BRAVE_API_KEY') ?? Deno.env.get('BRAVE_SEARCH_API_KEY') ?? ''
const FIRECRAWL_BASE = 'https://api.firecrawl.dev'
const TAVILY_BASE = 'https://api.tavily.com'
const LINKUP_BASE = 'https://api.linkup.so'
const BRAVE_CONTEXT_BASE = 'https://api.search.brave.com/res/v1/llm/context'

const COUNTER_KEY = 'nemesis_search_units'
const ENTITLEMENT_KEY = 'nemesis_search_daily_units'
// Monthly ceiling — the economic wall behind the daily cap (search has no cache
// discount, so daily_cap × 30 is the real cost exposure). Reads plan_entitlements
// 'nemesis_search_monthly_units'; counts a separate usage_counters bucket
// 'nemesis_search_units_month' (period = 1st of the month).
const MONTHLY_ENTITLEMENT_KEY = 'nemesis_search_monthly_units'
const MONTHLY_COUNTER_KEY = 'nemesis_search_units_month'
const FALLBACK_MONTHLY_UNITS = 300
// Emit one nemesis_cap_warning event when a user first crosses this fraction of
// either the daily or monthly cap (an early signal, not a block).
const CAP_WARN_FRACTION = 0.85
const ACTIVE = new Set(['active', 'trialing', 'past_due'])
const FALLBACK_DAILY_UNITS = 10 // free-tier default when no entitlement row
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })

// ── Cost attribution ────────────────────────────────────────────────────────
// Same two-ledger split as nemesis-llm: the counters above are the student's unit
// meter, this is what the unit COST US, tagged with which app spent it.
// The project token is PUBLISHABLE (it ships in the web bundle) and write-only.
const POSTHOG_KEY = Deno.env.get('POSTHOG_KEY') ?? 'phc_xcEjfTB3a2ftyzsw7oEAkpiBXRThWWjA3D5BcPBj36ht'
const POSTHOG_HOST = Deno.env.get('POSTHOG_HOST') ?? 'https://us.i.posthog.com'

/** USD per search/scrape unit by the provider that actually answered. These are
 *  ESTIMATES from the providers' published per-search rates (docs/research/
 *  competitor-economics-2026-07.md, "about a penny a search") — unlike the token
 *  prices in nemesis-llm, no provider bills us a line item per call, so events carry
 *  price_estimated: true and a report must not present them as exact. */
// Tavily at ADVANCED depth bills 2 API credits per search (~$0.016), double its
// basic rate — the price of the 2026-08-04 quality-first flip.
// Brave llm/context is $5 per 1,000 requests, read off Brave's own pricing page
// 2026-08-06 — the one rate here that is published per REQUEST rather than inferred,
// and less than a third of what the same search costs at Tavily.
const UNIT_USD: Record<string, number> = { brave: 0.005, firecrawl: 0.01, linkup: 0.005, tavily: 0.016 }

// ── Not asking the same question twice ──────────────────────────────────────
//
// 🔴 THE WINDOW IS A SESSION, NOT A DAY. This lane also serves questions about NOW — the router
// sends "what happened today" through it — so a long cache would answer current events with stale
// ones. Twenty minutes covers a conversation, a reload and a second look, and nothing further.
const SEARCH_CACHE_TTL_SECONDS = 20 * 60

/** The identity of a question, normalised so trivial differences are the same question. PURE. */
function searchCacheKey(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 500)
}

/** A stored answer to this learner's question, or null. Never throws: a cache that cannot be read
 *  is a cache that misses, and a miss is exactly what happened before this existed. */
async function cachedSearch(userId: string, query: string): Promise<unknown | null> {
  const key = searchCacheKey(query)

  if (!key) return null

  try {
    const { data, error } = await admin
      .from('web_search_cache')
      .select('response')
      .eq('user_id', userId)
      .eq('query_key', key)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle()

    if (error || !data?.response) return null

    return data.response
  } catch {
    return null
  }
}

/** Remember one answer and hand the caller back an equivalent Response.
 *
 *  🔴 THE BODY IS CONSUMED HERE, SO A NEW ONE IS BUILT. A `Response` body is a stream: reading it
 *  to store it would leave the caller holding an empty one, which is the kind of bug that looks
 *  like an outage in the provider rather than a mistake in the cache. */
async function cacheAndReturn(userId: string, query: string, response: Response): Promise<Response> {
  const text = await response.text()
  const key = searchCacheKey(query)

  if (key) {
    try {
      const parsed = JSON.parse(text) as unknown

      await admin.from('web_search_cache').upsert(
        {
          expires_at: new Date(Date.now() + SEARCH_CACHE_TTL_SECONDS * 1_000).toISOString(),
          query_key: key,
          response: parsed,
          user_id: userId
        },
        { onConflict: 'user_id,query_key' }
      )
    } catch {
      // A body that is not JSON, or a write that failed: the caller still gets their answer.
    }
  }

  return new Response(text, { headers: { 'Content-Type': 'application/json' }, status: 200 })
}
const PRICE_REV = '2026-08-06'

/** Which app is calling. MIRROR of resolveClient in _shared/llm-cost.ts. */
function resolveClient(header: string | null, keyLabel: string | null): string {
  const declared = (header ?? '').trim().toLowerCase()
  if (declared === 'web' || declared === 'ios' || declared === 'desktop') return declared

  const label = keyLabel ?? ''
  if (/iphone|ipad|ios/i.test(label)) return 'ios'
  if (/web/i.test(label)) return 'web'
  if (/desktop|mac/i.test(label)) return 'desktop'

  return 'unknown'
}

/** Report one billable unit to PostHog. Never throws — a missing cost report must
 *  never cost a student their search result. */
async function reportCost(distinctId: string, props: Record<string, unknown>): Promise<void> {
  if (!POSTHOG_KEY) return

  try {
    await fetch(`${POSTHOG_HOST}/i/v0/e/`, {
      body: JSON.stringify({
        api_key: POSTHOG_KEY,
        event: 'nemesis_service_cost',
        properties: { distinct_id: distinctId, ...props }
      }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST'
    })
  } catch {
    /* analytics is never load-bearing */
  }
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

interface KeyContext {
  userId: string
  plan: string
  dailyLimit: number
  used: number
  periodStart: string
  monthlyLimit: number
  monthlyUsed: number
  monthStart: string
  /** Device-key label — the fallback signal for which app spent this unit. */
  label: string | null
}

/** Resolve a device key to its user + plan + today's usage. Mirrors nemesis-llm. */
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

  let plan = sub?.plan && sub.status && ACTIVE.has(sub.status) ? sub.plan : 'free'

  // Free accounts remain on the bounded freemium tier. A paid subscription may
  // still be `trialing`, but account age alone never grants the full Pro budget.

  const { data: ents } = await admin
    .from('plan_entitlements')
    .select('entitlement_key,value_json')
    .eq('plan_code', plan)
    .in('entitlement_key', [ENTITLEMENT_KEY, MONTHLY_ENTITLEMENT_KEY])

  const entValue = (key: string): number | undefined => {
    const row = ents?.find(e => e.entitlement_key === key)
    return typeof row?.value_json === 'number' ? row.value_json : undefined
  }

  const dailyLimit = entValue(ENTITLEMENT_KEY) ?? FALLBACK_DAILY_UNITS
  const monthlyLimit = entValue(MONTHLY_ENTITLEMENT_KEY) ?? FALLBACK_MONTHLY_UNITS

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
    plan,
    used: usedFor(COUNTER_KEY, periodStart),
    userId: keyRow.user_id
  }
}

/**
 * Brave — the PRIMARY for /v2/search (owner 2026-08-06, replacing Tavily).
 *
 * Uses llm/context rather than web/search: it returns pre-extracted, ranked chunks
 * of each page instead of a one-line SERP snippet, which is what a model reading the
 * result actually needs. Every row keeps its url and title, so citations are
 * unchanged — the mapping into Firecrawl's response shape lives in brave.ts and is
 * unit-tested there, because THIS IS A PROVIDER SWAP AND THE CONTRACT MUST NOT MOVE.
 *
 * Returns null — "I did not answer, try the next one" — in four cases: no key, a
 * query Brave's API would reject, a non-2xx, or a payload with no citable row. The
 * last one matters: answering with an empty result set would look to the student
 * like the web had nothing to say, when really Brave just had no grounding.
 */
async function braveSearch(body: Record<string, unknown>): Promise<Response | null> {
  if (!BRAVE_KEY) {
    return null
  }

  const query = String(body.query ?? '')

  // Checked BEFORE the request, not after a 4xx: Tavily accepts queries Brave
  // rejects (>400 chars / >50 words), so without this a long query fails at Brave
  // and falls silently through — presenting as "Brave never wins" with no error.
  if (!braveCanAnswer(query)) {
    return null
  }

  // 🔴 THE FALLBACK IS THE PROVIDER'S CEILING, NOT A NUMBER OF OURS. This used to default to 5,
  // so any caller that did not name a limit got the narrowest possible read of the web — and one
  // search bills one metered unit whatever comes back, so the small number saved nothing. How many
  // to read is the model's call now; a caller that does not say gets everything Brave will give.
  const limit = typeof body.limit === 'number' ? body.limit : BRAVE_MAX_URLS
  const upstream = await fetch(`${BRAVE_CONTEXT_BASE}?${braveContextParams(query, limit)}`, {
    headers: { Accept: 'application/json', 'X-Subscription-Token': BRAVE_KEY },
    method: 'GET'
  }).catch(() => null)

  if (!upstream?.ok) {
    return null
  }

  const web = braveContextToWeb(await upstream.json().catch(() => null), limit)

  if (!web.length) {
    return null
  }

  return json({ data: { web }, success: true })
}

/** Tavily — the FALLBACK behind Brave since 2026-08-06 (it was the primary from
 *  2026-08-04: quality over the half-cent saving). Kept wired on purpose while
 *  Brave proves itself on real student queries; retiring it is a separate decision.
 *  Answered in Firecrawl's response shape so the desktop SDK parses it identically.
 *  Search only — scrape stays Firecrawl. */
async function tavilySearch(body: Record<string, unknown>): Promise<Response | null> {
  if (!TAVILY_KEY) {
    return null
  }

  const upstream = await fetch(`${TAVILY_BASE}/search`, {
    body: JSON.stringify({
      max_results: typeof body.limit === 'number' ? body.limit : BRAVE_MAX_URLS,
      query: String(body.query ?? ''),
      // Advanced depth re-ranks and reads deeper into pages — the better
      // snippets are the point of putting Tavily first. Costs 2 credits.
      search_depth: 'advanced'
    }),
    headers: { Authorization: `Bearer ${TAVILY_KEY}`, 'Content-Type': 'application/json' },
    method: 'POST'
  }).catch(() => null)

  if (!upstream?.ok) {
    return null
  }

  const data = (await upstream.json().catch(() => null)) as {
    results?: { content?: string; title?: string; url?: string }[]
  } | null

  if (!data?.results) {
    return null
  }

  return json({
    data: {
      web: data.results.map(result => ({
        description: result.content ?? '',
        title: result.title ?? result.url ?? '',
        url: result.url ?? ''
      }))
    },
    success: true
  })
}

/** Linkup fallback for /v2/search — the cheaper second line behind Tavily,
 *  ahead of Firecrawl. Same Firecrawl-shaped response as tavilySearch so the
 *  desktop SDK parses it identically; {name,url,content} → {title,url,description}. */
async function linkupSearch(body: Record<string, unknown>): Promise<Response | null> {
  if (!LINKUP_KEY) {
    return null
  }

  const upstream = await fetch(`${LINKUP_BASE}/v1/search`, {
    body: JSON.stringify({
      depth: 'standard',
      outputType: 'searchResults',
      q: String(body.query ?? '')
    }),
    headers: { Authorization: `Bearer ${LINKUP_KEY}`, 'Content-Type': 'application/json' },
    method: 'POST'
  }).catch(() => null)

  if (!upstream?.ok) {
    return null
  }

  const data = (await upstream.json().catch(() => null)) as {
    results?: { content?: string; name?: string; url?: string }[]
  } | null

  if (!data?.results) {
    return null
  }

  return json({
    data: {
      web: data.results.map(result => ({
        description: result.content ?? '',
        title: result.name ?? result.url ?? '',
        url: result.url ?? ''
      }))
    },
    success: true
  })
}

/**
 * One search answered from the cache: an event, and no meter movement.
 *
 * 🔴 `cost_credits: 0` AND NO COUNTER UPSERT, DELIBERATELY. `usage_events` serves two ledgers — the
 * learner's entitlement meter and our provider bill — and this row belongs to neither in the usual
 * way: nobody was billed, and nobody should be charged an allowance for it. What it IS is the only
 * evidence that the cache is doing anything, so it is written rather than skipped.
 */
async function recordCacheHit(ctx: KeyContext, detail: string, client: string): Promise<void> {
  try {
    await admin.from('usage_events').insert({
      cost_credits: 0,
      counter_key: COUNTER_KEY,
      event_type: 'nemesis_search_cache_hit',
      metadata: { client, cost_usd: 0, detail: detail.slice(0, 200), kind: 'search', price_rev: PRICE_REV, provider: 'cache' },
      period_start: ctx.periodStart,
      user_id: ctx.userId
    })
  } catch {
    // A missing observation is not a reason to fail a search the learner already has.
  }
}

/** Record one spent unit against today's + this month's counters + the event ledger,
 *  and report what that unit cost us. `provider` is whichever upstream actually
 *  answered — they charge different rates, so the cheapest-first routing only shows
 *  up in the numbers if the winner is recorded. */
async function recordUsage(
  ctx: KeyContext,
  kind: 'scrape' | 'search',
  detail: string,
  provider: 'brave' | 'firecrawl' | 'linkup' | 'tavily',
  client: string
): Promise<void> {
  const nowIso = new Date().toISOString()

  await admin.from('usage_counters').upsert(
    {
      counter_key: COUNTER_KEY,
      limit_snapshot: ctx.dailyLimit,
      period_end: ctx.periodStart,
      period_start: ctx.periodStart,
      updated_at: nowIso,
      used: ctx.used + 1,
      user_id: ctx.userId
    },
    { onConflict: 'user_id,counter_key,period_start' }
  )

  await admin.from('usage_counters').upsert(
    {
      counter_key: MONTHLY_COUNTER_KEY,
      limit_snapshot: ctx.monthlyLimit,
      period_end: ctx.monthStart,
      period_start: ctx.monthStart,
      updated_at: nowIso,
      used: ctx.monthlyUsed + 1,
      user_id: ctx.userId
    },
    { onConflict: 'user_id,counter_key,period_start' }
  )

  const usd = UNIT_USD[provider] ?? null

  await admin.from('usage_events').insert({
    cost_credits: 1,
    counter_key: COUNTER_KEY,
    event_type: `nemesis_search_${kind}`,
    metadata: { client, cost_usd: usd, detail: detail.slice(0, 200), kind, price_rev: PRICE_REV, provider },
    period_start: ctx.periodStart,
    user_id: ctx.userId
  })

  await reportCost(ctx.userId, {
    client,
    cost_usd: usd,
    kind,
    plan: ctx.plan,
    // Per-unit search rates are published averages, not a billed line item.
    price_estimated: true,
    price_rev: PRICE_REV,
    provider,
    service: 'search',
    units: 1
  })

  void maybeWarnCap(ctx, 'daily', ctx.used, ctx.used + 1, ctx.dailyLimit, ctx.periodStart)
  void maybeWarnCap(ctx, 'monthly', ctx.monthlyUsed, ctx.monthlyUsed + 1, ctx.monthlyLimit, ctx.monthStart)
}

/** Emit one nemesis_cap_warning event the moment usage crosses the warn line for a
 *  window (only on the crossing tick, so at most one per period). */
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
  if (before >= line || after < line) return

  await admin.from('usage_events').insert({
    cost_credits: 0,
    counter_key: COUNTER_KEY,
    event_type: 'nemesis_cap_warning',
    metadata: { after, limit, plan: ctx.plan, pct: Math.round((after / limit) * 100), window },
    period_start: period,
    user_id: ctx.userId
  })
}

async function proxyFirecrawl(req: Request, route: '/v2/scrape' | '/v2/search'): Promise<Response> {
  if (!BRAVE_KEY && !FIRECRAWL_KEY && !TAVILY_KEY && !LINKUP_KEY) {
    return json({ success: false, error: 'search provider key not configured on the server' }, 503)
  }

  const deviceKey = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const ctx = await resolveKey(deviceKey)

  if (ctx instanceof Response) {
    return ctx
  }

  // Which app is spending. Header first, device-key label as the fallback.
  const client = resolveClient(req.headers.get('x-nemesis-client'), ctx.label)

  if (ctx.used >= ctx.dailyLimit) {
    return json(
      {
        success: false,
        error: `Daily search budget reached for the ${ctx.plan} plan (${ctx.dailyLimit}/day). Upgrade or try again tomorrow.`
      },
      429
    )
  }

  if (ctx.monthlyUsed >= ctx.monthlyLimit) {
    return json(
      {
        success: false,
        error: `Monthly search budget reached for the ${ctx.plan} plan (${ctx.monthlyLimit}/month). It resets on the 1st — upgrade for a higher ceiling.`
      },
      429
    )
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null

  if (!body) {
    return json({ success: false, error: 'invalid request body' }, 400)
  }

  const detail = route === '/v2/search' ? String(body.query ?? '') : String(body.url ?? '')

  // Provider routing (owner 2026-08-06: Brave replaces Tavily as the default).
  // SEARCHES try Brave llm/context first ($0.005/request, model-ready extracts),
  // then Tavily at advanced depth (~$0.016 — kept as the fallback while Brave
  // proves itself), then Linkup (~$0.005), then Firecrawl. First to answer wins,
  // and whichever one did is what `recordUsage` writes down — the routing only
  // shows up in the cost numbers if the winner is recorded honestly.
  // Brave/Tavily/Linkup have no scrape role, so SCRAPES go straight to Firecrawl.
  if (route === '/v2/search') {
    // ── The same question, asked again ──────────────────────────────────────
    //
    // 🔴🔴 THE OWNER'S RULE: *"Do not repeatedly search for the same fact or repeatedly reacquire
    // the same source when durable grounding already exists."* A chat turn that searches, an
    // immediate follow-up that searches the same thing, and a page reload that searches it a third
    // time were three billed searches for one question. Nothing looked.
    //
    // 🔴 SHORT, BECAUSE THIS LANE IS ALSO THE "CURRENT EVENTS" LANE. `classifyChatRequest` routes a
    // question ABOUT NOW through here, and a cache measured in hours would answer today's news with
    // yesterday's. The window is set to cover a session — a conversation, a reload, a second look —
    // and nothing beyond it.
    //
    // 🔴 PER LEARNER, for the reason every other cache in this system is: a search result is a
    // record that a particular person asked a particular question.
    const cached = await cachedSearch(ctx.userId, detail)

    if (cached) {
      // 🔴 RECORDED, BUT NOT METERED. The event is written so the cache-hit rate is countable —
      // a saving that leaves no trace is indistinguishable from a lane that stopped being used —
      // and the learner's daily and monthly UNIT counters are deliberately not touched. A search
      // nobody paid for must not spend somebody's allowance, or the cache would give with one hand
      // and take with the other.
      void recordCacheHit(ctx, detail, client)

      return json(cached, 200)
    }

    const brave = await braveSearch(body)

    if (brave) {
      void recordUsage(ctx, 'search', detail, 'brave', client)

      // 🔴 THE BODY IS READ ONCE AND RE-SENT, because a Response body is a stream and reading it to
      // cache it would leave the caller with an empty one. `storeSearch` is handed the parsed
      // object and a fresh Response is built from it.
      return await cacheAndReturn(ctx.userId, detail, brave)
    }

    const primary = await tavilySearch(body)

    if (primary) {
      void recordUsage(ctx, 'search', detail, 'tavily', client)

      // 🔴 THE BODY IS READ ONCE AND RE-SENT, because a Response body is a stream and reading it to
      // cache it would leave the caller with an empty one. `storeSearch` is handed the parsed
      // object and a fresh Response is built from it.
      return await cacheAndReturn(ctx.userId, detail, primary)
    }

    const secondary = await linkupSearch(body)

    if (secondary) {
      void recordUsage(ctx, 'search', detail, 'linkup', client)

      // 🔴 THE BODY IS READ ONCE AND RE-SENT, because a Response body is a stream and reading it to
      // cache it would leave the caller with an empty one. `storeSearch` is handed the parsed
      // object and a fresh Response is built from it.
      return await cacheAndReturn(ctx.userId, detail, secondary)
    }
  }

  const upstream = FIRECRAWL_KEY
    ? await fetch(`${FIRECRAWL_BASE}${route}`, {
        body: JSON.stringify(body),
        headers: { Authorization: `Bearer ${FIRECRAWL_KEY}`, 'Content-Type': 'application/json' },
        method: 'POST'
      }).catch(() => null)
    : null

  if (upstream?.ok) {
    void recordUsage(ctx, route === '/v2/search' ? 'search' : 'scrape', detail, 'firecrawl', client)

    return new Response(await upstream.text(), {
      headers: { 'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json' },
      status: upstream.status
    })
  }

  if (upstream) {
    return new Response(await upstream.text(), {
      headers: { 'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json' },
      status: upstream.status
    })
  }

  return json({ success: false, error: 'search providers unreachable' }, 502)
}

Deno.serve((req: Request) => {
  const path = new URL(req.url).pathname

  if (req.method === 'POST' && path.endsWith('/v2/search')) {
    return proxyFirecrawl(req, '/v2/search')
  }

  if (req.method === 'POST' && path.endsWith('/v2/scrape')) {
    return proxyFirecrawl(req, '/v2/scrape')
  }

  return json({ error: 'not found' }, 404)
})
