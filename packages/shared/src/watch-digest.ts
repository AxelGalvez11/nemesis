// Same-day email digest of a user's LOUD watch alerts (WS-D increment 6) — PURE/deterministic, no I/O.
//
// Email is reserved for conclusion-movers: this builds a digest ONLY from loud alerts (new high-tier
// study | retraction). The quiet "what's new" feed and the walled "In the news — not verified evidence"
// list stay in-app and are NEVER emailed (news especially — an alert email must not carry unverified
// content). Returns null when a user has no new alerts this period, so the sender skips them rather than
// mailing an empty digest. The titles come from external sources, so the HTML body escapes them.
//
// The SEND + SCHEDULE of this digest is owner-gated (Resend account + verified domain + secret); this
// module is the deterministic, unit-tested content core the dormant sender will call once activated.

import { partitionWatchEvents, type WatchEvent } from "./watch-events.ts";

/** One watch's new events for this digest period (the edge fn groups a user's events by watch). */
export interface WatchDigestGroup {
  watchTitle: string;
  watchUrl?: string;
  events: readonly WatchEvent[];
}

export interface WatchDigestInput {
  groups: readonly WatchDigestGroup[];
  /** One-click unsubscribe target (CAN-SPAM); rendered in both bodies. */
  unsubscribeUrl: string;
  appName?: string;
}

export interface WatchDigest {
  subject: string;
  html: string;
  text: string;
  /** Total loud alerts across all watches. */
  alertCount: number;
  /** Number of watches that contributed at least one alert (the only ones shown). */
  watchCount: number;
}

const REASON_LABEL: Record<NonNullable<WatchEvent["alert_reason"]>, string> = {
  new_high_tier_study: "New high-tier study",
  retraction: "Retraction",
};

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;"),
  );
}

/** Only http(s) survives as a live href — event URLs come from external source APIs, so a javascript:/
 *  data: URI must never become a clickable link (escaping alone wouldn't neutralize the scheme). */
function safeHref(url: string): string {
  return /^https?:\/\//i.test(url) ? url : "#";
}

function reasonLabel(reason: WatchEvent["alert_reason"]): string {
  return reason ? REASON_LABEL[reason] : "Update";
}

interface DigestGroup {
  title: string;
  url?: string;
  alerts: WatchEvent[];
  otherCount: number; // quiet-feed items this period (a nudge to open the app), never listed
}

/**
 * Build the digest, or null when there is nothing loud to send. PURE: same events → same email.
 */
export function buildWatchDigest(input: WatchDigestInput): WatchDigest | null {
  const appName = input.appName ?? "Nemesis";

  const groups: DigestGroup[] = [];
  let alertCount = 0;
  for (const g of input.groups) {
    const { alerts, feed } = partitionWatchEvents(g.events); // news is dropped here — never emailed
    if (alerts.length === 0) continue; // only watches with a loud alert appear
    alertCount += alerts.length;
    groups.push({ title: g.watchTitle, url: g.watchUrl, alerts, otherCount: feed.length });
  }
  if (alertCount === 0) return null;

  const watchCount = groups.length;
  const subject = alertCount === 1
    ? `${appName}: 1 new alert on your watch`
    : `${appName}: ${alertCount} new alerts across ${watchCount} watch${watchCount === 1 ? "" : "es"}`;

  return {
    subject,
    text: renderText(appName, groups, input.unsubscribeUrl),
    html: renderHtml(appName, groups, input.unsubscribeUrl),
    alertCount,
    watchCount,
  };
}

function moreLine(otherCount: number): string | null {
  if (otherCount <= 0) return null;
  return `${otherCount} more update${otherCount === 1 ? "" : "s"} in your feed`;
}

function renderText(appName: string, groups: DigestGroup[], unsubscribeUrl: string): string {
  const lines: string[] = [`${appName} — what moved on your watches`, ""];
  for (const g of groups) {
    lines.push(g.title);
    for (const a of g.alerts) {
      lines.push(`  • [${reasonLabel(a.alert_reason)}] ${a.title}`);
      if (a.url) lines.push(`    ${a.url}`);
    }
    const more = moreLine(g.otherCount);
    if (more) lines.push(`  + ${more}`);
    lines.push("");
  }
  lines.push("These are evidence alerts only — your full feed and any news items live in the app.");
  lines.push(`Unsubscribe from these emails: ${unsubscribeUrl}`);
  return lines.join("\n");
}

function renderHtml(appName: string, groups: DigestGroup[], unsubscribeUrl: string): string {
  const blocks = groups.map((g) => {
    const title = g.url
      ? `<a href="${escapeHtml(safeHref(g.url))}" style="color:#0f172a;text-decoration:none">${escapeHtml(g.title)}</a>`
      : escapeHtml(g.title);
    const items = g.alerts.map((a) => {
      const label = `<strong>${escapeHtml(reasonLabel(a.alert_reason))}</strong>`;
      const text = a.url
        ? `<a href="${escapeHtml(safeHref(a.url))}" style="color:#0f172a">${escapeHtml(a.title)}</a>`
        : escapeHtml(a.title);
      return `<li style="margin:6px 0">${label} — ${text}</li>`;
    }).join("");
    const more = moreLine(g.otherCount);
    const moreHtml = more ? `<p style="margin:4px 0;color:#64748b;font-size:13px">+ ${escapeHtml(more)}</p>` : "";
    return `<div style="margin:0 0 20px">
      <h3 style="margin:0 0 8px;font-size:15px">${title}</h3>
      <ul style="margin:0;padding-left:18px">${items}</ul>
      ${moreHtml}
    </div>`;
  }).join("");

  return `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;max-width:560px;margin:0 auto;padding:24px">
    <h2 style="font-size:18px;margin:0 0 4px">${escapeHtml(appName)} — what moved on your watches</h2>
    <p style="color:#64748b;font-size:13px;margin:0 0 20px">Evidence alerts only. Your full feed and any news items live in the app.</p>
    ${blocks}
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0" />
    <p style="color:#94a3b8;font-size:12px;margin:0">
      <a href="${escapeHtml(unsubscribeUrl)}" style="color:#94a3b8">Unsubscribe from these emails</a>
    </p>
  </body></html>`;
}
