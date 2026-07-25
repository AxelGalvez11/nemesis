import Svg, { Path } from "react-native-svg";

// The Apple and Google marks for the sign-in buttons.
//
// PORTED VERBATIM from apps/web/components/OAuthButtons.tsx — same paths, same
// fills. Both are trademarks whose use on a sign-in button is governed by the
// owner's brand rules (Apple's Human Interface Guidelines, Google's Sign-In
// branding guidelines), which is exactly why they are copied rather than
// redrawn: an approximation of someone else's logo is an off-brand logo, and
// these two are the most looked-at eight millimetres of the whole app.
//
// Google's is deliberately full-colour in both themes — the guidelines don't
// allow a monochrome "G" on a coloured button — so it is the one place in this
// black-and-white app where brand colour is correct.

export function AppleMark({ size = 18, color = "#000000" }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        fill={color}
        d="M16.62 12.77c.03 3.2 2.8 4.26 2.83 4.28-.02.08-.44 1.52-1.46 3-.88 1.28-1.79 2.55-3.23 2.58-1.41.03-1.87-.84-3.48-.84-1.62 0-2.12.81-3.46.87-1.39.05-2.44-1.38-3.33-2.65-1.81-2.62-3.2-7.4-1.34-10.62A5.17 5.17 0 0 1 7.5 6.73c1.36-.03 2.65.92 3.48.92.83 0 2.4-1.13 4.04-.97.69.03 2.62.28 3.86 2.1-.1.07-2.3 1.35-2.26 3.99ZM13.96 4.94c.74-.9 1.24-2.14 1.1-3.38-1.06.04-2.35.71-3.11 1.6-.68.79-1.28 2.06-1.12 3.27 1.19.1 2.4-.6 3.13-1.49Z"
      />
    </Svg>
  );
}

export function GoogleMark({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        fill="#4285F4"
        d="M23.49 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.44a5.52 5.52 0 0 1-2.39 3.62v3h3.86c2.26-2.09 3.58-5.17 3.58-8.81Z"
      />
      <Path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.86-3c-1.07.72-2.44 1.15-4.08 1.15-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A12 12 0 0 0 12 24Z"
      />
      <Path fill="#FBBC05" d="M5.27 14.28a7.2 7.2 0 0 1 0-4.56V6.63H1.29a12 12 0 0 0 0 10.74l3.98-3.09Z" />
      <Path
        fill="#EA4335"
        d="M12 4.76c1.76 0 3.34.6 4.59 1.8l3.42-3.42A11.98 11.98 0 0 0 12 0 12 12 0 0 0 1.29 6.63l3.98 3.09C6.22 6.87 8.87 4.76 12 4.76Z"
      />
    </Svg>
  );
}
