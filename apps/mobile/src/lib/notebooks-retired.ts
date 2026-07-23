// Notebooks is RETIRED on the phone (owner 2026-07-23), matching the web app:
// lecture slides and school documents belong in the Library, so there is no
// second document surface to walk into.
//
// Retired means UNLINKED, not deleted. `app/(tabs)/notebooks.tsx`, `notebook.tsx`
// and `api/notebooks.ts` all stay exactly where they are and still work if
// something routes to them — this flag only closes the doors a student can see:
//   - the "Notebooks" row in the drawer (components/AppDrawer.tsx)
//   - "Move to notebook" in a chat's ··· menu (app/(tabs)/chat.tsx), which would
//     otherwise be a one-way trip into a surface with no way back
//
// Typed `boolean` rather than left as a literal so the guarded branches still
// type-check; flipping this to false brings both controls back untouched.
export const NOTEBOOKS_RETIRED: boolean = true;
