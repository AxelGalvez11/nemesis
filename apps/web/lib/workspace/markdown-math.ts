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
/** `\pi`, `\approx`, `\frac`. Letters that belong to LaTeX rather than to English. */
const CONTROL_SEQUENCE = /\\[A-Za-z]+/g;

/**
 * Does what sits between two `$` read as a sentence rather than as a formula?
 *
 * 🔴🔴🔴 THE TEST USED TO BE "DOES IT CONTAIN A LETTER", AND THAT BROKE MOST OF SCHOOL MATHS.
 * A variable IS a letter, and so is every LaTeX command, so `$0 < r < \pi/2$` was read as a price
 * and escaped: written correctly, by a model doing exactly what the contract asks of it, and shown
 * to the learner as raw source. The owner photographed one on 2026-08-25. `$0 \le x \le 1$`,
 * `$2 \pi r$` and `$5 \times 10^3$` all failed the same way, and the file's own "known limit" about
 * `$5 \text{kg}$` was this bug seen from one angle.
 *
 * 🔴 WHY THE OLD RULE ONLY EVER FAILED AFTER A SPACE. `$2x` survived because the letter touches the
 * digit and `MATHS_AFTER_DIGITS` catches it. Put one space in, and every formula beginning with a
 * number fell through to the letter test.
 *
 * Three structural questions, no subject matter anywhere:
 *
 *   1. take the LaTeX commands out, because their letters are notation, not words
 *   2. anything left with `^`, `_` or a brace in it is maths, full stop
 *   3. of what remains, a run of TWO OR MORE letters is an English word; single letters are
 *      variables. Words mean prose, which means the `$` opened a price
 *
 * So `0.87 to ` has the word "to" and is money, while `0 < r < \pi/2` has only `r` and is maths.
 *
 * 🔴 IT ALSO KEEPS THE ONE THING TODAY GETS RIGHT BY ACCIDENT. A model that wraps a whole SENTENCE
 * in `$…$` (measured in production: `$0 < r < \pi/2: z rises smoothly to its maximum…$`) still
 * reads as prose here, because the sentence is full of words. Rendering that as a formula would run
 * every word together into one italic smear; leaving it as text is ugly but readable, and readable
 * is the better of two bad outcomes.
 */
function readsAsProse(span: string): boolean {
  const notation = span.replace(CONTROL_SEQUENCE, " ");
  if (/[\^_{}]/.test(notation)) return false;
  return /\p{L}{2,}/u.test(notation);
}

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
 * Otherwise the span itself decides, and `readsAsProse` explains how.
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
        if (inside !== undefined && !readsAsProse(inside)) return match;
        return "\\$";
      });
    })
    .join("");
}
