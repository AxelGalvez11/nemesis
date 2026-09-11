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
  notifyPrefs, publish, members, importExport, history, pageOps, automations, searchFilters, maps. Invites came on with M5, the inbox with M6, chat and meeting notes with M9, agents with M11. The milestone that builds one turns its
  flag on. lib/space/space-ready.test.ts fails when an entry point escapes its flag.
- Controls with no handler of their own: 71 on 2026-09-11, down from 106 (lib/space/dead-controls.ts). The budget only goes down.
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
      2026-09-11, part one: the Chat tab, New chat (Cmd+O) and the full-page chat work (READY.chat). A question goes
      through the board's turn (lib/board/board-turn.ts, `place: "chat"`), streams in, draws with the app's markdown
      renderer (lib/space/answer-render.tsx) and is saved with its answer in chat_threads and chat_messages
      (lib/space/chats.ts), so chats from before the canvas come back in the list. Web search is a switch in the
      composer's settings. Left: the AI side panel and page tools, agents, Meetings, Home, Calendar.
      2026-09-11, part two: 20260911T16_space_meetings.sql is live (dry run 3 of 3, rolled back, then applied). AI
      Meeting Notes record: the block starts and stops the microphone (lib/space/meeting-recorder.ts, with the app's
      formats and silence gate), the audio goes through /api/recordings/jobs as surface "space" with no Library note,
      and the worker's transcript and notes are written into the block when it is done (lib/space/meeting-notes.ts).
      The Meetings tab lists the next week of the calendar and the meeting notes, and an event opens its own note.
      Left: the AI side panel and page tools, agents, Home, Calendar, and saving the audio in parts so a recording
      cut off by a closed tab can be recovered.
- [ ] M10 Old Library migrates in (notes to pages, sources stay sources); Canvas and Study inside the shell;
      front door flips for everyone; `/library` redirects; account deletion cleans space data
      2026-09-11, part one: each person's live Library notes become pages once, under "From your old Library"
      (lib/space/library-import.ts), and the sync engine sends at most 500 operations per write. Ids come from the notes,
      so an import cut short finishes on the next load and two tabs never make it twice. Left: sources, the
      /library redirect, Canvas and Study inside the shell, the front door for everyone, account deletion.
      2026-09-11, part two: 20260911T15_space_account_cleanup.sql is live (self-test 9 of 9, rolled back, before and
      after applying). Deleting an account (/api/account/delete) now removes the workspaces no one else owns or is a
      member of, with their files in ws-files, and the person's private pages and their files in workspaces others keep.
      Left: sources, the /library redirect, Canvas and Study inside the shell, the front door for everyone.
- [ ] M11 Agents: outside AI tools connect in and make things as the person (owner 2026-09-11: "Outside AI connects in")
      2026-09-11, part one: a remote MCP server at /api/mcp (mcp-handler, Streamable HTTP) with list_pages, read_page,
      create_page, list_decks, create_flashcards and create_practice_test, each acting through a client that carries the
      person's token, so row security bounds it as it bounds them (lib/agents/agent-actions.ts). Tokens come from Supabase
      Auth's OAuth 2.1 server and must name the AI tool they were issued to (lib/agents/agent-auth.ts). Discovery is at
      /.well-known/oauth-protected-resource, the approval page at /oauth/consent, and the sidebar's Agents section lists
      connected tools with Disconnect and shows how to connect one. Needs, once, in the Supabase dashboard:
      Authentication > OAuth Server on, Authorization Path /oauth/consent, dynamic client registration allowed. Left:
      databases and rows through the door, the calendar, and a record of what each tool made.

## The app, rebuilt around the workspace (owner, 2026-09-11)

Hours after the workspace went live for him: "the entire app is changing... integrate the synthesized design... I don't
want the old library... I don't want the study page". Asked whether the real app should take the approved mockup's
layout or keep today's with a new coat, he said "can't you do a synthesis of both?", because he likes the mockup's
style and he likes the tests and the blocks that are live now.

**Decided**, in his words or the options he picked:
- The sidebar carries five tabs: **Chats, Workspaces, Notes, Canvas, Meetings**. The inbox is a bell with its count.
  Notes keeps the page tree, All notes, My Tasks, Templates and Trash. Chats keeps the chat list and Agents. Meetings
  keeps Upcoming, the calendar and the meeting notes. The live game joins the row once it works.
- **Reviewing flashcards lives in the workspaces.** Each workspace lists its decks and tests under Made here, and one
  "Review due cards (N)" row at the top of Workspaces opens the review. He had 397 of 401 cards due when he asked.
- **The old Library goes.** Every way into it comes out and nothing in the database is deleted: 201 files, 22 decks,
  9 tests, one mind map, and the 37 notes that already became pages.
