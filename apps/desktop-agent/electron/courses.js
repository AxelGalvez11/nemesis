// Group generated decks into course workspaces. v0 infers the course from the source file's parent
// folder name (e.g. .../Pharmacology/lecture8.pdf -> "Pharmacology"), falling back to "Unsorted".
// This is the seed of the "school memory / course workspaces" idea — real, if simple.

const path = require("path");

function inferCourse(sourcePath, watchFolder) {
  try {
    if (watchFolder && sourcePath.startsWith(watchFolder)) {
      const rel = path.relative(watchFolder, sourcePath);
      const parts = rel.split(path.sep).filter(Boolean);
      if (parts.length > 1) return prettify(parts[0]); // first subfolder under the watch root
    }
    const parent = path.basename(path.dirname(sourcePath));
    if (parent && parent.toLowerCase() !== "downloads" && parent !== path.basename(watchFolder || "")) {
      return prettify(parent);
    }
  } catch (_) { /* fall through */ }
  return "Unsorted";
}

function prettify(name) {
  return String(name).replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 48) || "Unsorted";
}

/** Build the course->decks view from the state store's activity + processed records. PURE. */
function buildCourses(activity) {
  const byCourse = new Map();
  for (const a of activity || []) {
    if (a.status !== "generated") continue;
    const course = a.course || "Unsorted";
    if (!byCourse.has(course)) byCourse.set(course, { course, decks: [], cardTotal: 0 });
    const c = byCourse.get(course);
    c.decks.push({ deck: a.deck, source: a.source, cardCount: a.cardCount || 0, deckDir: a.deckDir, at: a.at });
    c.cardTotal += a.cardCount || 0;
  }
  return [...byCourse.values()].sort((a, b) => b.cardTotal - a.cardTotal);
}

module.exports = { inferCourse, buildCourses };
