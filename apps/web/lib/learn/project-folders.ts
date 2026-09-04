// Which folders are PROJECTS, and which are just places in the Library.
//
// 🔴🔴 ONE TABLE, TWO THINGS, AND THE OWNER FOUND THE SEAM. `folders` holds both: a project is a
// folder (see app/(workspace)/projects/page.tsx), and the Library's own New folder button writes to
// the same table. So pressing New folder in the Library produced something that then appeared under
// Projects, in the sidebar, and in the front door's project row.
//
// Owner, 2026-09-04: *"the library does not make folders, it makes new projects not library
// folders."* Right, and the half-fix is already in: `made_in` was added the same day so an empty
// Library folder would show on the Library shelf (`shelfFolders`, migration 20260904T20). That
// solved the Library's view of it and left every OTHER surface still calling it a project. This is
// the mirror of `shelfFolders` and the other half of the same column.
//
// 🔴 WHY NOT A SECOND TABLE. A project and a Library folder differ in exactly one way that anything
// reads: whether they are offered as a place to put a CHAT. Everything else about them is identical
// — same owner, same name, same nesting, same two-level depth trigger, same filing of outputs — and
// a second table would duplicate all of it plus its RLS in order to record one boolean. The column
// is already there and already carries this fact.
//
// 🔴 NULL IS A PROJECT, and that is the direction that keeps every existing row correct. Every
// folder made before today, and every one made on /projects or in the sidebar, has `made_in` null
// and must keep behaving exactly as it did. Only the Library writes a value, so only the Library's
// own folders are excluded here. The migration says the same thing from the database's side.

import type { Folder } from "./canvas-store";

/**
 * The folders that are projects: everything except the ones made on the Library. PURE.
 *
 * 🔴 EVERY SURFACE THAT OFFERS A PLACE TO PUT A CHAT USES THIS. The Projects page, the sidebar's
 * Projects section, the front door's "choose a project" row and the canvas manager's filing menu.
 * A surface that lists folders WITHOUT it is how this defect came back.
 */
export function projectFolders(folders: readonly Folder[]): readonly Folder[] {
  return folders.filter((folder) => folder.madeIn !== "library");
}

/**
 * Whether one folder is a project. PURE.
 *
 * 🔴 FOR THE SINGLE-PROJECT PAGE, which is handed an id rather than a list. Opening a Library
 * folder's id at /projects/<id> should not draw a project page around it.
 */
export function isProjectFolder(folder: Pick<Folder, "madeIn">): boolean {
  return folder.madeIn !== "library";
}
