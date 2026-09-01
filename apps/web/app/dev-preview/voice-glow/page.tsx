"use client";

// DEV-ONLY PREVIEW — three candidate glows for the voice conversation, drawn on a replica of the
// composer pill.
//
// Owner, 2026-08-31: *"if you could maybe design a glow for the voice mode, that'd be nice. Could
// you maybe do a mock up for that? like, a couple of designs for that"*. Nothing on this page
// ships to the composer; the page IS the proposal. Three rules every candidate obeys:
//
//   1. The colour is `--ui-action`, the character's own accent, so every candidate follows the
//      mascot without a second colour appearing anywhere (the 2026-08-30 accent ruling).
//   2. The pill's geometry never changes: same radius, same height, same controls, same send
//      slot. A glow is a LAYER painted behind the capsule, never a restyle of it.
//   3. Candidate C opens no new microphone. It subscribes to the same `mic-level` channel the
//      dictation waveform already reads; this page feeds that channel deterministic,
//      speech-shaped levels (talk, pause, talk) exactly the way /dev-preview/waveform does.
//
// 🔴 THE COMET (B) ANIMATES A REGISTERED CUSTOM PROPERTY (`@property --vg-angle`). Without the
// registration the angle is a discrete custom property and the sweep would JUMP once per cycle
// instead of turning. Chrome and Safari 16.4+ interpolate it; this is a proposal page, not a
// shipping surface, so no fallback is drawn for older engines.

import { useEffect, useRef } from "react";

import { Codicon } from "@/components/desktop-ui/codicon";
import { publishMicLevel, resetMicLevel, subscribeMicLevel } from "@/lib/workspace/mic-level";

/** The composer capsule, frozen mid-listen: live transcript in the spoken treatment, one Stop. */
function ReplicaPill() {
  return (
    <div className="relative flex flex-col rounded-[var(--composer-radius)] bg-(--composer-fill) shadow-[var(--composer-edge)]">
      <div className="flex min-h-[var(--composer-min-height)] items-end gap-0 px-[var(--composer-pad-x)] py-[8px]">
        <div className="flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-full text-(--ui-text-tertiary)">
          <Codicon name="add" size="18px" />
        </div>
        <div className="ml-[12px] flex max-h-[78px] min-w-0 flex-1 items-end self-center overflow-hidden">
          <p className="w-full text-[length:var(--canvas-text-body)] italic leading-[26px] [color:color-mix(in_srgb,var(--ui-text-primary)_72%,transparent)]">
            okay so walk me through how the second part connects to what we covered yesterday
          </p>
        </div>
        <div className="ml-[8px] flex size-[var(--composer-control)] shrink-0 items-center justify-center rounded-full bg-(--ui-action) text-(--ui-bg-editor)">
          <Codicon name="primitive-square" size="16px" />
        </div>
      </div>
    </div>
  );
}

/** C. The glow that listens: level in from the shared meter, attack fast, release slow. */
function AliveGlow() {
  const layer = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let target = 0;
    let shown = 0;
    const off = subscribeMicLevel((level) => {
      target = level;
    });
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      // A word lights it instantly; a pause lets it breathe out instead of snapping dark. The
      // same asymmetry every audio meter uses, tuned so a sentence reads as one warm swell.
      shown = target >= shown ? target : Math.max(target, shown - dt * 1.4);
      const el = layer.current;
      if (el) {
        el.style.opacity = String(0.3 + shown * 0.7);
        el.style.boxShadow = [
          `0 0 ${(3 + shown * 4).toFixed(1)}px 1px color-mix(in srgb, var(--ui-action) 55%, transparent)`,
          `0 0 ${(14 + shown * 26).toFixed(1)}px ${(3 + shown * 8).toFixed(1)}px color-mix(in srgb, var(--ui-action) ${Math.round(24 + shown * 30)}%, transparent)`,
        ].join(", ");
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      off();
      cancelAnimationFrame(raf);
    };
  }, []);

  return <div aria-hidden className="pointer-events-none absolute inset-0 rounded-[var(--composer-radius)]" ref={layer} />;
}

function Candidate({ children, feel, name, tag }: { children: React.ReactNode; feel: string; name: string; tag: string }) {
  return (
    <section className="mb-16">
      <h2 className="mb-1 text-[length:var(--canvas-text-body)] font-semibold text-(--ui-text-primary)">
        {tag}. {name}
      </h2>
      <p className="mb-7 max-w-[560px] text-[length:var(--canvas-text-small)] leading-relaxed text-(--ui-text-secondary)">{feel}</p>
      <div className="relative w-[620px] max-w-full">{children}</div>
    </section>
  );
}

