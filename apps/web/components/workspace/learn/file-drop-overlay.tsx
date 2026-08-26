// What a file drag looks like while it is still in the air.
//
// 🔴 IT SAYS WHAT WILL HAPPEN, WHICH A RING DOES NOT. The front door drew a 2px accent ring around
// the page and nothing else, and the canvas drew nothing at all — it accepted drops silently, so
// the only way to learn that dropping a PDF on a canvas works was to try it and see. A highlight
// answers "this element is a target"; it never answers "and then what", which is the question
// somebody holding an unsaved file actually has.
//
// 🔴 `pointer-events-none` ON EVERYTHING, INCLUDING THE SCRIM. An overlay that swallows pointer
// events swallows the drop with them: the file lands on this div, the surface underneath never
// hears about it, and the drag ends with nothing attached and no error. This element is a picture,
// never a target — the drop handler stays on the surface that owns the files.
//
// PRESENTATION ONLY. It holds no drag state; the surface that has the handlers has the state, since
// dragenter/dragleave bookkeeping belongs with the element the events fire on.

import { Codicon } from "@/components/desktop-ui/codicon";

export interface FileDropOverlayProps {
  /** What dropping here will do, in the caller's own terms. The canvas attaches; the front door
   *  starts something new, and telling a learner "added to the conversation" on a page with no
   *  conversation on it would be the reference's copy repeated rather than its idea. */
  note: string;
}

export function FileDropOverlay({ note }: FileDropOverlayProps) {
  return (
    <div className="pointer-events-none absolute inset-0 z-[60] flex items-center justify-center">
      {/* The page stays legible underneath. A drag is a moment, not a mode, and blacking the
          surface out for it makes changing your mind feel like an escape rather than a release. */}
      <div className="absolute inset-0 bg-(--ui-bg-editor)/70 backdrop-blur-[2px]" />
      {/* 🔴 THE RING IS ON THE PAGE, NOT ON THE CARD, and it is the half that was already right.
          It says the whole surface accepts the drop, so nobody tries to aim at the card — which is
          centred for reading and is the last place a file should have to land. */}
      <div className="absolute inset-3 rounded-2xl ring-2 ring-(--ui-action)" />
      <div className="relative grid justify-items-center gap-3 px-6 text-center">
        <Codicon className="text-(--ui-action)" name="files" size="40px" />
        {/* 🔴 A SCALE TOKEN, NOT A LOCAL 20px — §46.3. `--canvas-text-title` is the scale's top step and this
            is the only thing on screen while it shows. A literal size here
            would be a sixth step nobody declared, which is how the surface got to thirteen. */}
        <p className="m-0 text-[length:var(--canvas-text-title)] font-semibold text-(--ui-text-primary)">Add anything</p>
        <p className="m-0 text-[length:var(--canvas-text-small)] text-(--ui-text-tertiary)">{note}</p>
      </div>
    </div>
  );
}
