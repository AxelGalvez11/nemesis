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

/**
 * Where a learner lands when nothing else asked for a particular page.
 *
 * 🔴 THE FRONT DOOR IS `/learn`, AND IT IS NAMED ONCE. This was `"/sessions"`, repeated at three
 * call sites — so signing in put a learner on the chat surface, which the owner retired from
 * navigation and which the sidebar does not list at all. They arrived on a first screen they could
 * not themselves have navigated to.
 *
 * `canvas-v1-acceptance.md` §L: *"New canvas is the front door — straight to the minimal
 * composer."* A constant rather than three literals, so the next person adding an auth path
 * inherits that answer instead of copying whichever neighbour they happened to read.
 *
 * 🔴 IT IS ONLY A FALLBACK. An explicit `?next=` always wins, which is what keeps the shipped
 * extension's `/library?import=coursework` working — `sanitizeNextPath` returns `search` along with
 * the pathname, so the import parameter survives whenever one is supplied.
 */
export const DEFAULT_LANDING_PATH = "/learn";

/** Restrict post-auth navigation to a same-origin relative path. Repeated decoding catches payloads
 * such as %252f%252fevil.example before a router/browser gets a chance to normalize them. */
export function sanitizeNextPath(value: string | null | undefined, fallback = "/account"): string {
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
    if (!target.pathname.startsWith("/") || target.pathname.startsWith("//") || target.pathname.includes("\\") || CONTROL_CHARS.test(target.pathname)) {
      return fallback;
    }
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return fallback;
  }
}
