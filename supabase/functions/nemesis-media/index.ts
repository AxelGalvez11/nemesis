// nemesis-media — metered image generation for Nemesis desktop (task #61).
//
// Routes (single function):
//   POST /nemesis-media/images/generations   Authorization: Bearer <device key (nmk_...)>
//     body: { prompt: string, n?: 1 }  → validates key → plan → daily image budget
//     (plan_entitlements 'nemesis_media_daily_images' or in-code fallback) → calls
//     Gemini image generation with the SERVER-side key → returns
//     { data: [{ b64_json, mime_type }], model } (OpenAI-images-ish shape).
//   GET  /nemesis-media/usage                Authorization: Bearer <device key>
//     → { plan, daily_limit, used, remaining, period_start } for the image meter.
//
// Deploy with verify_jwt=false (device-key auth implemented here). Secrets:
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (platform) + GEMINI_API_KEY (vault,
// owner-added 2026-07-14 — reserved for image generation, NOT chat).
//
// Model note: Google retires fixed model ids for NEW keys (learned 2026-07-14 with
// gemini-2.5-flash chat → 404). No evergreen alias exists for image models, so we
// walk a LADDER, newest first, on 404/NOT_FOUND — and GEMINI_IMAGE_MODEL env
// overrides the whole ladder when set.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY') ?? ''
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta'

const MODEL_LADDER = (() => {
  const override = (Deno.env.get('GEMINI_IMAGE_MODEL') ?? '').trim()

  if (override) return [override]

  return ['gemini-3-pro-image-preview', 'gemini-2.5-flash-image']
})()

const COUNTER_KEY = 'nemesis_media_images'
const ENTITLEMENT_KEY = 'nemesis_media_daily_images'
const ACTIVE = new Set(['active', 'trialing', 'past_due'])
const TRIAL_MS = 7 * 24 * 60 * 60 * 1000

// Per-plan daily image budgets when no plan_entitlements row exists. Deliberate
// taste-tier for free; real capacity on paid plans.
const FALLBACK_DAILY_IMAGES: Record<string, number> = {
  enterprise: 200,
  free: 2,
  plus: 15,
  pro: 40,
  professional: 100,
  trial: 30
}

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

/** Resolve a device key to user + plan + today's IMAGE usage (mirrors nemesis-llm). */
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

  const { data: sub } = await admin
    .from('subscriptions')
    .select('plan,status')
    .eq('user_id', keyRow.user_id)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let plan = sub?.plan && sub.status && ACTIVE.has(sub.status) ? sub.plan : 'free'

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

  const dailyLimit = typeof ent?.value_json === 'number' ? ent.value_json : (FALLBACK_DAILY_IMAGES[plan] ?? 2)

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

/** Count generated images against today's counter + the event ledger. */
async function recordUsage(ctx: KeyContext, images: number, model: string): Promise<void> {
  await admin.from('usage_counters').upsert(
    {
      counter_key: COUNTER_KEY,
      limit_snapshot: ctx.dailyLimit,
      period_end: ctx.periodStart,
      period_start: ctx.periodStart,
      updated_at: new Date().toISOString(),
      used: ctx.used + images,
      user_id: ctx.userId
    },
    { onConflict: 'user_id,counter_key,period_start' }
  )

  await admin.from('usage_events').insert({
    cost_credits: images,
    counter_key: COUNTER_KEY,
    event_type: 'nemesis_media_generation',
    metadata: { images, model },
    period_start: ctx.periodStart,
    user_id: ctx.userId
  })
}

/** Extract the first inline image from a Gemini generateContent response. */
function firstInlineImage(payload: unknown): { b64: string; mime: string } | null {
  const parts =
    (payload as { candidates?: Array<{ content?: { parts?: Array<Record<string, unknown>> } }> })?.candidates?.[0]
      ?.content?.parts ?? []

  for (const part of parts) {
    const inline = (part.inline_data ?? part.inlineData) as { data?: string; mime_type?: string; mimeType?: string } | undefined

    if (inline?.data) {
      return { b64: inline.data, mime: inline.mime_type ?? inline.mimeType ?? 'image/png' }
    }
  }

  return null
}

async function generateImage(req: Request): Promise<Response> {
  if (!GEMINI_KEY) {
    return json({ error: { code: 'not_configured', message: 'Image generation is not configured yet.' } }, 503)
  }

  const deviceKey = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const ctx = await resolveKey(deviceKey)

  if (ctx instanceof Response) {
    return ctx
  }

  if (ctx.used >= ctx.dailyLimit) {
    return json(
      {
        error: {
          code: 'daily_image_budget_exhausted',
          message: `Daily image budget reached for the ${ctx.plan} plan. Try again tomorrow.`
        }
      },
      429
    )
  }

  const body = (await req.json().catch(() => null)) as { prompt?: unknown } | null
  const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : ''

  if (!prompt || prompt.length > 4000) {
    return json({ error: 'prompt required (string, ≤4000 chars)' }, 400)
  }

  let lastError = ''

  for (const model of MODEL_LADDER) {
    const upstream = await fetch(`${GEMINI_BASE}/models/${model}:generateContent`, {
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ['TEXT', 'IMAGE'] }
      }),
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY },
      method: 'POST'
    }).catch(() => null)

    if (!upstream) {
      lastError = 'network error reaching the image provider'
      continue
    }

    if (upstream.status === 404) {
      // Model id retired for this key — walk down the ladder.
      lastError = `model ${model} unavailable`
      await upstream.body?.cancel()
      continue
    }

    const payload = await upstream.json().catch(() => null)

    if (!upstream.ok) {
      const detail = (payload as { error?: { message?: string } })?.error?.message ?? `provider error ${upstream.status}`

      // Free-tier Google projects have ZERO image quota — a billing switch, not
      // a transient failure. Surface that plainly instead of Google's wall of text.
      if (/quota|billing/i.test(detail)) {
        lastError = 'image provider account needs billing enabled (Google AI Studio) — quota is 0 on the free tier'
        break
      }

      lastError = detail
      continue
    }

    const image = firstInlineImage(payload)

    if (!image) {
      lastError = 'provider returned no image (prompt may have been refused)'
      continue
    }

    await recordUsage(ctx, 1, model)

    return json({
      data: [{ b64_json: image.b64, mime_type: image.mime }],
      model,
      remaining: Math.max(0, ctx.dailyLimit - ctx.used - 1)
    })
  }

  return json({ error: { code: 'generation_failed', message: lastError || 'image generation failed' } }, 502)
}

Deno.serve(async (req: Request) => {
  const path = new URL(req.url).pathname

  if (req.method === 'POST' && path.endsWith('/images/generations')) {
    return generateImage(req)
  }

  if (req.method === 'GET' && path.endsWith('/usage')) {
    const deviceKey = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    const ctx = await resolveKey(deviceKey)

    if (ctx instanceof Response) {
      return ctx
    }

    return json({
      daily_limit: ctx.dailyLimit,
      period_start: ctx.periodStart,
      plan: ctx.plan,
      remaining: Math.max(0, ctx.dailyLimit - ctx.used),
      used: ctx.used
    })
  }

  return json({ error: 'not found' }, 404)
})
