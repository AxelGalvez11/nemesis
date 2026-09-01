import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  htmlToText,
  isPrivateAddress,
  pageTitle,
  READ_MAX_BYTES,
  readPage,
  safeTarget,
} from "./read-page.ts";

// ── the SSRF guard ──────────────────────────────────────────────────────────
//
// 🔴🔴🔴 THESE ARE THE TESTS THAT MATTER. While Firecrawl fetched the page, a hostile URL left
// THEIR network. Owner, 2026-09-01: *"also remove firecrawl too, i only want brave (its cheap)"* —
// so now it leaves OURS, from inside the platform, where 169.254.169.254 is a cloud metadata
// endpoint and localhost is the database. Every case below is a way that has actually been used
// against somebody.

Deno.test("safeTarget: an ordinary article is allowed", () => {
  const ok = safeTarget("https://en.wikipedia.org/wiki/Calvin_cycle");
  assert("url" in ok);
  assertEquals(ok.url.hostname, "en.wikipedia.org");
});

Deno.test("safeTarget: loopback is refused, in every notation fetch would accept", () => {
  // 🔴 A STRING TEST PASSES FOUR OF THESE FIVE. `"127.0.0.1".startsWith("127.")` says nothing
  // about `0177.0.0.1`, `2130706433`, `127.1` or `0.0.0.0`, and every one of them resolves to
  // this machine. Parsing to octets is what makes the notation stop mattering.
  for (const host of ["127.0.0.1", "0177.0.0.1", "2130706433", "127.1", "0.0.0.0"]) {
    const result = safeTarget(`http://${host}/`);
    assert("reason" in result, `${host} was allowed through`);
  }
});

Deno.test("safeTarget: the cloud metadata endpoint is refused", () => {
  // The single most valuable address on any cloud host: it hands out the machine's own
  // credentials to anything that asks from inside the network.
  assert("reason" in safeTarget("http://169.254.169.254/latest/meta-data/"));
  assert("reason" in safeTarget("http://metadata.google.internal/computeMetadata/v1/"));
});

Deno.test("safeTarget: private ranges and internal names are refused", () => {
  for (const url of [
    "http://10.1.2.3/",
    "http://172.16.0.1/",
    "http://172.31.255.255/",
    "http://192.168.1.1/",
    "http://100.64.0.1/",
    "http://localhost:3000/",
    "http://db.internal/",
    "http://printer.local/",
    "http://[::1]/",
    "http://[fd00::1]/",
    "http://[::ffff:10.0.0.1]/",
  ]) {
    assert("reason" in safeTarget(url), `${url} was allowed through`);
  }
});

Deno.test("safeTarget: 172.15 and 172.32 are PUBLIC — the private block is 16 through 31", () => {
  // 🔴 THE OFF-BY-ONE THAT GOES THE OTHER WAY. Refusing all of 172.* would quietly break real
  // public sites, and a guard that over-blocks gets loosened by whoever hits it next.
  assert("url" in safeTarget("http://172.15.0.1/"));
  assert("url" in safeTarget("http://172.32.0.1/"));
});

Deno.test("safeTarget: non-web schemes and ports are refused", () => {
  assert("reason" in safeTarget("file:///etc/passwd"));
  assert("reason" in safeTarget("gopher://example.com/"));
  assert("reason" in safeTarget("http://example.com:6379/"));
  assert("reason" in safeTarget("http://example.com:5432/"));
  assert("url" in safeTarget("http://example.com:80/"));
  assert("url" in safeTarget("https://example.com:443/"));
});

Deno.test("safeTarget: credentials in the URL are refused", () => {
  // They would be replayed to whatever the redirect chain ends at.
  assert("reason" in safeTarget("https://user:secret@example.com/"));
});

Deno.test("isPrivateAddress: a hostname is not an address and is not judged as one", () => {
  assertEquals(isPrivateAddress("example.com"), false);
  assertEquals(isPrivateAddress("10.example.com"), false);
});

Deno.test("readPage: a redirect ONTO a private address is refused at the hop", () => {
  // 🔴🔴 THE ATTACK THAT DEFEATS A ONE-TIME CHECK, and the reason `redirect: 'manual'` is used
  // instead of letting fetch follow. The first URL is impeccable; the second is the database.
  const hops: string[] = [];
  const fetcher = ((url: string) => {
    hops.push(url);
    return Promise.resolve(
      new Response("", { headers: { location: "http://169.254.169.254/latest/" }, status: 302 }),
    );
  }) as unknown as typeof fetch;

  return readPage("https://innocent.example/start", fetcher).then((result) => {
    assert("reason" in result, "the redirect to a metadata endpoint was followed");
    assertEquals(hops.length, 1, "it kept fetching after the refusal");
  });
});

