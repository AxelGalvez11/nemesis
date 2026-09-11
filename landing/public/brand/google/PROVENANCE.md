# Google product logos

Four official Google Workspace product marks, used to identify the apps a learner can connect to
Nemesis. Nothing here is Nemesis artwork and nothing here may be redrawn.

| file | product | source |
|---|---|---|
| `drive.svg` | Google Drive | `https://www.gstatic.com/images/branding/productlogos/drive_2026/v2/web/192px.svg` |
| `gmail.svg` | Gmail | `https://www.gstatic.com/images/branding/productlogos/gmail_2026/v2/web/192px.svg` |
| `calendar.svg` | Google Calendar | `https://www.gstatic.com/images/branding/productlogos/calendar_2026/v2/web/192px.svg` |
| `docs.svg` | Google Docs | `https://www.gstatic.com/images/branding/productlogos/docs_2026/v2/web/192px.svg` |

Fetched 2026-08-30 from Google's own CDN, as served on `workspace.google.com`. Byte-for-byte as
delivered — **not traced, not recoloured, not re-cut**. Owner asked for the real marks on 2026-08-30
after I had used our own icons in their place.

## Rules for these files

- **Unmodified.** Google's brand guidelines permit their product icons to identify an integration
  with that product, provided the mark is not altered, recoloured or combined with other marks.
  Editing any of these files is the one change that turns permitted use into a violation.
- **Only to name the product.** They label a connection to Drive, Gmail, Calendar or Docs. They are
  not decoration and must not appear anywhere that implies Google endorses Nemesis.
- **Served from here, never hot-linked.** A remote `<img src="https://www.gstatic.com/...">` would
  put Google on the request path for every page view and break the moment they re-cut the asset.
- 🔴 **Each is drawn with an `<img>`, never inlined into the page.** All four define internal ids
  (`mask id="a"`, `fill="url(#a)"`, `mask0_3724…`) and two of them use the id `a`. Inlined side by
  side in one document those ids collide and the browser resolves every `url(#a)` to whichever
  came first — Gmail would paint itself with Drive's gradient. An `<img>` keeps each SVG its own
  document, which is why the row uses one.

To refresh: re-fetch the URLs above. If a path 404s, Google has re-cut the set; the current URLs are
readable from the `<img>` tags on `workspace.google.com`.
