// The REAL landing component, signed out, so its character can be looked at.
//
// Not a mock: `CanvasHome` itself, with no token and no user. Everything it does before
// a submission — the greeter, the composer, dictation — runs exactly as it does in the
// product, which is the point. A copy of the layout would drift from it within a week.

import { CanvasHome } from "@/components/workspace/learn/canvas-home";

export const metadata = { title: "Canvas landing preview" };

export default function CanvasHomePreview() {
  return (
    <div className="h-dvh">
      <CanvasHome accessToken={null} userId={null} />
    </div>
  );
}
