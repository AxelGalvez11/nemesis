// The run itself: question in, cited report out.
//
//   plan the sub-questions
//     → for each, write search queries and search
//       → read each source ALONE, keeping its own text beside every fact
//     → write the report from the pooled facts, citing by number
//     → check every sentence against the passages it cited, and drop the ones that fail
//
// 🔴 THE CHECK AT THE END IS NOT A FORMALITY, it is what separates this from a chat answer with
// links stapled on. Anything the model wrote that its cited passages do not carry is removed from
// the report before the learner ever sees it, and the count of what was removed is printed in the
// report's own footer. A research tool that hides how much of its output failed its own check is
// worse than one with no check.
//
// 🔴 EVERY NETWORK FAILURE DEGRADES, NEVER THROWS. A search that times out costs that sub-question
// its sources; it must not cost the run its other four. The only thing that ends a run early is
// having no plan at all, because there is nothing to do without one.

import { postChatCompletion, searchWebContext, type WireMsg } from "@/lib/workspace/chat-api";

import { byRank, citable, rankSource } from "./source-trust";
import {
  readExtraction,
  readQueries,
  readReportBody,
  readSubQuestions,
  readVerdict,
} from "./research-parse";
import { checkMessages, extractMessages, planMessages, queryMessages, writeMessages } from "./research-prompts";
import {
  RESEARCH_LIMITS,
  type OnResearchStep,
  type ReportSource,
  type ResearchLearning,
  type ResearchReport,
} from "./research-model";

/** The thinking model for judgement work, the fast one for extraction. Extraction is a hundred
 *  small identical jobs and the reasoner's price is not worth paying a hundred times; planning,
 *  writing and checking are each done once and are where the quality actually comes from. */
const REASONING = { model: "deepseek-reasoner", route: "research", searchWeb: false } as const;
const FAST = { model: "deepseek-chat", route: "conversation", searchWeb: false } as const;

/** Run `jobs` with at most `width` in flight. Order of results matches order in. */
async function pooled<T, R>(items: readonly T[], width: number, job: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(width, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await job(items[i] as T, i);
    }
  });
  await Promise.all(workers);
  return out;
}

/**
 * The two things this module does to the outside world, named so a test can supply its own.
 *
 * 🔴 INJECTED RATHER THAN IMPORTED-AND-MOCKED, and the reason is that the parts most worth testing
 * here are the ones between the calls: whether a dead search costs the run or only its query,
 * whether a sentence that fails its check is really removed, and whether fact indices survive being
 * remapped into source numbers. None of that is reachable if exercising the pipeline needs a live
 * key, and none of it is what a mocked module tests. Production passes nothing and gets the real
 * two, so there is no second code path to keep honest.
 */
export interface ResearchIO {
  complete: (messages: readonly { role: string; content: string }[], thinking: boolean) => Promise<string>;
  search: (query: string, limit: number) => Promise<{ title: string; url: string; description: string }[]>;
}

function liveIO(uid: string, signal?: AbortSignal): ResearchIO {
  return {
    complete: async (messages, thinking) => {
      try {
        const reply = await postChatCompletion(uid, messages as WireMsg[], {
          decision: thinking ? REASONING : FAST,
          ...(signal ? { signal } : {}),
        });
        return reply.text ?? "";
      } catch {
        return "";
      }
    },
    search: async (query, limit) => {
      const found = await searchWebContext(uid, query, signal, limit);
      return found.sources;
    },
  };
}

export interface RunResearchOptions {
  onStep?: OnResearchStep;
  signal?: AbortSignal;
  /** Test seam. Production never passes this. */
  io?: ResearchIO;
}

export type ResearchFailure = { error: string };

