# Indie & AI-app pricing teardown — top-up mechanics for Nemesis
2026-07-15 · live pricing pages fetched and verified this session (two research agents, nine apps)

## Why
Nemesis carries the model bill inside the subscription (unlike BYOK apps). The daily cap
protects the tail, but today it hard-stops the best customers. This teardown answers: how
do surviving (non-VC-subsidized) apps sell EXTRA usage, and what should Nemesis copy?

## The credits/top-up camp (meter + sell more)

### Poe (Quora)
- Tiers by included "compute points": 10k/day $4.99 · 660k/mo $19.99 · 1.65M/mo $49.99 ·
  3.3M/mo $99.99 · 8.25M/mo $249.99. Annual = 17% off, all tiers.
- **Top-up: $30 per 1M points, subscribers only, lasts 1 YEAR**, non-refundable.
  Consumption order: plan points first, then add-ons. Per-message budget warnings.
- Passes provider **cache discounts through** (50% OpenAI, 90% Anthropic).
- No token counts shown to users — just points + the $30/1M reference rate.

### Cursor
- Pro $20/mo (annual $16) includes **$20 of real API usage** — denominates in dollars,
  the most transparent scheme found. Pro+ $60 → $70 usage; Ultra $200 → $400 usage.
- Overage = **postpaid pay-as-you-go at cost** (no markup on individual plans; teams pay
  +$0.25/M markup). User sets a monthly spend cap; at cap, AI stops, notice shown.
- Students: no codified discount (only campus-event promos).

### Manus
- Credits blend LLM tokens + VM minutes. Free 300/day · $20 → 4k/mo · $40 → 8k/mo ·
  $200 → 40k/mo. Annual ~15–17% off.
- **Add-on packs: prices login-gated (unpublished), never expire while subscribed.**
  Monthly credits do NOT roll over. Consumption order: event → daily → monthly → add-on
  → signup-bonus. **No overage fee — new tasks just can't start at zero.**
- **Failed tasks (their fault) are fully credit-refunded.**
- Translates credits via task examples ("15-min data-viz task ≈ 200 credits").
- Education: no discount — instead instant activation + **1,000 bonus credits per
  referred classmate** (growth loop, not price cut).

### Perplexity
- Pro $20/mo ($17/mo annual); **agentic "Computer" work has its own credit currency**
  separate from search quotas (Max: 10k/mo recurring). Search/Research don't consume it.
- **Students: $10/mo via SheerID verification.**

### Raycast AI (the no-meter outlier)
- Pro $10/mo, Pro+Advanced-AI $20/mo (annual 20% off). No countable unit at all —
  gating is by MODEL TIER (standard vs frontier), "unlimited" within tier, no top-ups,
  BYOK as the escape valve. Students: 50% off Pro.

## The indie BYOK camp (charge for software, user pays tokens)
- **TypingMind**: one-time $39/$79/$99 lifetime, pure BYOK, "no usage limit."
- **BoltAI**: perpetual $79/$99 (+1yr updates), pure BYOK. **Students: 50% off first
  year (university email), 40% off renewals.**
- **Msty**: $149/user/yr or $349 lifetime; BYOK/local only, no meter anywhere.
- **Elephas** (the hybrid): $19/$39/$49/mo with included credits 100/500/1,000 (+Free 20);
  **top-ups purchasable in-app (prices unpublished), expire 3 months after purchase**;
  BYOK escape hatch = unlimited. Annual = exactly 2 months free (advertised "~17%").
- **MacWhisper** €64 one-time, local ASR (our recorder parallel). **Students 25% off.**
- **Superwhisper** $8.49/mo · $84.99/yr ("2 months free") · **$249.99 lifetime**; Pro
  INCLUDES cloud Claude/GPT/Llama usage flat-rate ("usage is covered by your license") —
  the closest comp to Nemesis's included-intelligence model, viable because dictation
  calls are tiny (short prompts/outputs, no agent loops). **Students 40% off.**

## Cross-cutting patterns
1. **Prepaid packs beat postpaid overage for consumers** — Poe/Manus/Elephas all prepay;
   only Cursor (developers) bills in arrears. Students fear bill shock.
2. **Top-up expiry spectrum**: Elephas 3 months (stingy) → Poe 1 year → Manus never
   (while subscribed). Generosity is cheap: the cash is collected up front.
3. **Consumption order is universal**: plan allowance first, purchased credits after.
4. **Nobody shows raw tokens.** Poe shows points+$rate; Manus shows task examples;
   Cursor shows dollars. Opaque unit + concrete anchors is the norm.
5. **Annual = 15–20% ("2 months free") everywhere.**
6. **Student discounts are normal**: 25–50% across indie apps; Perplexity $10/mo;
   Manus does bonus-credits-for-referrals instead.
7. **"Unlimited" only exists where models are cheap/small (Superwhisper local) or
   VC-subsidized/model-tier-gated (Raycast).** Validates capped design.

## Recommendation for Nemesis (proposed, owner to approve)
- **Boost packs (prepaid, Stripe one-time), sold on the daily-limit card + 80% strip:**
  - Boost +1M tokens — **$2.99** ("about one heavy study day")
  - Boost +5M tokens — **$9.99** ("exam-week pack", better rate)
  - Rules: active paid plan required (not trials); consumed AFTER the daily allowance;
    **no expiry while subscribed** (Manus pattern); visible in Account & usage.
  - Margin at $0.30/M blended: $2.99 → ~$2.30 gross (77%); $9.99 → ~$7.60 (76%);
    still 55–65% if burned entirely inside a hypothetical 2× evening-surcharge window.
- **Annual plans framed "2 months free"**: Student ~$99/yr, Agent Pro ~$199/yr.
- **No further student discount** (list price IS the student price) — instead steal
  Manus's referral: "+1M boost when a referred classmate subscribes."
- **Failed-job refunds** (Manus): agent job dies from our fault → credits back. Cheap trust.
- **BYOK tier: parked.** Right for tinkerer apps; wrong for our zero-setup wedge now.
- **Skip**: lifetime deals (ongoing COGS), postpaid overage (bill shock), unlimited tiers.

Sources: poe.com/subscription_plans · cursor.com/pricing + docs · manus.im/pricing +
help.manus.im billing collection · perplexity.ai/pro + help center · raycast.com/pricing ·
typingmind.com/pricing · boltai.com/buy · msty.ai/studio/pricing · elephas.app/pricing ·
goodsnooze.gumroad.com/l/macwhisper · superwhisper.com
