"use client";

// The character studio.
//
// Same convention as the other dev-preview routes: a plain client page, no auth gate,
// not linked from any navigation. Nothing the product ships imports it — deleting
// `components/dev/character-studio`, `lib/studio` and this route removes the whole tool
// and leaves the mascot engine untouched.
//
// `/character-studio` redirects here, so the short URL works without taking a name in
// the app's own top-level namespace.

import { CharacterStudio } from "@/components/dev/character-studio/studio";

import "@/components/mascot/mascot.css";

export default function CharacterStudioPage() {
  return <CharacterStudio />;
}
