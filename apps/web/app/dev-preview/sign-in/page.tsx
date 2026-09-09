"use client";

import { useId, useState } from "react";

import { NemesisMark } from "@/components/nemesis-mark";

import "./sana-signin.css";

/**
 * Sign-in, rebuilt on sana.ai/login's measured anatomy.
 *
 * Owner, 2026-09-09: "for the sign in, make sure it looks like the sana sign in because that one
 * had a nice, cool animation." And the standing rule from the same message: figma.com leads, Sana
 * is used where it does not fight. Figma has no sign-in worth copying (a plain centred card), so
 * this surface is entirely Sana's, motion included.
 *
 * 🔴 THIS IS A PREVIEW, NOT THE LIVE PAGE. /sign-in still runs AuthFrame and is untouched. This
 * route is presentational only: the form does not authenticate anything. It exists so the shape
 * can be judged before it replaces a page people actually sign in through.
 *
 * 🔴 THE LAYOUT IS SANA'S, THE BRAND IS OURS. Their four-dot mark, their wordmark and their
 * product photograph are theirs; the geometry, the rhythm and the easing are facts about a
 * public page. Copying a login page's LOOK is ordinary practice; copying its identity onto a
 * screen that collects credentials is not, so the mark here is ours and the panel holds our
 * gradient rather than their laptop shot.
 *
 * Measured anatomy is documented gap by gap in ./sana-signin.css.
 */
export default function SanaShapedSignIn() {
  const [email, setEmail] = useState("");
  const grainId = useId().replace(/:/g, "");
  const ready = email.trim().length > 0;

  return (
    <div className="sig">
      <a className="sig-mark" href="/" aria-label="Nemesis home">
        <NemesisMark size={24} />
      </a>

      <div className="sig-form">
        {/* Measured: ONE h1 holding both lines at 34/500. The second is the same size and weight
            at 60% ink. Every reference we measured builds its hierarchy this way. */}
        {/* 🔴 BOTH LINES MUST FIT THE 381px COLUMN ON ONE LINE EACH. The whole vertical rhythm
            below is measured from a 95.2px (two-line) headline; a third line pushes every row
            down by exactly 47.6px and the page silently stops matching the reference.

            Measured in this h1, in Inter Variable at 34/500, against a 381px column:
              "Welcome to Nemesis"       319.0px   fits
              "Your learning workspace"  370.4px   fits, 10.6px to spare
              "Your academic workspace"  396.6px   WRAPS — this was the first draft
            Guarded by sign-in-preview.test.ts. Re-measure in the page before editing this copy;
            a canvas measureText in a blank document reports ~11% narrow and will mislead you. */}
        <h1 className="sig-in sig-in-1">
          Welcome to Nemesis
          <br />
          <span>Your learning workspace</span>
        </h1>

        <p className="sig-lead sig-in sig-in-2">
          Sign in or create an account
          <br />
          with your school or work email
        </p>

        <button className="sig-sso sig-in sig-in-3" type="button">
          <svg viewBox="0 0 18 18" aria-hidden="true">
            <path
              fill="#4285F4"
              d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
            />
            <path
              fill="#34A853"
              d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
            />
            <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z" />
            <path
              fill="#EA4335"
              d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
            />
          </svg>
          Continue with Google
        </button>

        {/* Measured: plain centred text, no rules either side. */}
        <div className="sig-or sig-in sig-in-4">or</div>

        <input
          className="sig-field sig-in sig-in-5"
          type="email"
          name="email"
          autoComplete="email"
          placeholder="name@school.edu"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        {/* Measured: quiet until there is something to submit, then solid ink. It is the only
            state change on their page, and it arrives on the spring rather than a linear fade. */}
        <button className={`sig-submit sig-in sig-in-5${ready ? " is-ready" : ""}`} type="button">
          {ready ? "Continue" : "Enter your email"}
        </button>

        <p className="sig-legal sig-in sig-in-6">
          By creating an account you agree to our <a href="/terms">Terms</a> and{" "}
          <a href="/privacy">Privacy Notice</a>. We only read the material you bring, and only to
          build the things you ask for.
        </p>
      </div>

      {/* Measured: 706.3x720 at radius 18 on rgb(23,24,26), cropping artwork that is deliberately
          LARGER than the frame (731.9x751.1, offset -12.8/-15.5) so it bleeds past every edge. */}
      <section className="sig-panel" aria-hidden="true">
        {/* 🔴 THE COMPUTER IS THE SUBJECT, NOT THE GRADIENT. Sana's panel holds a photograph of a
            laptop running their product, cropped by the frame. The first pass here kept the frame
            and replaced its contents with a flat wash, which is how the thing the owner actually
            picked the page for went missing. The machine is built in CSS 3D rather than
            photographed because the app is being redesigned: a real screenshot today would be a
            picture of something about to change. The mesh is what is ON the screen, and when the
            redesign lands the product replaces it in the same laptop at the same angle. */}
        <div className="sig-stage">
          <div className="sig-laptop">
            <div className="sig-lid">
              <div className="sig-screen">
                <div className="sig-panel-mesh" />
                <svg className="sig-panel-grain" focusable="false">
                  <filter id={`sig-grain-${grainId}`}>
                    <feTurbulence type="fractalNoise" baseFrequency="0.82" numOctaves="3" stitchTiles="stitch" />
                    <feColorMatrix type="saturate" values="0" />
                  </filter>
                  <rect width="100%" height="100%" filter={`url(#sig-grain-${grainId})`} />
                </svg>
                <div className="sig-glass" />
              </div>
            </div>
            <div className="sig-deck" />
          </div>
        </div>
        <div className="sig-panel-shaft" />
      </section>
    </div>
  );
}
