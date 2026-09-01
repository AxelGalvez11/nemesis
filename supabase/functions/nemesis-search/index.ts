// nemesis-search — the metering valve between Nemesis desktop and web search/scrape.
//
// The desktop's agent speaks the Firecrawl API natively (its provider is pointed at
// this function via FIRECRAWL_API_URL, with the student's device key as the "api key"),
// so this function implements the two Firecrawl v2 routes the agent actually calls.
//
// 🔴🔴 THE SHAPE IS FIRECRAWL'S; NOTHING IS FORWARDED TO FIRECRAWL ANY MORE. Owner,
// 2026-09-01: *"also remove firecrawl too, i only want brave (its cheap)."* The route
// names and the response envelope stay because three clients parse them — renaming a
// wire format to make a point breaks the desktop, the phone and the web at once — but
// both routes are answered HERE now: search by Brave, scrape by our own reader.
//
//   POST /nemesis-search/v2/search   Authorization: Bearer <device key (nmk_...)>
//     → validates key → plan (subscriptions) → daily + monthly unit budgets
//       (plan_entitlements 'nemesis_search_daily_units'/'nemesis_search_monthly_units'
//       + usage_counters 'nemesis_search_units'/'nemesis_search_units_month') → asks
//       BRAVE, AND ONLY BRAVE (llm/context — model-ready extracts) → records
//       usage_events. The answer is translated to Firecrawl's response shape, which
//       is the wire format the desktop SDK parses.
//
//       🔴🔴 ONE SEARCH PROVIDER, BY THE OWNER, 2026-09-01: *"make sure tavily is not
//       plugged into nemesis, only brave for websearch please."* Tavily and Linkup are
//       gone from this file — not demoted, removed — and Firecrawl no longer answers a
//       SEARCH either. A chain of fallbacks is how a retired provider keeps billing:
//       every one of them was reachable, none of them was chosen deliberately, and the
//       only evidence of which answered was a field in an analytics event.
//   POST /nemesis-search/v2/scrape   Authorization: Bearer <device key>
//     → same gate, then `readPage` (read-page.ts): one ordinary HTTPS request and a
//       plain-text extraction, no vendor and no per-page cost. Brave's llm/context
//       cannot fetch a URL you name, so deleting Firecrawl without this would have
//       deleted the feature, not the provider. One search or one scrape = one unit —
//       a scrape now costs us nothing, but the unit is also the rate limit.
//
// Device keys are the SAME identity nemesis-llm mints and validates (device_keys table,
// SHA-256 at rest) — one device, one identity, two metered services.
//
// Deploy with verify_jwt=false (custom device-key auth here). Secrets: SUPABASE_URL /
// SUPABASE_SERVICE_ROLE_KEY (platform-injected) and BRAVE_API_KEY — 🔴 THE ONLY
// PROVIDER KEY THIS FUNCTION STILL READS. When it is unset, /v2/search returns a 503
// naming it rather than leaking the gap to students as a cryptic parse error; /v2/scrape
// needs no key at all and keeps working. It is
// read HERE, server-side, and does not exist on the Vercel side, which only forwards.
// 🔴 TAVILY_API_KEY, LINKUP_API_KEY AND FIRECRAWL_API_KEY ARE READ BY NOTHING; delete
// all three from the function's secrets, so a key nothing asks for cannot quietly bill.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { braveContextParams, braveContextToWeb, braveFit, BRAVE_MAX_URLS } from './brave.ts'
import { readPage } from './read-page.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
// Read under BOTH names on purpose. `Deno.env.get` is case- and name-sensitive, and
// this project has already lost a wired provider to a secret stored under a name the
// code did not ask for — the failure is silent, because a missing key is
// indistinguishable from "provider declined" in the fallback chain.
const BRAVE_KEY = Deno.env.get('BRAVE_API_KEY') ?? Deno.env.get('BRAVE_SEARCH_API_KEY') ?? ''
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
// Brave llm/context is $5 per 1,000 requests, read off Brave's own pricing page
// 2026-08-06 — the one rate here published per REQUEST rather than inferred.
//
// 🔴 TAVILY, LINKUP AND FIRECRAWL ARE NOT LISTED, BECAUSE NOTHING CAN SPEND THEM. A
// price for a provider this file cannot call is an invitation to wire it back up.
// Historical rows naming them are still priceable — that registry is
// `apps/web/lib/provider-costs.ts`, which carries them as RETIRED.
//
// 🔴 `direct` IS ZERO AND IS STILL RECORDED. Reading a page ourselves costs no vendor
// money, and an event with no row would make the scrape lane look retired the moment
// it stopped billing — the exact misreading that let Tavily survive in the code for
// 26 days after it last answered anything. Free is a price; absent is not.
const UNIT_USD: Record<string, number> = { brave: 0.005, direct: 0 }

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
 * Brave — the ONLY provider for /v2/search (owner 2026-09-01; the primary since
 * 2026-08-06).
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

  // 🔴 TRIMMED TO FIT, NOT REJECTED. Brave refuses a query over 400 characters or 50
  // words. That used to mean "let Tavily take it"; with no one else to take it, the
  // choice is between a shortened search and no search, and `braveFit` makes it the
  // former. See its own note.
  const asked = String(body.query ?? '')
  const query = braveFit(asked)

  if (!query) {
    return null
  }

  if (query !== asked.trim().replace(/\s+/g, ' ')) {
    // Logged rather than silent: a result set that answers a shorter question than the
    // one asked is exactly the kind of thing that is impossible to diagnose later.
    console.log(`brave: query trimmed to fit (${asked.length} → ${query.length} chars)`)
  }

  // 🔴 THE FALLBACK IS THE PROVIDER'S CEILING, NOT A NUMBER OF OURS. This used to default to 5,
  // so any caller that did not name a limit got the narrowest possible read of the web — and one
  // search bills one metered unit whatever comes back, so the small number saved nothing. How many
  // to read is the model's call now; a caller that does not say gets everything Brave will give.
  const limit = typeof body.limit === 'number' ? body.limit : BRAVE_MAX_URLS
  // 🔴 FORWARDED RAW, VALIDATED IN `braveContextParams`. Whether a question turns on recency is the
  // model's reading; whether `pw` is a value Brave accepts is a fact, and the one place that talks
  // to Brave is the honest place to check it. Anything unrecognised becomes no filter at all rather
  // than a parameter that silently does nothing.
  const upstream = await fetch(`${BRAVE_CONTEXT_BASE}?${braveContextParams(query, limit, body.freshness)}`, {
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
  provider: 'brave' | 'direct',
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
  // 🔴 ONLY SEARCH NEEDS A KEY NOW. Reading a page is an ordinary HTTPS request, so the
  // scrape route has nothing to be unconfigured about and must not be refused for a
  // missing search key — asking one pooled question is how a server with the wrong half
  // of its configuration fails the working half.
  if (route === '/v2/search' && !BRAVE_KEY) {
    return json({ success: false, error: 'web search is not configured on the server (BRAVE_API_KEY)' }, 503)
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

  // Provider routing (owner 2026-09-01: *"only brave for websearch"*).
  // SEARCHES ask Brave llm/context and nothing else. SCRAPES go to Firecrawl, which
  // is the only thing here that reads one named URL. There is no chain to fall down.
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

    // 🔴🔴 BRAVE DECLINED, AND THAT IS THE WHOLE ANSWER NOW. There is nowhere to fall
    // through to, so this says what happened instead of pretending a search ran and
    // came back empty. `braveSearch` returns null for three different reasons — the
    // request failed, the key is missing, or Brave returned nothing — and a learner
    // cannot act on any of them, so they get one honest sentence and the log keeps
    // the detail.
    return json({ success: false, error: 'web search returned nothing for this query' }, 502)
  }

  // ── /v2/scrape — read the one page they named ─────────────────────────────
  //
  // 🔴 ANSWERED IN FIRECRAWL'S ENVELOPE, because that is what three clients parse:
  // `data.markdown` is where the notebook reader looks, `data.metadata.title` is what
  // names the source. The shape is a contract with our own apps; the vendor behind it
  // was never part of that contract.
  const page = await readPage(String(body.url ?? ''))

  if ('reason' in page) {
    // 🔴 THE REASON IS THE LEARNER'S, NOT A STATUS CODE. "Couldn't read that page" was
    // the old ceiling on what we could say, because the failure happened inside someone
    // else's service. We do the fetching now, so we know whether it was a PDF, a login
    // wall, a redirect off the public web or a dead link — and saying which is the
    // difference between a person fixing their link and giving up.
    return json({ success: false, error: page.reason }, 422)
  }

  void recordUsage(ctx, 'scrape', detail, 'direct', client)

  return json({
    data: {
      markdown: page.text,
      metadata: { sourceURL: page.url, title: page.title }
    },
    success: true
  })
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
