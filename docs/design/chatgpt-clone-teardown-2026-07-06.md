# ChatGPT 100% clone — systematic teardown (2026-07-06, owner's Plus account, dark theme)

Method: every surface visited, every safe control clicked, DOM+computed styles probed via extension.
Destructive controls (Log out, Delete, Archive, Upgrade) captured visually, NOT pressed.
Mapping column = where it lands in our repo (apps/web).

## Captured so far (screenshots)
- Chat view + composer ("Ask anything", + button, effort "High ⌄", mic, voice orb)
- "+" menu: Add photos & files · Create image · Web search · Deep research · Gmail ·
  OpenAI Platform · Figma · Finances · "Type to search plugins, files & skills" footer
- Sources drawer: "Sources · 132" — card = favicon+publisher row / bold 2-line title /
  meta "by AUTHOR · YEAR · Cited by N — snippet…"
- Activity drawer (alternating search/reasoning blocks) — already cloned
- Library: title + Search + "New ⌄"; tabs All/Images/Files; filter + grid/list icons right;
  list = Name/Modified/Size table, thumb+name rows, "…" on row hover
- Scheduled: title + subtitle "Ask ChatGPT to schedule tasks, set reminders, or monitor for
  updates."; "Active ⌄" filter chip top-right; "Schedule a task" composer (+, mic, voice);
  active row = colored dot + bold name + "Monitoring · Next run in 24 hours"; squiggly divider;
  suggestion rows = ⊕ + emoji + bold title + one-line description
- Profile menu: name/plan row › · Upgrade plan · Personalization · Profile · Settings · Help › · Log out
- Settings → General: Appearance System⌄ (System/Light/Dark) · Contrast System⌄ · Accent color
  Yellow⌄ · Language Auto-detect⌄ · "Higher intelligence" toggle ("automatically use a higher
  intelligence setting when you ask a complex question") · Enable Dictation toggle
- Settings nav: General, Notifications, Personalization, Apps, Voice, Billing, Data controls,
  Storage, Safety, Security and login, Parental controls, Trusted contact, Account, Keyboard
- Sidebar: ChatGPT wordmark + collapse icon; New chat, Search chats, Library, Scheduled, Apps,
  More…; Pinned section; Projects section (expand shows nested chats + edit/… on hover;
  "Show more"); Chats list; footer = avatar + name + plan + apps icon

## Measured values
(appended below per probe)

### Probe 1 — global + sidebar (dark)
- body: bg rgb(0,0,0) PURE BLACK, text #fff, font -apple-system-body/ui-sans-serif stack, 16px/24px
- sidebar nav links: height 36px, radius 10px, padding 6px 10px, font 14px
- DOM semantics: projects navigate via "Open project home" button; chats pin/unpin buttons on hover;
  every row has "Open conversation options for <title>" menu button
- Library: native `Upload` file input button; Name/Modified/Size are SORTABLE column buttons;
  "Open filters" button; Grid view / List view toggle buttons; per-row "Open actions menu for <file>"
- Chat URLs: /c/<uuid>; project chats: /g/g-p-<id>/c/<uuid>; pages: /library, /scheduled, /apps

### Probe 2 — PROJECT page (this is the "upload files/context" surface the owner wants)
URL: /g/g-p-<projectId>  (chats inside: /g/g-p-<projectId>/c/<uuid>)
Header row: [folder icon+color button "Open project icon and color menu"] Title
  [Edit-title button] ........ [Share button] [⋯ "Show project details"/options]
Composer: "+ Add files and more" + placeholder "New chat in <Project>" + effort "High ⌄" + mic + voice
Tabs (tablist "Project sections"): **Chats** | **Sources**
  - Chats tab: chat rows (bold title / gray one-line preview / right date), divider lines
  - Sources tab: right controls "Sort sources: Newest ⌄" + "Filter sources: All ⌄"
    Empty state = dashed drop card, stacked app icons (Slack/GDrive/attach), "Give ChatGPT more
    context", subtitle "Upload sources, link drives, or connect apps like Slack…", "Add sources" btn
"Add sources" MODAL: title "Add sources" + ×; big dashed "Drag sources here" drop zone (upload-cloud
  icon); 4 source buttons row: **Upload** (upload icon) · **Text input** (text icon) ·
  **Google Drive** (GDrive icon) · **Slack** (slack icon). Upload = native file input.

### PharmaOrb mapping for Projects-as-context (owner ask)
Our /app/projects/[id] must gain: Chats|Sources tab pair; Sources tab with an "Add sources" modal.
HONEST subset for v1 (no Slack/GDrive OAuth yet): keep **Upload** (file → Supabase Storage, bound to
project_id) + **Text input** (paste context → stored as a project source row). Google Drive/Slack =
"Soon" disabled tiles, NOT faked. Project context then rides into /ask exactly like the existing
projectInstructions path (already wired: outgoing = "Project context (user-set): …\n\nQuestion: …").
Needs: a project_sources table (id, project_id, kind[file|text], name, content/url, bytes, created_at)
+ RLS; a small upload edge path or direct Storage upload with signed policy. Owner-gated migration.

### Appearance (owner ask: remove "grey", keep only white + black)
ChatGPT Settings→General→Appearance = System / Light / Dark (3). Our themes today: light(default) +
grey + dark. ACTION: drop "grey"; map to two — "light" (white) + "dark" (pure black #000 per probe 1,
NOT our current #0b0b0b near-black → owner wants literal ChatGPT). Theme toggle + Settings picker +
the no-flash script in layout.tsx all updated; migrate any stored theme==="grey" → "dark".

### ChatGPT composer "+" menu (owner: our tools button has too much / doesn't match)
ChatGPT "+" = Add photos & files · Create image · Web search · Deep research · Gmail · [connected apps…]
+ search field. OUR "+" today = Deep research/Discovery/Verify/Monitor/filters (too much, per owner).
ACTION: collapse to ChatGPT's shape — primary: **Add photos & files** (upload), **Web search**
(the fresh-info lane, once on), **Deep research** (our existing Pro report). Drop the noisy extras
from the menu (Discovery/Verify/Monitor move into their own surfaces or are removed from the composer).
