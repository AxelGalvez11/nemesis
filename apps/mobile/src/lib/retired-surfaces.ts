// The surfaces the web app no longer has, closed on the phone to match (owner 2026-08-20).
//
// The web app is now built around ONE surface — the Canvas (`/learn`) — and its destination
// list is exactly four rows: New canvas · Library · Calendar · Stats
// (`apps/web/lib/workspace/sidebar-nav.ts`). Chat, Study, Sessions and the Graph are not
// destinations there any more, so they stop being destinations here.
//
// 🔴 RETIRED MEANS UNLINKED, NOT DELETED — the same contract as `notebooks-retired.ts`, and
// for a stronger reason here. `app/(tabs)/chat.tsx` is 2,363 lines containing a WORKING
// composer, audio recorder and streaming-reply implementation, and the Canvas port is meant
// to reuse that code rather than write it again. Deleting these screens would mean rebuilding
// what already works, and losing the only reference for how it behaved.
//
// Every screen below still exists and still functions if something routes to it. These flags
// only close the doors a student can see. Flipping one to false brings its row back untouched.
//
// Kept separate from `notebooks-retired.ts` rather than folded into it: that flag is older,
// has its own reasoning (a second document surface, retired 2026-07-23), and is already
// imported in two places. Merging them would rewrite history that is still accurate.

/** Chat — superseded by the Canvas, which is where a conversation happens now. */
export const CHAT_RETIRED: boolean = true;

/** Study — the drill surfaces move onto the Canvas in a later pass. */
export const STUDY_RETIRED: boolean = true;

/** Graph — not a destination on web; the knowledge graph is not a place you navigate to. */
export const GRAPH_RETIRED: boolean = true;

/** Plugins — never had a web counterpart in the four-destination model. */
export const PLUGINS_RETIRED: boolean = true;

/**
 * Stats — hidden on the phone for now (owner 2026-08-20: "remove the stats page for now (hide
 * it)").
 *
 * 🔴 THE ONLY FLAG HERE THAT DOES NOT MATCH THE WEB. Every other surface in this file was retired
 * because the web app stopped having it. Stats is still a destination on the web
 * (`apps/web/lib/workspace/sidebar-nav.ts`), so this is a deliberate, phone-only divergence and
 * the word "for now" is load-bearing — flip this to false to bring the row back, unchanged.
 */
export const STATS_RETIRED: boolean = true;


// The file-manager Library is RETIRED on the phone (owner 2026-08-20), matching the web app.
//
// Library's primary objects are CANVASES now. The web app made that change on 2026-08-13
// (`apps/web/components/workspace/library/canvas-manager.tsx`) and kept its old file browser
// alive at `/library/classic` rather than deleting it — "remove the control, not the feature".
// This flag is the phone's half of that decision.
//
// 🔴 RETIRED MEANS UNLINKED, NOT DELETED — the same contract as the four flags above and as
// `lib/notebooks-retired.ts`, and for the strongest reason any of them has. Chat, Study
// and the Graph were retired because the web app stopped having them; the notes tree is retired
// because Library's OBJECTS changed underneath it. The notes themselves did not go anywhere:
// `public.readable_library_documents` is a live table with live rows, and after this change
// NOTHING ELSE ON THE PHONE LISTS THEM. `app/note.tsx` opens one by id, `app/slides.tsx` renders
// one as a deck; neither can find a note you do not already hold a link to. Deleting
// `components/library/ClassicLibraryBody.tsx` would not retire a surface — it would strand a
// student's notes with no way back to them.
//

/** The notes-and-folders tree is no longer a destination. `components/library/ClassicLibraryBody.tsx`
 *  still exists and still works if something renders it. */
export const LIBRARY_CLASSIC_RETIRED: boolean = true;

/**
 * The unlinked door, and the reason it is a query parameter rather than a route.
 *
 * 🔴 THE WEB KEPT A ROUTE; THE PHONE KEEPS A PARAMETER, AND THE DIFFERENCE IS NOT A PREFERENCE.
 * `/library/classic` on the web is a page file the Library pass owned. On the phone the route
 * table IS the filesystem under `app/`, and this pass owns exactly one file there — so a real
 * `/library-classic` route could not be created without writing outside the pass. `/library` with
 * `?classic=1` renders the same body from the same frame and costs the student nothing, because
 * the point of a retired surface is that nothing links to it either way.
 *
 * 🔴 NOTHING IN THE PRODUCT WRITES THIS LINK, ON PURPOSE. It exists so a student who still has
 * notes can be routed back to them — and so `app/note.tsx`'s post-delete
 * `router.replace("/library")` and `app/slides.tsx`'s `close()` fallback have somewhere honest to
 * land — both now do exactly that.
 */
export const CLASSIC_LIBRARY_PARAM = "classic";
