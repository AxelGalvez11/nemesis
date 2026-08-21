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

/** `$` opening a price: not already escaped, not the second half of `$$`, digits next. */
const CURRENCY_OPENER = /(?<![\\$])\$(?=\d)/g;
/** The amount itself — `$5`, `$0.87`, `$1,000.50`. */
const AMOUNT = /^\$\d[\d,]*(?:\.\d+)?/;
/** Right after the digits, any of these mean the `$` opened maths: `$2x$`, `$2^n$`, `$100$`. */
const MATHS_AFTER_DIGITS = /^[$A-Za-z\\^_{]/;
/** The run up to the next `$` on the same line, if there is one. */
const SPAN_TO_NEXT_DOLLAR = /^([^$\n]*)\$/;

/**
 * Escape the `$` in front of a price so single-dollar math cannot swallow it.
 *
 * 🔴 THIS IS THE ONLY THING STANDING BETWEEN A PRICE AND ITALICS ON A SURFACE THAT WANTS
 * `$k$` TO BE MATHS. remark-math pairs the next two `$` it sees, so "$0.87 to $3.96" becomes
 * one inline formula reading "0.87 to 3.96" — the owner sent that screenshot twice, in August
 * and again today. Turning single-dollar math off instead would take `$k$` and `$x^2$` away
 * from every learner working through kinetics or a proof, which is why the Canvas turned it on.
 *
 * The test is structural, never subject-matter: what follows the digits decides. A letter,
 * `\`, `^`, `_`, `{` or a closing `$` means someone opened maths; anything else means money.
 * A `$…$` span holding only digits and operators is maths too, so `$2 + 3$` survives — words
 * inside the span are what mark it as prose.
 *
 * Known limit: `$5 \text{kg}$` reads as money, because a space then a word is the shape of a
 * price. `$$…$$` renders in every mode and is the way to write that one.
 */
export function escapeCurrencyDollars(markdown: string): string {
  return markdown
    .split(CODE_SPAN_OR_BLOCK)
    .map((segment, index) => {
      if (index % 2 === 1) return segment;
      return segment.replace(CURRENCY_OPENER, (match, offset: number, whole: string) => {
        const rest = whole.slice(offset);
        const amount = AMOUNT.exec(rest);
        if (!amount) return match;
        const afterDigits = rest.slice(amount[0].length);
        if (MATHS_AFTER_DIGITS.test(afterDigits)) return match;
        const inside = SPAN_TO_NEXT_DOLLAR.exec(afterDigits)?.[1];
        if (inside !== undefined && !/[A-Za-z]/.test(inside)) return match;
        return "\\$";
      });
    })
    .join("");
}
