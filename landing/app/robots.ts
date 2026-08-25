import type { MetadataRoute } from "next";

import { SITE_ORIGIN } from "@/lib/site";

/**
 * /robots.txt
 *
 * There was not one. The path returned Next's 404 page — an HTML document with
 * `<meta name="robots" content="noindex">` in it — which is not a parse failure a
 * crawler recovers anything useful from. Same for /sitemap.xml.
 *
 * Everything here is public marketing, so everything is allowed. The only
 * exclusion is Next's build output, which contains no content and only wastes
 * crawl budget.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: "/_next/" }],
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
    host: SITE_ORIGIN,
  };
}
