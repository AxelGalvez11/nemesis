# Space: the Notion-style workspace, made live

Owner, 2026-09-11: "Make this live into the app, we have the frontend, now let's make the backend work."
His three answers the same day:
1. Signing in lands in the new workspace. Canvas, Study (and the old Library, until it is gone) open from its sidebar.
2. Classmates work together from day one: invites, the same page edited at the same time, comments and inbox between people.
3. "The new notion based library should supersede" the old Library. Old notes move in; the old Library retires.

Code name **space** (Notion's own internal word for a workspace). `components/workspace` already means the old shell, so
nothing here reuses that word.

## Rules that do not bend
- **No Notion assets ship.** The frontend is the 1:1 copy in `~/Desktop/notion-1to1` (never committed: it holds Notion's
  icons, artwork, settings text and other creators' Marketplace templates). What enters this repo is the layout and the
  behaviour only. Icons come from Lucide (ISC, the one library /design/ICONS.md allows, stroke 1.5), the AI face is our character, templates are our own, settings are our
  real settings in our words. `space-no-notion-assets.test.ts` fails on the word "notion", a Notion host, or a copied file.
- Field-agnostic seed and template content (CLAUDE.md). No em dashes in product copy.
- The repo is public: no secrets, no captured third-party content.

## Architecture
- **Client**: the copy stays Preact + htm (it is 350 KB of measured behaviour; a React port would re-open every
  measurement). It mounts as an island inside the Next.js app. React surfaces (Canvas, Study, Calendar) sit beside it in
  the main column, positioned by the sidebar width the island publishes.
- **CSS** is scoped under `.nsp` by `scripts/space-scope-css.mjs` (postcss), with the UA defaults the copy relied on
  restored inside the scope at zero specificity, because Tailwind's preflight would otherwise reach in.
- **State**: the copy's global `S` stays the UI model. `space/sync/adapter.ts` maps it to records and back. A diff
  against a shadow copy (the last server state) turns each `persist()` into field patches; nothing in the copy needs to
  announce what it changed.
- **Records**: one table, `ws_records`, kinds `page | block | row | collection | view | comment`. Every record has a
  `page_id` (the page it is loaded and broadcast with) and pages carry `path` (ancestor page ids, root first) for
  permissions.
- **Writes**: `ws_apply(space, ops, client)` in one transaction. Field patches carry the version they were based on;
  a per-field version map (`fv`) means two people changing different fields of one record never conflict. List fields
  (`content`, `children`, `views`, `rows`, `notes`) travel as insert-after / remove operations that never conflict. Only
  the same text field edited at once conflicts; the server returns the current value and the client merges (three-way
  text merge) and resends.
- **Live**: after a write the function calls `realtime.send` on private channels `ws:page:<id>`, `ws:space:<id>`
  (sidebar-level changes to shared pages) and `ws:user:<id>` (private pages, notifications). Channel access is checked by
  RLS policies on `realtime.messages` through `ws_can_join(topic)`. Presence on the page channel shows who is here.
- **Security**: tables have RLS on and no client policies. Every read and write goes through SECURITY DEFINER functions
  that check `ws_page_role(uid, page)`: none < read < comment < edit < full. Roles come from the root page's section
  (private owner, teamspace, or whole workspace), plus grants on any ancestor page (user, workspace, teamspace, public).
- **Files**: private bucket `ws-files`, path `<space>/<page>/<uuid>-<name>`, storage policies call the same role check.
- **Rollout**: `ws_rollout` decides who gets the new shell. The owner first, then `*` when every milestone is verified.

## Not built yet stays hidden
- `READY` in apps/web/space/app/main.js hides every way into a feature with no server behind it: ai, meetings, inbox,
  notifyPrefs, publish, members, importExport, history, pageOps, automations, searchFilters, maps. Invites came on with M5, the inbox with M6. The milestone that builds one turns its
  flag on. lib/space/space-ready.test.ts fails when an entry point escapes its flag.
- Controls with no handler of their own: 76 on 2026-09-11, down from 106 (lib/space/dead-controls.ts). The budget only goes down.
- Home has no page of its own until M9; it opens the page you were last on, or your first page.

## Milestones
- [x] M1 Schema, roles, `ws_apply`, loaders, realtime policies, SQL self-test (rolled back, leaves nothing).
      Applied 2026-09-11 as three migrations (space_core_a/b/c); self-test 38 of 38 checks true.
- [x] M2 Sync engine in TypeScript: adapter, diff, list ops, text merge, queue, realtime; unit tests
      (records.ts, sync-engine.ts, list-ops.ts, text-merge.ts, fake-backend.ts). Realtime is wired in runtime.js on the
      page, space, team and user channels; presence avatars moved to M6.
- [ ] M3 Copy enters the repo clean (icons, AI face, seed, copy text, class names), scoped CSS, host shell, routes,
      rollout flag; pages, blocks, sidebar, trash, favorites, recents live on the backend.
      2026-09-11: built. Driven in /dev-preview/space over the in-memory backend: first-visit page, templates, database
      rows, settings, a new page, the slash menu, trash. An account on the rollout lands on /home after sign-in
      (components/space/space-landing.ts). Left: the same checks on production after merge.
- [ ] M4 Databases: rows, views, filters, sorts, groups, relations, rollups, unique ids, forms, files
      2026-09-11, part one: filters work in every view, with conditions for each property type (lib/space/db-filter.ts);
      they are a field of the view record, so they sync. A search box finds rows by their words, a Person property opens
      a picker of the workspace's people, and a row made while filters are on starts inside them. Database controls with
      nothing behind them are wired or hidden. Left: calculations, grouping a table, several sorts, forms people fill in,
      files, unique ids, relations and rollups, and the chart settings rows that do nothing yet.
      2026-09-11, part two: several sorts with a sort editor (`sorts` on the view; an old single `sort` still reads), tables
      group by a select, status or checkbox property with groups that fold away, "Open pages in" chooses the side peek or
      the full page, and the board's Group by and the calendar's and timeline's date pickers work (lib/space/db-sort.ts).
      Deleting a property takes its column, sorts, filters and grouping out of every view. Chart settings with nothing
      behind them read as plain text. Left: calculations, grouping by other property types, forms people fill in, files,
      unique ids, relations and rollups, and the chart settings themselves.
      2026-09-11, part three: 20260911T13_space_tasks.sql is live (self-test 16 of 16, rolled back, before and after
      applying). Putting someone in a Person column tells them in the Inbox, unless they made the change or cannot open
      the database, and My Tasks lists every row they are assigned to that is not done, soonest due first; a task opens
      its database with the row beside it. Left: calculations, grouping by other property types, forms people fill in,
      files, unique ids, relations and rollups, and the chart settings themselves.
      2026-09-11, part four: a Files & media property (upload, open and remove files in a cell or on the row page; they
      live in the private ws-files bucket under the database page), and a line under every table and group that
      calculates a column over the rows the view shows: counts, shares, sum, average, median, min, max, range and date
      spans (lib/space/db-calc.ts). Filters handle files as empty or not, and sorts by the first file's name. Left: forms
      people fill in, unique ids, relations and rollups, grouping by other property types, and the chart settings.
      2026-09-11, part five: 20260911T14_space_forms.sql is live (self-test 12 of 12, rolled back, before and after
      applying). Anyone who can open a database can fill in its forms: ws_submit_form keeps the form's own questions and
      the answers that fit them, adds the row at the end and broadcasts it, 60 responses an hour at most. Readers see
      the form itself; editors see the builder and a Preview. Left: unique ids, relations and rollups, grouping by other
      property types, file questions in forms, forms for people outside the workspace (publish), and chart settings.
- [ ] M5 Sharing and people: invites by email, roles, guests, page share, publish to web, teamspaces
      2026-09-11, part one: 20260911T11_space_invites.sql is live (self-test 30 of 30, rolled back). Share a page by
      email with a role; an address without an account waits as an invite that only a confirmed email can claim; guests
      reach only what is shared; access list, change and remove. Client: the Share menu invites and edits roles, the
      workspace switcher works, a shared page opens in its own workspace, view and comment roles cannot type, and
      /api/space/invite emails each person. Left: publish to web, workspace members, teamspaces.
- [ ] M6 Comments, discussions, mentions, inbox notifications, presence avatars
      2026-09-11, part one: 20260911T12_space_inbox.sql is live (self-test 12 of 12, rolled back). A share, a new
      comment in a conversation or a new mention notifies the people it concerns, never the person acting and never
      anyone who cannot open the page. The Inbox lists them with an unread count and marks them read, and the people
      looking at a page show as avatars in its top bar. Left: per-page notification settings, email digests.
- [ ] M7 Search, templates gallery (ours), duplicate, import (Markdown, CSV), export
- [ ] M8 Real settings (account, preferences, notifications, connections, workspace, people, teamspaces, billing)
- [ ] M9 AI panel and chats on nemesis-llm with page tools; Meetings on the recording pipeline; Home; Calendar
- [ ] M10 Old Library migrates in (notes to pages, sources stay sources); Canvas and Study inside the shell;
      front door flips for everyone; `/library` redirects; account deletion cleans space data
      2026-09-11, part one: each person's live Library notes become pages once, under "From your old Library"
      (lib/space/library-import.ts), and the sync engine sends at most 500 operations per write. Ids come from the notes,
      so an import cut short finishes on the next load and two tabs never make it twice. Left: sources, the
      /library redirect, Canvas and Study inside the shell, the front door for everyone, account deletion.
