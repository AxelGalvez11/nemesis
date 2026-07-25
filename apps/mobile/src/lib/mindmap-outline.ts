// A mind map is stored as a markdown outline: one "# Topic" root heading, then
// nested "- " bullets. Pure helpers for reading that, kept out of the component so
// they can be tested (the test runner cannot load React Native).

/** How many nodes an outline holds — headings plus bullets.
 *
 *  Counted rather than guessed from the character length: the row's subtitle says
 *  "18 nodes", and a number shown to a student has to be the real one (the repo's
 *  standing rule that stats are computed, never estimated).
 *
 *  Blank lines, and stray prose a model may have left around the outline, are not
 *  nodes and are not counted. */
export function outlineNodes(outline: string): number {
  let count = 0;
  for (const line of outline.split(/\r?\n/)) {
    if (/^\s*#{1,6}\s+\S/.test(line)) count += 1;
    else if (/^\s*[-*+]\s+\S/.test(line)) count += 1;
  }
  return count;
}
