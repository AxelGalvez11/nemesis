import type { MetadataRoute } from "next";

import { ROUTES, SITE_ORIGIN } from "@/lib/site";

/**
 * /sitemap.xml
 *
 * Six routes, which is the whole site. It returned a 404 before this existed.
 *
 * 🔴 `lastModified` IS THE BUILD TIME, AND THAT IS HONEST HERE ONLY BECAUSE THE
 * SITE IS FULLY STATIC. Every page in this app is prerendered, so a deploy is the
 * only thing that can change any of them, and the build stamp and the real
 * modification date never drift apart by more than one deploy. The moment anything
 * here starts reading a CMS or a database, this becomes a lie that tells crawlers
 * to re-fetch six unchanged pages after every unrelated deploy — swap it for a
 * real per-route date then.
 *
 * `priority` is a hint about relative importance WITHIN this site and nothing
 * else; it does not compete with anybody else's pages. The home page leads, the
 * two pages that sell come next, and the legal pages sit at the bottom because a
 * crawler spending its budget on /terms is spending it wrong.
 */
const PRIORITY: Record<string, number> = {
  "/": 1,
  "/pricing": 0.8,
  "/principles": 0.7,
  "/about": 0.6,
  "/privacy": 0.3,
  "/terms": 0.3,
};

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return ROUTES.map((route) => ({
    url: route === "/" ? SITE_ORIGIN : `${SITE_ORIGIN}${route}`,
    lastModified,
    changeFrequency: route === "/" ? ("weekly" as const) : ("monthly" as const),
    priority: PRIORITY[route] ?? 0.5,
  }));
}
