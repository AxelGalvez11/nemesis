// Google Calendar's mark: the sheet, in its published geometry.
//
// 🔴🔴 THIS REPLACED A HAND-DRAWN APPROXIMATION ON 2026-08-26 (see `google-drive-mark.tsx` for the
// owner's words and the general rule). That version had also been redrawn once, from a ring-bound
// desk calendar to a white square with a blue border and a blue "31", and the redraw's own comment
// argued the real mark "is mostly blue and white". It is not: the sheet is bordered by FOUR
// colours, blue down the left and across the top, yellow down the right, green across the bottom,
// red in the bottom-right corner. Losing them is what made it read as any calendar rather than as
// this one.
//
// 🔴 THE NUMERAL IS PATHS, NOT `<text>`. The version before this set "31" in Arial, which meant the
// mark's single most recognisable feature was rendered by whatever font the machine happened to
// have, at whatever weight it happened to interpret 700 as. The real numeral is drawn geometry, and
// it is drawn here, so it is the same shape on every device.

export function GoogleCalendarMark({ size = 32 }: { size?: number }) {
  return (
    <svg aria-hidden="true" focusable="false" height={size} viewBox="0 0 200 200" width={size}>
      <path d="m152.6 47.4h-105.2v105.2h105.2z" fill="#FFFFFF" />
      <path d="m152.6 200 47.4-47.4h-47.4z" fill="#EA4335" />
      <path d="m200 47.4h-47.4v105.2h47.4z" fill="#FBBC04" />
      <path d="m152.6 152.6h-105.2v47.4h105.2z" fill="#34A853" />
      <path d="m0 152.6v33.7c0 7.6 6.1 13.7 13.7 13.7h33.7v-47.4z" fill="#188038" />
      <path d="m200 47.4v-33.7c0-7.6-6.1-13.7-13.7-13.7h-33.7v47.4z" fill="#1967D2" />
      <path d="m13.7 0c-7.6 0-13.7 6.1-13.7 13.7v138.9h47.4v-105.2h105.2v-47.4z" fill="#4285F4" />
      <path
        d="m68.9 129.3c-3.9-2.7-6.7-6.6-8.2-11.8l9.1-3.8c.8 3.2 2.3 5.7 4.4 7.5 2.1 1.8 4.6 2.6 7.6 2.6 3 0 5.6-.9 7.8-2.8s3.3-4.2 3.3-7.1c0-2.9-1.2-5.3-3.5-7.2s-5.2-2.8-8.6-2.8h-5.3v-9h4.7c3 0 5.4-.8 7.5-2.4 2-1.6 3-3.8 3-6.6 0-2.5-.9-4.5-2.7-6s-4.1-2.2-6.9-2.2c-2.7 0-4.9.7-6.5 2.2-1.6 1.5-2.8 3.3-3.5 5.4l-9 -3.8c1.2-3.4 3.4-6.4 6.6-9s7.3-3.9 12.3-3.9c3.7 0 7 .7 9.9 2.1 2.9 1.4 5.2 3.4 6.9 5.9 1.7 2.5 2.5 5.3 2.5 8.4 0 3.2-.8 5.9-2.3 8.1s-3.4 3.9-5.7 5.1v.5c3 1.2 5.4 3.1 7.3 5.7 1.9 2.6 2.8 5.6 2.8 9.1s-.9 6.7-2.7 9.4c-1.8 2.8-4.3 4.9-7.4 6.5-3.2 1.6-6.7 2.4-10.6 2.4-4.6 0-8.8-1.3-12.7-4z"
        fill="#4285F4"
      />
      <path d="m112.4 79.5-9.9 7.2-5-7.6 17.8-12.8h6.8v60.5h-9.7z" fill="#4285F4" />
    </svg>
  );
}
