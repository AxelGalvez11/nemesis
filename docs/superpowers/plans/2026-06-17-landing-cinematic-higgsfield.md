# PharmaOrb landing — cinematic upgrade (Higgsfield assets + scroll choreography)

**Status:** APPROVED to execute (owner 2026-06-17) — direction = **Bold cinematic**, scope = **Recommended tier** (hero video + scroll-scrubbed centerpiece + 2 section backgrounds + de-chopped layout + free scroll choreography; ~16–21 generations). Generation spend authorized at that tier; a style-lock + first hero-video take will be shown before completing the tier. **Landing deploy stays owner-gated.**

## Decision & adjustments (2026-06-17)
Owner picked **Bold cinematic** over the restrained recommendation. Adapt every prompt accordingly: **bigger, more dynamic camera moves** (assertive push-in / slow orbit, a "reveal" beat where the structure snaps into focus), **higher contrast + dramatic volumetric light**, more kinetic mote movement and energy. **Held fixed regardless of boldness:** exact palette (#0a0a0b / #BCFF3C / #9BD92E / #f4f4f5), the dark legibility scrim under all copy, performance budget (≤720p loop, both codecs, pause-offscreen, mobile/reduced-motion → static poster), and abstract-scientific-only imagery (no doctors/pills/patients, no implied clinical claims).

**Chosen toolchain (confirmed via models_explore; balance 828 credits, Ultra):** stills via **Recraft 4.1** (`recraft-v4-1`) using its exact hex palette controls (`background_color`, `colors`); video via **Seedance 2.0** (`seedance_2_0`) with start+end frame for seamless loop, 1080p, genre `epic`, silent.

### Advisor corrections (pre-generation)
1. **Two motion contracts — do not conflate.** The **hero background video** must be an *ambient resting state*: continuous cyclical/orbital mote drift around an already-present faint orb, **no net camera move, no one-time pulse/reveal** (one-time beats stutter on an infinite loop; `end=start` only loops when the in-between motion is net-zero/cyclical). The dramatic **build** (motes converge → icosahedron crystallizes → pulse → push-in) belongs to the **scroll-scrubbed centerpiece**, which plays once tied to scroll and needs **its own start frame** composed for "build," not "resting state."
2. **Compose for the text zone + verify early.** The hero copy sits at the **top** but the existing scrim darkens the **bottom** — so compose stills with the **upper third dark/quiet/near-empty** (headline zone), energy in lower-center; expect to add a stronger/top-anchored scrim for busy video. **Verify the still behind real hero copy (static-mock screenshot, dark+light) BEFORE animating** — a legibility fail caught at the still stage costs one image gen, not a tier of video runs. Keep the text zone safe under a mobile center-crop too.
3. **Confirm real cost after the first 1080p Seedance gen** (the priciest call) before trusting ~16–21 fits in 828 credits.
**Date:** 2026-06-17
**Surface:** the marketing site `landing/` (Vercel project "pharma-bro", apex pharmaorb.app) — NOT the logged-in app (`apps/web`).
**Tooling:** Higgsfield MCP (image/video generation) + the existing `landing/` stack (three.js, GSAP, Lenis — already installed).

## Honest framing first
- **Premium for a medical/evidence product = restraint + craft, not spectacle.** Apple reads premium because of whitespace, typography, calm scroll-driven motion, and one cohesive color story — not because a loud video plays behind everything. A flashy commercial-style background can *lower* trust here. The recommendation below leans restrained-but-cinematic and keeps the acid-green orb as the brand signature.
- **This is a credibility/waitlist-conversion upgrade, not the B2B revenue lever.** Per the strategy work, the unicorn bottleneck is go-to-market, not landing polish. Worth doing for a strong first impression; keep scope proportionate.
- **The single biggest "premium" win is free.** GSAP + Lenis are already in `package.json` but the scroll is just a fade-in. Choreographed, scrubbed scroll motion (Lenis smooth-scroll + GSAP ScrollTrigger) is the most Apple-like lift and needs **zero Higgsfield credits**. The generated visuals add production value on top of that.

## Why it doesn't feel premium today (diagnosis, verified in code)
- **Generic SaaS shape:** Nav → hero → stats → demo → sources → how-it-works → evidence → features → CTA → footer, each separated by `<hr className="rule">` divider lines (`landing/app/page.tsx`). The dividers chop the page into boxes — the opposite of Apple's full-bleed scenes that flow into each other.
- **Scroll is reveal-only:** `useScrollReveal` (an IntersectionObserver adding a fade-up) is the entire scroll story. No pinning, no parallax, no scrubbing. GSAP/Lenis sit unused.
- **No cinematic material:** the page is CSS + text + one orb. The orb (`HeroCanvas.tsx`, an animated acid-green wireframe icosahedron) is genuinely nice — keep it — but it's the only "visual," so the page feels flat.

## Brand lock (use these exact values in every Higgsfield prompt)
- Background near-black **#0a0a0b** (deeper black for video void OK), secondary #0e0e10.
- Single accent **acid green #BCFF3C** (darker pair #9BD92E). White text #f4f4f5.
- Aesthetic: **thin luminous wireframe lines + fine particle motes + volumetric haze on black**, lots of negative space. No literal medical clichés (no doctors, pills, DNA-stock). Abstract + scientific + calm.

## Creative concept: "Evidence, made visible"
Every visual echoes the product promise — *shows its work*: scattered data motes (citations) drift in black, lines connect them into structure, the structure resolves into a clean glowing answer. The acid-green-on-black, wireframe language ties directly to the existing orb so the whole site feels like one object.

## Higgsfield asset plan (manual mode for cinematic control)
Pipeline order per the skill: **lock the look → hero → scroll scene → section backgrounds → CTA card.** Budget 2–3 generations per usable clip (iteration is normal).

1. **Style/palette lock (consistency backbone).** SOUL 2.0 + **HEX** (pin #0a0a0b / #BCFF3C) + a **Moodboard** for the wireframe-on-black look. Produce one "style key" still; reference it (`@`) in everything after so all assets match. *~1–2 gens.*
2. **Hero background video** (Seedance 2.0). 6s, loopable, muted. Slow drift of green data motes in deep black, a faint wireframe icosahedron forming, soft green rim light. One camera move (slow push-in), no cuts. Sits behind the hero copy under a dark scrim; the orb can stay layered as the focal object or be swapped for the video — owner's call. *~2–3 gens.*
   - Prompt seed: *"Ultra-minimal scientific abstraction, near-black void #0a0a0b, thousands of tiny acid-green (#BCFF3C) data motes drifting slowly, a faint thin-wireframe icosahedron forming at center from the particles, soft green rim light, volumetric haze, Apple-keynote restraint. Very slow push-in. No cuts, no zoom, no text. Calm, weightless, cinematic, 16:9, start and end states match for seamless loop."*
3. **Scroll-scrubbed centerpiece** (Seedance 2.0 multi-shot → exported frames). A continuous sequence scrubbed to scroll position: (1) one green point of light → (2) it multiplies into a scattered citation cloud → (3) lines connect the motes into a lattice/orb → (4) the lattice resolves into a clean glowing ring ("the answer"). One camera drift, no text/UI. This is the premium scroll moment. *~3–4 shots × 2 gens.*
4. **Section backgrounds** (SOUL 2.0 stills, optionally short Seedance loops). Calm, low-contrast, brand-tinted full-bleed fields with negative space for text, for 2–3 key sections (Sources, Evidence, CTA). Replaces the `<hr>` chop with flowing scenes. *~2–3 stills × 2 gens.*
5. **CTA end-card motion** (Vibe Motion). Kinetic brand card + the single waitlist CTA, brand colors. *~1–2 gens.* (Optional — Tier "Full".)
- **Audio:** none. Background video is muted. (Reserve a narrated trailer for later if ever wanted.)

## Technical integration (frontend only)
- **Video hero:** add a lazy `<video autoplay muted loop playsinline poster>` behind `.hero-content` in `Hero.tsx`, reusing the existing `.hero-overlay` scrim for text legibility. Ship **MP4 (H.264) + WebM (VP9) + a WebP poster**. Pause when offscreen (IntersectionObserver). `prefers-reduced-motion` → poster only (and/or keep the orb static frame, which it already supports).
- **Scroll choreography (the free premium lift):** wire **Lenis** smooth-scroll + **GSAP ScrollTrigger** in `useLandingEffects.ts`: a pinned section that scrubs the cinematic frame-sequence to scroll, parallax on section backgrounds, and richer staggered reveals (replacing the single fade). Disable smooth-scroll + scrub under `prefers-reduced-motion`.
- **De-chop the layout:** where a background asset exists, drop the `<hr className="rule">` and let sections run full-bleed into each other.
- **Files:** `landing/components/Hero.tsx`, new `landing/components/ScrollScene.tsx`, `landing/lib/useLandingEffects.ts`, `landing/components/Sections.tsx`, `landing/app/globals.css`, new `landing/public/cinematic/*` (assets), maybe `landing/app/layout.tsx` (poster preload).

## Performance, accessibility & medical-trust guardrails
- Background video ≈720p, short loop, both codecs, WebP poster, lazy + pause-offscreen. Scroll-scrub prefers a compressed frame sequence (WebP/AVIF) over video `currentTime` on mobile (which janks); **mobile + reduced-motion get static posters, no scrub.**
- Keep all copy crisp over a dark scrim (WCAG contrast); the orb already proves the legibility pattern.
- Abstract visuals only — nothing that implies a clinical claim or shows fake patients. Any real UI in a clip stays captioned "illustrative example" (existing honesty rule). The abstract assets won't show UI, so this is mostly N/A.

## Verification before shipping (per the standing "can't log in from a session" rule)
Use the static-mock screenshot method: copy the real `globals.css` + hero/section markup to `/tmp`, serve with `python3 -m http.server`, screenshot **dark + light** into `.playwright-mcp/`, and confirm legibility + framing. Also test a mobile viewport and `prefers-reduced-motion`. Don't ship visual changes blind.

## Cost & gates
- **Cost is in generations, not dollars yet** — each generation costs Higgsfield credits and usually needs 2–3 takes. Step 1 of execution is **check the Higgsfield balance** and size to it. Rough totals: **Lean ≈ 4–5 gens · Recommended ≈ +12–16 · Full ≈ +10 more.**
- **Owner-gated:** (a) spending Higgsfield credits to generate, and (b) deploying the landing (Vercel "pharma-bro"). Everything else is local frontend work.

## Scope tiers (pick one)
- **Lean:** style lock + hero background video + the free Lenis/GSAP scroll choreography. Biggest bang, fewest credits.
- **Recommended:** Lean + the scroll-scrubbed centerpiece + 2 section backgrounds + de-chop the layout.
- **Full:** Recommended + CTA motion card + extra section loops + mobile/light variants.

## Recommended sequence
1. Lock palette/style (Higgsfield). 2. **Wire Lenis + GSAP scroll choreography (no credits — do this regardless).** 3. Hero background video + wire the video hero. 4. Scroll-scrubbed centerpiece. 5. Section backgrounds + de-chop. 6. (Full) CTA card.

## Awaiting confirmation
Confirm (a) **aesthetic direction** (restrained-scientific recommended), (b) **scope tier**, and (c) the go-ahead to **spend credits**. On approval I'll run one advisor pass on the final prompts + integration, then generate Step 1 (style lock) and a first hero-video take for your review before going further.

## Progress (2026-06-17, in-flight — not deployed)
- **Style key LOCKED:** orb C (Recraft 4.1, job `e23e3564`) — wireframe icosahedron + orbiting motes, exact palette, dark top for the headline.
- **Hero background video SHIPPED to code:** Seedance take 1 (job `f7c3d6a4`, a slow push-in) → ffmpeg **boomerang** (forward+reverse) = seamless *breathing* loop, audio stripped → `landing/public/cinematic/hero-orb.{mp4,webm}` + `hero-orb-poster.jpg`. The locked-off re-take hit Seedance content moderation twice (`ip_detected`, then `nsfw` — both false positives on an abstract orb), so the boomerang of the clean take 1 is used (no further hero gens needed).
- **Hero.tsx rewired:** new `HeroVideo.tsx` (autoplay/muted/loop/playsInline; `prefers-reduced-motion` → poster only; pause-when-offscreen) replaces three.js `HeroCanvas`; `.hero-video` CSS added; **"Beta · Coming soon" chip removed** (owner request). `landing` typecheck GREEN. Legibility verified on the most-zoomed/brightest frame (desktop) + the calm frame (mobile).
- **Remaining (Recommended tier):** Lenis + GSAP scroll choreography (free, no credits — biggest remaining premium lift); scroll-scrubbed centerpiece (reuse take 1's push-in as the build); 2 section backgrounds; de-chop the `<hr>` layout. Then verify the real build + owner-gated deploy.
- **Cleanup later:** temp screenshots in repo root (`hero-*.png`, `landing-live-hero.png`), `/tmp` mock + `python3 -m http.server` on port 8731.

### Update (2026-06-17, owner course-correction)
Owner reverted the cinematic-video direction for the hero and asked for four changes — all done, verified live on the dev server (`localhost:3001`), `landing` typecheck green:
1. **Original three.js orb restored as the hero** — `Hero.tsx` back to `HeroCanvas` (the `HeroVideo` swap reverted).
2. **Logo matched to the app** — ported the app's halftone dot-lattice `Orb` mark into `landing/components/Orb.tsx`; `Nav.tsx` + `Sections.tsx` footer now use `<Orb/>` + plain "PharmaOrb" wordmark (old green-swirl `BrandMark` no longer used; still defined in `icons.tsx`). Added `.orb` CSS + `--acid` token to landing `globals.css`.
3. **Headline shortened** → "Answers that show their **work.**" (from "Drug information that actually shows its work.").
4. **Video skipped** — there is NO PharmaOrb Remotion video; the only one is the Dario painting commercial in ClaroAgencyWorks (wrong project). Nothing embedded.
- **PARKED (unused, not referenced):** `landing/public/cinematic/hero-orb.{mp4,webm}` + `hero-orb-poster.jpg` (the Higgsfield orb clip, ~27 credits), `landing/components/HeroVideo.tsx`, and the `.hero-video` CSS rule. Kept for possible reuse in a future "see it in action" section; safe to delete if not wanted.
- **Remaining cinematic-plan items (untouched, owner's call):** the free Lenis + GSAP scroll choreography, scroll-scrubbed centerpiece, section backgrounds, de-chop layout. Nothing deployed.

### Update 2 (2026-06-17, announce video added)
Owner pointed to a real PharmaOrb promo: `ClaroAgencyWorks/automation/remotion/out/pharmaorb-announce-final.mp4` (vertical 9:16, ~30s, H.264+AAC, on-brand "INTRODUCING PharmaOrb · Read from the literature. Cited to the source."). Added as a **phone-framed, click-to-play (with sound)** section:
- Copied to `landing/public/video/pharmaorb-announce.mp4` (+ `pharmaorb-announce-poster.jpg`, regenerated from a non-black frame @2s — frame 0 is the black fade-in).
- New `landing/components/AnnounceVideo.tsx` (client: poster + green play overlay → `play()` with sound → native controls; resets to poster on end). `.announce`/`.phone` CSS added to `globals.css`. Inserted in `page.tsx` after `<Stats/>` (before `InteractiveDemo`), with `.reveal` fade-in. Typecheck green; verified on dev server.
- Note: 12 MB asset now lives under `landing/public/video/` (will be committed). The parked hero-orb clip (`landing/public/cinematic/*`) + `HeroVideo.tsx` + `.hero-video` CSS remain **unused** — candidates for deletion.
