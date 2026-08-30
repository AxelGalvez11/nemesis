import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { supabaseAnonKey, supabaseUrl } from "@/lib/env";
import { verifyBearer } from "@/lib/server";

export const runtime = "nodejs";

// Pre-made course skeletons: a published book's own chapter order.
//
// 🔴 THE READER SHIPS WITH THE STORE. `course_scaffolds` is the third thing this session has put in
// the database, and the lesson of the first one is written all over this codebase: `core_sources`
// was built, filled, licence-gated and then archived UNREAD because nothing ever asked it a
// question. A table with no route is a warehouse with no door.
//
// 🔴 A SCAFFOLD IS "WHERE AM I IN THE BOOK", NEVER "WHAT DO I KNOW". `canvas-focus.ts` forbids
// document layout from becoming a territory tree, and a chapter list is document layout. This route
// exists so a course map can be shown NEXT TO the knowledge map, not folded into it.
//
// Public content, identical for every learner, so there is no per-user scoping to enforce; the
// caller must still be signed in.

export interface ScaffoldChapter { title: string; index: number }
export interface ScaffoldPart { part: string; index: number; chapters: ScaffoldChapter[] }

export interface CourseScaffold {
  id: string;
  bookTitle: string;
  bookUrl: string;
  /** Rendered wherever the course map appears. CC BY requires it. */
  attribution: string;
  chapterCount: number;
  parts: ScaffoldPart[];
}

const MAX_LIMIT = 40;

export async function GET(req: NextRequest) {
  const auth = await verifyBearer(req);
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const search = (url.searchParams.get("q") ?? "").trim();
  const book = (url.searchParams.get("book") ?? "").trim();
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 12, 1), MAX_LIMIT);

  const client = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: req.headers.get("authorization") ?? "" } },
  });

  let query = client
    .from("course_scaffolds")
    .select("id,book_title,book_url,attribution,chapter_count,parts")
    .order("chapter_count", { ascending: false })
    .limit(limit);

  // 🔴 `parts` IS ONLY RETURNED FOR A NAMED BOOK. A list of forty scaffolds with every chapter of
  // every one is a megabyte of JSON to render a menu; the browsing case needs titles and counts.
  if (book) query = client
    .from("course_scaffolds")
    .select("id,book_title,book_url,attribution,chapter_count,parts")
    .eq("book_url", book)
    .limit(1);
  else if (search) {
    // 🔴 WORD-WISE, BECAUSE A SUBJECT IS NOT A TITLE. "cell biology" as one phrase misses
    // "Cell and Molecular Biology"; each word alone finds it, and the model ballot downstream is
    // what filters the extra matches this lets in. Words are letters and digits only, so nothing a
    // caller types can smuggle PostgREST filter syntax into the .or() expression; course-shaped
    // filler words are dropped so "intro to biology" searches for biology, not for every
    // introduction on the shelf.
    const FILLER = new Set(["course", "courses", "class", "intro", "introduction", "basics", "beginner", "beginners", "learn", "learning", "the", "and", "for"]);
    const words = (search.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []).filter((word) => !FILLER.has(word)).slice(0, 6);
    if (words.length === 0) query = query.ilike("book_title", `%${search}%`);
    else query = query.or(words.map((word) => `book_title.ilike.%${word}%`).join(","));
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ courses: [], error: "course list unavailable" }, { status: 503 });

  const rows = (data ?? []) as Record<string, unknown>[];
  const courses: CourseScaffold[] = rows.map((row) => ({
    attribution: String(row.attribution ?? ""),
    bookTitle: String(row.book_title ?? ""),
    bookUrl: String(row.book_url ?? ""),
    chapterCount: Number(row.chapter_count ?? 0),
    id: String(row.id ?? ""),
    parts: book ? ((row.parts as ScaffoldPart[] | null) ?? []) : [],
  }));

  return NextResponse.json({ courses });
}
