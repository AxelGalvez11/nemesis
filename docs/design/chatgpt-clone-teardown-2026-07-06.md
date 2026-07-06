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

### Probe 3 — EXHAUSTIVE control sweep + measured tokens (dark, computed styles)
Method note: clicked every control on every surface below; probed getComputedStyle at each. Stopped
only where nothing remained clickable (destructive controls — Log out / Delete / Archive / Upgrade —
photographed, not pressed).

**Global (dark)**
- page bg #000 (rgb 0,0,0) PURE BLACK · text #fff · font -apple-system/ui-sans-serif · 16px / 24px
- sidebar nav link: 36px tall, radius 10px, pad 6px 10px, 14px

**Composer pill** (`--composer-surface-primary`)
- bg #212121 (rgb 33,33,33) · radius **28px** · minHeight 52px · pad 5px 8px · inset border rgba(255,255,255,.2) 0 0 1px
- textarea 16px / 26px line · placeholder "Ask anything" (home) / "Chat with ChatGPT"
- left: "+" (Add files and more, tooltip shows "@") · right: effort chip "High ⌄" · mic (Start dictation) · voice orb (Start Voice, amber)
- send button appears only when text present

**Effort dropdown** (composer chip): header "Intelligence" (dimmed) · Instant · Medium · High(✓) · divider · "GPT-5.5 ›" submenu → GPT-5.5(✓)/GPT-5.4/GPT-5.3/o3

**Popover/menu tokens** (model menu, "+" menu, profile menu): bg **#353535** (rgb 53,53,53) · radius 16px · pad 6px 0 · shadow `0 8px 16px rgba(0,0,0,.32), inset 0 0 1px rgba(255,255,255,.2)` · items 36px tall, pad 6px 10px, radius 10px, 14px

**Modal/dialog tokens** (Settings, Search, Add sources): bg #212121 (settings) / #2f2f2f (search) · radius 16px · width 680px · shadow `0 8px 16px rgba(0,0,0,.32)` (settings) / `0 14px 62px rgba(0,0,0,.25)` (search)

**Toggle switch**: 32×20px, radius full, ON = **#3a83f7** (rgb 58,131,247 — the ChatGPT blue accent), OFF = gray

**"+" composer menu** rows: Add photos & files (Upload from computer) · Create image · Web search (Find real-time news and info) · Deep research (Get a detailed report) · [connected apps: Google Calendar/Gmail/Figma/Finances/Supabase…] · footer search "Type to search plugins, files & skills"

**Search chats modal** (Cmd+K): 680px, radius 16px; input "Search chats…" + ×; pinned "New chat" row; date-grouped ("Today") chat rows = bubble icon + title

**Sidebar** (full): wordmark "ChatGPT" + collapse toggle · New chat · Search chats · Library · Scheduled · Apps · More… · Pinned (projects/convos, unpin + options on hover) · Projects (folder icon; "Open project home" + "Open project options"; expand shows nested chats + pin/options; "Show more") · Chats list · footer: avatar+name+plan (opens profile menu) + apps icon · also: "Turn on temporary chat" button, "Skip to content" a11y link

**Profile menu**: name/plan row › · Upgrade plan · Personalization · Profile · Settings · Help › · Log out

**Settings tabs** (left nav, 16 total): General · Notifications · Personalization · Apps · Voice · Billing · Data controls · Storage · Safety · Security and login · Parental controls · Trusted contact · Account · Keyboard
- General: Appearance (System/Light/Dark) · Contrast · Accent color (Yellow…) · Language · Higher intelligence toggle · Enable Dictation toggle
- Personalization: Base style and tone (Default⌄) · Characteristics (Warm/Enthusiastic/Headers&Lists/Emoji each ⌄) · Fast answers toggle · Custom instructions textarea · About you

**Library**: title + "Search" input + "New ⌄"; tabs All/Images/Files; "Open filters" + Grid/List toggle; sortable columns Name/Modified/Size; rows = thumb + name + date + size + "Open actions menu for <file>"; native Upload file input

**Scheduled**: title + subtitle · "Active ⌄" filter · "Schedule a task" composer (+ / mic / voice); active task row = colored dot + name + "Monitoring · Next run in 24h"; squiggly divider; suggestion rows = ⊕ + emoji + title + desc

**Project page** (/g/g-p-<id>): folder icon/color menu · title + edit · Share · ⋯ (Project settings / Pin project); composer "New chat in <Project>"; tabs Chats | Sources; Sources: Sort(Newest)/Filter(All) + "Add sources" → modal [drag zone + Upload / Text input / Google Drive / Slack]

**Apps page** (/apps): title + "Search apps" · promo carousel (pause/dots) · Featured/Lifestyle/Productivity tabs · 2-col app cards (icon/name/desc/chevron) — LOW priority for us (no 3rd-party apps)

### CLONE TOKEN MAP → PharmaOrb globals.css (dark = pure black ChatGPT)
--bg #000 · --surface #212121 (composer/settings) · --raised #353535 (menus/popovers) ·
--surface-2 #2f2f2f (search modal) · --text #fff · --text-2 ~#b4b4b4 · accent(actions) #3a83f7 blue ·
radius: pill 28px, menu/modal 16px, menu-item 10px · menu shadow `0 8px 16px rgba(0,0,0,.32), inset 0 0 1px rgba(255,255,255,.2)`
Light theme = ChatGPT light (page #fff, composer #f4f4f4-ish) — capture separately if needed.