export async function runResearch(
  uid: string,
  question: string,
  options: RunResearchOptions = {},
): Promise<ResearchReport | ResearchFailure> {
  const { onStep, signal } = options;
  const io = options.io ?? liveIO(uid, signal);
  const asked = question.trim();
  if (asked.length < 8) return { error: "Give me a question with a bit more in it to research." };

  // ---- plan ------------------------------------------------------------------------------
  onStep?.({ kind: "planning" });
  const subQuestions = readSubQuestions(await io.complete(planMessages(asked), true));
  if (!subQuestions) return { error: "I couldn't break that question into parts to research. Try rephrasing it." };

  // ---- gather ----------------------------------------------------------------------------
  const learnings: ResearchLearning[] = [];
  const seenUrls = new Set<string>();
  let searchesRun = 0;
  let done = 0;

  await pooled(subQuestions, RESEARCH_LIMITS.concurrency, async (subQuestion) => {
    onStep?.({ done, kind: "searching", subQuestion, total: subQuestions.length });
    const queries = readQueries(
      await io.complete(queryMessages(subQuestion, RESEARCH_LIMITS.queriesPerSubQuestion), false),
      RESEARCH_LIMITS.queriesPerSubQuestion,
    );
    // A sub-question the model could not turn into queries is still searchable as itself.
    const toSearch = queries.length ? queries : [subQuestion];

    for (const query of toSearch) {
      if (signal?.aborted || learnings.length >= RESEARCH_LIMITS.maxLearnings) break;
      searchesRun += 1;
      let results;
      try {
        results = await io.search(query, RESEARCH_LIMITS.resultsPerQuery);
      } catch {
        continue; // a dead search costs this query, never the run
      }

      // Rank ORDERS the pool so the best sources are read first when the fact budget runs out.
      // It never removes one: see source-trust.ts.
      for (const source of byRank(results)) {
        if (learnings.length >= RESEARCH_LIMITS.maxLearnings) break;
        if (!source.url || seenUrls.has(source.url) || !citable(source.url)) continue;
        // The extract IS the evidence. Nothing to check a claim against means nothing to cite.
        const passage = (source.description ?? "").trim();
        if (passage.length < 80) continue;
        seenUrls.add(source.url);
        onStep?.({ kind: "reading", url: source.url });

        const { facts } = readExtraction(
          await io.complete(
            extractMessages(asked, subQuestions, source.title || source.url, source.url, passage, RESEARCH_LIMITS.factsPerSource),
            false,
          ),
        );
        for (const fact of facts) {
          if (learnings.length >= RESEARCH_LIMITS.maxLearnings) break;
          learnings.push({ fact, passage, subQuestion, title: source.title || source.url, url: source.url });
        }
      }
    }
    done += 1;
  });

  if (!learnings.length) {
    return { error: "The search came back with nothing usable on that. Try naming the topic more specifically." };
  }

  // ---- write -----------------------------------------------------------------------------
  onStep?.({ kind: "writing" });
  const numbered = learnings.map((l, i) => `${i + 1}. ${l.fact}  [${l.title}]`).join("\n");
  const body = readReportBody(await io.complete(writeMessages(asked, subQuestions, numbered), true), learnings.length);
  if (!body) return { error: "The report came back in a shape I couldn't read. Nothing was saved." };

  // ---- check -----------------------------------------------------------------------------
  // Every sentence, against the passages it actually cited. This is the expensive step and the
  // one worth paying for.
  const allPoints = body.sections.flatMap((section) => section.points);
  let checked = 0;
  const verdicts = await pooled(allPoints, RESEARCH_LIMITS.concurrency, async (point) => {
    const passages = point.support
      .map((i) => learnings[i])
      .filter((l): l is ResearchLearning => Boolean(l))
      .map((l, n) => `[${n + 1}] ${l.title}\n${l.passage}`)
      .join("\n\n");
    const verdict = readVerdict(await io.complete(checkMessages(point.text, passages), false));
    checked += 1;
    onStep?.({ done: checked, kind: "checking", total: allPoints.length });
    return verdict;
  });

  const survives = new Map(allPoints.map((point, i) => [point, verdicts[i] === true]));
  const sections = body.sections
    .map((section) => ({ ...section, points: section.points.filter((point) => survives.get(point)) }))
    .filter((section) => section.points.length > 0);
  const kept = sections.reduce((n, section) => n + section.points.length, 0);

  if (!kept) {
    return { error: "Nothing in the draft held up against its own sources, so I did not save a report." };
  }

  // Only sources a SURVIVING point actually cites are listed. A reference list padded with pages
  // nothing ended up using overstates the work and makes the real citations harder to trust.
  const usedIndices = new Set(sections.flatMap((s) => s.points.flatMap((p) => p.support)));
  const sources: ReportSource[] = [];
  const numberByUrl = new Map<string, number>();
  for (const index of usedIndices) {
    const learning = learnings[index];
    if (!learning || numberByUrl.has(learning.url)) continue;
    numberByUrl.set(learning.url, sources.length);
    sources.push({ rank: rankSource(learning.url).rank, title: learning.title, url: learning.url });
  }

  // 🔴 SUPPORT CHANGES MEANING HERE, ONCE, AND THE REPORT SAYS SO. Up to this line a point's
  // support indexed the FACT POOL, because that is what verification needed: the passage behind
  // each fact. From here it indexes `sources`, because that is what a reader needs: the numbered
  // list at the bottom. Two facts off one page must collapse to ONE number, or the markers and the
  // reference list quietly disagree. Doing it here rather than in the renderer means nothing
  // downstream has to be handed a second map to make sense of the first.
  const remapped = sections.map((section) => ({
    ...section,
    points: section.points.map((point) => ({
      ...point,
      support: [...new Set(point.support.map((i) => numberByUrl.get(learnings[i]?.url ?? "")))]
        .filter((n): n is number => n !== undefined)
        .sort((a, b) => a - b),
    })),
  }));

  return {
    gaps: body.gaps,
    question: asked,
    sections: remapped,
    sources,
    stats: { dropped: allPoints.length - kept, found: learnings.length, kept, searched: searchesRun },
    subQuestions,
    summary: body.summary,
  };
}
