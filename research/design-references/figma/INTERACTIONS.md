# figma: observed interaction patterns

**Two systems in one brand.** The application and the marketing site use different type scales,
control heights and radii on purpose. This is the reference set's clearest evidence that a
productivity surface should step down in size and roundness rather than reflow a landing page.

**Semantic token grammar.** `--color-{role}-{context}-{prominence}-{state}` with `bg`, `text`,
`icon` and `border` as separate namespaces. Adopted wholesale in `/design/TOKENS.md`.

**"On" contexts are first class.** `text-onbrand`, `icon-ondisabled`, `icon-onselected` mean a
component on a coloured surface has a defined foreground rather than an improvised one. Adopted.

**Value-named tokens.** `--fig-space-8`, `--fig-radius-12`. The token cannot drift from its value
and nobody has to remember whether `md` is 6 or 8. Adopted.

**Two elevations for an entire product**, both 10% opacity with a very wide blur. Adopted.


