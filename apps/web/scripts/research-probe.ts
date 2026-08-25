/**
 * A REAL research run, with only the search provider substituted.
 *
 * The model calls are genuine DeepSeek. The passages are genuine page text, fetched over the
 * network from real public URLs. What is stubbed is the choice of which URLs — the Brave/Tavily key
 * lives server-side in the edge function and is deliberately not on this machine — so I supply a
 * realistic result set per query and let the pipeline do everything else for real:
 * plan → per-source extraction → write → per-sentence verification → render.
 *
 * The question is deliberately engineering. Under the allowlist this rewrite removed, an
 * engineering question returned almost nothing citable.
 *
 * Usage, from apps/web (reads DEEPSEEK_API_KEY from .env.local):
 *   pnpm --filter @nemesis/web research-probe
 */

import { runResearch } from "@/lib/research/run-research";
import { reportMarkdown } from "@/lib/research/report-markdown";

const KEY = process.env.DEEPSEEK_API_KEY ?? "";
if (!KEY) {
  console.error("DEEPSEEK_API_KEY is not set. Run with --env-file=.env.local from apps/web.");
  process.exit(1);
}

const QUESTION = "What limits how much heat a finned aluminium heatsink can move by natural convection?";

/** Real, public, non-medical pages on the topic. Deliberately a mix of institutional, reference and
 *  ordinary, so source ranking has something to sort. */
const PAGES = [
  "https://en.wikipedia.org/wiki/Heat_sink",
  "https://en.wikipedia.org/wiki/Natural_convection",
  "https://en.wikipedia.org/wiki/Thermal_resistance",
  "https://en.wikipedia.org/wiki/Fin_(extended_surface)",
  "https://en.wikipedia.org/wiki/Nusselt_number",
  "https://en.wikipedia.org/wiki/Thermal_conductivity_and_resistivity",
];

/**
 * Real page text, taken the way a search provider gives it: clean prose from the top of the
 * article, not a slice out of the middle of the HTML. My first pass grabbed an arbitrary mid-page
 * window and handed the model equation fragments, which is a probe bug rather than a product one.
 */
async function fetchPassage(url: string): Promise<{ title: string; url: string; description: string } | null> {
  const title = decodeURIComponent(url.split("/wiki/")[1] ?? "");
  try {
    const api =
      `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&format=json&redirects=1&titles=` +
      encodeURIComponent(title);
    const res = await fetch(api, { headers: { "User-Agent": "NemesisResearchProbe/1.0" } });
    if (!res.ok) return null;
    const body = (await res.json()) as { query?: { pages?: Record<string, { title?: string; extract?: string }> } };
    const page = Object.values(body.query?.pages ?? {})[0];
    const extract = (page?.extract ?? "").replace(/\s+/g, " ").trim();
    if (extract.length < 200) return null;
    return { description: extract.slice(0, 1200), title: page?.title ?? title, url };
  } catch {
    return null;
  }
}

async function deepseek(messages: readonly { role: string; content: string }[], thinking: boolean): Promise<string> {
  const res = await fetch("https://api.deepseek.com/chat/completions", {
    body: JSON.stringify({ messages, model: thinking ? "deepseek-reasoner" : "deepseek-chat" }),
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    method: "POST",
  });
  if (!res.ok) {
    console.error(`  model call failed: ${res.status}`);
    return "";
  }
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return body.choices?.[0]?.message?.content ?? "";
}

async function main() {
  console.log(`QUESTION: ${QUESTION}\n`);
  process.stdout.write("fetching real page text… ");
  const pool = (await Promise.all(PAGES.map(fetchPassage))).filter((p): p is NonNullable<typeof p> => p !== null);
  console.log(`${pool.length}/${PAGES.length} pages, ${pool.reduce((n, p) => n + p.description.length, 0)} chars\n`);
  if (!pool.length) {
    console.error("no pages fetched; cannot run");
    process.exit(1);
  }

  const started = Date.now();
  let calls = 0;
  const report = await runResearch("probe", QUESTION, {
    io: {
      complete: async (messages, thinking) => {
        calls += 1;
        return deepseek(messages, thinking);
      },
      // Every query gets the same real pool; dedup inside the run means each page is read once.
      search: async () => pool,
    },
    onStep: (step) => {
      if (step.kind === "reading") console.log(`  reading  ${step.url}`);
      else if (step.kind === "searching") console.log(`  search   ${step.subQuestion}`);
      else if (step.kind === "checking") process.stdout.write(`\r  checking ${step.done}/${step.total}   `);
      else console.log(`  ${step.kind}`);
    },
  });

  console.log(`\n\n${calls} model calls, ${Math.round((Date.now() - started) / 1000)}s\n`);
  if ("error" in report) {
    console.error(`FAILED: ${report.error}`);
    process.exit(1);
  }
  console.log("=".repeat(78));
  console.log(reportMarkdown(report));
  console.log("=".repeat(78));
}

void main();
