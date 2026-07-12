import { appUrl, normalizeBaseUrl } from "./env";

interface ResolveAuthRedirectOpts {
  envAppUrl?: string | null;
  origin?: string | null;
}

export function resolveAuthRedirectUrl(path: string, opts: ResolveAuthRedirectOpts = {}): string {
  const browserOrigin = opts.origin ?? (typeof window === "undefined" ? null : window.location.origin);
  const base = normalizeBaseUrl(browserOrigin) ?? normalizeBaseUrl(opts.envAppUrl ?? appUrl) ?? "https://app.enternemesis.com";
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${cleanPath}`;
}

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/** Restrict post-auth navigation to a same-origin relative path. Repeated decoding catches payloads
 * such as %252f%252fevil.example before a router/browser gets a chance to normalize them. */
export function sanitizeNextPath(value: string | null | undefined, fallback = "/app"): string {
  if (!value || !value.startsWith("/") || CONTROL_CHARS.test(value) || value.includes("\\")) return fallback;

  let decoded = value;
  try {
    for (let i = 0; i < 3; i += 1) {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    }
  } catch {
    return fallback;
  }

  if (!decoded.startsWith("/") || decoded.startsWith("//") || decoded.includes("\\") || CONTROL_CHARS.test(decoded)) {
    return fallback;
  }

  try {
    const base = new URL("https://app.enternemesis.com");
    const target = new URL(value, base);
    if (target.origin !== base.origin) return fallback;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return fallback;
  }
}
