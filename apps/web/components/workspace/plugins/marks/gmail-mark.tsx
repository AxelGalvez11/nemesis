// Gmail's mark: the envelope, in its published geometry.
//
// 🔴🔴 THIS REPLACED A HAND-DRAWN APPROXIMATION ON 2026-08-26 (see `google-drive-mark.tsx` for the
// owner's words and the general rule). The version before it had been redrawn once already, from
// four solid colour quadrants to a white envelope with a stroked red checkmark, which is a much
// closer READING of the mark. It still was not the mark: Gmail's red is two filled shapes forming
// the inner "M", not one stroke of constant width, and the flap's fold does not have round caps.
//
// 🔴 FIVE PATHS, WHICH IS THE WHOLE MARK. Blue left panel, green right panel, yellow right flap,
// red left flap, and the white-bounded "M" between them. The white of the envelope is the TILE
// showing through, which is why `plugin-icon.tsx` paints a fixed white ground rather than a themed
// one: on a dark tile this mark loses its middle.

export function GmailMark({ size = 32 }: { size?: number }) {
  return (
    <svg aria-hidden="true" focusable="false" height={size} viewBox="0 0 52 40" width={size}>
      <path d="m3.545 39.5h8.273v-20.091l-11.818-8.864v25.409c0 1.962 1.59 3.546 3.545 3.546z" fill="#4285F4" />
      <path d="m40.182 39.5h8.273c1.961 0 3.545-1.59 3.545-3.546v-25.409l-11.818 8.864z" fill="#34A853" />
      <path d="m40.182 3.955v15.454l11.818-8.864v-4.818c0-4.383-5.003-6.881-8.509-4.25z" fill="#FBBC04" />
      <path d="m11.818 19.409v-15.454l14.182 10.636 14.182-10.636v15.454l-14.182 10.636z" fill="#EA4335" />
      <path d="m0 6.545v4.818l11.818 8.864v-15.454l-3.309-2.478c-3.506-2.631-8.509-.133-8.509 4.25z" fill="#C5221F" />
    </svg>
  );
}
