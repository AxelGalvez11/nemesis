// Everything needed to WRITE one lesson, put on disk so Claude can read it and write.
//
// 🔴🔴 THIS SCRIPT DOES NOT WRITE LESSONS AND MUST NEVER LEARN HOW. Owner, 2026-09-04:
// *"I don't want it to be written by via API ... I'm paying for the subscription ... don't make
// DeepSeek write anything."*
//
// There WAS a `write-course-lessons.mts` here that called a model over HTTP. It wrote 146 lessons
// and they were all deleted, because the author was not the author the product claims. The lesson
// text comes from Claude working in the owner's own session. That is not a limitation to be
// engineered around; it is the requirement.
//
// So the machine does the three things a machine should do, and none of the one it should not:
//
//   course-brief.mts        fetches the real textbook section and lays it out to write from
//   (a human-run session)   writes <ordinal>.json                        <-- the actual writing
//   check-course-lessons    fails the ones that break a rule
//   load-course-lessons     puts the survivors in the database
//
//   pnpm tsx scripts/course-brief.mts --course anatomy-and-physiology --count 6

import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { openStaxPages, pressbooksPages, readable, titleKey } from "./course-source.mjs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const OUT = process.env.LESSON_OUT ?? "/tmp/nemesis-lessons";

/**
 * How much of the section goes in the brief.
 *
 * 🔴🔴 IT WAS 14,000 AND IT WAS SILENTLY TRUNCATING LESSONS. 2.3 Chemical Reactions is 15,993
 * characters, so the brief stopped before the section on enzymes and catalysts. The writer noticed,
 * refused to caption a figure it could not see the source for, and taught the objective from the
 * three rate factors it could actually reach. That was the right call and it should never have had
 * to make it: an objective whose source was cut off is taught short, and nothing downstream can
 * tell that apart from a thin section.
 *
 * 🔴 THE OLD NUMBER WAS SIZED FOR THE WRONG READER. 14,000 was chosen when the brief had to fit in
 * a shared context alongside everything else. A subagent writing one lesson has a whole context
 * window for one section, so the only real ceiling is the longest section in the shelf.
 */
const SOURCE_CAP = 60000;

async function rest<T>(path: string): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${SUPABASE_KEY}` },
  });
  return (await res.json()) as T;
}

function arg(name: string): string | null {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? null : (process.argv[at + 1] ?? null);
}

async function main(): Promise<void> {
  const slug = arg("course");
  if (!slug) throw new Error("pass --course <slug>");

  const [course] = await rest<{ id: string; title: string; source: string; source_url: string }[]>(
    `course_catalogue?slug=eq.${slug}&select=id,title,source,source_url`,
  );
  if (!course) throw new Error(`no course ${slug}`);

  const sections = await rest<{ ordinal: number; number: string | null; title: string; objectives: string[] }[]>(
    `course_sections?course_id=eq.${course.id}&select=ordinal,number,title,objectives&order=ordinal`,
  );
  const done = new Set(
    (await rest<{ section_ordinal: number }[]>(`course_lessons?course_id=eq.${course.id}&select=section_ordinal`)).map(
      (r) => r.section_ordinal,
    ),
  );

  const dir = join(OUT, slug);
  await mkdir(dir, { recursive: true });
  for (const file of await readdir(dir)) {
    if (/^\d+\.json$/.test(file)) done.add(Number(file.split(".")[0]));
  }

  const from = Number(arg("from") ?? 0);
  const todo = sections
    .filter((s) => s.objectives.length > 0 && !done.has(s.ordinal) && s.ordinal >= from)
    .slice(0, Number(arg("count") ?? 5));

  if (todo.length === 0) {
    console.log(`${course.title}: nothing left to write`);
    return;
  }

  const pages = course.source === "openstax" ? await openStaxPages(slug) : await pressbooksPages(course.source_url);
  if (!pages) throw new Error(`could not read the source for ${slug}`);
  const byTitle = new Map(pages.map((p) => [titleKey(p.title), p]));

  for (const section of todo) {
    const page = byTitle.get(titleKey(section.title));
    if (!page) {
      console.log(`  no source page matched ${section.number ?? section.ordinal} ${section.title}`);
      continue;
    }
    const { figures, text } = readable(page.html, page.base);
    if (text.length < 900) {
      console.log(`  ${section.number ?? section.ordinal} ${section.title}: source is only ${text.length} chars, skipping`);
      continue;
    }
    // 🔴 THE FIGURE KEYS AND URLS BOTH GO IN THE BRIEF. The lesson refers to a key; the loader needs
    // the url. Writing them out together means the writer never has to guess a hash.
    const lines = [
      `# ${section.number ? `${section.number} ` : ""}${section.title}`,
      `course_id: ${course.id}`,
      `section_ordinal: ${section.ordinal}`,
      "",
      "## Objectives (index them from 0)",
      ...section.objectives.map((o, i) => `[${i}] ${o}`),
      "",
      "## Figures available",
      ...(figures.length
        ? figures.map((f) => `${f.key}\t${f.url}\n\t${f.alt.slice(0, 300)}`)
        : ["(none usable in this section)"]),
      "",
      // 🔴 A TRUNCATED BRIEF HAS TO SAY SO ON ITS FACE. Three lessons were written from source
      // text that stopped mid-sentence, and in every case the writer only found out by reading to
      // the end and noticing the sentence broke off. Nothing downstream could tell a section that
      // was cut short from a section that is genuinely thin. Now the brief states it.
      text.length > SOURCE_CAP
        ? `## Source text (TRUNCATED: ${text.length} characters, showing the first ${SOURCE_CAP})`
        : `## Source text (complete, ${text.length} characters)`,
      text.slice(0, SOURCE_CAP),
    ];
    await writeFile(join(dir, `brief-${section.ordinal}.md`), lines.join("\n"));
    console.log(
      `  brief-${section.ordinal}.md  ${section.number ?? ""} ${section.title}  ` +
        `(${section.objectives.length} objectives, ${figures.length} figures, ${text.length} chars)`,
    );
  }
  console.log(`\nbriefs in ${dir}. Write each one as <ordinal>.json, then run check-course-lessons.`);
}

await main();
