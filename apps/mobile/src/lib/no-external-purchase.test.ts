import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

/**
 * App Store guideline 3.1.1(a) guard.
 *
 * Apple permits "buttons, external links, or other calls to action that direct
 * customers to purchasing mechanisms other than in-app purchase" in the United
 * States storefront and NOWHERE ELSE. Nemesis shipped US-only for exactly that
 * reason; on 2026-07-29 the owner chose worldwide availability instead, which
 * makes any such link a rejection in every other country.
 *
 * A comment cannot stop that link coming back — the previous rule was a comment,
 * and the reason this file exists is that the comment was load-bearing. So the
 * rule is a test: no source file under `src/` may contain a web address that
 * points at a place to buy something.
 *
 * WHAT THIS CANNOT CATCH, stated so nobody trusts it further than it goes: a URL
 * assembled at runtime from pieces, or one fetched from the server. It catches
 * the realistic regression — somebody pasting the pricing page back in — not a
 * determined workaround. If in-app purchase or a per-country External Purchase
 * Link entitlement is ever built, this test is the thing to change, and changing
 * it should be a deliberate line in a pull request rather than a surprise.
 */

/** Words that make a web address a place to spend money. */
const PURCHASE_WORDS = /pricing|checkout|billing|subscribe|subscription|upgrade|purchase|plans|buy|payment/i;

/** Any http/https literal, stopping at whatever would end a string in source. */
const URL_LITERAL = /https?:\/\/[^\s"'`)]+/g;

const SRC = new URL("../", import.meta.url).pathname;
const THIS_FILE = new URL("", import.meta.url).pathname;

async function* sourceFiles(dir: string): AsyncGenerator<string> {
  for await (const entry of Deno.readDir(dir)) {
    const path = `${dir}${entry.name}${entry.isDirectory ? "/" : ""}`;
    if (entry.isDirectory) {
      if (entry.name === "node_modules") continue;
      yield* sourceFiles(path);
    } else if (/\.tsx?$/.test(entry.name) && path !== THIS_FILE) {
      yield path;
    }
  }
}

Deno.test("no source file links out to a place to buy a plan", async () => {
  const offenders: string[] = [];
  for await (const path of sourceFiles(SRC)) {
    const text = await Deno.readTextFile(path);
    for (const url of text.match(URL_LITERAL) ?? []) {
      if (PURCHASE_WORDS.test(url)) offenders.push(`${path.slice(SRC.length)} -> ${url}`);
    }
  }
  assertEquals(
    offenders,
    [],
    "App Store 3.1.1(a): these link to an external purchase, which is only legal on the US storefront:\n" +
      offenders.join("\n"),
  );
});

// The module that used to hold the link is gone. Kept as its own case because a
// re-added helper is how the link would come back tidily rather than obviously.
Deno.test("the pricing-link helper stays deleted", async () => {
  let exists = true;
  try {
    await Deno.stat(`${SRC}lib/pricing.ts`);
  } catch {
    exists = false;
  }
  assertEquals(exists, false, "src/lib/pricing.ts is back — it opened the web checkout from inside the app");
});
