"use client";

// One styled confirmation dialog, for everything that removes something.
//
// WHY THIS EXISTS (owner 2026-07-29: "make sure any delete options have a ui
// popup"). Confirmations were already there — fifteen of them — but every one
// was `window.confirm`, the browser's own grey box. It ignores the theme, it
// says the origin at the top like a security warning, its buttons are in the
// OS order rather than ours, and on some browsers it is a sheet that covers the
// thing you are trying to decide about. AppShell had already replaced ONE of
// them with a styled card; this is that card, extracted so the other fourteen
// can stop being the odd ones out.
//
// WHY A PROMISE RATHER THAN DIALOG STATE. `window.confirm` is synchronous, so
// every call site reads:
//
//     if (!window.confirm("…")) return;
//
// A React dialog is not synchronous, and the usual conversion — hoist the
// pending item into state, move the rest of the handler into the dialog's
// onConfirm — rewrites the control flow of all fifteen and is where the bugs
// would come from. Handing back a promise keeps each call site one line and the
// same shape:
//
//     if (!(await confirm({ … }))) return;
//
// The styling deliberately reuses .confirm-* from app/styles/shell.css (loaded
// globally in app/layout.tsx) rather than introducing a second look — this IS
// the dialog AppShell was already showing.

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

export interface ConfirmRequest {
  /** The question, as a question. "Delete this deck?" — not "Are you sure". */
  title: string;
  /** What happens, and whether it can be undone. Optional, but nearly always
   *  worth saying: the title asks, this is what the answer costs. */
  body?: ReactNode;
  /** Names the action rather than agreeing with the question — "Delete", not
   *  "OK". A button that says what it does is the last chance to notice. */
  confirmLabel?: string;
  cancelLabel?: string;
  /**
   * 🔴 A STATEMENT, NOT A QUESTION — this is what replaces `window.alert`. There is nothing to
   * decline, so the cancel button is dropped and the remaining one is neutral rather than
   * destructive: a lone red "Delete" on a message that says "Added 3 sources" reads as a threat.
   * Escape and a click outside still dismiss, because an acknowledgement the student cannot
   * dismiss with the key they already use everywhere else is a trap.
   */
  acknowledge?: boolean;
}

type Ask = (request: ConfirmRequest) => Promise<boolean>;

const ConfirmContext = createContext<Ask | null>(null);

/** Ask the student to confirm. Resolves true only if they press the confirm
 *  button — Escape, the Cancel button and a click outside all resolve false. */
export function useConfirm(): Ask {
  const ask = useContext(ConfirmContext);
  if (!ask) throw new Error("useConfirm() needs <ConfirmProvider> above it — it is mounted in app/layout.tsx.");
  return ask;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const resolveRef = useRef<((confirmed: boolean) => void) | null>(null);

  const settle = useCallback((confirmed: boolean) => {
    const resolve = resolveRef.current;
    resolveRef.current = null;
    setRequest(null);
    resolve?.(confirmed);
  }, []);

  const ask = useCallback<Ask>((next) => {
    // A second ask while one is open would strand the first promise forever,
    // and a promise that never settles is a handler that stops half-done with
    // nothing on screen to say so. Answer the old one "no" and move on.
    resolveRef.current?.(false);
    resolveRef.current = null;
    setRequest(next);
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      {request ? (
        <div className="confirm-overlay" onClick={() => settle(false)} role="presentation">
          <div
            aria-describedby={request.body ? "nemesis-confirm-body" : undefined}
            aria-labelledby="nemesis-confirm-title"
            aria-modal="true"
            className="confirm-card"
            // Stops a click on the card itself counting as a click-away cancel.
            onClick={(event) => event.stopPropagation()}
            // Bubbles up from the autofocused button below, so Escape works
            // without the dialog having to grab focus for itself.
            onKeyDown={(event) => {
              if (event.key === "Escape") settle(false);
            }}
            role="alertdialog"
          >
            <h3 className="confirm-title" id="nemesis-confirm-title">{request.title}</h3>
            {request.body ? <p className="confirm-body" id="nemesis-confirm-body">{request.body}</p> : null}
            <div className="confirm-actions">
              {/* Cancel is autofocused, so the safe answer is the one Enter and
                  Escape both give. Destructive actions should take a deliberate
                  click, never a reflex keypress. */}
              {request.acknowledge ? null : (
                <button autoFocus className="confirm-cancel" onClick={() => settle(false)} type="button">
                  {request.cancelLabel ?? "Cancel"}
                </button>
              )}
              <button
                autoFocus={request.acknowledge}
                className={request.acknowledge ? "confirm-cancel" : "confirm-del"}
                onClick={() => settle(true)}
                type="button"
              >
                {request.confirmLabel ?? (request.acknowledge ? "OK" : "Delete")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </ConfirmContext.Provider>
  );
}
