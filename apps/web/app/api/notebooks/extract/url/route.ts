// Notebook web-link source extraction — scrapes a URL to plain text via the nemesis-search edge
// function's /v2/scrape route (which holds the server-side Firecrawl key and meters usage against the
// student's device key). This proxy exists because nemesis-search has no browser CORS and was built
// for server-to-server calls; the browser passes its own nmk_ device key through, we forward it, and
// return { title, text } for the client to write as a notebook_sources row under its RLS session.
import { NextResponse } from "next/server";

import { supabaseUrl } from "@/lib/env";

export const runtime = "nodejs";

const SCRAPE_TEXT_CAP = 200_000; // Mirror the PDF extractor's cap — keep saved rows bounded.

function normalizeUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

interface ScrapePayload {
  success?: boolean;
  error?: string;
  data?: {
    markdown?: unknown;
    content?: unknown;
    metadata?: { title?: unknown };
  };
}

export async function POST(req: Request): Promise<Response> {
  // A SHAPE check, and that is enough HERE and only here: this route spends
  // nothing itself — it forwards the key to nemesis-search, which resolves it
  // against `device_keys` and meters the Firecrawl call against that account. A
  // forged key gets a 403 one hop later, before any money is spent.
  //
  // The sibling file route carried this identical line and was NOT safe, because
  // it forwards nowhere and calls Gemini on our own key. Whether a prefix check
  // is sufficient depends entirely on what happens downstream — so if this route
  // ever starts doing its own fetching, it needs verifyDeviceKey (lib/device-key.ts).
  const bearer = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!bearer.startsWith("nmk_")) {
    return NextResponse.json(
      { error: "This device needs to re-connect to your account. Try again." },
      { status: 401 },
    );
  }

  const body = (await req.json().catch(() => null)) as { url?: unknown } | null;
  const url = normalizeUrl(body?.url);
  if (!url) {
    return NextResponse.json({ error: "Enter a valid web link (http or https)." }, { status: 400 });
  }
  if (!supabaseUrl) {
    return NextResponse.json({ error: "The web reader isn't configured on the server." }, { status: 503 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${supabaseUrl}/functions/v1/nemesis-search/v2/scrape`, {
      method: "POST",
      headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
    });
  } catch {
    return NextResponse.json({ error: "The web reader is unreachable right now. Try again." }, { status: 502 });
  }

  const payload = (await upstream.json().catch(() => null)) as ScrapePayload | null;

  if (!upstream.ok || !payload || payload.success === false) {
    const msg = typeof payload?.error === "string" && payload.error ? payload.error : "Couldn't read that page.";
    const status =
      upstream.status === 401 || upstream.status === 403 ? 401 : upstream.status === 429 ? 429 : 502;
    return NextResponse.json({ error: msg }, { status });
  }

  const data = payload.data ?? {};
  const raw = typeof data.markdown === "string" ? data.markdown : typeof data.content === "string" ? data.content : "";
  const text = raw.trim().slice(0, SCRAPE_TEXT_CAP);
  if (!text) {
    return NextResponse.json(
      { error: "That page had no readable text (it may need a login or run entirely on scripts)." },
      { status: 422 },
    );
  }

  const metaTitle = data.metadata?.title;
  const title = typeof metaTitle === "string" && metaTitle.trim() ? metaTitle.trim().slice(0, 300) : url;
  return NextResponse.json({ title, text, sourceUrl: url, bytes: text.length });
}
