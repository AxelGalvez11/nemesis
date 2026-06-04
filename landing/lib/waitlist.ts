// Waitlist submission logic — kept pure and framework-free so it unit-tests with a mock
// client (no DOM / RTL toolchain). WaitlistForm wires this to the form inputs.

/** Pragmatic email-shape check; mirrors the server-side CHECK in 0121_waitlist.sql. */
export function isValidEmail(email: string): boolean {
  const trimmed = email.trim();
  if (trimmed.length === 0 || trimmed.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

export type WaitlistResult =
  | { ok: true }
  | { ok: false; reason: "invalid_email" | "error" };

/** The slice of the Supabase client submitWaitlist depends on (keeps it mockable). */
export interface WaitlistRpcClient {
  rpc(
    fn: "join_waitlist",
    args: { p_email: string },
  ): Promise<{ error: unknown }>;
}

export async function submitWaitlist(
  email: string,
  honeypot: string,
  client: WaitlistRpcClient,
): Promise<WaitlistResult> {
  // Honeypot: a hidden field no human fills. A bot that auto-fills it gets a silent
  // success and learns nothing. This is anti-naive-bot UX, NOT a security control —
  // join_waitlist is a public PostgREST endpoint; the server-side email CHECK +
  // ON CONFLICT DO NOTHING are the real gate.
  if (honeypot.trim() !== "") return { ok: true };

  if (!isValidEmail(email)) return { ok: false, reason: "invalid_email" };

  try {
    const { error } = await client.rpc("join_waitlist", { p_email: email.trim() });
    return error ? { ok: false, reason: "error" } : { ok: true };
  } catch {
    return { ok: false, reason: "error" };
  }
}
