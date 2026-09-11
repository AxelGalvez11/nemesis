/**
 * Buttons, menu items and tabs in the Space frontend's markup that nothing handles: a tag with role="button",
 * role="menuitem" or role="tab" (or a MenuItem or ToggleItem) with no onClick, onMouseDown or onPointerDown of its own.
 * A control whose parent handles the click counts too, so the number is a ratchet for space-ready.test.ts rather than a
 * verdict on each control.
 */
export function deadControls(src: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < src.length; i++) {
    if (src[i] !== "<" || !/[a-zA-Z$]/.test(src[i + 1] ?? "")) continue;
    let j = i + 1;
    let depth = 0;
    let quote: string | null = null;
    for (; j < src.length; j++) {
      const c = src[j]!;
      if (quote) {
        if (c === quote && src[j - 1] !== "\\") quote = null;
        continue;
      }
      if (depth > 0 && (c === "'" || c === "`")) {
        quote = c;
        continue;
      }
      if (c === "$" && src[j + 1] === "{") {
        depth++;
        j++;
        continue;
      }
      if (c === "{" && depth > 0) {
        depth++;
        continue;
      }
      if (c === "}" && depth > 0) {
        depth--;
        continue;
      }
      if (c === '"' && depth === 0) {
        quote = c;
        continue;
      }
      if (c === ">" && depth === 0) break;
      if (c === "\n" && depth === 0 && j - i > 4000) break;
    }
    const tag = src.slice(i, j + 1);
    const interactive = /role="(button|menuitem|tab)"/.test(tag) || /^<\$\{(MenuItem|ToggleItem)\}/.test(tag);
    if (interactive && !/on(Click|MouseDown|PointerDown)=/.test(tag)) out.push(tag.slice(0, 90).replace(/\s+/g, " "));
  }
  return out;
}
