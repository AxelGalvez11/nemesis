export interface SlidePreview {
  title: string;
  bullets: string[];
  speakerNotes: string;
}

/** Parse the markdown artifact emitted by create_slide_deck. Kept permissive so
 * older slide notes with no frontmatter or speaker notes still open. */
export function parseSlideDeck(markdown: string): SlidePreview[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const slides: SlidePreview[] = [];
  let current: SlidePreview | null = null;
  let inNotes = false;

  const finish = () => {
    if (!current) return;
    current.speakerNotes = current.speakerNotes.trim();
    slides.push(current);
  };

  for (const rawLine of lines) {
    const heading = rawLine.match(/^##\s+(?:\d+\.\s*)?(.+?)\s*$/);
    if (heading) {
      finish();
      current = { bullets: [], speakerNotes: "", title: heading[1].trim() };
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
      current.bullets.push(bullet[1].trim());
      continue;
    }
    if (inNotes && rawLine.trim() && rawLine.trim() !== "---") {
      current.speakerNotes += `${current.speakerNotes ? "\n" : ""}${rawLine.trim()}`;
    }
  }
  finish();
  return slides.filter((slide) => slide.title && (slide.bullets.length > 0 || slide.speakerNotes));
}
