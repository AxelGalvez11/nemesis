import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  BRAVE_DESCRIPTION_MAX_CHARS,
  BRAVE_MAX_SNIPPETS,
  BRAVE_QUERY_MAX_CHARS,
  braveCanAnswer,
  braveContextParams,
  braveContextToWeb,
} from "./brave.ts";

// A real llm/context payload, trimmed to the fields we read. Shape from
// api-dashboard.search.brave.com/documentation/services/llm-context, 2026-08-06.
const PAYLOAD = {
  grounding: {
    generic: [
      {
        snippets: ["Photosynthesis converts light into chemical energy.", "It occurs in the chloroplast."],
        title: "Photosynthesis",
        url: "https://example.edu/photosynthesis",
      },
      {
        snippets: ["The Calvin cycle fixes carbon."],
        title: "Calvin cycle",
        url: "https://example.edu/calvin",
      },
    ],
  },
  sources: { "https://example.edu/photosynthesis": { hostname: "example.edu", title: "Photosynthesis" } },
};

Deno.test("braveContextToWeb: maps grounding.generic onto the {title,url,description} contract", () => {
  const web = braveContextToWeb(PAYLOAD, 5);

  assertEquals(web.length, 2);
  assertEquals(web[0].title, "Photosynthesis");
  assertEquals(web[0].url, "https://example.edu/photosynthesis");
  // Every chunk Brave extracted for that page, joined — this is the "model-ready"
  // half of the swap, and it must survive into `description` unchanged.
  assert(web[0].description.includes("chemical energy"));
  assert(web[0].description.includes("chloroplast"));
});

// The citation guarantee. A row we cannot attribute is worse than one fewer row.
Deno.test("braveContextToWeb: drops a result with no URL rather than emitting an uncitable row", () => {
  const web = braveContextToWeb(
    { grounding: { generic: [{ snippets: ["orphan text"], title: "No source", url: "" }, PAYLOAD.grounding.generic[0]] } },
    5,
  );

  assertEquals(web.length, 1);
  assertEquals(web[0].url, "https://example.edu/photosynthesis");
});

Deno.test("braveContextToWeb: falls back to the URL when Brave sends no title", () => {
  const web = braveContextToWeb({ grounding: { generic: [{ snippets: ["x"], url: "https://example.edu/a" }] } }, 5);

  assertEquals(web[0].title, "https://example.edu/a");
});

Deno.test("braveContextToWeb: honours the caller's limit", () => {
  assertEquals(braveContextToWeb(PAYLOAD, 1).length, 1);
});

// Brave hands back whole extracted chunks. Unbounded, `description` becomes an
// order of magnitude longer than anything this endpoint returned under Tavily —
// same shape, different payload. The cap is the thing that keeps it a provider swap.
Deno.test("braveContextToWeb: caps description length so the contract stays comparable to Tavily", () => {
  const web = braveContextToWeb(
    { grounding: { generic: [{ snippets: ["x".repeat(9_000)], title: "Long", url: "https://example.edu/long" }] } },
    5,
  );

  assertEquals(web[0].description.length, BRAVE_DESCRIPTION_MAX_CHARS);
});

Deno.test("braveContextToWeb: malformed payloads yield no rows, never a partial one", () => {
  assertEquals(braveContextToWeb(null, 5), []);
  assertEquals(braveContextToWeb({}, 5), []);
  assertEquals(braveContextToWeb({ grounding: {} }, 5), []);
  assertEquals(braveContextToWeb({ grounding: { generic: "not an array" } }, 5), []);
  assertEquals(braveContextToWeb({ grounding: { generic: [{ snippets: "no", url: "" }] } }, 5), []);
});

Deno.test("braveContextToWeb: a result whose snippets are all empty still keeps its citation", () => {
  const web = braveContextToWeb({ grounding: { generic: [{ snippets: ["", "  "], title: "T", url: "https://e.edu/a" }] } }, 5);

  assertEquals(web.length, 1);
  assertEquals(web[0].description, "");
});

// THE SILENT-FALLTHROUGH GUARD. Brave rejects >400 chars or >50 words; Tavily
// never did. Without this check a long query fails at Brave and quietly lands on
// the fallback, and the symptom is "Brave never wins" with no error to find.
Deno.test("braveCanAnswer: rejects a query past Brave's character limit", () => {
  assertEquals(braveCanAnswer("a".repeat(BRAVE_QUERY_MAX_CHARS + 1)), false);
  assertEquals(braveCanAnswer("a".repeat(BRAVE_QUERY_MAX_CHARS)), true);
});

Deno.test("braveCanAnswer: rejects a query past Brave's 50-word limit even when it is short", () => {
  assertEquals(braveCanAnswer(Array(51).fill("w").join(" ")), false);
  assertEquals(braveCanAnswer(Array(50).fill("w").join(" ")), true);
});

Deno.test("braveCanAnswer: rejects an empty or whitespace-only query", () => {
  assertEquals(braveCanAnswer(""), false);
  assertEquals(braveCanAnswer("   "), false);
});

Deno.test("braveCanAnswer: accepts an ordinary student question", () => {
  assert(braveCanAnswer("what is the mechanism of the Calvin cycle?"));
});

Deno.test("braveContextParams: asks for what we intend to keep, clamped to the endpoint's range", () => {
  const params = braveContextParams("  photosynthesis  ", 5);

  assertEquals(params.get("q"), "photosynthesis");
  assertEquals(params.get("maximum_number_of_urls"), "5");
  assertEquals(params.get("count"), "5");
  assertEquals(params.get("maximum_number_of_snippets"), String(BRAVE_MAX_SNIPPETS));
});

Deno.test("braveContextParams: clamps a limit outside Brave's 1-50 range", () => {
  assertEquals(braveContextParams("q", 0).get("maximum_number_of_urls"), "1");
  assertEquals(braveContextParams("q", 999).get("maximum_number_of_urls"), "50");
});
