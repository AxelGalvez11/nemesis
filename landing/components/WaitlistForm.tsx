"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { getSupabase } from "@/lib/supabase";
import { submitWaitlist, type WaitlistResult } from "@/lib/waitlist";

type Status = "idle" | "submitting" | "success" | "invalid" | "error";

interface WaitlistFormProps {
  /** Centers the form + helper copy (used by the CTA section). */
  centered?: boolean;
  /** Helper copy under the form (varies between hero and CTA in the design). */
  note?: string;
}

/**
 * Email-capture form styled with the design's `.wform` / `.winput` / `.wbtn` classes and
 * wired to the REAL Supabase waitlist backend. Used twice (hero `#waitlist` + CTA); state
 * is React-driven so the two instances never share DOM ids.
 */
export function WaitlistForm({
  centered = false,
  note = "We'll email you when the beta opens. No spam, ever.",
}: WaitlistFormProps) {
  const [email, setEmail] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const successRef = useRef<HTMLParagraphElement>(null);

  // Move focus to the confirmation when the form is replaced, so keyboard / AT users aren't
  // dropped to <body> after a successful submit.
  useEffect(() => {
    if (status === "success") successRef.current?.focus();
  }, [status]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (status === "submitting") return;
    setStatus("submitting");

    let result: WaitlistResult;
    try {
      // Adapter: supabase-js rpc() returns a thenable builder, not a plain Promise — await it
      // here and hand submitWaitlist the minimal { error } shape it depends on. getSupabase()
      // is called ONLY here (lazy; it throws if env is missing, so it must never run at
      // module load or during render).
      result = await submitWaitlist(email, honeypot, {
        rpc: async (fn, args) => {
          const { error } = await getSupabase().rpc(fn, args);
          return { error };
        },
      });
    } catch {
      result = { ok: false, reason: "error" };
    }

    if (result.ok) setStatus("success");
    else setStatus(result.reason === "invalid_email" ? "invalid" : "error");
  }

  if (status === "success") {
    return (
      <p
        ref={successRef}
        tabIndex={-1}
        role="status"
        className="wsuccess"
        style={centered ? { textAlign: "center" } : undefined}
      >
        You&rsquo;re on the list. We&rsquo;ll email you when the beta opens. ✓
      </p>
    );
  }

  const showError = status === "invalid" || status === "error";

  return (
    <>
      <form
        className="wform"
        onSubmit={onSubmit}
        noValidate
        style={centered ? { justifyContent: "center" } : undefined}
      >
        {/* Honeypot — visually hidden, not tab-reachable; bots that fill it get a silent no-op. */}
        <input
          type="text"
          name="company"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
          style={{
            position: "absolute",
            left: "-9999px",
            height: 0,
            width: 0,
            opacity: 0,
          }}
        />
        <input
          className="winput"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          aria-label="Email address"
          aria-invalid={showError}
          placeholder="you@example.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (showError) setStatus("idle");
          }}
        />
        <button
          className="wbtn"
          type="submit"
          disabled={status === "submitting"}
          aria-busy={status === "submitting"}
        >
          {status === "submitting" ? "Joining…" : "Join the waitlist"}
        </button>
      </form>
      <p className="wnote" style={centered ? { textAlign: "center" } : undefined}>
        {note}
      </p>
      {showError && (
        <p
          role="alert"
          style={{
            fontSize: "12px",
            color: "var(--mint)",
            marginTop: "10px",
            ...(centered ? { textAlign: "center" } : {}),
          }}
        >
          {status === "invalid"
            ? "Please enter a valid email."
            : "Something went wrong. Please try again."}
        </p>
      )}
    </>
  );
}