Deno.test("readPage: an ordinary page comes back as text and title", async () => {
  const html = `<html><head><title>The Calvin cycle</title></head>
    <body><nav>menu menu</nav><main><h1>Stage one</h1><p>Carbon is fixed by RuBisCO.</p>
    <script>tracking()</script></main><footer>copyright</footer></body></html>`;
  const fetcher = (() =>
    Promise.resolve(
      new Response(html, { headers: { "content-type": "text/html; charset=utf-8" }, status: 200 }),
    )) as unknown as typeof fetch;

  const result = await readPage("https://example.com/calvin", fetcher);

  assert(!("reason" in result));
  assertEquals(result.title, "The Calvin cycle");
  assert(result.text.includes("Carbon is fixed by RuBisCO."));
  assert(!result.text.includes("tracking()"), "a script body reached the source text");
  assert(!result.text.includes("menu menu"), "the nav reached the source text");
});

Deno.test("readPage: a PDF is NAMED, not decoded into mojibake", async () => {
  // A binary read as UTF-8 is a page of garbage that looks like a successful read, and it lands in
  // a notebook as a source. Saying "this is a PDF" is what lets the caller do something about it.
  const fetcher = (() =>
    Promise.resolve(
      new Response("%PDF-1.7 …", { headers: { "content-type": "application/pdf" }, status: 200 }),
    )) as unknown as typeof fetch;

  const result = await readPage("https://example.com/paper.pdf", fetcher);

  assert("reason" in result);
  assert(result.reason.includes("application/pdf"), `the reason did not name the type: ${result.reason}`);
});

Deno.test("readPage: a page that lies about its size is still capped", async () => {
  // `content-length` is a claim. The body is measured after reading for exactly this reason.
  const fetcher = (() =>
    Promise.resolve(
      new Response("x".repeat(READ_MAX_BYTES + 10), {
        headers: { "content-length": "10", "content-type": "text/html" },
        status: 200,
      }),
    )) as unknown as typeof fetch;

  const result = await readPage("https://example.com/huge", fetcher);

  assert("reason" in result);
  assert(result.reason.includes("too large"));
});

Deno.test("readPage: a 404 says so rather than returning an empty source", async () => {
  const fetcher = (() =>
    Promise.resolve(new Response("Not found", { status: 404 }))) as unknown as typeof fetch;

  const result = await readPage("https://example.com/gone", fetcher);

  assert("reason" in result);
  assert(result.reason.includes("404"));
});

// ── HTML to text ────────────────────────────────────────────────────────────

Deno.test("htmlToText: paragraphs stay separate lines", () => {
  // Running a page into one line is what makes scraped text unchunkable — see
  // document-chunks.ts, which cuts on structure it can only see if it survives.
  const text = htmlToText("<body><p>First one.</p><p>Second one.</p></body>");
  assertEquals(text, "First one.\nSecond one.");
});

Deno.test("htmlToText: entities are decoded, including numeric and hex", () => {
  assertEquals(htmlToText("<body><p>Fe&#178;&#x207a; &amp; H&nbsp;O</p></body>"), "Fe²⁺ & H O");
});

Deno.test("htmlToText: a malformed entity does not fail the whole page", () => {
  // `String.fromCodePoint` THROWS above 0x10FFFF. One bad entity must not lose the article.
  const text = htmlToText("<body><p>before &#99999999; after</p></body>");
  assert(text.includes("before"));
  assert(text.includes("after"));
});

Deno.test("htmlToText: an <article> wins over the page around it", () => {
  const html = `<body><nav>nav</nav><article>${"The real content. ".repeat(30)}</article><footer>f</footer></body>`;
  const text = htmlToText(html);
  assert(text.startsWith("The real content."));
  assert(!text.includes("nav"));
});

Deno.test("htmlToText: a TINY <article> does not win — the body does", () => {
  // 🔴 A one-line <article> is usually a card in a list, not the page. Honouring it would return
  // a headline and drop the piece, which reads as success and is data loss.
  const html = `<body><article>Read more</article><p>${"The actual chapter. ".repeat(40)}</p></body>`;
  const text = htmlToText(html);
  assert(text.includes("The actual chapter."), "a teaser card was taken for the page");
});

Deno.test("htmlToText: list items keep their bullets", () => {
  assertEquals(htmlToText("<body><ul><li>one</li><li>two</li></ul></body>"), "• one\n• two");
});

Deno.test("pageTitle: <title> first, og:title as the fallback, empty when neither", () => {
  assertEquals(pageTitle("<html><head><title> Spaced  out </title></head></html>"), "Spaced out");
  assertEquals(
    pageTitle(`<html><head><meta property="og:title" content="From OG"></head></html>`),
    "From OG",
  );
  assertEquals(pageTitle("<html><body>no title</body></html>"), "");
});
