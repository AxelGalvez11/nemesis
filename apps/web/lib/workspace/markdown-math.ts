const CODE_SPAN_OR_BLOCK = /(```[\s\S]*?```|`[^`\n]*`)/g;

export function normalizeMathDelimiters(markdown: string): string {
  return markdown
    .split(CODE_SPAN_OR_BLOCK)
    .map((segment, index) => {
      if (index % 2 === 1) return segment;
      return segment
        .replace(/\\\[([\s\S]*?)\\\]/g, (_match, body: string) => `\n$$\n${body.trim()}\n$$\n`)
        // Double-dollar inline, not single: chat renders with single-dollar
        // math OFF (so "$0.20 … $1.20" prices stay prose), and `$$x$$` is
        // the inline form remark-math still honors in that mode. Notes keep
        // single-dollar math on, where $$…$$ inline is equally valid.
        .replace(/\\\(([\s\S]*?)\\\)/g, (_match, body: string) => `$$${body.trim()}$$`);
    })
    .join("");
}