- **The Study page goes** the same way. Links inside old chats that carry parameters keep working until M16.
- **Signing in lands on a new chat**: "What are we working on?", with the person's workspaces as chips.
- **A shared workspace** shares its sources, its notes and what was made there. Each person's chats stay their own
  until they press Share.
- **The live group game is not called polls.** It is Kahoot-shaped: people join, answer together, score points and see
  who is ahead, with multiple choice, select all that apply, free response and a word cloud. Taking part needs an
  account, the way editing a shared document does. Researched 2026-09-11: Sana has live poll cards but no points, no
  leaderboard and no word cloud, so Kahoot, Wayground, Poll Everywhere, Mentimeter and Slido are the references.
- **The design** is the one in /design, under his ruling of the same day: one ink at alpha steps, Inter, 14px chrome,
  radii 4/6/10/16/24/pill, a ring inside soft shadows, an ink focus ring, and the accent only on the send button and
  the learner's own bubble.

### Milestones
- [ ] M12 **The design and the sidebar.** The build repaints the measured copy in our ink
      (scripts/space-scope-css.mjs), the design layer (space/styles/synthesis.src.css) carries type, shape, elevation,
      focus, motion and the accent, and the React column beside the shell reads the same tokens. The sidebar becomes
      the five tabs with the bell: Apps goes, Canvas becomes a tab, the calendar moves under Meetings, and Study and
      the old Library come out. Signing in lands on a new chat.
      2026-09-11, part one: the design is in. `inkColors` in scripts/space-scope-css.mjs maps every colour in the
      measured copy into our ink (a warm grey keeps its lightness, a warm tint becomes ink at the alpha that darkens
      the ground by the same amount, the reference's accent becomes ink), synthesis.src.css carries the rest of the
      system, and host.css re-points the React column's `--ui-*` tokens so Canvas, Review and the calendar match.
      Both wear Inter. Apps is Canvas, Review and Calendar: Study and the old Library are gone and nothing was
      deleted, the page list is "All notes" rather than a second Library, and signing in lands on a new chat that
      asks "What are we working on?". /review reviews every card that is due across every deck, counted by the same
      rule as the sidebar row (lib/space/due-cards.ts). lib/space/space-design.test.ts guards the mapping, keeps
      space.css in step with its sources, and fails if anything but the send button and the learner's bubble wears
      the accent. Left for part two: the five tabs, the bell, the Canvas tab and the review row in Workspaces.
      2026-09-11, part two: the sidebar is the one he approved. Five tabs (Chats, Workspaces, Notes, Canvas,
      Meetings), the inbox is a bell beside the account name with its own popover, search is a field under it, and the
      sidebar is a column instead of three absolutely placed rows. Chats holds the chats and Agents; Notes holds the
      page tree, All notes, My Tasks, Templates and Trash; Canvas lists this person's boards from canvas_boards and
      opens one in the column beside the sidebar; Meetings holds the calendar, the week ahead and the meeting notes;
      Workspaces holds "Review due cards" with its count (lib/space/due-cards.ts, counted at most once a minute) and
      the workspaces themselves. A sidebar saved before the rename opens on the tab that replaced its own, and
      lib/space/space-sidebar.test.ts pins the row, the rename and the fact that the old Library and Study have no
      door. Left: the live group game's tab (M15).
- [ ] M13 **Workspaces.** A workspace is a page that holds sources, chats, notes and what was made there: create,
      rename and share it; upload sources that its chats read; the Create tiles (flashcards, test, study guide, mind
      map); Made here; and the review row across workspaces. A note made in a workspace is the same record that shows
      under Notes.
      2026-09-11, part one: a workspace is a top-level page carrying `workspace`, so sharing, permissions, realtime
      and the page tree all work the day it is made, and its notes are simply the pages inside it. Its chats are
      chat_threads whose `meta.workspace` is the page (no migration: a chat belongs to at most one workspace and
      nothing queries by it). The Workspaces tab lists them with a colour square taken from the page's own id, opens
      them, and makes new ones; a workspace's own page offers a chat here and a note rather than the page templates.
      Left: sources and the chats that read them, the Create tiles, Made here, and the workspace overview.
- [ ] M14 **Canvas**, reset to the spatial board of #1141 and given the card kinds a canvas should hold: notes,
      images, links, groups and labelled arrows, drawn in the new design and collaborative over the workspace's
      realtime channels. No documents, no deliverables, no Office files on the board.
- [ ] M15 **The live group game** (the name is still to choose): a host screen, joining by link or code with an
      account, points and a leaderboard, and questions Nemesis writes from a workspace's sources.
- [ ] M16 **Retirements.** /study and /library/classic redirect, saved chat links that point at /study are migrated,
      and the front door flips for everyone once M12 to M15 are verified, which finishes M10.
