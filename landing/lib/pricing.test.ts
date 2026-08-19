// The marketing site's prices, checked against the application's.
//
// 🔴 THIS GUARD EXISTS BECAUSE THE NUMBER LIVES TWICE. The landing site has no
// dependency on @nemesis/shared, so its constants are a hand copy. Reading the
// shared module's SOURCE here is what gives the copy a causal link to the
// original: change one and this fails by name.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  annualPerMonthCents,
  annualSavingPercent,
  formatUsdCents,
  INTERVALS,
  NEMESIS_ANNUAL_CENTS,
  NEMESIS_MONTHLY_CENTS,
} from "./pricing";

function sharedConstant(name: string): number {
  const source = readFileSync(
    join(import.meta.dirname, "..", "..", "packages", "shared", "src", "plan.ts"),
    "utf8",
  );
  const match = source.match(new RegExp(`export const ${name} = ([0-9_]+);`));
  if (!match) throw new Error(`${name} not found in packages/shared/src/plan.ts`);
  return Number(match[1].replaceAll("_", ""));
}

describe("the marketing site charges what the application charges", () => {
  it("monthly matches the shared constant", () => {
    expect(NEMESIS_MONTHLY_CENTS).toBe(sharedConstant("NEMESIS_MONTHLY_CENTS"));
    expect(NEMESIS_MONTHLY_CENTS).toBe(1_999);
  });

  it("annual matches the shared constant", () => {
    expect(NEMESIS_ANNUAL_CENTS).toBe(sharedConstant("NEMESIS_ANNUAL_CENTS"));
    expect(NEMESIS_ANNUAL_CENTS).toBe(19_999);
  });
});

describe("what the cards say", () => {
  it("shows $19.99 a month and $16.67 a month", () => {
    expect(formatUsdCents(NEMESIS_MONTHLY_CENTS)).toBe("$19.99");
    expect(formatUsdCents(annualPerMonthCents())).toBe("$16.67");
  });

  it("claims a 17% saving, from the real prices", () => {
    expect(annualSavingPercent()).toBe(17);
    expect(NEMESIS_MONTHLY_CENTS * 12 - NEMESIS_ANNUAL_CENTS).toBe(3_989);
  });

  it("never shows a per-month figure without the real annual charge", () => {
    const annual = INTERVALS.find((option) => option.id === "annual");
    expect(annual?.perMonth).toBe("$16.67");
    expect(annual?.billedAs).toContain("$199.99");
  });

  it("never says two months free", () => {
    for (const option of INTERVALS) {
      expect(`${option.label} ${option.billedAs}`.toLowerCase()).not.toContain("months free");
    }
  });
});
