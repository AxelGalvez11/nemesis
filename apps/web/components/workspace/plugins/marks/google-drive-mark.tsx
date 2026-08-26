// Google Drive's mark: the trefoil, in its published geometry.
//
// 🔴🔴 THIS REPLACED A HAND-DRAWN APPROXIMATION ON 2026-08-26, AND THE OWNER'S WORDS ARE WHY:
// *"the plugins page still doesn't have the actual Gmail or Google app icons, the real ones, not
// just a fake one."* The version before this was three polygons making a SOLID tricolour triangle.
// Drive's mark is not a solid triangle. It is a hollow trefoil: six facets folded round an open
// centre, which is the whole reason it is recognisable at 16px. A solid triangle is precisely the
// "fake one" the owner was pointing at, and it survived one review because the reviewer was
// checking the colours rather than the shape.
//
// 🔴 THE GEOMETRY IS THE MARK'S OWN, NOT A GUESS AT IT. These six paths are Drive's published
// outline in its own 87.3 x 78 coordinate space, kept in that space rather than refitted to a
// square grid by hand, because refitting by eye is how a logo ends up subtly wrong in a way nobody
// can name but everybody sees.
//
// 🔴 REPRODUCED TO SAY "THIS CONNECTS TO DRIVE", WHICH IS WHAT AN INTEGRATION ICON IS FOR. It is
// Google's mark, used unaltered and unstyled to name Google's product. Nothing here recolours it,
// crops it, or puts it on our own badge.
//
// 🔴 AND IT IS DRAWN, NOT FETCHED. See `plugin-icon.tsx`'s header: a remote <img> is a third-party
// request on every page load, a broken square the day the address moves, and a beacon telling
// Google which of our users opened this page.

export function GoogleDriveMark({ size = 32 }: { size?: number }) {
  return (
    <svg aria-hidden="true" focusable="false" height={size} viewBox="0 0 87.3 78" width={size}>
      <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066DA" />
      <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00AC47" />
      <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#EA4335" />
      <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832D" />
      <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684FC" />
      <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#FFBA00" />
    </svg>
  );
}
