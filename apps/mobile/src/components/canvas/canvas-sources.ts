// Turning an answer's citations into the small pills the canvas shows under it — and the one
// favicon resolver the whole phone uses, wherever a source is named.
//
// Ported from `apps/web/lib/learn/source-pill.ts` + `apps/web/lib/favicon.ts`, which are two files
// on the web only because one of them is also used by the composer's attachment chips. The rules
// they encode are the whole reason this is a module and not four lines inside a component:
//
// 🔴 `null` IS A REFUSAL AND IT REACHES THE SURFACE AS SILENCE. A citation this canvas cannot
// resolve to a real, openable place produces NO pill. Never a greyed-out one, never a
// "source unknown" — a pill that names a source and cannot open it is a claim the surface cannot
// support, which is the one thing an evidence affordance must never be.
//
// 🔴 DE-DUPLICATED BY WHAT THE LEARNER WOULD PRESS, not by the citation's own identity. Two
// sentences citing the same page are one pill, because pressing either goes to the same place.
//
// 🔴 THE ICON SET IS FETCHED, NEVER SHIPPED. There is no map of "known" domains here and there
// must not be one: a hardcoded set silently degrades every site nobody thought of into an empty
// square, and it goes stale on its own. The favicon comes from the site's own icon via a public
// resolver; when it does not arrive, the mark falls back to the site's initial.
//
// 🔴 ONE RESOLVER, EVERY SURFACE, AND THE FAILURE IS REMEMBERED HERE (owner 2026-08-20). Three
// places on the phone draw a site's mark: the single Sources pill under an answer (three stacked
// icons), the rows inside the Sources popup, and the inline citation chips in the prose — and a
// well-cited paragraph carries a dozen of the last one. Holding "this host has no icon" in each
// component meant the same dead host was fetched once per chip, on every mount, forever. It is now
// a module-level memo (`noteFaviconFailed` / `useFaviconFailed`) that every surface reads, so a
// host is settled at most once per app session and every later chip for that host draws its letter
// with no request at all. See `faviconUrl` for why the HTTP cache cannot do this for us.
//
// 🔴 AND IT IS THE ONLY RESOLVER — `components/SourcesSheet.tsx` USED TO HAVE ITS OWN (owner
// 2026-08-20). The Chat tab's popup built `https://<host>/favicon.ico` by hand and kept its
// verdict in a `useState` per row. Two consequences, both live: a site that publishes its icon
// only through a `<link rel="icon">` tag (most of them) drew a letter in the popup and its real
// icon three lines above in the prose, and a host that had already failed everywhere else was
// re-requested by every row, on every open. That file now imports from here and nothing else
// resolves an icon.

import { useEffect, useSyncExternalStore } from "react";

import type { ChatSource } from "@/lib/chat-thread";

/** A resolved pill: what it shows, and where pressing it goes. */
export interface SourcePill {
  /** De-dupe identity — `web:<url>`. Also the React key. */
  key: string;
  /** The site's name, capitalised: `en.wikipedia.org` → "Wikipedia". */
  label: string;
  /** The full title, for assistive tech and long-press. */
  title: string;
  /** Where the press goes. Always present: a pill with nowhere to go is not built. */
  url: string;
  /** The host, for the favicon lookup and for the letter fallback. */
  host: string;
}

/**
 * Sub-domain parts that name a delivery channel rather than the publication.
 * `en.wikipedia.org` is Wikipedia; `m.bbc.co.uk` is the BBC. Same list as the web's `siteName`.
 */
const GENERIC_PARTS = new Set(["www", "en", "m", "amp", "mobile"]);

/** The host of a URL, or null when it is not a URL we could open. */
export function hostOf(url: string): string | null {
  try {
    const parsed = new URL(url.trim());
    // 🔴 http(s) ONLY. `sendChat` returns whatever a search result carried, and a `javascript:` or
    // `data:` href handed to `Linking.openURL` is not a source, it is an instruction.
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.hostname || null;
  } catch {
    return null;
  }
}

/**
 * The publication's name, from its host. `pubmed.ncbi.nlm.nih.gov` → "Pubmed".
 *
 * Deliberately NOT the page title: titles are long, they repeat the sentence the pill sits under,
 * and three of them wrap a phone's width into a paragraph. The site is the part the learner is
 * judging.
 */
