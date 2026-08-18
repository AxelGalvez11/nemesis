// DEV-ONLY — where "we actually listened" is written down.
//
// 🔴 THE STORE IS THE POINT, NOT THE FILE FORMAT. §43 says a locale's provider may only be called
// `measured` after a person has listened, and that claim needs somewhere durable to live or it
// evaporates when the tab closes. Ratings land in a gitignored JSON file on the machine that did
// the listening; `winnerFor()` reads them back and refuses to name a winner from one provider or
// from a tie.
//
// 🔴 IT DOES NOT EDIT `speech-route.ts`, AND THAT IS DELIBERATE. Promotion into the production table
// stays a human commit: the route returns the exact line to add, and somebody has to mean it. A lab
// surface that could silently change which provider production speaks through would make the
// difference between `measured` and `unmeasured-default` unauditable — which is the distinction the
// whole field exists to keep.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { NextResponse } from "next/server";

import {
  isCompleteRating,
  promotionLine,
  winnerFor,
  type BakeoffProvider,
  type RatedSample,
} from "@/lib/learn/tts-bakeoff";

export const runtime = "nodejs";

/** Gitignored, and outside `app/` so a write never trips the dev server's file watcher. */
const STORE = join(process.cwd(), ".nemesis-lab", "tts-bakeoff.json");

interface Store {
  rated: RatedSample[];
}

async function readStore(): Promise<Store> {
  try {
    const raw = await readFile(STORE, "utf8");
    const parsed = JSON.parse(raw) as Partial<Store>;
    return { rated: Array.isArray(parsed.rated) ? parsed.rated : [] };
  } catch {
    // A missing store is an empty one. Anything unreadable is treated the same way rather than
    // throwing: a corrupted bench file must not take the Lab down, and nothing here is precious.
    return { rated: [] };
  }
}

async function writeStore(store: Store): Promise<void> {
  await mkdir(dirname(STORE), { recursive: true });
  await writeFile(STORE, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

function guard(): NextResponse | null {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "The TTS bench is a development surface." }, { status: 404 });
  }
  return null;
}

/** Everything listened to so far, plus who each locale's winner would be. */
export async function GET() {
  const blocked = guard();
  if (blocked) return blocked;

  const store = await readStore();
  const locales = [...new Set(store.rated.map((entry) => entry.sample.locale))].sort();
  return NextResponse.json({
    rated: store.rated,
    winners: locales.map((locale) => {
      const result = winnerFor(locale, store.rated);
      return { locale, promote: promotionLine(result), result };
    }),
  });
}

export async function POST(req: Request) {
  const blocked = guard();
  if (blocked) return blocked;

  const body = (await req.json().catch(() => ({}))) as { rating?: unknown; sample?: unknown };
  const sample = body.sample as RatedSample["sample"] | undefined;
  if (!sample || typeof sample.locale !== "string" || typeof sample.provider !== "string") {
    return NextResponse.json({ error: "A rating needs the sample it is about." }, { status: 400 });
  }
  // 🔴 ALL FIVE AXES OR NOTHING. A half-filled card averaged over the axes somebody bothered with
  // would rank a provider on the dimensions its listener happened to care about that afternoon.
  if (!isCompleteRating(body.rating)) {
    return NextResponse.json(
      { error: "Score every axis from 1 to 5.", reason: "incomplete-rating" },
      { status: 400 },
    );
  }

  const store = await readStore();
  const entry: RatedSample = {
    rating: body.rating,
    sample: {
      chars: typeof sample.chars === "number" ? sample.chars : sample.phrase?.length ?? 0,
      latencyMs: typeof sample.latencyMs === "number" ? sample.latencyMs : 0,
      locale: sample.locale,
      phrase: typeof sample.phrase === "string" ? sample.phrase : "",
      provider: sample.provider as BakeoffProvider,
      ...(sample.voice ? { voice: sample.voice } : {}),
    },
  };
  // Appended rather than replaced: two listeners disagreeing about one voice is data, and the last
  // person to open the Lab is not automatically right.
  store.rated.push(entry);
  await writeStore(store);

  const result = winnerFor(entry.sample.locale, store.rated);
  return NextResponse.json({ promote: promotionLine(result), rated: store.rated.length, result });
}
