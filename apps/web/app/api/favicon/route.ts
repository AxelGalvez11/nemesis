import { NextResponse } from "next/server";

// ── the favicon proxy: a site's mark, fetched by us instead of by the learner ────────────────
//
// 🔴🔴🔴 THIS ROUTE EXISTS SO THE LEARNER'S BROWSER NEVER TELLS A THIRD PARTY WHAT THEY ARE
// READING. Measured off ChatGPT 2026-08-24: it points every chip straight at
// `https://www.google.com/s2/favicons?domain=<host>&sz=128`. That is a fine trade for them and a
// bad one for us — an `<img>` to another origin carries the learner's IP and the domain in the
// query string, so a student researching a diagnosis, a legal case, an immigration process or a
// bankruptcy would be handing Google a list of exactly which sites their studying touched, one
// request per chip, from their own machine.
//
// `lib/favicon.ts` already had that URL in it. It was harmless only because the component using it
// was never mounted; drawing chips on the real thinking preview is what would have turned it from
// dead code into a request on every web-search turn for every learner. Fixing it while adding the
// feature is the whole reason to look before wiring something up.
//
// So: the browser asks Nemesis, Nemesis asks the site, and the site never learns who wanted it.
//
// 🔴 WE FETCH THE SITE'S OWN ICON, NOT AN AGGREGATOR'S. `/favicon.ico` is a convention every host
// serves, which means no third party sits in the middle at all. The cost is that it fails more
// often than an aggregator would — some hosts only declare an icon in their HTML — and that is
// exactly why the fallback below is a real drawn mark rather than a broken-image glyph.

/** How long a browser and the CDN may keep an icon. A favicon changes on the order of years. */
const CACHE_SECONDS = 60 * 60 * 24 * 7;
/** A miss is cached too, briefly — a site with no icon must not be re-fetched on every turn. */
const MISS_CACHE_SECONDS = 60 * 60 * 6;
/** Upstream budget. A slow host must never hold a learner's thinking preview open. */
const FETCH_TIMEOUT_MS = 2500;
/** Anything larger is not a favicon, and we are not a general image proxy. */
const MAX_BYTES = 100 * 1024;

/**
 * 🔴 THE ONLY SHAPE WE WILL FETCH. Without this the route is an open proxy: anyone could point it
 * at an internal address and read the response through us. A hostname is letters, digits, dots and
 * hyphens — no scheme, no port, no path, no credentials, and no bare IP (which is how the private
 * ranges and the cloud metadata endpoint would be reached).
 */
const HOSTNAME = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;
const IS_IP = /^\d{1,3}(?:\.\d{1,3}){3}$/;

/**
 * The mark shown when a site has no icon we could fetch.
 *
 * 🔴 A DRAWN GLOBE, NOT AN EMPTY BOX. The old code's comment said "a broken icon just renders
 * empty", which puts a hole in a row of circles and reads as a bug rather than as "this site has
 * no icon".
 *
 * 🔴🔴 THE STROKE IS A LITERAL GREY, AND `currentColor` HERE IS A TRAP I FELL INTO. This first
 * shipped as `stroke="currentColor"` with a comment claiming it would inherit the chip's text
 * colour. It does not, and cannot: an SVG referenced by `<img src>` is an isolated document with
 * no parent to inherit from, so `currentColor` resolves to the initial colour — black. In light
 * mode that looked perfect. On the dark preview all three fallback marks vanished completely
 * while reporting `complete: true` and a 150×150 natural size, which is the worst shape a bug can
 * have: present, loaded, occupying its box, drawing nothing.
 *
 * `#8f8f8f` is the reference's own tertiary grey and clears both grounds — roughly 2.9:1 on white
 * and 5.9:1 on the near-black page. A single value is right in all four theme/scheme combinations,
 * which a `prefers-color-scheme` block inside the SVG would not be: this app's theme can be set
 * explicitly against the OS, and the SVG document can only see the OS.
 */
const FALLBACK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="#8f8f8f" stroke-width="1.25"><circle cx="8" cy="8" r="6.25"/><path d="M1.75 8h12.5M8 1.75c1.6 1.7 2.5 3.9 2.5 6.25S9.6 12.55 8 14.25C6.4 12.55 5.5 10.35 5.5 8S6.4 3.45 8 1.75Z"/></svg>`;

function fallback(status: number, reason: string): NextResponse {
  return new NextResponse(FALLBACK_SVG, {
    // 🔴 200, NOT AN ERROR CODE. The response IS the answer — this is the mark for "no icon".
    // A 404 would make the browser draw its own broken-image glyph, which is the hole again.
    status: 200,
    headers: {
      "Cache-Control": `public, max-age=${MISS_CACHE_SECONDS}, s-maxage=${MISS_CACHE_SECONDS}`,
      "Content-Type": "image/svg+xml",
      "X-Favicon-Fallback": reason,
      "X-Favicon-Upstream": String(status),
    },
  });
}

export async function GET(request: Request) {
  const domain = new URL(request.url).searchParams.get("domain")?.trim().toLowerCase() ?? "";

  // Refused shapes get the same drawn mark as a miss: a chip must never depend on this route
  // succeeding, and an error body would be rendered as a broken image anyway.
  if (!domain || domain.length > 253 || IS_IP.test(domain) || !HOSTNAME.test(domain)) {
    return fallback(0, "rejected");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const upstream = await fetch(`https://${domain}/favicon.ico`, {
      // 🔴 `redirect: "follow"` is deliberate and bounded by fetch's own hop limit: hosts very
      // commonly 301 /favicon.ico to a CDN. What we must not do is send anything identifying —
      // no cookies, no referrer, no learner headers. This request is ours, not theirs.
      credentials: "omit",
      headers: { accept: "image/*" },
      redirect: "follow",
      referrerPolicy: "no-referrer",
      signal: controller.signal,
    });

    if (!upstream.ok) return fallback(upstream.status, "upstream");

    const type = upstream.headers.get("content-type") ?? "";
    // 🔴 A host that serves its 404 page as 200 text/html is common. Rendering that as an image
    // is the broken-image glyph again, so anything that is not an image becomes the drawn mark.
    if (!type.startsWith("image/")) return fallback(upstream.status, "not-an-image");

    const bytes = new Uint8Array(await upstream.arrayBuffer());
    if (bytes.byteLength === 0) return fallback(upstream.status, "empty");
    if (bytes.byteLength > MAX_BYTES) return fallback(upstream.status, "too-large");

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Cache-Control": `public, max-age=${CACHE_SECONDS}, s-maxage=${CACHE_SECONDS}, immutable`,
        "Content-Type": type,
      },
    });
  } catch {
    // Timeout, DNS failure, bad certificate, connection refused — all the same to a chip.
    return fallback(0, "unreachable");
  } finally {
    clearTimeout(timer);
  }
}
