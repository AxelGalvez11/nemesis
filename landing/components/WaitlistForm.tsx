"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { getSupabase } from "@/lib/supabase";
import { submitWaitlist, type WaitlistResult } from "@/lib/waitlist";

type Status = "idle" | "submitting" | "success" | "invalid" | "error";

export function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const successRef = useRef<HTMLParagraphElement>(null);

  // Move focus to the confirmation when the form is replaced, so keyboard / AT users
  // aren't dropped to <body> after a successful submit.
  useEffect(() => {
    if (status === "success") successRef.current?.focus();
  }, [status]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (status === "submitting") return;
    setStatus("submitting");

    let result: WaitlistResult;
    try {
      // Adapter: supabase-js rpc() returns a thenable builder, not a plain Promise — await
      // it here and hand submitWaitlist the minimal { error } shape it depends on.
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
        className="rounded-xl border border-teal-600/30 bg-teal-50 px-4 py-3 text-sm font-medium text-teal-800 outline-none"
      >
        You&rsquo;re on the list. We&rsquo;ll email you when the beta opens.
      </p>
    );
  }

  const showError = status === "invalid" || status === "error";

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2 sm:flex-row" noValidate>
      {/* Honeypot — offscreen, hidden from humans; bots that fill it get a silent no-op. */}
      <input
        type="text"
        name="company"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        value={honeypot}
        onChange={(e) => setHoneypot(e.target.value)}
        className="absolute left-[-9999px] h-0 w-0 opacity-0"
      />
      <label htmlFor="email" className="sr-only">
        Email address
      </label>
      <input
        id="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        required
        aria-invalid={showError}
        aria-describedby={showError ? "email-error" : undefined}
        placeholder="you@example.com"
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
          if (showError) setStatus("idle");
        }}
        className="h-12 flex-1 rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-900 outline-none placeholder:text-slate-400 focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20"
      />
      <button
        type="submit"
        disabled={status === "submitting"}
        aria-busy={status === "submitting"}
        className="h-12 rounded-xl bg-teal-600 px-6 text-base font-medium text-white transition-colors hover:bg-teal-700 disabled:opacity-60"
      >
        {status === "submitting" ? "Joining…" : "Join the waitlist"}
      </button>
      {showError && (
        <p id="email-error" role="alert" className="basis-full text-sm text-red-600">
          {status === "invalid"
            ? "Please enter a valid email address."
            : "Something went wrong. Please try again."}
        </p>
      )}
    </form>
  );
}
