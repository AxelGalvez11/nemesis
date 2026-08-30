"use client";

// The Canvas surface — the product's primary page.
//
// Two states, one route:
//   /learn            the home: one composer, and the learner's sessions below it
//   /learn?c=<id>     that session
//
// 🔴 THIS IS THE FRONT DOOR, AND IT IS NO LONGER ALSO THE LIBRARY (§L, owner 2026-08-13).
//
// It used to say: "THE HOME IS ALSO THE LIBRARY. There is no /library navigation item any more."
// That is stale. `/library` is a destination in the sidebar again, and the distinction is an
// object model rather than a change of mind:
//
//   this page  →  LEARN. The minimal composer, "What do you want to learn?", with upload,
//                 record and dictate. The canvas is created automatically once the learner
//                 starts, and lands in `Unfiled` for them to file later.
//   /library   →  FIND AND ORGANISE what you have already learned. Its primary objects are
//                 CANVASES, and a folder organises canvases — not the pile of raw documents
//                 the old Library managed, which is the thing that was actually retired.
//
// So "a second page showing the same information a different way" is still the rule; Library
// now shows a different object, which is why it comes back rather than being reinstated.
//
// What has NOT changed: the learner's canvases still appear below the composer here. Scrolling
// down from the front door still works; it is no longer the ONLY way to find things, because a
// rail that grows with history optimises for recovering a conversation rather than for managing
// bodies of knowledge.
//
// Inside the (workspace) group on purpose: sign-in, the two-factor guard and the upgrade
// dialog all come from the shell, and — decisively — the whole `--ui-*` token layer is scoped
// under the `[data-workspace]` attribute the shell stamps. A route outside the group would
// have no design system at all.

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { useAuth } from "@/components/AuthProvider";
import { CanvasHome } from "@/components/workspace/learn/canvas-home";
import { LearningCanvas } from "@/components/workspace/learn/learning-canvas";
import { COMPOSER_CAPABILITIES, type ComposerCapability } from "@/lib/learn/composer-capability";
import { learnEntryFrom, learnSurface } from "@/lib/learn/learn-entry";
import { policyOverrideFrom } from "@/lib/learn/policy-override";
import { strategyOverrideFrom } from "@/lib/learn/teaching-strategy";

function LearnSurface() {
  // A canvas is addressable by `?c=<id>` rather than by path segment. The original reason is now
  // stale and is recorded rather than deleted, because the shape of it still applies: the shell
  // used to suppress the nav rail on an exact-pathname match, so `/learn/[id]` "would silently get
  // the sidebar back".
  //
  // 🔴 `/learn` IS NO LONGER AN IMMERSIVE ROUTE. Suppressing the rail also suppressed its reopen
  // toggle, so the Canvas offered no way to reach Library, Calendar or Stats at all. The rail now
  // starts COLLAPSED everywhere instead, which is quiet in the same way without being a dead end —
  // and, usefully, that behaviour no longer depends on the pathname, so a future `/learn/[id]`
  // would inherit it correctly rather than breaking it.
  const params = useSearchParams();
  // 🔴 WHICH SURFACE THIS IS, AS A VALUE — see lib/learn/learn-entry.ts. Two separate features now
  // hang off the same answer (§38.1 hides the rail inside a canvas, §38.2 makes the `×` the only
  // way out of one), and as inline conditions here neither could be enumerated over the entry
  // paths a learner actually arrives by.
  const entry = learnEntryFrom(params);
  const surface = learnSurface(entry);
  const canvasId = entry.c;
  const ask = entry.ask;
  // The staged capability from the front door, validated against the real list — an invented
  // `?cap=` value is nobody's declaration and reads as none. `learn-entry.ts` deliberately keeps
  // the raw string; which names are real is composer-capability.ts's fact, checked here.
  const openingCapability = (COMPOSER_CAPABILITIES as readonly string[]).includes(entry.cap ?? "")
    ? (entry.cap as ComposerCapability)
    : null;
  // What the URL is still allowed to say about the teaching-policy runtime: stop it, or bypass
  // ownership deliberately. Neither is an opt-in — see policy-override.ts, where the rules live and
  // are tested, rather than as an expression here that nothing could assert.
  //
  // 🔴 DELIBERATELY NOT AN ENVIRONMENT VARIABLE. This file is a client component, so a flag here
  // would have to be `NEXT_PUBLIC_*`, which Next inlines at BUILD time — turning "emergency
  // rollback" into a redeploy, against a Vercel account with a daily build cap.
  const policyOverride = policyOverrideFrom(params.get("policy"));
  // WHICH TEACHING CONTROLLER RUNS — the internal development switch, and the only way to reach the
  // baseline arm today.
  //
  //     ?teacher=nemesis_policy   the structured cognition engine. Also the default.
  //     ?teacher=llm_teacher      the same model, given an adaptive-teaching objective, choosing.
  //
  // 🔴 NOT EXPOSED TO LEARNERS, AND "NOT EXPOSED" MEANS THERE IS NO CONTROL — no toggle, no menu, no
  // setting. Contract §27 rules that a learner must not keep deciding which engine to invoke, and a
  // visible arm picker would be exactly that, dressed as an experiment. Someone who does not type
  // this parameter cannot reach the baseline, and nothing on screen tells them it exists.
  //
  // 🔴 A QUERY PARAMETER RATHER THAN AN ENVIRONMENT FLAG, FOR THE REASON DIRECTLY ABOVE AND ONE MORE.
  // `NEXT_PUBLIC_*` is inlined at BUILD time, so switching arms would cost a redeploy against a
  // daily build cap — but worse, it would be global: every session on the deployment would move at
  // once, and two arms that never run concurrently cannot be compared against each other's cohort.
  // A parameter is per-session, which is what an experiment needs.
  //
  // 🔴 IT IS AN OVERRIDE, NOT THE ASSIGNMENT MECHANISM. Random assignment is built and switched off
  // (`resolveStrategy`'s `randomise`); this is how a developer exercises an arm deliberately, and it
  // is recorded as `assignedBy: "override"` so a later analysis can exclude hand-picked sessions
  // from a randomised result.
  const strategyOverride = strategyOverrideFrom(params.get("teacher"));
  const { session } = useAuth();

  // `?new=1` — a canvas the learner has already started by dropping material on the front door.
  // It carries no id because there is nothing to carry yet: `useCanvasSession(null)` mints the
  // canvas, and the files are claimed from the handoff once it exists. Without this the router
  // would land back on the landing page and the files would sit unclaimed until something else
  // took them. (`learnSurface` reads it; the constant lives with the other entry parameters.)

  // No canvas named, nothing asked and nothing started: this is the landing surface.
  if (surface === "home")
    return <CanvasHome accessToken={session?.access_token ?? null} userId={session?.user.id ?? null} />;
  // 🔴 EVERY OTHER ENTRY PATH LANDS HERE, AND `LearningCanvas` RENDERS `CanvasSurface`, WHICH
  // RENDERS THE `×` WITH NO CONDITION AROUND IT. That chain is what makes §38.2 true for a deep
  // link, a hard refresh, a return from sign-in, a topic, dropped material and the processing
  // state alike — rather than six places each remembering to include an exit.
  return (
    <LearningCanvas
      canvasId={canvasId}
      openingAsk={ask}
      openingCapability={openingCapability}
      openingFolder={entry.folder}
      policyOverride={policyOverride}
      strategyOverride={strategyOverride}
    />
  );
}

export default function LearnPage() {
  return (
    <Suspense fallback={<main className="h-full bg-(--ui-bg-editor)" />}>
      <LearnSurface />
    </Suspense>
  );
}
