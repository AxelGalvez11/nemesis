import { appUrl, normalizeBaseUrl } from "./env";

interface ResolveAuthRedirectOpts {
  envAppUrl?: string | null;
  origin?: string | null;
}

export function resolveAuthRedirectUrl(path: string, opts: ResolveAuthRedirectOpts = {}): string {
  const browserOrigin = opts.origin ?? (typeof window === "undefined" ? null : window.location.origin);
  const base = normalizeBaseUrl(browserOrigin) ?? normalizeBaseUrl(opts.envAppUrl ?? appUrl) ?? "https://app.pharmaorb.app";
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${cleanPath}`;
}
