/**
 * The Lab's one-way mirror — Nemesis Lab §10.
 *
 * 🔴🔴 THE ONLY PRODUCTION CODE THE LAB IS ALLOWED TO ADD IS A REPORT. The owner's rule is that the
 * Lab may have special OBSERVABILITY and must never have special parsing or special teaching. This
 * module is the whole of that permission: production calls `labTrace(...)` at points where a fact
 * exists, and by default nothing is listening and nothing happens.
 *
 * Four properties make that claim true rather than merely intended:
 *
 *   1. **No subscribers, no work.** `labTrace` returns on its first line when the subscriber set is
 *      empty, which is every production request. Nothing is allocated, nothing is stringified.
 *   2. **The payload is a THUNK.** Callers pass `() => ({ … })`, so building the detail object — the
 *      wire messages, the model's answer, the evidence row — costs nothing when nobody is watching.
 *      A plain object argument would be constructed on every production turn.
 *   3. **It cannot throw into the caller.** Every subscriber runs inside `try/catch`. A broken debug
 *      panel must never be able to break a learner's turn.
 *   4. **It imports nothing from the runtime.** No canvas types, no supabase client, no React. A
 *      cycle here would put the debug sink inside the module graph of the thing it observes.
 *
 * 🔴 AND IT IS CALIBRATED IN BOTH DIRECTIONS. `trace.test.ts` proves that a traced function behaves
 * identically with tracing off AND that the trace actually fires when on. A sink that silently never
 * fires looks exactly like a system doing nothing wrong — an empty timeline in the debug panel and
 * a working product are indistinguishable — and that is this repo's most repeated failure shape.
 */

/** What kind of fact this is. The debug panel groups a turn by these. */
export type LabTraceKind =
  /** A call to the model, through `postChatCompletion` — the one door every model call uses. */
  | "model_call"
  /** Which knowledge this canvas resolved, and from what. */
  | "knowledge"
  /** The teaching controller's decision, and the context it read. */
  | "controller"
  /** The question put in front of the learner. */
  | "prompt"
  /** The evaluator's verdict on an answer. */
  | "judge"
  /** A row written to `learner_evidence`, and whether the write succeeded. */
  | "evidence"
  /** The learner's projected state, before and after. */
  | "learner_state"
  /** Anything that does not fit the above and is still worth seeing. */
  | "note";

export interface LabTraceEvent {
  /** Monotonic within a page load, so the panel can order events that share a millisecond. */
  seq: number;
  at: number;
  kind: LabTraceKind;
  /** A short human line. The panel shows this; `detail` is behind a disclosure. */
  label: string;
  /** How long the thing took, when the caller measured it. Absent means nobody timed it. */
  ms?: number;
  detail: Record<string, unknown>;
}

type Listener = (event: LabTraceEvent) => void;

const listeners = new Set<Listener>();
let seq = 0;

/** Is anything listening? Callers may use this to skip work the thunk cannot defer. */
export function labTraceOn(): boolean {
  return listeners.size > 0;
}

/**
 * Listen. Returns the unsubscribe.
 *
 * 🔴 CALLED ONLY FROM `/dev/lab`, WHICH 404s IN PRODUCTION. That is what keeps the set empty
 * everywhere else — the gate is enforced by there being no other caller, and `trace.test.ts`
 * asserts the sink is inert with no subscribers rather than trusting that.
 */
export function subscribeLabTrace(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Drop every listener. For tests, and for a panel unmounting under React strict mode. */
export function resetLabTrace(): void {
  listeners.clear();
}

/**
 * Record a fact, if anyone is watching.
 *
 * `detail` is a function on purpose — see the header. `ms` is optional and must be omitted rather
 * than zeroed when nothing measured it.
 */
export function labTrace(
  kind: LabTraceKind,
  label: string,
  detail: () => Record<string, unknown>,
  ms?: number,
): void {
  if (listeners.size === 0) return;
  let event: LabTraceEvent;
  try {
    seq += 1;
    event = { at: Date.now(), detail: detail(), kind, label, seq, ...(ms === undefined ? {} : { ms }) };
  } catch (cause) {
    seq += 1;
    event = {
      at: Date.now(),
      detail: { error: cause instanceof Error ? cause.message : String(cause) },
      kind,
      label: `${label} (the trace payload itself failed to build)`,
      seq,
    };
  }
  for (const listener of listeners) {
    try {
      listener(event);
    } catch {
      // A debug panel that throws must not take a learner's turn down with it.
    }
  }
}
