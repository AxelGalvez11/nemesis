import { Fragment, cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";

// Word-by-word reveal for a freshly-arrived answer (the ChatGPT "typing in" feel).
//
// We deliberately do NOT stream from the server: the safety scanner + citation enforcer rewrite the
// WHOLE answer before it is allowed out, so there are no safe intermediate tokens to stream. Instead
// we take the finished, validated answer and reveal it word-by-word on the client, purely with CSS.
// Each word becomes an inline-block <span class="rv-w"> with an increasing animation-delay, so the
// text fades in left-to-right. Whitespace is left as plain text so normal line-wrapping still works;
// emphasis wrappers (<strong>/<em>/<code>) are recursed into so their words reveal in sequence too;
// and the caller spends a delay slot (revealDelay) on each citation chip so a chip never appears
// before the sentence it cites.
//
// The reveal plays ONCE, on first mount of the new turn: CSS animations don't restart on re-render
// (React reuses the DOM nodes), and the page marks only the just-arrived turn as revealable — so
// reopened/saved chats and historical turns render instantly. A prefers-reduced-motion guard in CSS
// turns the whole thing off for users who ask for less motion.

export interface RevealCtx {
  /** Running word index, mutated as words/chips are emitted during a single render pass. */
  i: number;
  /** ms before the first word appears. */
  base: number;
  /** ms between consecutive words. */
  step: number;
}

/** A fresh counter for one answer. base/step tuned so a typical answer reads as a brisk, smooth
 *  type-in (~55 words/sec) without dragging on long answers. */
export function newRevealCtx(base = 40, step = 18): RevealCtx {
  return { i: 0, base, step };
}

/** The next sequential delay (ms), then advance the counter. Used for words AND citation chips so
 *  both share one continuous timeline. */
export function revealDelay(ctx: RevealCtx): number {
  const d = ctx.base + ctx.i * ctx.step;
  ctx.i += 1;
  return d;
}

/** Wrap every word in `node` in an animated span with a sequential delay. Returns `node` unchanged
 *  shape for non-text leaves. Recurses into arrays and emphasis elements. */
export function wrapWords(node: ReactNode, ctx: RevealCtx): ReactNode {
  if (typeof node === "string") return splitString(node, ctx);
  if (node === null || node === undefined || typeof node === "boolean" || typeof node === "number") return node;
  if (Array.isArray(node)) return node.map((n, i) => <Fragment key={i}>{wrapWords(n, ctx)}</Fragment>);
  if (isValidElement(node)) {
    const el = node as ReactElement<{ children?: ReactNode }>;
    return cloneElement(el, undefined, wrapWords(el.props.children, ctx));
  }
  return node;
}

function splitString(s: string, ctx: RevealCtx): ReactNode {
  if (!s) return s;
  // Keep whitespace runs as their own (unwrapped) parts so words remain separate, line-wrappable tokens.
  return s.split(/(\s+)/).map((part, i) => {
    if (part === "" || /^\s+$/.test(part)) return <Fragment key={i}>{part}</Fragment>;
    return (
      <span key={i} className="rv-w" style={{ animationDelay: `${revealDelay(ctx)}ms` }}>
        {part}
      </span>
    );
  });
}
