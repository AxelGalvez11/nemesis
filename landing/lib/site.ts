/**
 * Where this site lives, in one place.
 *
 * The origin was written out by hand in `layout.tsx` as the `metadataBase`, and
 * robots.ts and sitemap.ts both need the same string. Three copies of a hostname
 * is how a canonical URL ends up disagreeing with a sitemap entry, and a crawler
 * treats that as two different pages.
 *
 * 🔴 IT IS THE www HOST, NOT THE APEX, AND THAT IS NOT A STYLE CHOICE.
 * `enternemesis.com` answers with a 308 to `https://www.enternemesis.com/`, and the
 * canonical tag the page already emits points at www. A sitemap listing the apex
 * would hand every crawler a redirect on every URL.
 */
export const SITE_ORIGIN = "https://www.enternemesis.com";

/** Every indexable route, in the order a reader would meet them. */
export const ROUTES = ["/", "/principles", "/pricing", "/about", "/privacy", "/terms"] as const;
