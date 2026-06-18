// Thin Resend send wrapper (WS-D increment 6, email layer). Resend is the chosen provider (verified
// domain + API key are owner-gated). This is a minimal, injectable, fault-tolerant POST to the Resend
// API — it never throws (a send failure must not crash the digest sweep) and returns a small result the
// caller logs. DORMANT until RESEND_API_KEY + a verified from-address are configured.

export interface SendEmailArgs {
  apiKey: string;
  from: string; // e.g. "PharmaOrb <alerts@pharmaorb.app>" — must be a Resend-verified domain
  to: string;
  subject: string;
  html: string;
  text: string;
  /** List-Unsubscribe one-click header target (RFC 8058) — deliverability + compliance. */
  unsubscribeUrl?: string;
  fetchImpl?: (url: string, init: RequestInit) => Promise<Response>;
}

export interface SendEmailResult {
  ok: boolean;
  id?: string;
  error?: string;
}

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export async function sendEmail(args: SendEmailArgs): Promise<SendEmailResult> {
  const doFetch = args.fetchImpl ?? ((u, init) => fetch(u, init));
  const headers: Record<string, string> = {
    Authorization: `Bearer ${args.apiKey}`,
    "Content-Type": "application/json",
  };
  // RFC 8058 one-click unsubscribe — mailbox providers surface a native "Unsubscribe" button.
  if (args.unsubscribeUrl) {
    headers["List-Unsubscribe"] = `<${args.unsubscribeUrl}>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }
  try {
    const res = await doFetch(RESEND_ENDPOINT, {
      method: "POST",
      headers,
      body: JSON.stringify({ from: args.from, to: args.to, subject: args.subject, html: args.html, text: args.text }),
    });
    if (!res.ok) {
      const body = (await res.text()).slice(0, 200);
      console.warn(`watch-digest resend HTTP ${res.status}: ${body}`);
      return { ok: false, error: `HTTP ${res.status}` };
    }
    const json = await res.json().catch(() => ({}));
    return { ok: true, id: (json as { id?: string }).id };
  } catch (err) {
    console.warn("watch-digest resend error:", err instanceof Error ? err.message : err);
    return { ok: false, error: "network" };
  }
}
