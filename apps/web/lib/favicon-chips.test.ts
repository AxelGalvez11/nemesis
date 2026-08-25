import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { faviconUrl } from "./favicon";

// ── the searched-domain chips: whose server is asked, and what may be claimed ─────────────────
//
// Owner 2026-08-24: *"if it's searching the web, can it also show the favicons as thumbnails when
// searching… when they're thinking preview?"* — and then, having approved a measurement run
// inside their own ChatGPT: *"make it live."*
//
// Two failures are guarded here, and they are not cosmetic. One leaks what a learner is reading to
// a third party. The other draws a picture of a website nothing visited.

const strip = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const FAVICON = strip(readFileSync(new URL("./favicon.ts", import.meta.url), "utf8"));
const CHIPS = strip(readFileSync(new URL("../components/DomainChips.tsx", import.meta.url), "utf8"));
const RUN = strip(readFileSync(new URL("../components/RunThinking.tsx", import.meta.url), "utf8"));
const ROUTE = strip(readFileSync(new URL("../app/api/favicon/route.ts", import.meta.url), "utf8"));
const DOCK = strip(readFileSync(new URL("../components/character/character-dock.tsx", import.meta.url), "utf8"));

test("🔴🔴🔴 a chip never asks a third party for the icon — that request names what the learner is reading", () => {
  // This is the whole reason the proxy exists. `faviconUrl` used to return
  // `https://www.google.com/s2/favicons?domain=<host>&sz=<n>` — the same service ChatGPT uses,
  // measured 2026-08-24. An <img> to another origin sends the learner's IP AND, in the query
  // string, the name of a site they are reading. One request per chip, per turn, from their own
  // machine. For a study tool that is a reading list handed over as a side effect of drawing a
  // 12px circle.
  //
  // Calibration: point faviconUrl back at the s2 service and this reddens.
  assert.equal(faviconUrl("en.wikipedia.org"), "/api/favicon?domain=en.wikipedia.org");
  assert.ok(faviconUrl("a.example").startsWith("/"), "the favicon URL left our own origin");
  assert.ok(!/https?:\/\//.test(FAVICON), "an absolute URL is back in the client's favicon helper");
  assert.ok(!/s2\/favicons|google\.com/.test(FAVICON + CHIPS), "the third-party favicon service is back");
});

test("🔴 the domain is escaped into the URL, so a hostile host cannot forge query parameters", () => {
  assert.equal(faviconUrl("a b&x=1"), "/api/favicon?domain=a%20b%26x%3D1");
  assert.match(FAVICON, /encodeURIComponent\(domain\)/, "the domain reaches the URL unescaped");
});

test("🔴🔴🔴 there is NO fabricated domain list anywhere — a chip is a site actually read", () => {
  // `SEARCH_DOMAINS` was four hardcoded hosts (pubmed, clinicaltrials.gov, fda.gov, medlineplus.gov)
  // and `RunThinking` drew them whenever the real list was empty:
  //     const chips = domains?.length ? domains : SEARCH_DOMAINS;
  // Two independent reasons it had to go. It CLAIMS four sites were consulted when none were,
  // which is `thinking-phases.ts`'s rule broken in picture form — and a favicon is harder to doubt
  // than a caption, because a real site's logo reads as evidence. And it is the dead pharma
  // identity CLAUDE.md bans (owner 2026-07-27, field-agnostic), so a law student would have been
  // shown the FDA.
  assert.ok(!/SEARCH_DOMAINS\s*=/.test(FAVICON), "the fabricated domain list is back in lib/favicon.ts");
  assert.ok(!/:\s*SEARCH_DOMAINS/.test(RUN), "RunThinking fell back to a fabricated list again");
  for (const host of ["pubmed.ncbi.nlm.nih.gov", "clinicaltrials.gov", "fda.gov", "medlineplus.gov"]) {
    assert.ok(!FAVICON.includes(host) || FAVICON.indexOf(host) === -1, `${host} is hardcoded again`);
  }
  // …and the component draws nothing for an empty list rather than substituting anything.
  assert.match(CHIPS, /if \(domains\.length === 0\) return null;/, "an empty list no longer draws nothing");
});

test("🔴🔴 the route refuses anything that is not a public hostname", () => {
  // Without this the route is an open proxy: a bare IP reaches the private ranges and the cloud
  // metadata endpoint, and the response comes back through our own origin.
  const hostname = /const HOSTNAME = (\/.*\/i?);/.exec(ROUTE);
  const isIp = /const IS_IP = (\/.*\/);/.exec(ROUTE);
  assert.ok(hostname && isIp, "the route's input guards are gone");
  const HOST_RE = eval(hostname![1]!) as RegExp;
  const IP_RE = eval(isIp![1]!) as RegExp;

  const allowed = (d: string) => HOST_RE.test(d) && !IP_RE.test(d);
  for (const good of ["en.wikipedia.org", "bbc.co.uk", "a-b.example.com"]) {
    assert.ok(allowed(good), `${good} should be fetchable`);
  }
  for (const bad of [
    "169.254.169.254", // cloud metadata
    "127.0.0.1",
    "10.0.0.1",
    "localhost", // single label, no dot
    "example.com/../etc", // path
    "example.com:8080", // port
    "user@example.com", // credentials
    "",
  ]) {
    assert.ok(!allowed(bad), `${bad} must be refused, it reached the fetch`);
  }
  assert.match(ROUTE, /credentials: "omit"/, "the proxy started sending credentials upstream");
  assert.match(ROUTE, /referrerPolicy: "no-referrer"/, "the proxy started telling sites who asked");
});

test("🔴🔴 a miss is a drawn mark at 200, never an error the browser renders as a broken image", () => {
  // A 404 here would put a browser's own broken-image glyph in a row of circles, which reads as a
  // bug rather than as "this site has no icon". Every refusal path returns the same drawn globe.
  assert.match(ROUTE, /status: 200,/, "the fallback stopped answering 200");
  assert.ok(!/status: 40\d|status: 50\d/.test(ROUTE), "an error status is back on a path a chip renders");
  for (const reason of ["rejected", "upstream", "not-an-image", "empty", "too-large", "unreachable"]) {
    assert.ok(ROUTE.includes(`"${reason}"`), `the ${reason} path stopped returning the drawn mark`);
  }
  // 🔴🔴 AND THE MARK MUST NOT USE `currentColor`. It did, with a comment claiming it would
  // inherit the chip's text colour. An SVG loaded through `<img src>` is an isolated document
  // with nothing to inherit from, so it resolved to black and every fallback mark disappeared on
  // the dark theme — while still reporting `complete: true` and a 150×150 natural size. Found by
  // looking at the dark preview, not by reading the code, which is the only way this one shows up.
  // Calibration: put `currentColor` back and this reddens.
  assert.ok(!/currentColor/.test(ROUTE), "the fallback mark is back on currentColor and is invisible on one of the two themes");
  assert.match(ROUTE, /stroke="#[0-9a-f]{6}"/i, "the fallback mark lost the explicit colour that makes it visible on both grounds");
  assert.match(ROUTE, /FETCH_TIMEOUT_MS/, "a slow host can now hold the thinking preview open");
  assert.match(ROUTE, /MAX_BYTES/, "the proxy will now relay a file of any size");
});

test("🔴🔴 the shimmer wraps the WORD, never the box the chips sit in", () => {
  // `.canvas-thinking-word` animates a gradient through text via `background-clip: text` +
  // `color: transparent`, and BOTH inherit. On the caption's outer box that paints every hostname
  // transparent and clips the favicons' own box: the row occupies space and draws nothing.
  // Verified in the browser after the fix — the caption box computes a real colour and the
  // shimmer span computes rgba(0,0,0,0), which is the correct split.
  const box = DOCK.slice(DOCK.indexOf("character-caption"), DOCK.indexOf("</span>", DOCK.indexOf("character-caption")));
  assert.ok(box.length > 0, "the caption block moved — this guard is pointed at nothing");
  assert.ok(!/character-caption[^`"]*canvas-thinking-word/.test(DOCK), "the shimmer is back on the caption box and will erase the chips");
  assert.match(DOCK, /<span className="canvas-thinking-word[^"]*">\{caption\}<\/span>/, "the shimmer left the word it animates");
  assert.match(DOCK, /<DomainChips domains=\{domains\} \/>/, "the dock stopped drawing the chips");
  assert.ok(!/domains: _domains/.test(DOCK), "the dock is ignoring the prop again");
});

test("🔴 the chip label is the bare hostname, matching the pills and the Sources panel", () => {
  // `sourceLabel()` title-cases the first host label, which renders bbc.co.uk as "Bbc" and
  // jstor.org as "Jstor" — a misspelling of a real organisation, applied hardest to the most
  // recognisable sources. Seen in the browser before it was changed. The panel below the chips
  // labels with a bare `hostnameOf`, so anything else puts two names on one site on one screen.
  assert.ok(!/sourceLabel/.test(CHIPS), "the chips went back to title-casing hostnames");
  assert.match(CHIPS, /\{domain\}<\/span>/, "the chip stopped printing the hostname it was given");
});

test("🔴 the renderer owns truncation and reports a true remainder", () => {
  assert.match(CHIPS, /const extra = domains\.length - shown\.length;/, "the +N stopped being a real remainder");
  assert.match(CHIPS, /\+\{extra\}/, "the overflow marker left the measured '+N' form");
  assert.ok(!/more</.test(CHIPS), "the overflow went back to 'N more'");
});
