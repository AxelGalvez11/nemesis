// Mission "report ready" email — PURE content builder (the send I/O lives in the research fn).
// Same discipline as watch-digest.ts: everything user-visible is built and tested here.

import type { MissionCadence } from "./missions.ts";

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export interface MissionEmailArgs {
  question: string;
  cadence: MissionCadence;
  reportTitle: string;
  sources: number;
  reportUrl: string;
  manageUrl: string;
}

export function buildMissionEmail(a: MissionEmailArgs): { subject: string; html: string; text: string } {
  const subjectFull = `Your ${a.cadence} research report is ready: ${a.question}`;
  const subject = subjectFull.length > 140 ? `${subjectFull.slice(0, 139)}…` : subjectFull;
  const srcLine = `${a.sources} sources reviewed and cited`;

  const text = [
    `Your ${a.cadence} research report is ready.`,
    ``,
    a.reportTitle,
    srcLine,
    ``,
    `Read it: ${a.reportUrl}`,
    ``,
    `Manage your scheduled research: ${a.manageUrl}`,
  ].join("\n");

  const html = [
    `<div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a">`,
    `<p style="color:#666;font-size:13px">Your ${esc(a.cadence)} research report is ready</p>`,
    `<h2 style="font-size:18px;margin:8px 0">${esc(a.reportTitle)}</h2>`,
    `<p style="font-size:14px;color:#444">${esc(srcLine)}.</p>`,
    `<p><a href="${esc(a.reportUrl)}" style="display:inline-block;background:#111;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-size:14px">Open the report</a></p>`,
    `<p style="font-size:12px;color:#888">You scheduled this research to repeat. <a href="${esc(a.manageUrl)}" style="color:#888">Pause or manage it here</a>.</p>`,
    `</div>`,
  ].join("");

  return { subject, html, text };
}
