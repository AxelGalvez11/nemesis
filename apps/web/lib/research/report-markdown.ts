// The report as a note in the learner's library.
//
// Markdown rather than a bespoke viewer, deliberately: the Library already reads, searches, edits
// and exports notes, and a report that is a note can be quoted into an essay, turned into slides,
// or fed back to the canvas as material. The engine this replaces had its own report component,
// its own export routes and its own storage, and the result was a document that lived in a room of
// its own and could not be used for anything.
//
// 🔴 THE FOOTER TELLS ON US, ON PURPOSE. It prints how many sentences the draft had and how many
// were removed for not being supported by their own sources. A research tool that hides how much
// of its output failed its own check has turned the check into decoration.

import type { ResearchReport } from "./research-model";

/** Citation markers as the reader sees them: [1], or [1][3] where a sentence rests on two sources.
 *  `support` already indexes `report.sources` by the time it gets here; see ReportPoint. */
function markers(support: readonly number[], sourceCount: number): string {
  return support
    .filter((i) => i >= 0 && i < sourceCount)
    .map((i) => `[${i + 1}]`)
    .join("");
}

/** Render the report as a library note. */
export function reportMarkdown(report: ResearchReport): string {
  const lines: string[] = [`# ${report.question}`, "", report.summary, ""];

  for (const section of report.sections) {
    lines.push(`## ${section.heading}`, "");
    for (const point of section.points) {
      const cite = markers(point.support, report.sources.length);
      lines.push(`- ${point.text}${cite ? ` ${cite}` : ""}`);
    }
    lines.push("");
  }

  if (report.gaps.length) {
    lines.push("## What this does not settle", "");
    for (const gap of report.gaps) lines.push(`- ${gap}`);
    lines.push("");
  }

  lines.push("## Sources", "");
  report.sources.forEach((source, i) => {
    // The rank is shown in words rather than as a score. "primary" beside a court opinion and a
    // standards document means the same thing to a reader in either field, which a number would not.
    const note = source.rank === "ordinary" ? "" : ` _(${source.rank})_`;
    lines.push(`${i + 1}. [${source.title}](${source.url})${note}`);
  });
  lines.push("");

  lines.push("## How this was made", "");
  lines.push(`Researched in ${report.subQuestions.length} parts:`);
  for (const sub of report.subQuestions) lines.push(`- ${sub}`);
  lines.push("");
  const { dropped, found, kept, searched } = report.stats;
  // Counted in words rather than glued together with an "(s)": this line is read by the learner and
  // sometimes by whoever they hand the report to, and "1 were removed" undercuts every careful
  // sentence above it.
  const were = (n: number) => (n === 1 ? "was" : "were");
  lines.push(
    `${searched} searches, ${found} facts kept with the passage each came from. ` +
      `Of ${kept + dropped} sentences drafted, ${kept} ${were(kept)} confirmed against the cited sources and ` +
      `${dropped} ${were(dropped)} removed for saying more than those sources did.`,
  );
  lines.push("");
  // 🔴 THE LIMIT, STATED. Every claim above was checked against the passage the search returned,
  // which is not the same as reading the whole page and is not the same as the page being right.
  // Saying so here costs a line and stops the report claiming a strength it does not have.
  lines.push(
    "_Each sentence was checked against the passage its source actually returned. That confirms the " +
      "source says it, not that the source is correct, and the passage is an extract rather than the " +
      "whole page._",
  );

  return lines.join("\n");
}

/**
 * "Research done in 1m 12s · 14 sources · 6 searches" — the line a learner reads when it lands.
 *
 * 🔴 THE SAME THREE NUMBERS THE REPORT'S OWN FOOTER CARRIES, so the notice and the document cannot
 * disagree about what happened. What it deliberately does NOT say is "23 citations" the way the
 * reference tool does: our count is SOURCES, and a source cited by four sentences is one source
 * here and four citations there. Reporting the bigger number would flatter the run.
 */
export function researchSummaryLine(report: ResearchReport): string {
  const seconds = Math.max(1, Math.round(report.stats.elapsedMs / 1000));
  const took = seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  // Both forms spelled out. "search" does not pluralise by adding an s, and the version of this
  // that appended one and then patched the result with string replacement was worse than the
  // problem it solved.
  const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  return [
    `Research done in ${took}`,
    count(report.sources.length, "source", "sources"),
    count(report.stats.searched, "search", "searches"),
  ].join(" · ");
}

/** A short title for the library, from the question. Questions make poor filenames; this keeps the
 *  first clause and drops the question mark. */
export function reportTitle(question: string): string {
  const cleaned = question.trim().replace(/\s+/g, " ").replace(/[?.!]+$/, "");
  const firstClause = cleaned.split(/[,:;]/)[0] ?? cleaned;
  const chosen = firstClause.length >= 20 ? firstClause : cleaned;
  return chosen.slice(0, 110).trim() || "Research";
}
