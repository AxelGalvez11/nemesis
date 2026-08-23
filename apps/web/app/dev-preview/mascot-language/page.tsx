"use client";

// DEV-ONLY PREVIEW — the mascot's own animation language, on one board.
//
// Owner 2026-08-23: *"build it and show it to me so that I can verify it."* This page is the
// showing. The still row holds every face the language has, frozen at its characteristic
// instant; the live pair proves the parts that only exist in motion — the gaze the glasses
// ride, and the poke cycle (jump-and-squish → brow waggle → spin → sigma → wink).
//
// Same convention as the other dev-preview routes: plain client page, no auth gate, not
// linked from navigation, nothing the product ships imports it.

import { BloubBot } from "@/components/bloub/bloub-bot";
import { BloubDock } from "@/components/bloub/bloub-dock";
import { usePoke } from "@/components/bloub/use-poke";
import { POSES, type StateId } from "@/lib/bloub/states";
import type { FaceId } from "@/lib/character/face";

function Still({ caption, face, state = "idle" }: { caption: string; face?: FaceId; state?: StateId }) {
  return (
    <figure className="flex flex-col items-center gap-3">
      <BloubBot face={face ?? null} frozenAt={POSES[state] ?? 1} size={168} state={state} />
      <figcaption className="text-xs text-(--ui-text-secondary)">{caption}</figcaption>
    </figure>
  );
}

function LivePokeable() {
  const poke = usePoke("idle");
  return (
    <figure className="flex flex-col items-center gap-3">
      <div
        className={
          poke.motion === "jump" ? "bloub-jump" : poke.motion === "spin" ? "bloub-spin" : undefined
        }
      >
        <BloubBot
          face={poke.face}
          onPoke={poke.poke}
          size={148}
          state={poke.state}
          track
          waggle={poke.motion === "waggle"}
        />
      </div>
      <figcaption className="text-xs text-(--ui-text-secondary)">
        jump · waggle · spin · sigma · wink
      </figcaption>
      {/* The character itself is clickable, exactly as in the product; the button is for
          reviewing on touchpads and for driving the cycle from tests. */}
      <button
        className="rounded-lg border border-(--ui-stroke-secondary) px-3 py-1 text-xs text-(--ui-text-secondary) hover:bg-(--ui-control-hover-background)"
        data-poke
        onClick={poke.poke}
        type="button"
      >
        Poke
      </button>
    </figure>
  );
}

export default function MascotLanguagePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-12 px-8 py-14">
      <header>
        <h1 className="text-lg font-medium text-(--ui-text-primary)">The mascot&apos;s own language</h1>
        <p className="mt-1 text-sm text-(--ui-text-secondary)">
          One creature, one ink. Everything below is body, eyes, brows, mouth — nothing borrowed,
          nothing bolted on.
        </p>
      </header>

      <section className="flex flex-wrap items-end gap-10">
        <Still caption="Rest" />
        <Still caption="Wink" state="wink" />
        <Still caption="Reading — glasses" face="reading" />
        <Still caption="Sigma" face="sigma" />
      </section>

      <section className="flex flex-wrap items-end gap-10">
        <figure className="flex flex-col items-center gap-3">
          <BloubBot frozenAt={1} hand="point" size={168} state="idle" />
          <figcaption className="text-xs text-(--ui-text-secondary)">Pointing — hand prototype</figcaption>
        </figure>
        {/* The marks ride the dock, exactly as they do in the product — same colour rule,
            same counter-scaling. The "?" already ships; the "!" is here for approval. */}
        <figure className="flex flex-col items-center gap-3">
          <div className="relative h-44 w-44">
            <BloubDock bottom={28} contain left={44} marker="?" state="idle" />
          </div>
          <figcaption className="text-xs text-(--ui-text-secondary)">Asking — the ? it already wears</figcaption>
        </figure>
        <figure className="flex flex-col items-center gap-3">
          <div className="relative h-44 w-44">
            <BloubDock bottom={28} contain left={44} marker="!" state="idle" />
          </div>
          <figcaption className="text-xs text-(--ui-text-secondary)">Heads-up — the ! (new, unwired)</figcaption>
        </figure>
      </section>

      <section className="flex flex-wrap items-end gap-14">
        <LivePokeable />
        <figure className="flex flex-col items-center gap-3">
          <BloubBot face="reading" size={148} state="idle" track />
          <figcaption className="text-xs text-(--ui-text-secondary)">
            Reading, live — the glasses ride the gaze. Move your cursor.
          </figcaption>
        </figure>
      </section>
    </main>
  );
}
