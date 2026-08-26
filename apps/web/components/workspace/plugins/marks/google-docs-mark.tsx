// Google Docs's mark: the page, in its published geometry.
//
// 🔴🔴 THIS REPLACED A HAND-DRAWN APPROXIMATION ON 2026-08-26 (see `google-drive-mark.tsx` for the
// owner's words and the general rule). The version before it drew a full blue rectangle and then
// laid a DARK blue triangle over the top-right corner. A folded corner is not an overlay: the page
// itself is cut away there, and the fold is a LIGHTER shade of the page, because it is the back of
// the paper catching the light. Drawn the other way round it reads as a sticker on a rectangle.
//
// 🔴 THE RULES ARE THREE, EVENLY SPACED, NOT THREE WITH A SHORT LAST ONE. The previous version
// shortened the last rule "like a paragraph's last line", which is a nice idea and not what the
// mark does.

export function GoogleDocsMark({ size = 32 }: { size?: number }) {
  return (
    <svg aria-hidden="true" focusable="false" height={size} viewBox="0 0 47 65" width={size}>
      <path d="m29.375 0h-24.5c-2.681 0-4.875 2.194-4.875 4.875v55.25c0 2.681 2.194 4.875 4.875 4.875h37.25c2.681 0 4.875-2.194 4.875-4.875v-42.5z" fill="#4285F4" />
      <path d="m29.375 0v13.625c0 2.694 2.181 4.875 4.875 4.875h12.75z" fill="#A1C2FA" />
      <path d="m11.375 46.75h24.25v-3.25h-24.25zm0-8.125h24.25v-3.25h-24.25zm0-11.375v3.25h24.25v-3.25z" fill="#F1F1F1" />
    </svg>
  );
}
