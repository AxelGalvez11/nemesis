// One-line plain-text preview of a card's front for list rows. Cards now
// carry markdown emphasis, math, images, and inline sub/sup HTML — none of
// which should appear as raw syntax in Browse and picker lists.

import { stripClozeMarkers } from "./study-ai-extras";

export function cardListPreview(front: string): string {
  return stripClozeMarkers(front)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "[picture]")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<\/?(?:sub|sup|u)>/gi, "")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}
