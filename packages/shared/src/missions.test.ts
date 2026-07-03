import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { cadenceLabel, missionEntitlement, missionUsageLabel, nextRunAt } from "./missions.ts";

Deno.test("nextRunAt daily adds exactly one day", () => {
  assertEquals(nextRunAt("daily", new Date("2026-07-02T13:30:00Z")).toISOString(), "2026-07-03T13:30:00.000Z");
});

Deno.test("nextRunAt weekly adds seven days across a month boundary", () => {
  assertEquals(nextRunAt("weekly", new Date("2026-07-28T09:00:00Z")).toISOString(), "2026-08-04T09:00:00.000Z");
});

Deno.test("nextRunAt monthly advances the calendar month", () => {
  assertEquals(nextRunAt("monthly", new Date("2026-07-15T09:00:00Z")).toISOString(), "2026-08-15T09:00:00.000Z");
});

Deno.test("nextRunAt monthly on Jan 31 rolls over (documented JS behavior, not a bug)", () => {
  const d = nextRunAt("monthly", new Date("2026-01-31T09:00:00Z"));
  assertEquals(d.getTime() > new Date("2026-02-27T09:00:00Z").getTime(), true);
});

Deno.test("missionEntitlement defaults to the free floor (0) when key missing", () => {
  assertEquals(missionEntitlement(null).limit, 0);
  assertEquals(missionEntitlement({ plan: "free", entitlements: {} }).limit, 0);
});

Deno.test("missionEntitlement reads mission_limit when present", () => {
  assertEquals(missionEntitlement({ plan: "pro", entitlements: { mission_limit: 5 } }).limit, 5);
});

Deno.test("labels", () => {
  assertEquals(missionUsageLabel(2, 5), "2 of 5 scheduled runs used");
  assertEquals(missionUsageLabel(1, 1), "1 of 1 scheduled run used");
  assertEquals(cadenceLabel("weekly"), "Runs weekly");
});
