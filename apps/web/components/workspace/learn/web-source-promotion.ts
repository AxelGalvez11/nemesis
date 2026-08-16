/**
 * Turn the page reader's response into a durable-source attachment without mixing provenance into
 * the material itself. The URL is metadata; prepending it to `content` would create a synthetic
 * assertion that the knowledge extractor could mistake for something the page taught.
 */
export function prepareWebSourcePromotion(input: {
  requestedUrl: string;
  returnedUrl?: string;
  text: string;
  title?: string;
}): { content: string; fileName: string; sourceUrl: string } {
  const sourceUrl = input.returnedUrl?.trim() || input.requestedUrl.trim();
  return {
    content: input.text,
    fileName: `${(input.title?.trim() || sourceUrl).slice(0, 120)}.md`,
    sourceUrl,
  };
}
