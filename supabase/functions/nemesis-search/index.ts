// nemesis-search — the metering valve between Nemesis desktop and web search/scrape.
//
// The desktop's agent speaks the Firecrawl API natively (its provider is pointed at
// this function via FIRECRAWL_API_URL, with the student's device key as the "api key"),
// so this function implements the two Firecrawl v2 routes the agent actually calls and
// forwards them to the real Firecrawl with the SERVER-side key:
//
//   POST /nemesis-search/v2/search   Authorization: Bearer <device key (nmk_...)>
//     → validates key → plan (subscriptions) → daily unit budget (plan_entitlements
//       'nemesis_search_daily_units' + usage_counters 'nemesis_search_units') → forwards
//       body verbatim to https://api.firecrawl.dev/v2/search → records usage_events.
//   POST /nemesis-search/v2/scrape   Authorization: Bearer <device key>
//     → same gate, forwards to /v2/scrape. One search or one scrape = one unit.
//
// Device keys are the SAME identity nemesis-llm mints and validates (device_keys table,
// SHA-256 at rest) — one device, one identity, two metered services.
//
// Deploy with verify_jwt=false (custom device-key auth here). Secrets: SUPABASE_URL /
// SUPABASE_SERVICE_ROLE_KEY (platform-injected) and FIRECRAWL_API_KEY (server-side
// upstream key; when unset this returns 503 with a plain explanation instead of leaking
// the gap to students as a cryptic parse error).
import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const FIRECRAWL_KEY = Deno.env.get('FIRECRAWL_API_KEY') ?? ''
const FIRECRAWL_BASE = 'https://api.firecrawl.dev'

const COUNTER_KEY = 'nemesis_search_units'
const ENTITLEMENT_KEY = 'nemesis_search_daily_units'
const ACTIVE = new Set(['active', 'trialing', 'past_due'])
const FALLBACK_DAILY_UNITS = 150 // free-tier default when no entitlement row

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

  const plan = sub?.plan && sub.status && ACTIVE.has(sub.status) ? sub.plan : 'free'

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
  if (!FIRECRAWL_KEY) {
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

  const upstream = await fetch(`${FIRECRAWL_BASE}${route}`, {
    body: JSON.stringify(body),
    headers: { Authorization: `Bearer ${FIRECRAWL_KEY}`, 'Content-Type': 'application/json' },
    method: 'POST'
  })

  const text = await upstream.text()

  if (upstream.ok) {
    const detail = route === '/v2/search' ? String(body.query ?? '') : String(body.url ?? '')
    void recordUsage(ctx, route === '/v2/search' ? 'search' : 'scrape', detail)
  }

  return new Response(text, {
    headers: { 'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json' },
    status: upstream.status
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
