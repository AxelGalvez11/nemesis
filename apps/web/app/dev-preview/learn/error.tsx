"use client";

// The dev-preview harness renders the exact same `LearningCanvas` production does (see the note
// at the top of `page.tsx` in this directory), so a render exception here is exactly as real as
// one on `/learn` — and worth catching the same way, since this route is the one place a canvas
// crash can be reproduced without a signed-in session. Re-exporting rather than duplicating: one
// fallback, one place to keep it honest with the real route's.
export { default } from "../../(workspace)/learn/error";
