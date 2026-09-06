"use client";

import { phCapture } from "./posthog";

// Funnel milestones that fire once per browser. The flag lives in localStorage so a reload
// or a second canvas does not count as a second "first".

export type FirstEvent = "first_source_added" | "first_turn_sent";

const FLAG: Record<FirstEvent, string> = {
  first_source_added: "nemesis.ph.first_source",
  first_turn_sent: "nemesis.ph.first_turn",
};

export function captureFirst(event: FirstEvent, properties?: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  try {
    if (window.localStorage.getItem(FLAG[event])) return;
    window.localStorage.setItem(FLAG[event], new Date().toISOString());
  } catch {
    return;
  }
  phCapture(event, properties);
}
