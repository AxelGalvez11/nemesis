"use client";

// What is waiting, under the composer on the front door.
//
// Owner's build order, workstream D: *"Opening Nemesis shows the state of your studying: forty
// cards due, a canvas you left half finished, an exam in nine days. One tap into any of it."*
//
// 🔴🔴 IT DRAWS NOTHING WHEN THERE IS NOTHING, AND THAT IS THE DESIGN RATHER THAN AN EDGE CASE.
// §19 asks for an interface that almost disappears and §4 forbids a second onboarding screen; a
// panel reporting "0 cards due" every morning is both of those violated at once, and it trains
// the learner to stop looking at the one surface meant to bring them back. `isQuiet` decides,
// and the front door renders nothing at all.
//
// 🔴🔴 IT REPORTS, IT NEVER RECOMMENDS. Rows are counts and facts. There is no "start here", no
// ordering by what Nemesis thinks matters, and no badge competing for attention — deciding what
// to do next is the teaching policy's job (§18, §26), and a front-door widget that steered the
// session would be §38's banned mode selector wearing a dashboard's face.
//
// 🔴 THE COMPOSER STAYS THE PRIMARY THING. This sits UNDER it, quiet, in meta-sized type. Someone
// arriving to type a question must not have to look past a wall of status to find the box.

import { useEffect, useState } from "react";

import { EMPTY_TODAY, isQuiet, loadToday, whenPhrase, type Today } from "@/lib/learn/today";

export function TodayStrip({ uid }: { uid: string | null }) {
  const [today, setToday] = useState<Today>(EMPTY_TODAY);
  // 🔴 NEVER RENDER BEFORE THE READ LANDS. Painting "nothing waiting" and then popping three rows
  // in a moment later is worse than a beat of nothing: the front door would visibly change shape
  // under someone already reaching for the composer.
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const next = await loadToday(uid);
      if (!alive) return;
      setToday(next);
      setLoaded(true);
    })();
    return () => {
      alive = false;
    };
  }, [uid]);

  if (!loaded || isQuiet(today)) return null;

  return (
    <section
      aria-label="What is waiting"
      className="mx-auto mt-8 flex w-full max-w-xl flex-col gap-1"
    >
      {today.cardsDue > 0 && (
        <Row
          detail={`${today.cardsDue} card${today.cardsDue === 1 ? "" : "s"}`}
          href="/library"
          label="Ready to review"
        />
      )}

      {today.unfinished.map((canvas) => (
        // 🔴 `?c=`, WHICH IS `learn-entry.ts`'s OWN PARAM NAME. `?canvas=` reads better and is
        // simply ignored: `learnSurface` would send the learner to the home surface they were
        // already on, which looks like a dead link rather than a wrong one.
        <Row detail={canvas.title} href={`/learn?c=${canvas.id}`} key={canvas.id} label="Left unfinished" />
      ))}

      {/* 🔴 NOT A LINK. A date the learner mentioned has nowhere to go — there is no "exam" object
          in this product — and a row that looks pressable and does nothing is this codebase's
          most-repeated defect. It is here to be READ. */}
      {today.dates.map((date) => (
        <div className="flex items-baseline gap-2 px-3 py-1.5" key={date.id}>
          <span className="shrink-0 text-[length:var(--canvas-text-meta)] text-(--ui-text-quaternary)">
            {whenPhrase(date.inDays) || "Coming up"}
          </span>
          <span className="min-w-0 flex-1 truncate text-[length:var(--canvas-text-meta)] text-(--ui-text-secondary)">
            {date.statement}
          </span>
        </div>
      ))}
    </section>
  );
}

/** 🔴 `bg-transparent` IS EXPLICIT — this app's stylesheet gives every anchor outside
 *  `[data-workspace]` a marketing treatment. Same reason `canvas-clarification.tsx` states it. */
function Row({ detail, href, label }: { detail: string; href: string; label: string }) {
  return (
    <a
      className="flex items-baseline gap-2 rounded-lg bg-transparent px-3 py-1.5 no-underline transition-colors hover:bg-(--ui-bg-tertiary)"
      href={href}
    >
      <span className="shrink-0 text-[length:var(--canvas-text-meta)] text-(--ui-text-quaternary)">{label}</span>
      <span className="min-w-0 flex-1 truncate text-[length:var(--canvas-text-meta)] text-(--ui-text-secondary)">
        {detail}
      </span>
    </a>
  );
}