export default function VoiceGlowPreviewPage() {
  // The synthetic speaker: about two and a half seconds of talking, then a pause, on a loop, so
  // candidate C shows both of its states. Deterministic (no randomness), so two viewings agree.
  useEffect(() => {
    const started = performance.now();
    const meter = window.setInterval(() => {
      const t = (performance.now() - started) / 1000;
      const talking = t % 4 < 2.6;
      publishMicLevel(talking ? Math.min(1, 0.4 + 0.25 * Math.sin(t * 5.3) + 0.18 * Math.sin(t * 12.7)) : 0.02);
    }, 80);
    return () => {
      window.clearInterval(meter);
      resetMicLevel();
    };
  }, []);

  return (
    <main className="min-h-dvh bg-(--ui-bg-editor) px-16 py-14" data-workspace>
      <h1 className="mb-2 text-[length:var(--canvas-text-lead)] font-semibold text-(--ui-text-primary)">
        A glow for the voice conversation
      </h1>
      <p className="mb-12 max-w-[560px] text-[length:var(--canvas-text-small)] leading-relaxed text-(--ui-text-secondary)">
        Three candidates, each drawn on a replica of the pill mid-listen. Every one takes its
        colour from the accent, which is the character&apos;s own colour, so the glow follows the
        mascot automatically. None of them change the pill&apos;s shape, its buttons, or the send
        slot: the glow is a layer behind the capsule.
      </p>

      <Candidate
        feel="A soft halo swells and settles about every three seconds, whether or not anyone is talking. The calmest of the three: it reads as an open channel, a held breath."
        name="Breath"
        tag="A"
      >
        <div aria-hidden className="vg-breath pointer-events-none absolute inset-0 rounded-[var(--composer-radius)]" />
        <ReplicaPill />
      </Candidate>

      <Candidate
        feel="A point of light circles the rim for as long as the conversation is on. The most visible from the corner of your eye and the quietest at the centre: nothing behind the words ever moves."
        name="Comet"
        tag="B"
      >
        <div aria-hidden className="vg-comet pointer-events-none" />
        <ReplicaPill />
      </Candidate>

      <Candidate
        feel="The glow listens. Faint while the room is quiet, brighter the moment you speak, easing back when you pause. It reads the same level meter the dictation waveform already reads, so it costs no new microphone plumbing."
        name="Alive"
        tag="C"
      >
        <AliveGlow />
        <ReplicaPill />
      </Candidate>

      <p className="max-w-[560px] text-[length:var(--canvas-text-meta)] leading-relaxed text-(--ui-text-quaternary)">
        The words and levels on this page are synthetic; no microphone is opened. The pill is a
        replica, so nothing here can reach a real conversation.
      </p>

      <style>{`
        @property --vg-angle {
          syntax: "<angle>";
          inherits: false;
          initial-value: 0deg;
        }
        .vg-breath {
          box-shadow:
            0 0 3px 1px color-mix(in srgb, var(--ui-action) 55%, transparent),
            0 0 22px 4px color-mix(in srgb, var(--ui-action) 40%, transparent),
            0 0 46px 10px color-mix(in srgb, var(--ui-action) 22%, transparent);
          animation: vg-breath 2.8s ease-in-out infinite;
        }
        @keyframes vg-breath {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }
        .vg-comet {
          position: absolute;
          inset: -2.5px;
          border-radius: calc(var(--composer-radius) + 2.5px);
          padding: 2.5px;
          background: conic-gradient(
            from var(--vg-angle),
            transparent 0deg 208deg,
            color-mix(in srgb, var(--ui-action) 35%, transparent) 268deg,
            var(--ui-action) 322deg,
            color-mix(in srgb, white 25%, var(--ui-action)) 337deg,
            transparent 352deg 360deg
          );
          -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          -webkit-mask-composite: xor;
          mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          mask-composite: exclude;
          filter: drop-shadow(0 0 5px color-mix(in srgb, var(--ui-action) 55%, transparent));
          animation: vg-comet 2.6s linear infinite;
        }
        @keyframes vg-comet {
          to { --vg-angle: 360deg; }
        }
      `}</style>
    </main>
  );
}
