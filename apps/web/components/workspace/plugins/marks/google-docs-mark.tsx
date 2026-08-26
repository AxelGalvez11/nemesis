// Google Docs's mark: a page with a folded top corner and white text rules, drawn as our own
// vectors.
//
// 🔴 A RECREATION OF THE WELL KNOWN SHAPE, NOT A TRACED COPY. A blue page, a darker triangle
// folded down at the top right corner, and three white rules standing in for text, the last one
// shorter like a paragraph's last line. See plugin-icon.tsx's header for why nothing here is a
// binary asset or a hotlink.

export function GoogleDocsMark({ size = 32 }: { size?: number }) {
  return (
    <svg aria-hidden="true" focusable="false" height={size} viewBox="0 0 32 32" width={size}>
      <rect fill="#4285F4" height="26" rx="2" width="18" x="7" y="3" />
      <polygon fill="#185ABC" points="19,3 25,3 25,9" />
      <rect fill="#FFFFFF" height="2" rx="1" width="12" x="10" y="13" />
      <rect fill="#FFFFFF" height="2" rx="1" width="12" x="10" y="18" />
      <rect fill="#FFFFFF" height="2" rx="1" width="8" x="10" y="23" />
    </svg>
  );
}
