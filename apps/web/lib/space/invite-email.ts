import { escapeHtml } from "@/lib/email";

import type { InviteRole } from "./invite-request";

export interface InviteEmailInput {
  inviter: string | null;
  pageTitle: string;
  pageUrl: string;
  role: InviteRole;
}

const CAN: Record<InviteRole, string> = { full: "edit and share", edit: "edit", comment: "comment on", read: "read" };

/** The email a person gets when someone shares a page with them. It names the page and who shared it, nothing else. */
export function buildInviteEmail({ inviter, pageTitle, pageUrl, role }: InviteEmailInput): {
  subject: string;
  html: string;
  text: string;
} {
  const who = inviter?.trim() || "Someone";
  const title = pageTitle.trim() || "Untitled";
  const subject = `${who} shared "${title}" with you`;

  const text = [
    `${who} shared a page with you in Nemesis.`,
    ``,
    title,
    `You can ${CAN[role]} it.`,
    ``,
    `Open the page: ${pageUrl}`,
    `No account yet? Sign up with this email address and the page will be waiting.`,
    ``,
    `Nemesis`,
  ].join("\n");

  const html = `
  <div style="margin:0 auto;max-width:520px;padding:32px 24px;font-family:Arial,Helvetica,sans-serif;color:#16181d;">
    <p style="font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#8a2430;margin:0 0 16px;">Nemesis</p>
    <h1 style="font-size:22px;line-height:1.3;margin:0 0 16px;">${escapeHtml(who)} shared a page with you.</h1>
    <p style="font-size:15px;line-height:1.6;margin:0 0 12px;"><strong>${escapeHtml(title)}</strong></p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 12px;">You can ${CAN[role]} it.</p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 20px;">
      <a href="${escapeHtml(pageUrl)}" style="color:#8a2430;font-weight:bold;">Open the page</a>
    </p>
    <p style="font-size:14px;line-height:1.6;color:#5c616b;margin:0;">No account yet? Sign up with this email address and the page will be waiting.</p>
  </div>`;

  return { subject, html, text };
}
