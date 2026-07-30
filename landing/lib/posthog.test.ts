import { describe, expect, it } from "vitest";

import { isReportingHostname } from "./posthog";

// The gate that decides whether a page view is real traffic or noise. Getting it wrong in
// either direction is expensive: too loose and preview deploys inflate production numbers,
// too tight and the live site reports nothing while looking fine.
describe("isReportingHostname", () => {
  it("reports from the live marketing and app hosts", () => {
    // Both must pass, or the www -> app funnel is only half instrumented.
    expect(isReportingHostname("www.enternemesis.com")).toBe(true);
    expect(isReportingHostname("app.enternemesis.com")).toBe(true);
  });

  it("reports from the bare apex domain", () => {
    expect(isReportingHostname("enternemesis.com")).toBe(true);
  });

  it("stays silent on localhost", () => {
    expect(isReportingHostname("localhost")).toBe(false);
    expect(isReportingHostname("127.0.0.1")).toBe(false);
  });

  it("stays silent on Vercel preview deploys", () => {
    // Every branch push gets one of these. They must never reach production analytics.
    expect(isReportingHostname("nemesis-git-some-branch.vercel.app")).toBe(false);
  });

  it("rejects look-alike domains", () => {
    // The reason the check is `.enternemesis.com` and not a bare endsWith: a bare suffix
    // match would accept the first of these and let someone else's site write into our data.
    expect(isReportingHostname("evil-enternemesis.com")).toBe(false);
    expect(isReportingHostname("notenternemesis.com")).toBe(false);
  });

  it("rejects a domain that merely contains ours as a prefix", () => {
    expect(isReportingHostname("enternemesis.com.attacker.net")).toBe(false);
  });
});
