# Connectable app logos

Seven product marks, used to identify the apps a learner can connect to Nemesis. Nothing here is
Nemesis artwork and nothing here may be redrawn.

| file | product | source |
|---|---|---|
| `canvas.svg` | Canvas LMS (Instructure) | `https://logos.composio.dev/api/canvas` |
| `google_classroom.svg` | Google Classroom | `https://logos.composio.dev/api/google_classroom` |
| `googlesheets.svg` | Google Sheets | `https://logos.composio.dev/api/googlesheets` |
| `notion.svg` | Notion | `https://logos.composio.dev/api/notion` |
| `one_drive.svg` | Microsoft OneDrive | `https://logos.composio.dev/api/one_drive` |
| `outlook.svg` | Microsoft Outlook | `https://logos.composio.dev/api/outlook` |
| `zoom.svg` | Zoom | `https://logos.composio.dev/api/zoom` |

Fetched 2026-08-31 from the logo service Composio serves its own connector list from, keyed by the
same toolkit slug this repo already uses (`meta.logo` on `GET /api/v3/toolkits`). Byte-for-byte as
delivered: **not traced, not recoloured, not re-cut**.

The four Google Workspace marks in `../google/` came straight from Google's own CDN and keep their
own provenance file. These seven come from one place because there is one place that has all of
them; where a vendor's own CDN is later preferred for a given mark, replace the file and change the
row above.

## Rules for these files

- **Unmodified.** Each vendor permits its product icon to identify an integration with that
  product, provided the mark is not altered, recoloured or combined with other marks. Editing any
  of these files is the one change that turns permitted use into a violation.
- **Only to name the product.** They label a connection to that app. They are not decoration and
  must not appear anywhere implying the vendor endorses Nemesis.
- **Served from here, never hot-linked.** A remote `<img src="https://logos.composio.dev/…">` would
  put a third party on the request path for every page view and break the day they re-cut an asset.
  None of these files references an external URL, so serving them locally is self-contained.
- 🔴 **Each is drawn with an `<img>`, never inlined into the page.** This is not a style
  preference, and these files prove the point harder than the Google set did. `googlesheets.svg`
  defines the ids `a`, `b` and `c`; `outlook.svg` defines fourteen; five of the seven point a
  `fill` at `url(#…)`. Inlined side by side in one document those ids collide and the browser
  resolves every `url(#a)` to whichever element came first, so Sheets would paint itself with
  another mark's gradient. An `<img>` keeps each SVG its own document, which is why every surface
  that draws these uses one.

To refresh: re-fetch the URLs above. The slugs are Composio toolkit slugs and match the `key` field
in `apps/web/lib/workspace/composio-apps.ts`, including `one_drive`'s underscore.