export function siteName(host: string): string {
  const parts = host.split(".").filter(Boolean);
  let index = 0;
  while (index < parts.length - 1 && GENERIC_PARTS.has(parts[index]!.toLowerCase())) index += 1;
  const name = parts[index] ?? host;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * The site's own icon, through Google's public resolver — the same URL the web builds.
 *
 * 🔴 REQUESTED AT 32 AND DRAWN AT 12–14. That is a 2x fetch for a retina screen, not an accident.
 *
 * 🔴 THIS RESOLVER DOES ANSWER "NO ICON" WITH A REAL 404 — MEASURED, DO NOT "FIX" IT AGAIN
 * (owner 2026-08-20). A review claimed the letter fallback below could never fire because Google
 * answers every domain with HTTP 200 and a grey globe. That was checked against the live service
 * and it is not what happens. This URL 301-redirects to `t{0..3}.gstatic.com/faviconV2`, and that
 * endpoint returns:
 *   * 200 + the site's real icon for a host it has crawled (wikipedia, pubmed, arxiv, bbc, mit…);
 *   * 404 + a 726-byte grey-globe PNG body for a host with no declared icon (`example.com`) AND
 *     for a host that does not resolve at all (`nonexistent-domain-abc123xyz.com`).
 * The globe is only ever served with a 404 — twenty assorted hosts were hashed against it and no
 * 200 response was ever the globe. So the status code IS the signal, at every `sz` we tried
 * (none, 16, 32, 64). React Native turns that status into `onError` on both platforms:
 * `node_modules/react-native/Libraries/Image/RCTImageLoader.mm:746-754` rejects any non-200 HTTP
 * response before it ever reaches the decoder, and Fresco's OkHttp fetcher does the same on
 * Android. The fallback is real.
 *
 * 🔴 AND IT IS A NETWORK HIT PER HOST, WITH THE FAILURES DELIBERATELY UNCACHED BY GOOGLE. The 200
 * carries `cache-control: public, max-age=604800`, so a resolved icon is a week-long native cache
 * hit and costs nothing to draw again. The 404 carries NO cache headers at all — which means the
 * platform image cache will re-request a dead host every single time it is drawn. That asymmetry
 * is the entire reason the failure memo below exists in JS rather than being left to the OS.
 */
export function faviconUrl(host: string): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32`;
}

/** The first letter shown when the icon cannot be fetched. */
export function siteInitial(host: string): string {
  return siteName(host).charAt(0).toUpperCase() || "?";
}

// --- the favicon memo, and the probe that makes the letter fallback real ------
//
// Three module-level caches, all keyed by host, all alive for the session and no longer:
//   * SOURCES — a STABLE `{ uri }` object per host. React Native re-requests an <Image> when the
//     `source` prop is not equal to the last one, and a `{ uri: … }` literal built in render is a
//     fresh object every time. Handing out the same object keeps a re-render free, which matters
//     when a streaming answer re-renders its prose on every chunk with a dozen chips in it.
//   * STATE — what we know about a host's icon: nothing yet, a probe in flight, it arrived, or it
//     is missing. Sticky for the session on purpose: the answer will not change under the reader.
//   * LISTENERS — every icon currently on screen, so one verdict settles the question for all of
//     them at once.
//
// 🔴 THE "NO ICON" VERDICT NO LONGER DEPENDS ON THE STATUS CODE (owner 2026-08-20, second pass).
// The measurement recorded on `faviconUrl` above STANDS and is not deleted: checked against the
// live service, an icon-less host answered 404, and React Native turns a non-200 into `onError`,
// so the letter did fire. A later review measured the OPPOSITE — HTTP 200 carrying the 726-byte
// grey-globe body — which if true leaves `onError` silent forever and makes the letter fallback
// dead code that only looks present. Re-measuring a third time settles nothing durably: Google is
// free to change either behaviour without telling us, and whichever reading we hard-wire is the
// one that quietly breaks.
// So the verdict is taken from an explicit probe instead — exactly once per host per session we
// request the icon ourselves and decide from what actually came back:
//   * not a 2xx                                   → missing  (the first measurement's case)
//   * a 2xx that is not an image                  → missing
//   * a 2xx whose body is the known placeholder   → missing  (the second measurement's case)
//   * anything else                               → present
// `onError` is KEPT as the second net (`noteFaviconFailed`), for a host that dies between the
// probe and the draw. The two guards are independent, so the letter fires under either reading.
//
// 🔴 THE PLACEHOLDER IS IDENTIFIED BY ITS SIZE, AND THAT IS NOT A LIST OF KNOWN SITES. Nothing
// here decides which publications get an icon — that would go stale on its own and blank out every
// site nobody thought of, which the header already rules out. This is one fingerprint of one
// generic image the resolver serves when it has nothing: the grey globe, measured at 726 bytes. If
// the resolver ever serves a different placeholder the worst case is the old behaviour, an icon
// that says nothing, not a wrong icon.
//
// 🔴 THE PROBE IS PER HOST PER SESSION, NEVER PER RENDER. A streaming answer re-renders on every
// chunk; a request on that path would be a request per frame. `STATE.has(host)` is the gate and it
// is set BEFORE the await, so ten chips mounting in the same frame share one flight and every
// later mount asks nothing at all.

/** What is known about one host's icon. Absent from the map = never asked. */
type IconState = "probing" | "present" | "missing";

const SOURCES = new Map<string, { uri: string }>();
const STATE = new Map<string, IconState>();
const LISTENERS = new Set<() => void>();

/**
 * Byte lengths of the resolver's own "I have nothing" image. See the header.
 *
 * 🔴 RE-MEASURED A THIRD TIME, 2026-08-20, DURING THE SOURCES-UI PASS, AND THE NUMBER HOLDS. Four
 * hosts through the live service, following the 301 to `faviconV2`:
 *   example.com                          → 404, image/png, content-length 726, no cache headers
 *   nonexistent-domain-abc123xyz.invalid → 404, image/png, content-length 726, no cache headers
 *   en.wikipedia.org                     → 200, image/png, 555 bytes, max-age=604800
 *   releasebot.io                        → 200, image/png, 638 bytes, max-age=604800
 * So on this reading the FIRST measurement reproduced — the status code alone was enough and the
 * `onError` net would have fired on its own. The probe is kept anyway, and the fingerprint with it:
 * the point of taking the verdict from the body as well as the status is that we stop having to be
 * right about which of the two behaviours Google is serving this month.
 */
const PLACEHOLDER_LENGTHS = new Set(["726"]);

/** The `<Image source>` for a host — same object every call, so re-renders never refetch. */
export function faviconSource(host: string): { uri: string } {
  const cached = SOURCES.get(host);
  if (cached) return cached;
  const built = { uri: faviconUrl(host) };
  SOURCES.set(host, built);
  return built;
}

function publish(host: string, next: IconState): void {
  if (STATE.get(host) === next) return;
  STATE.set(host, next);
  for (const listener of LISTENERS) listener();
}

/**
 * Ask the resolver, once, whether this host has an icon at all.
 *
 * Deliberately fire-and-forget: nothing awaits it, and a caller that renders before it lands draws
 * the <Image> optimistically — which is right, because the overwhelming case is that the icon
 * exists and is already in the platform's week-long cache. Only the failing case ever swaps to the
 * letter, and it swaps once.
 */
function probeFavicon(host: string): void {
  if (!host || STATE.has(host)) return;
  STATE.set(host, "probing");
  void (async () => {
    try {
      const response = await fetch(faviconUrl(host), { headers: { accept: "image/*" } });
      const length = response.headers.get("content-length");
      const contentType = response.headers.get("content-type") ?? "";
      const present =
        response.ok &&
        (contentType === "" || contentType.startsWith("image/")) &&
        !(length !== null && PLACEHOLDER_LENGTHS.has(length));
      publish(host, present ? "present" : "missing");
    } catch {
      // 🔴 A NETWORK ERROR IS NOT A VERDICT ABOUT THE SITE. Offline, or a resolver hiccup, says
      // nothing about whether this publication has an icon, and condemning it here would leave a
      // letter where an icon belongs for the rest of the session. Call it present and let the
      // <Image> — which is subject to the same outage — reach its own conclusion via `onError`.
      publish(host, "present");
    }
  })();
}

/**
 * Record that this host's icon did not arrive. Called from an `<Image onError>` — the rendered
 * image is the only thing that knows — but stored here so every OTHER pill and chip for the same
 * host stops trying immediately.
 */
export function noteFaviconFailed(host: string): void {
  if (!host) return;
  publish(host, "missing");
}

function subscribeFavicons(listener: () => void): () => void {
  LISTENERS.add(listener);
  return () => {
    LISTENERS.delete(listener);
  };
}

/**
 * True when this host is known to have no icon — draw the letter, do not mount an <Image>.
 *
 * Also the one place the probe is started, because every surface that draws an icon already calls
 * this before deciding what to draw. Safe to call with `""` (a link whose href had no openable
 * host): nothing is probed and the answer is simply never true.
 */
export function useFaviconFailed(host: string): boolean {
  const missing = useSyncExternalStore(
    subscribeFavicons,
    () => STATE.get(host) === "missing",
    () => STATE.get(host) === "missing",
  );
  useEffect(() => probeFavicon(host), [host]);
  return missing;
}

/**
 * The pills for one answer's sources, in the order they were cited, de-duplicated.
 *
 * Returns an empty array rather than a placeholder when nothing resolves — the caller renders
 * nothing at all in that case, which is the silence the header describes.
 */
export function sourcePills(sources: readonly ChatSource[] | undefined): SourcePill[] {
  if (!sources?.length) return [];
  const seen = new Set<string>();
  const pills: SourcePill[] = [];
  for (const source of sources) {
    const url = source.url?.trim();
    if (!url) continue;
    const host = hostOf(url);
    if (!host) continue;
    const key = `web:${url.replace(/\/+$/, "")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pills.push({ host, key, label: siteName(host), title: source.title?.trim() || host, url });
  }
  return pills;
}
