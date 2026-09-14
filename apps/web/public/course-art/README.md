# Course artwork

Drop an image here named after the course's slug and that course gets a picture, on the shelf and
on its own page. Nothing else to change: no database row, no code, no build step, no list to keep
up to date. Delete the file and the course goes back to its drawn motif.

```
apps/web/public/course-art/<slug>.webp
```

`manifest.json` in this directory lists all 186 courses with the exact filename each one wants,
plus its title, subject and what it covers. That file is the input for generating the set.

## The spec

| | |
|---|---|
| Format | WebP |
| Size | 1200 x 400 (3:1) |
| Weight | Under 60 KB each |
| Text in the image | None |
| Filename | The `file` field from `manifest.json`, exactly |

**Under 60 KB matters more than it sounds.** The shelf shows every course at once, so a visitor
loads up to 186 of these on one screen. At 60 KB that is 11 MB and already too much; at 300 KB it
is 56 MB and the page is unusable on a phone.

**No text, no titles, no numbers.** The course title is printed directly under the picture in the
app's own type. A title inside the image means it appears twice, in two different fonts, and it
cannot be translated or searched.

## Two crops, so keep the middle clear

The same file is used at two very different shapes, centre-cropped by CSS (`object-fit: cover`):

| where | drawn at | keeps |
|---|---|---|
| Shelf card | about 245 x 92 | the middle 2.7:1 |
| Course page | about 768 x 150 | the middle 5.1:1 |

So the safe area is a **letterbox strip across the middle**. Put the subject there. Anything in the
top or bottom quarter is cut off on the course page, and the far left and right edges are cut off
on a shelf card. Backgrounds and gradients should run to all four edges.

## Light and dark

The app has both themes and the picture is not swapped between them. A mid-tone image works in
both. Pure white and pure black backgrounds each disappear into one of the two page grounds, so
avoid them.

## House style

The rest of this product is quiet: one accent colour, near-black type, grey line work. Artwork
that shouts fights it. What works here is abstract and calm, in the spirit of the drawn motifs it
replaces (arcs, cells, lattice, waves, bars, orbits, grid). Let the subject of the course suggest
the shapes: orbits for Astronomy, a lattice for Chemistry, waves for Physics. Photographs of
people, stock-photo lighting and 3D renders all read as a different product.

## Missing files are normal

The drawn motif is painted underneath every card. If the file is not there, the `<img>` fails
quietly and the motif is what you see. Nothing logs an error and nothing looks broken, so the set
can be filled in a few courses at a time.
