# Obsidian's canvas, read out of its own bundle (2026-09-06)

Owner: *"can you look into obsidian bundle too for their canvas tool as well? their canvas allows
users to drop in media, notes, webpages, and form groups"*.

Read from `/Applications/Obsidian.app/Contents/Resources/obsidian.asar` (358 files; `/app.js` is
3.9 MB and holds the whole canvas). Nothing here is guessed from the UI.

## Four kinds of card, one maker each

| kind | maker | default size | notes |
|---|---|---|---|
| text | `createTextNode({pos, size, position, text, save, focus})` | **250 x 60** | starts editing the moment it lands |
| file | `createFileNode({pos, size, file, subpath, …})` | **400 x 400** | any vault file: a note, an image, a PDF, audio. `subpath` points at one heading or block inside it |
| link | `createLinkNode({pos, size, url, …})` | 400 x 400, and **640 x 360** when the url is a video | a live webpage as a card |
| group | `createGroupNode({pos, size, label, …})` | 400 x 400 | label defaults to "Untitled group" and is focused for renaming at once |

Dropping several files at once is `createFileNodes(files, {x, y})`: a grid **ten across**, spaced
`width + 45` and `height + 45`. So twelve dropped files land as ten and two, never a pile.

## 🔴🔴 A group owns whatever is inside it, and stores no list

`createGroupNode` is made from the selection's bounding box **padded by 20**, and membership is
answered live by `canvas.getContainingNodes(bbox)`. Moving a card into a group's rectangle joins it;
dragging the group moves what is inside because of where those cards are, not because of a field.
Its saved data is only `{type: "group", label?, background?, backgroundStyle?}`.

That is the whole trick, and it is why grouping in Obsidian never has a broken-membership state.

## The rest of the model

- **Edges** carry `{id, fromNode, fromSide, fromEnd, toNode, toSide, toEnd}`: which side of the card
  the line leaves and enters, and whether each end wears an arrow. Ours has neither side nor end.
- **The file** is `{nodes: [...], edges: [...]}` (the JSON Canvas format Obsidian publishes as an
  open spec), so a canvas is a plain document that other tools can read.
- **Config**: `zoomMultiplier: .5`, `objectSnapDistance: 15`, `minContainerDimension: 50`, and both
  `snapToObjects` and `snapToGrid` **on by default**.
- Every node keeps a z-index that lifts on touch, and a `canvas-node-label` above the card.

## What this is worth to our board

Ours already has the cards, the sources, the outputs and the edges. What Obsidian has that we do not:

1. **A group**, made from a selection and holding by geometry. It is the cheapest thing on this list
   and the one the owner named.
2. **A webpage as a card.** We attach a page as a source; Obsidian keeps it on the canvas as a thing
   you can put beside a note.
3. **Snapping**, to other cards and to a grid, which is most of why their boards look tidy.
4. **Edge sides and arrowheads**, so a line means a direction rather than a link.

Not worth copying: their file-per-canvas format (ours lives in a row), and their text card, which is
a note editor. Nemesis annotates and never edits (`annotate-never-edit`), so our text card is the
learner's own note and stays as it is.
