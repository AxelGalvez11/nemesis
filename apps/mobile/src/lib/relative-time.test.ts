// Deno unit tests (repo convention).
// Run: deno test --no-check --unstable-sloppy-imports --allow-read --allow-env apps/mobile/src/lib/relative-time.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { flattenProjects, longRelativeTime, shortRelativeTime, type FlatProject } from "./relative-time.ts";
import type { ProjectNode } from "./canvases.ts";

const NOW = new Date("2026-09-01T12:00:00.000Z").getTime();

function iso(msAgo: number): string {
  return new Date(NOW - msAgo).toISOString();
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

Deno.test("shortRelativeTime: now, minutes, hours, days, then a calendar date", () => {
  assertEquals(shortRelativeTime(iso(0), NOW), "now");
  assertEquals(shortRelativeTime(iso(5 * MIN), NOW), "5m");
  assertEquals(shortRelativeTime(iso(3 * HOUR), NOW), "3h");
  assertEquals(shortRelativeTime(iso(2 * DAY), NOW), "2d");
  assertEquals(shortRelativeTime(iso(9 * DAY), NOW), new Date(NOW - 9 * DAY).toLocaleDateString(undefined, { month: "short", day: "numeric" }));
  assertEquals(shortRelativeTime("not a date", NOW), "");
});

Deno.test("longRelativeTime: ChatGPT's 'N unit ago' phrasing, singular at 1", () => {
  assertEquals(longRelativeTime(iso(0), NOW), "just now");
  assertEquals(longRelativeTime(iso(1 * MIN), NOW), "1 minute ago");
  assertEquals(longRelativeTime(iso(5 * MIN), NOW), "5 minutes ago");
  assertEquals(longRelativeTime(iso(1 * HOUR), NOW), "1 hour ago");
  assertEquals(longRelativeTime(iso(3 * HOUR), NOW), "3 hours ago");
  assertEquals(longRelativeTime(iso(1 * DAY), NOW), "1 day ago");
  assertEquals(longRelativeTime(iso(2 * DAY), NOW), "2 days ago");
  assertEquals(longRelativeTime(iso(3 * WEEK), NOW), "3 weeks ago");
  assertEquals(longRelativeTime(iso(35 * DAY), NOW), "1 month ago");
  assertEquals(longRelativeTime(iso(400 * DAY), NOW), "1 year ago");
  assertEquals(longRelativeTime("not a date", NOW), "");
});

function node(over: Partial<ProjectNode> & { id: string; name: string }): ProjectNode {
  return {
    canvases: [],
    children: [],
    color: null,
    holdsPinned: false,
    icon: null,
    instructions: null,
    modifiedAt: "",
    pinnedAt: null,
    ...over,
  };
}

Deno.test("flattenProjects: depth-first, parent before children, depth counted from 0", () => {
  const tree: ProjectNode[] = [
    node({ id: "a", name: "A", children: [node({ id: "a1", name: "A1", children: [node({ id: "a1a", name: "A1a" })] })] }),
    node({ id: "b", name: "B" }),
  ];
  const flat: FlatProject[] = flattenProjects(tree);
  assertEquals(flat.map((f) => [f.node.id, f.depth]), [
    ["a", 0],
    ["a1", 1],
    ["a1a", 2],
    ["b", 0],
  ]);
});
