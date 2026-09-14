// Turning written lessons into SQL, in batches small enough to send one at a time.
//
// TWO WAYS IN, AND WHICH ONE RUNS DEPENDS ONLY ON WHETHER A KEY IS PRESENT.
//
//   SUPABASE_SERVICE_ROLE_KEY set  →  the rows are POSTed straight to PostgREST. This is the path
//                                     that scales: 5,686 lessons is roughly 80 MB of JSON, and
//                                     nothing about it should pass through a conversation.
//   not set                        →  a file of SQL, to be run over an admin connection by hand.
//
// 🔴 `course_lessons` IS PUBLIC REFERENCE DATA: anyone may read it, nobody may write it. That is
// the right policy and it is not going to be loosened for a loader. The key belongs in
// `apps/web/.env.local`, which is gitignored, and this script is the only thing that reads it.
//
// 🔴 `ON CONFLICT DO UPDATE`, NOT `DO NOTHING`. Re-running the writer for a section that already has
// a lesson is how a bad lesson gets replaced; skipping the row would leave the bad one in place and
// report success.
//
//   pnpm tsx scripts/load-course-lessons.mts --course anatomy-and-physiology [--batch 8]

import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const OUT = process.env.LESSON_OUT ?? "/tmp/nemesis-lessons";

function arg(name: string): string | null {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? null : (process.argv[at + 1] ?? null);
}

/** Postgres string literal. Doubling the quote is the whole escape; there is nothing else to do. */
function lit(value: unknown): string {
  return `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;
}

async function main(): Promise<void> {
  const slug = arg("course");
  if (!slug) throw new Error("pass --course <slug>");
  const batchSize = Number(arg("batch") ?? 8);

  const dir = join(OUT, slug);
  const files = (await readdir(dir)).filter((f) => f.endsWith(".json")).sort((a, b) => Number(a.split(".")[0]) - Number(b.split(".")[0]));

  const rows: string[] = [];
  for (const file of files) {
    const d = JSON.parse(await readFile(join(dir, file), "utf8")) as Record<string, unknown>;
    rows.push(
      `('${String(d.course_id)}'::uuid, ${Number(d.section_ordinal)}, ${Number(d.minutes) || 8}, ` +
        `${lit(d.blocks)}, ${lit(d.terms)}, ${lit(d.figures)}, ${lit(d.flashcards)}, ${lit(d.items)}, '${String(d.written_by ?? "claude-sonnet-5")}')`,
    );
  }

  const batches: string[] = [];
  for (let at = 0; at < rows.length; at += batchSize) {
    batches.push(
      "insert into course_lessons " +
        "(course_id, section_ordinal, minutes, blocks, terms, figures, flashcards, items, written_by) values\n" +
        rows.slice(at, at + batchSize).join(",\n") +
        "\non conflict (course_id, section_ordinal) do update set " +
        "minutes = excluded.minutes, blocks = excluded.blocks, terms = excluded.terms, " +
        "figures = excluded.figures, flashcards = excluded.flashcards, items = excluded.items, " +
        "written_by = excluded.written_by, written_at = now();",
    );
  }

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    const path = join(dir, "load.sql");
    await writeFile(path, batches.join("\n\n-- BATCH --\n\n"));
    console.log(`${rows.length} lessons in ${batches.length} batches -> ${path}`);
    console.log("(set SUPABASE_SERVICE_ROLE_KEY in apps/web/.env.local to write them directly)");
    return;
  }

  // Straight in. `resolution=merge-duplicates` is PostgREST's upsert, and it needs the unique
  // constraint the migration already put on (course_id, section_ordinal).
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  let sent = 0;
  for (let at = 0; at < files.length; at += batchSize) {
    const payload = await Promise.all(
      files.slice(at, at + batchSize).map(async (f) => JSON.parse(await readFile(join(dir, f), "utf8")) as Record<string, unknown>),
    );
    const res = await fetch(`${url}/rest/v1/course_lessons?on_conflict=course_id,section_ordinal`, {
      body: JSON.stringify(payload.map((d) => ({ ...d, written_by: d.written_by ?? "claude-sonnet-5" }))),
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
        prefer: "resolution=merge-duplicates,return=minimal",
      },
      method: "POST",
    });
    if (!res.ok) {
      console.error(`batch at ${at} refused: ${res.status} ${await res.text()}`);
      continue;
    }
    sent += payload.length;
  }
  console.log(`${sent} of ${files.length} lessons written to course_lessons`);
}

await main();
