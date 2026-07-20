const CODE_SPAN_OR_BLOCK = /(```[\s\S]*?```|`[^`\n]*`)/g;

export function normalizeMathDelimiters(markdown: string): string {
  return markdown
    .split(CODE_SPAN_OR_BLOCK)
    .map((segment, index) => {
      if (index % 2 === 1) return segment;
      return segment
        .replace(/\\\[([\s\S]*?)\\\]/g, (_match, body: string) => `\n$$\n${body.trim()}\n$$\n`)
        .replace(/\\\(([\s\S]*?)\\\)/g, (_match, body: string) => `$${body.trim()}$`);
    })
    .join("");
}
