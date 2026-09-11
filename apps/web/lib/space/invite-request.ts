/** What a person gets on a shared page, in ws_permissions terms. */
export type InviteRole = "full" | "edit" | "comment" | "read";

export const INVITE_ROLES: readonly InviteRole[] = ["full", "edit", "comment", "read"];
export const MAX_INVITES = 20;

/** A share request as the invite route accepts it. */
export interface InviteRequest {
  page: string;
  emails: string[];
  role: InviteRole;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Splits what someone typed into the Share box into addresses; commas, semicolons, spaces and new lines all separate. */
export function splitEmails(typed: string): string[] {
  const seen = new Set<string>();
  for (const part of typed.split(/[\s,;]+/)) {
    const email = part.trim().toLowerCase();
    if (email) seen.add(email);
  }
  return [...seen];
}

/**
 * Checks a request body and returns the request, or the sentence to show. ws_invite checks everything again; this
 * answers the common mistakes without a trip to the database.
 */
export function parseInviteRequest(body: unknown): { ok: true; request: InviteRequest } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Send the page and the email addresses." };
  const { page, emails, role } = body as Record<string, unknown>;
  if (typeof page !== "string" || !UUID.test(page)) return { ok: false, error: "That page could not be found." };
  const typed = Array.isArray(emails) ? emails.filter((e): e is string => typeof e === "string") : typeof emails === "string" ? [emails] : [];
  const list = [...new Set(typed.flatMap(splitEmails))];
  if (!list.length) return { ok: false, error: "Add at least one email address." };
  if (list.length > MAX_INVITES) return { ok: false, error: `Invite up to ${MAX_INVITES} people at a time.` };
  const bad = list.find((email) => !EMAIL.test(email));
  if (bad) return { ok: false, error: `${bad} is not an email address.` };
  const chosen = role === undefined ? "edit" : role;
  if (typeof chosen !== "string" || !(INVITE_ROLES as readonly string[]).includes(chosen)) {
    return { ok: false, error: "Choose what they can do." };
  }
  return { ok: true, request: { page: page.toLowerCase(), emails: list, role: chosen as InviteRole } };
}
