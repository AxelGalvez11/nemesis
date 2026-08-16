"use client";

// Ask the student for one short string, in the product's own dialog.
//
// 🔴 THIS EXISTS TO DELETE `window.prompt` (owner 2026-08-15: "make sure all button popups have
// ui"). A native prompt is drawn by the operating system, in a system font, at a size and position
// nothing in the app controls — it cannot be themed, it announces the page's ORIGIN rather than the
// product, and Chrome and Firefox both let a user tick "prevent this page from creating additional
// dialogs", after which every call returns null instantly. That last part is the real defect: the
// button stays, the click still registers, and nothing happens, forever, with no error.
//
// 🔴 IT DELIBERATELY MIRRORS `useConfirm()` — same context-and-promise shape, same `.confirm-*`
// classes, same overlay. Two dialog systems in one product is how a rename comes to look unlike a
// delete; this is the SAME dialog with a field in it. The API is `await ask({...})`, so replacing a
// `window.prompt` call is a one-line change at the call site and the surrounding logic is untouched.

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

export interface PromptRequest {
  /** What is being asked for, as a title. "Rename this note" — not "Enter a value". */
  title: string;
  /** Optional supporting line, for when the field alone does not explain the rules. */
  body?: ReactNode;
  /** Prefilled value. A rename starts from the current name so the student edits rather than retypes. */
  initial?: string;
  placeholder?: string;
  /** Names the action, never "OK". */
  confirmLabel?: string;
  cancelLabel?: string;
  /**
   * Whether an empty string is a legitimate answer. Default false, which disables the confirm
   * button until something is typed. "Move to folder" sets it true, because blank genuinely means
   * "the library root" there — a rule the old prompt communicated only inside its message text.
   */
  allowEmpty?: boolean;
}

type Ask = (request: PromptRequest) => Promise<string | null>;

const PromptContext = createContext<Ask | null>(null);

/** Resolves to the trimmed string, or null if the student cancelled — Escape, Cancel and a click
 *  outside all resolve null, so `if (value === null) return` reads exactly like the prompt it
 *  replaces. An empty-but-allowed answer resolves to "", which is NOT null and must stay distinct. */
export function usePrompt(): Ask {
  const ask = useContext(PromptContext);
  if (!ask) throw new Error("usePrompt() needs <PromptProvider> above it — it is mounted in app/layout.tsx.");
  return ask;
}

export function PromptProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<PromptRequest | null>(null);
  const [value, setValue] = useState("");
  const resolveRef = useRef<((answer: string | null) => void) | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const settle = useCallback((answer: string | null) => {
    const resolve = resolveRef.current;
    resolveRef.current = null;
    setRequest(null);
    setValue("");
    resolve?.(answer);
  }, []);

  const ask = useCallback<Ask>((next) => {
    // A second ask while one is open would strand the first promise forever, and a promise that
    // never settles is a handler that stops half-done with nothing on screen to say so. Answer the
    // old one "cancelled" and move on — the same rule the confirm dialog follows.
    resolveRef.current?.(null);
    resolveRef.current = null;
    setRequest(next);
    setValue(next.initial ?? "");
    return new Promise<string | null>((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  // Focus and select on open. Selecting matters for a rename: the student almost always wants to
  // replace the name rather than append to it, and a prefilled field with the caret at the end
  // makes them clear it by hand first.
  useEffect(() => {
    if (!request) return;
    const id = requestAnimationFrame(() => inputRef.current?.select());
    return () => cancelAnimationFrame(id);
  }, [request]);

  const trimmed = value.trim();
  const submittable = request?.allowEmpty ? true : trimmed.length > 0;

  return (
    <PromptContext.Provider value={ask}>
      {children}
      {request ? (
        <div className="confirm-overlay" onClick={() => settle(null)} role="presentation">
          <form
            aria-labelledby="nemesis-prompt-title"
            aria-modal="true"
            className="confirm-card"
            // Stops a click on the card itself counting as a click-away cancel.
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === "Escape") settle(null);
            }}
            onSubmit={(event) => {
              event.preventDefault();
              if (submittable) settle(trimmed);
            }}
            role="dialog"
          >
            <h3 className="confirm-title" id="nemesis-prompt-title">{request.title}</h3>
            {request.body ? <p className="confirm-body">{request.body}</p> : null}
            <input
              aria-label={request.title}
              className="prompt-field"
              onChange={(event) => setValue(event.target.value)}
              placeholder={request.placeholder}
              ref={inputRef}
              value={value}
            />
            <div className="confirm-actions">
              <button className="confirm-cancel" onClick={() => settle(null)} type="button">
                {request.cancelLabel ?? "Cancel"}
              </button>
              {/* 🔴 NOT AUTOFOCUSED, UNLIKE THE CONFIRM'S CANCEL. There the safe answer should be
                  the one a reflex keypress gives; here the student came to type, so the field takes
                  focus and Enter submits it. Disabled until there is something to submit, rather
                  than accepting blank and creating an untitled thing they then have to find. */}
              <button className="confirm-del" disabled={!submittable} type="submit">
                {request.confirmLabel ?? "Save"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </PromptContext.Provider>
  );
}
