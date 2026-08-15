import type { Metadata } from "next";

import { SiteChrome } from "@/components/SiteChrome";
import { Canvas } from "@/components/home/Canvas";
import { Intake } from "@/components/home/Intake";
import { LearnerModel } from "@/components/home/LearnerModel";
import { Tenets } from "@/components/home/Tenets";
import { Everything } from "@/components/home/Everything";

/**
 * Principles — the long form.
 *
 * These five sections used to sit on the homepage. They are accurate and worth
 * keeping; they were simply in the wrong place, because a first-time visitor
 * needs to know what Nemesis IS before they can care how it decides what to teach
 * next.
 *
 * They are moved here UNCHANGED rather than rewritten or deleted. A visitor who
 * follows "Tenets" out of the nav has explicitly asked for the detail, and the
 * detail is what they should get.
 */
export const metadata: Metadata = {
  title: "Principles — Nemesis",
  description:
    "How Nemesis decides what to teach next: the loop, what it reads, what it learns about you, and the tenets it holds to.",
};

export default function Principles() {
  return (
    <SiteChrome>
      <header className="phead">
        <div className="wrap">
          <h1>principles</h1>
          <p>
            How Nemesis decides what you should do next — the loop, what it reads, what it learns
            about you, and what it will not do.
          </p>
        </div>
      </header>

      <Canvas />
      <Intake />
      <LearnerModel />
      <Tenets />
      <Everything />
    </SiteChrome>
  );
}
