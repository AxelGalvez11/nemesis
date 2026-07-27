export interface SlideDeckSlide {
  title: string;
  bullets: string[];
  speakerNotes: string;
}

/** Parse the markdown artifact written by both web and iOS slide tools.
 * Older notes without frontmatter or speaker notes remain readable. */
export function parseSlideDeck(markdown: string): SlideDeckSlide[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const slides: SlideDeckSlide[] = [];
  let current: SlideDeckSlide | null = null;
  let inNotes = false;

  const finish = () => {
    if (!current) return;
    current.speakerNotes = current.speakerNotes.trim();
    if (current.title && (current.bullets.length || current.speakerNotes)) slides.push(current);
  };

  for (const rawLine of lines) {
    const heading = rawLine.match(/^##\s+(?:\d+\.\s*)?(.+?)\s*$/);
    if (heading) {
      finish();
      current = { bullets: [], speakerNotes: "", title: heading[1]?.trim() ?? "" };
      inNotes = false;
      continue;
    }
    if (!current) continue;
    if (/^###\s+speaker notes\s*$/i.test(rawLine)) {
      inNotes = true;
      continue;
    }
    const bullet = rawLine.match(/^\s*[-*]\s+(.+?)\s*$/);
    if (bullet && !inNotes) {
      current.bullets.push(bullet[1]?.trim() ?? "");
      continue;
    }
    if (inNotes && rawLine.trim() && rawLine.trim() !== "---") {
      current.speakerNotes += `${current.speakerNotes ? "\n" : ""}${rawLine.trim()}`;
    }
  }
  finish();
  return slides;
}
