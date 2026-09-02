# iPhone app ↔ web app parity, September 2026

Owner, 2026-09-01: *"get the iOS app up to speed with the web app"*, with the ChatGPT iPhone app
as the reference for how every screen should look (34 screenshots, catalogued in the session
notes). The web app was itself built to that reference, so the target is one sentence:

> **The phone is the ChatGPT iPhone app's shape, carrying the Nemesis web app's content.**

## Where the two apps stand (main, 2026-09-01)

| Surface | Web (`apps/web`) | Phone (`apps/mobile`) |
|---|---|---|
| Front door | `/learn`: "Learn ‹subject›" + character + composer (`+` menu: upload + 7 capabilities, dictate, record, voice) | redirect into a fresh `chat_threads` thread |
| Sidebar | New canvas · Library · Projects · Plugins* · Calendar* — then Pinned / Projects / Canvases (from `learning_canvases` + `folders`) | Study · Library · Notebooks(off) · Calendar — then Pinned / Chats (from `chat_threads`) |
| Session | a Canvas (`learning_canvases.document`, conversation in `moments`) | a chat thread (`chat_threads` / `chat_messages`, retired on the web 2026-08-20) |
| Projects | `/projects` list + project page | none |
| Library | outputs (decks + notes) with folders, grid/list, search | folder tree of notes |
| Settings | one modal, 11 sections | bottom sheet, 4 groups (already the reference's shape) |
| Character | `NemesisAvatar` (SVG + rAF engine in `lib/avatar`) | none |

\* hidden until an app / a calendar app is connected.

The data layer needs no new backend: the web's canvas is client-side logic over Supabase tables
the phone can already read as the signed-in user (RLS), plus the same edge functions the phone
already calls (`nemesis-llm`, `nemesis-speak`). 315 of the 385 files in `apps/web/lib/learn` are
pure (relative imports only, no React, no DOM) and are imported by the phone by relative path
through ONE module, `apps/mobile/src/learn/web.ts`, so the moment shape, the capability list and
the history reconstruction have exactly one copy.

## Slices — each one visible on the simulator, each one shippable

1. **The phone shows your real canvases.** Sidebar = the web's nav rows and its Pinned /
   Projects / Canvases sections from `learning_canvases` + `folders`; row actions Pin · Rename ·
   Add to project · Delete; the bottom pill starts a new canvas. Home = the Learn front door
   (greeting, character stand-in, composer with the `+` menu and capability chips). A canvas
   screen renders the stored conversation from `moments` exactly as the web rebuilds it on reopen,
   and its composer sends a plain turn through `nemesis-llm`, appended as an `assistant` moment so
   the web sees it too.
2. **The teaching turn.** The canvas composer runs the web's own turn (`turn-router`,
   `strategy-llm-teacher`, capabilities → deliverables) instead of a plain reply; streaming
   progress lines; the Sources sheet; the message long-press menu (Copy · Read aloud · Retry).
3. **Projects and Library.** `/projects` list with filter chips + search, project page with
   Canvases | Sources tabs and the `…` menu; Library as outputs (decks + notes) with All / Decks /
   Notes chips; the document viewer with the floating composer.
4. **Character and voice.** Port the avatar engine to `react-native-svg` + reanimated; read-aloud
   through `nemesis-speak` (needs an audio module → a native build); voice conversation.
5. **Calendar and settings parity.** Week view, Google-parity editor; settings sections aligned.

Native changes (new modules, permissions) need an EAS build + TestFlight; everything else ships
over the air. The dev-client simulator build `07755c00` (fingerprint `e4b4584a…`) carries every
native module slices 1–3 need.

## Rules carried from the web

- A capability is a one-shot declaration on the next submission and clears on send (§38).
- `moments` is capped (80 rows, text budgets) — append through the web's own `appendMoment`.
- `territory` is a column the canvas object never carries; never write it from a save.
- `updated_at` is owned by the table trigger; the client never sends it.
