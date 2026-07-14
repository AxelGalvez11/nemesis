// nemesis-search — the metering valve between Nemesis desktop and web search/scrape.
//
// The desktop's agent speaks the Firecrawl API natively (its provider is pointed at
// this function via FIRECRAWL_API_URL, with the student's device key as the "api key"),
// so this function implements the two Firecrawl v2 routes the agent actually calls and
// forwards them to the real Firecrawl with the SERVER-side key:
//
//   POST /nemesis-search/v2/search   Authorization: Bearer <device key (nmk_...)>
//     → validates key → plan (subscriptions) → daily unit budget (plan_entitlements
//       'nemesis_search_daily_units' + usage_counters 'nemesis_search_units') → tries
//       Tavily, then Linkup, then Firecrawl (first one to answer wins) → records
//       usage_events. All three are translated to Firecrawl's response shape.
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
// error), TAVILY_API_KEY (cheap primary for /v2/search), and LINKUP_API_KEY (search
// fallback that sits between Tavily and Firecrawl).
import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const FIRECRAWL_KEY = Deno.env.get('FIRECRAWL_API_KEY') ?? ''
const TAVILY_KEY = Deno.env.get('TAVILY_API_KEY') ?? ''
const LINKUP_KEY = Deno.env.get('LINKUP_API_KEY') ?? ''
const FIRECRAWL_BASE = 'https://api.firecrawl.dev'
const TAVILY_BASE = 'https://api.tavily.com'
const LINKUP_BASE = 'https://api.linkup.so'

const COUNTER_KEY = 'nemesis_search_units'
const ENTITLEMENT_KEY = 'nemesis_search_daily_units'
const ACTIVE = new Set(['active', 'trialing', 'past_due'])
const FALLBACK_DAILY_UNITS = 10 // free-tier default when no entitlement row
const TRIAL_MS = 7 * 24 * 60 * 60 * 1000

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })

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
}

/** Resolve a device key to its user + plan + today's usage. Mirrors nemesis-llm. */
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

  // No paid plan: accounts younger than 7 days ride the full-power trial tier.
  if (plan === 'free') {
    const { data: userData } = await admin.auth.admin.getUserById(keyRow.user_id)
    const createdAt = userData?.user?.created_at ? Date.parse(userData.user.created_at) : 0

    if (createdAt && Date.now() - createdAt < TRIAL_MS) {
      plan = 'trial'
    }
  }

  const { data: ent } = await admin
    .from('plan_entitlements')
    .select('value_json')
    .eq('plan_code', plan)
    .eq('entitlement_key', ENTITLEMENT_KEY)
    .maybeSingle()

  const dailyLimit = typeof ent?.value_json === 'number' ? ent.value_json : FALLBACK_DAILY_UNITS

  const periodStart = new Date().toISOString().slice(0, 10)
  const { data: counter } = await admin
    .from('usage_counters')
    .select('used')
    .eq('user_id', keyRow.user_id)
    .eq('counter_key', COUNTER_KEY)
    .eq('period_start', periodStart)
    .maybeSingle()

  return { dailyLimit, periodStart, plan, used: counter?.used ?? 0, userId: keyRow.user_id }
}

/** Tavily fallback for /v2/search, answered in Firecrawl's response shape so the
 *  desktop SDK parses it identically. Search only — scrape stays Firecrawl. */
async function tavilySearch(body: Record<string, unknown>): Promise<Response | null> {
  if (!TAVILY_KEY) {
    return null
  }

  const upstream = await fetch(`${TAVILY_BASE}/search`, {
    body: JSON.stringify({
      max_results: typeof body.limit === 'number' ? body.limit : 5,
      query: String(body.query ?? ''),
      search_depth: 'basic'
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

/** Linkup fallback for /v2/search — second in line behind Tavily, ahead of Firecrawl.
 *  Same Firecrawl-shaped response as tavilySearch so the desktop SDK parses it
 *  identically; Linkup's {name,url,content} maps to {title,url,description}. */
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

/** Record one spent unit against today's counter + the event ledger. */
async function recordUsage(ctx: KeyContext, kind: 'scrape' | 'search', detail: string): Promise<void> {
  await admin.from('usage_counters').upsert(
    {
      counter_key: COUNTER_KEY,
      limit_snapshot: ctx.dailyLimit,
      period_end: ctx.periodStart,
      period_start: ctx.periodStart,
      updated_at: new Date().toISOString(),
      used: ctx.used + 1,
      user_id: ctx.userId
    },
    { onConflict: 'user_id,counter_key,period_start' }
  )

  await admin.from('usage_events').insert({
    cost_credits: 1,
    counter_key: COUNTER_KEY,
    event_type: `nemesis_search_${kind}`,
    metadata: { detail: detail.slice(0, 200), kind },
    period_start: ctx.periodStart,
    user_id: ctx.userId
  })
}

async function proxyFirecrawl(req: Request, route: '/v2/scrape' | '/v2/search'): Promise<Response> {
  if (!FIRECRAWL_KEY && !TAVILY_KEY && !LINKUP_KEY) {
    return json({ success: false, error: 'search provider key not configured on the server' }, 503)
  }

  const deviceKey = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const ctx = await resolveKey(deviceKey)

  if (ctx instanceof Response) {
    return ctx
  }

  if (ctx.used >= ctx.dailyLimit) {
    return json(
      {
        success: false,
        error: `Daily search budget reached for the ${ctx.plan} plan (${ctx.dailyLimit}/day). Upgrade or try again tomorrow.`
      },
      429
    )
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null

  if (!body) {
    return json({ success: false, error: 'invalid request body' }, 400)
  }

  const detail = route === '/v2/search' ? String(body.query ?? '') : String(body.url ?? '')

  // Cost routing: Tavily is the cheap search provider, so SEARCHES go there first,
  // Linkup second, and Firecrawl last (with Tavily/Linkup having no scrape role, so
  // SCRAPES go straight to Firecrawl, which is what it's actually good at).
  if (route === '/v2/search') {
    const primary = await tavilySearch(body)

    if (primary) {
      void recordUsage(ctx, 'search', detail)

      return primary
    }

    const secondary = await linkupSearch(body)

    if (secondary) {
      void recordUsage(ctx, 'search', detail)

      return secondary
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
    void recordUsage(ctx, route === '/v2/search' ? 'search' : 'scrape', detail)

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
