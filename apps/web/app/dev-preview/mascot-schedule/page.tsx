"use client";

// DEV-ONLY PREVIEW — what the character does now, what it would do, side by side and running.
//
// Owner, 2026-08-26: *"it's missing some animations and expressions"* → *"You pick, show me before
// it goes live"*. This is that page. Every character below is the real `NemesisAvatar` playing a
// real catalogue animation at real speed, wearing the real squircle, so what is approved here is
// what would ship.
//
// 🔴 IT DRAWS FROM `lib/character/schedule-proposal.ts` RATHER THAN FROM A LIST OF ITS OWN. A
// preview whose rows are typed out separately from the proposal is a picture of a different
// proposal, and the difference would show up only after somebody said yes to it.
//
// Same convention as the other dev-preview routes: plain client page, no auth gate, not linked
// from navigation, nothing the product ships imports it.

import { useEffect, useState } from "react";

import { NemesisAvatar } from "@/components/avatar/nemesis-avatar";
import { useTheme } from "@/components/theme-provider";
import { characterInk } from "@/lib/accent";
import { CHARACTER_SILHOUETTE } from "@/lib/character/body";
import { PROPOSAL, RESTING_FACES, RESTING_FACES_LEFT_OUT } from "@/lib/character/schedule-proposal";

const SIZE = 76;

function Character({ animation }: { animation: string }) {
  // 🔴 THE PRODUCT'S INK, NOT THE CATALOGUE'S. `DEFAULT_AVATAR` is Strobi and Strobi is BLUE, so a
  // preview that passes no colour shows the owner fourteen blue characters and asks him to approve
  // the behaviour of a black one. Same call `canvas-thinking.tsx` makes.
  const { accent, theme } = useTheme();
  return (
    <NemesisAvatar
      accent={accent}
      animation={animation}
      facing="forward"
      ink={characterInk(accent, theme === "dark")}
      silhouette={CHARACTER_SILHOUETTE}
      size={SIZE}
      track
    />
  );
}

/** One proposed change: what plays now on the left, what would play on the right. */
function Row({ row }: { row: (typeof PROPOSAL)[number] }) {
  return (
    <li className="grid grid-cols-[auto_1fr] gap-5 rounded-2xl border border-(--ui-stroke-secondary) p-5 sm:grid-cols-[auto_auto_1fr]">
      <figure className="flex w-24 shrink-0 flex-col items-center gap-2">
        <div className="flex h-[76px] items-center justify-center">
          {row.today ? <Character animation={row.today} /> : <span className="text-xs text-(--ui-text-quaternary)">nothing</span>}
        </div>
        <figcaption className="text-center text-[0.7rem] text-(--ui-text-tertiary)">
          now
          <br />
          <span className="text-(--ui-text-quaternary)">{row.today ?? "cannot happen"}</span>
        </figcaption>
      </figure>
      <figure className="flex w-24 shrink-0 flex-col items-center gap-2">
        <div className="flex h-[76px] items-center justify-center">
          <Character animation={row.proposed} />
        </div>
        <figcaption className="text-center text-[0.7rem] font-medium text-(--ui-text-secondary)">
          would be
          <br />
          <span className="text-(--ui-text-tertiary)">{row.proposed}</span>
        </figcaption>
      </figure>
      <div className="min-w-0">
        <h3 className="text-sm font-medium text-(--ui-text-primary)">{row.when}</h3>
        <p className="mt-2 text-sm leading-relaxed text-(--ui-text-secondary)">{row.because}</p>
      </div>
    </li>
  );
}

/**
 * The second question: a different face each time it rests.
 *
 * Runs the same rhythm the landing page uses — hold a face, change to another — so what is being
 * approved is the real pace rather than a grid of stills.
 */
function RestingCycle() {
  const [at, setAt] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setAt((n) => n + 1), 4200);
    return () => window.clearInterval(timer);
  }, []);
  const face = RESTING_FACES[at % RESTING_FACES.length]!;
  return (
    <figure className="flex items-center gap-6 rounded-2xl border border-(--ui-stroke-secondary) p-5">
      <Character animation={face} />
      <figcaption className="text-sm text-(--ui-text-secondary)">
        Resting, wearing <span className="font-medium text-(--ui-text-primary)">{face}</span>. It changes
        every few seconds, through {RESTING_FACES.length} of the sixteen faces. Left out:{" "}
        {RESTING_FACES_LEFT_OUT.join(" and ")} — the only two a learner can read as being aimed at them.
      </figcaption>
    </figure>
  );
}

export default function MascotSchedulePage() {
  // data-workspace: outside it, the legacy stylesheet repaints every button as an accent pill —
  // same opt-out the app shell and the other dev-preview boards use.
  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-10 px-8 py-14" data-workspace="">
      <header>
        <h1 className="text-lg font-medium text-(--ui-text-primary)">What the character does, and when</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-(--ui-text-secondary)">
          The character can do 52 things. The app plays three of them, and all three are still
          pictures rather than animations, which is why it looks like it is not doing anything. Each
          row below is one moment in the app: on the left is what it does today, on the right what
          it would do. Nothing here is live yet.
        </p>
      </header>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-medium text-(--ui-text-primary)">The eight moments</h2>
        <ul className="flex flex-col gap-3">
          {PROPOSAL.map((row) => (
            <Row key={row.activity} row={row} />
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-medium text-(--ui-text-primary)">A separate question: a different face at rest</h2>
        <p className="max-w-2xl text-sm leading-relaxed text-(--ui-text-secondary)">
          The rows above all tie a face to something that is actually happening. This one does not:
          it is the trick the front page uses, where the character simply wears a different
          expression every few seconds. It would make it noticeably more alive, and it would be the
          one thing it does that does not mean anything. Worth deciding on its own.
        </p>
        <RestingCycle />
      </section>
    </main>
  );
}
