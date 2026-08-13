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
 * 🔴 IT IS ONLY A FALLBACK. An explicit `?next=` always wins — `sanitizeNextPath` returns `search`
 * along with the pathname, so a supplied parameter survives.
 *
 * 🔴 AND THAT SENTENCE USED TO CLAIM MORE THAN IT COULD. It said this "is what keeps the shipped
 * extension's `/library?import=coursework` working." That was true only for a learner who is ALREADY
 * SIGNED IN — who never passes the auth gate at all. For the signed-OUT learner, who is the entire
 * person that sentence was about, it was false: the gate built `next` from `usePathname()`, which
 * excludes the query by definition, so `import=coursework` was gone before `sanitizeNextPath` ever
 * saw it. Preserving the query at the consumer is worthless if the producer never sends one. See
 * `signInRedirect`.
 */
export const DEFAULT_LANDING_PATH = "/learn";

/**
 * Where the auth gate sends a signed-out visitor, so that signing in returns them to the page they
 * actually asked for — **including its query string**.
 *
 * 🔴 THE QUERY IS PART OF THE DESTINATION, NOT DECORATION. Three gates built this from
 * `usePathname()` alone, which never contains the query, and the two live consequences were:
 *
 * ```
 * /library?import=coursework  ->  /sign-in?next=%2Flibrary   import=coursework GONE
 * /learn?canvas=<uuid>        ->  /sign-in?next=%2Flearn     the canvas id GONE
 * ```
 *
 * A student installs the browser extension, clicks "import my coursework" while logged out, signs
 * in, and arrives at a bare Library with nothing importing. Anyone opening a shared canvas link
 * while logged out lands on the front door instead of the canvas. Both surfaces looked like they
 * worked, because the person testing them was signed in.
 *
 * One function rather than a fix repeated three times: the next person adding a gated surface
 * inherits the answer instead of copying whichever neighbour they happened to read — the same
 * reason `DEFAULT_LANDING_PATH` exists.
 *
 * `search` is passed in rather than read from `window` so this stays pure and testable; callers on
 * the client hand it `useSearchParams()` or `window.location.search`.
 */
export function signInRedirect(pathname: string, search = ""): string {
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  // Tolerate both shapes a caller may hold: `useSearchParams().toString()` has no leading "?",
  // `window.location.search` does. An empty string must stay empty rather than become a bare "?".
  const query = !search || search === "?" ? "" : search.startsWith("?") ? search : `?${search}`;
  return `/sign-in?next=${encodeURIComponent(`${path}${query}`)}`;
}

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
