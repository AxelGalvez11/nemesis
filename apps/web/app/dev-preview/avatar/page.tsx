"use client";

// Every animation, playing, on any body.
//
// This is the whole point of `lib/avatar`: not a tool for making animations, but the 23
// finished ones, running. Pick a body along the top and the same set plays on it.

import { useState } from "react";

import { NemesisAvatar, avatarLoopMs } from "@/components/avatar/nemesis-avatar";
import { ANIMATIONS, AVATARS, DEFAULT_AVATAR, type Avatar } from "@/lib/avatar";

import "./avatar-preview.css";

const label = (id: string): string =>
  id.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());

export default function AvatarPreviewPage() {
  const [avatar, setAvatar] = useState<Avatar>(DEFAULT_AVATAR);
  const [big, setBig] = useState<string>("thinking");

  return (
    <main className="apv">
      <header className="apv-head">
        <h1>Avatar</h1>
        <p>
          {ANIMATIONS.length} animations on {AVATARS.length} bodies. Everything below is
          running — nothing here is a still.
        </p>
      </header>

      <section className="apv-stage">
        <div className="apv-stage-art">
          <NemesisAvatar animation={big} avatar={avatar} size={280} label={label(big)} />
        </div>
        <div className="apv-stage-meta">
          <span className="apv-now">{label(big)}</span>
          <span className="apv-sub">
            {(avatarLoopMs(big) / 1000).toFixed(1)}s loop · {avatar.name}
          </span>
        </div>
      </section>

      <section className="apv-section">
        <h2>Body</h2>
        <div className="apv-bodies">
          {AVATARS.map((a) => (
            <button
              key={a.id}
              type="button"
              className={`apv-chip${a.id === avatar.id ? " is-on" : ""}`}
              onClick={() => setAvatar(a)}
            >
              <NemesisAvatar animation="idle" avatar={a} size={44} frozenAt={900} />
              <span>{a.name}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="apv-section">
        <h2>Animations</h2>
        <div className="apv-grid">
          {ANIMATIONS.map((a, i) => (
            <button
              key={a.id}
              type="button"
              className={`apv-cell${a.id === big ? " is-on" : ""}`}
              onClick={() => setBig(a.id)}
            >
              {/* Staggered, so twenty-three of them do not blink in unison. */}
              <NemesisAvatar animation={a.id} avatar={avatar} size={92} offsetMs={i * 617} />
              <span className="apv-name">{label(a.id)}</span>
              <span className="apv-len">{(avatarLoopMs(a.id) / 1000).toFixed(1)}s</span>
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
