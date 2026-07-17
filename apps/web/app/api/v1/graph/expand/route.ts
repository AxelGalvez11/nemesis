import { NextRequest, NextResponse } from "next/server";

import { pmidFromUrl } from "@nemesis/shared";
import { verifyBearer } from "@/lib/server";

export const runtime = "nodejs";

// HARDENING (mirrors evidence/search/route.ts): this route fans out to OpenAlex (up to 4 calls per
// request), so it must not be a public open door. Two guards: (1) require a signed-in user; nothing
// auto-calls this route, so auth breaks no flow. (2) a per-instance sliding-window rate cap bounding
// the outbound fan-out under a token burst. Responses carry a CDN cache header so repeats are absorbed.
const RATE_WINDOW_MS = 10_000;
const RATE_MAX = 30; // expands per window per instance — a backstop; auth is the primary gate
let hits: number[] = [];
function rateLimited(now: number): boolean {
  hits = hits.filter((t) => now - t < RATE_WINDOW_MS);
  if (hits.length >= RATE_MAX) return true;
  hits.push(now);
  return false;
}

const OPENALEX = "https://api.openalex.org";
const CAP = 8;

interface SlimWork { id: string; title: string | null; year: string | null; pmid: string | null }

interface OpenAlexWork {
  id?: string;
  ids?: { pmid?: string };
  title?: string | null;
  publication_year?: number | null;
  referenced_works?: string[];
  related_works?: string[];
}

/** Short OpenAlex id (`W...`) from a full or short id string. */
function shortId(id: string | undefined): string | null {
  if (!id) return null;
  const m = id.match(/(W\d+)/);
  return m ? m[1] ?? null : null;
}

function slim(w: OpenAlexWork): SlimWork {
  return {
    id: shortId(w.id) ?? (w.id ?? ""),
    title: w.title ?? null,
    year: typeof w.publication_year === "number" ? String(w.publication_year) : null,
    pmid: pmidFromUrl(w.ids?.pmid ?? null),
  };
}

function mailtoParam(): string {
  const mail = process.env.OPENALEX_MAILTO;
  return mail ? `&mailto=${encodeURIComponent(mail)}` : "";
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`openalex ${res.status}`);
  return res.json();
}

async function listWorks(url: string): Promise<SlimWork[]> {
  const data = await getJson(url);
  if (typeof data !== "object" || data === null || !("results" in data)) return [];
  const results = (data as { results?: unknown }).results;
  if (!Array.isArray(results)) return [];
  return results.slice(0, CAP).map((r) => slim(r as OpenAlexWork));
}

export async function GET(req: NextRequest) {
  const user = await verifyBearer(req);
  if (!user) {
    return NextResponse.json({ error: "unauthorized", message: "Sign in to explore related papers." }, { status: 401 });
  }

  const pmid = req.nextUrl.searchParams.get("pmid")?.trim();
  if (!pmid || !/^\d{1,9}$/.test(pmid)) {
    return NextResponse.json({ error: "bad_pmid", message: "Pass a numeric ?pmid=..." }, { status: 400 });
  }

  if (rateLimited(Date.now())) {
    return NextResponse.json({ error: "rate_limited", message: "Too many lookups right now — try again shortly." }, { status: 429 });
  }

  try {
    const mailto = mailtoParam();
    const root = await getJson(`${OPENALEX}/works/pmid:${pmid}?select=id,ids,title,publication_year,referenced_works,related_works${mailto}`) as OpenAlexWork;
    const workId = shortId(root.id);
    if (!workId) {
      return NextResponse.json({ error: "not_found", message: "No matching paper in the citation graph." }, { status: 404 });
    }

    const refIds = (root.referenced_works ?? []).map(shortId).filter((x): x is string => !!x).slice(0, CAP);
    const [cites, citedBy, similar] = await Promise.all([
      refIds.length
        ? listWorks(`${OPENALEX}/works?filter=openalex_id:${refIds.join("|")}&select=id,ids,title,publication_year&per-page=${CAP}${mailto}`)
        : Promise.resolve<SlimWork[]>([]),
      listWorks(`${OPENALEX}/works?filter=cites:${workId}&select=id,ids,title,publication_year&per-page=${CAP}${mailto}`),
      listWorks(`${OPENALEX}/works?filter=related_to:${workId}&select=id,ids,title,publication_year&per-page=${CAP}${mailto}`),
    ]);

    const payload = {
      work: slim(root),
      cites,
      cited_by: citedBy,
      similar,
    };
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "s-maxage=86400, stale-while-revalidate=604800" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Related-paper lookup failed";
    return NextResponse.json({ error: "graph_expand_failed", message }, { status: 502 });
  }
}
