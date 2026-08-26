// Google Drive's mark: a triangle in three colour facets, drawn as our own vector shapes.
//
// 🔴 A RECREATION, NOT A COPY OF GOOGLE'S FILE. There is no licensed asset in this repo (see
// plugin-icon.tsx's header) and there never will be. These points were drawn by hand to the mark's
// well known geometry: an upward triangle split into a blue face on the left, a green face on the
// right, and a yellow trapezoid across the base. Close enough to read instantly at 40px; not a
// pixel trace of anything Google ships, and the shades are Drive's own (not the general four-colour
// Google palette Gmail and Calendar below use).

export function GoogleDriveMark({ size = 32 }: { size?: number }) {
  return (
    <svg aria-hidden="true" focusable="false" height={size} viewBox="0 0 32 32" width={size}>
      <polygon fill="#0066DA" points="16,3 6.8,20 16,20" />
      <polygon fill="#00AC47" points="16,3 16,20 25.2,20" />
      <polygon fill="#FFBA00" points="6.8,20 25.2,20 29,27 3,27" />
    </svg>
  );
}
