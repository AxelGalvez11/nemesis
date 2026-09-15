// Relative-time formatting and project-tree flattening — PURE, no React, no I/O.
// Split out of AppDrawer.tsx/canvases.ts rather than folded into either: the drawer already had
// a short "5m/3h/2d" formatter, and the Projects page (docs/design/ios-web-parity-2026-09.md
// item 8) wants ChatGPT's longer "3 weeks ago" phrasing for the same timestamp — two call sites,
// one small pure module, one test file, instead of guessing which existing file should grow it.

import type { ProjectNode } from "./canvases.ts";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;
const MONTH_MS = 30 * DAY_MS;
const YEAR_MS = 365 * DAY_MS;

/** Compact stamp for a list row: "now", "5m", "3h", "2d", then a calendar date once
 *  it's a week old — the drawer's canvas rows (unchanged from the old chat rows). */
export function shortRelativeTime(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const ms = Math.max(0, now - then);
  if (ms < MINUTE_MS) return "now";
  if (ms < HOUR_MS) return `${Math.round(ms / MINUTE_MS)}m`;
  if (ms < DAY_MS) return `${Math.round(ms / HOUR_MS)}h`;
  if (ms < WEEK_MS) return `${Math.round(ms / DAY_MS)}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** ChatGPT-style "3 weeks ago" stamp — the Projects page's row style. Caps out at years
 *  rather than running the week count past a year unreadably high. */
export function longRelativeTime(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const ms = Math.max(0, now - then);
  const unit = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"} ago`;
  if (ms < MINUTE_MS) return "just now";
  if (ms < HOUR_MS) return unit(Math.round(ms / MINUTE_MS), "minute");
  if (ms < DAY_MS) return unit(Math.round(ms / HOUR_MS), "hour");
  if (ms < WEEK_MS) return unit(Math.round(ms / DAY_MS), "day");
  if (ms < MONTH_MS) return unit(Math.round(ms / WEEK_MS), "week");
  if (ms < YEAR_MS) return unit(Math.round(ms / MONTH_MS), "month");
  return unit(Math.round(ms / YEAR_MS), "year");
}

export interface FlatProject {
  node: ProjectNode;
  /** Nesting steps below a root project — 0 for a root. */
  depth: number;
}

/**
 * Every project in the tree, parents before their children, depth-first — what "Add to
 * project" needs (the web offers every project by name, not just the top level). `buildProjects`
 * already sorted each level by recency; this walk keeps that order rather than re-sorting.
 */
export function flattenProjects(nodes: readonly ProjectNode[], depth = 0): FlatProject[] {
  const out: FlatProject[] = [];
  for (const node of nodes) {
    out.push({ depth, node });
    out.push(...flattenProjects(node.children, depth + 1));
  }
  return out;
}
