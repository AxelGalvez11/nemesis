# Generate deliverables (slides, reports, handouts)

Use this skill when the student asks for a slide deck, presentation, report, brief,
handout, or one-pager. You BUILD A FILE and the app previews it beside the chat.

## The mechanism

1. Write ONE self-contained HTML file to `~/Documents/Nemesis Library/Exports/<Title>.html`
   (create the folder if missing; use the absolute home path, not `~`, when you write).
2. Everything inline: CSS in a `<style>` tag, no external fonts, images, or scripts.
3. The file appears automatically in the app's Library under the Exports folder, where
   it previews live — always tell the student it's there ("It's in Library → Exports").
4. ALSO end your reply with this EXACT link on its own final line (it opens the deck in
   the chat's side panel instantly). This must be the literal markdown token, not prose:
   `[Preview: <Title>](#preview/<URL-ENCODED ABSOLUTE FILE PATH>)`
   — URL-encode the absolute path (spaces → %20). Do not describe it in words instead;
   emit the actual `[Preview: …](#preview/…)` link or the panel won't open.
5. Mention that Print → Save as PDF (from the preview) gives them the PDF file.

## Hard rules

- **Grounding**: every fact, number, and citation comes from this conversation or from
  sources you actually retrieved. Cite inline (PMID/NCT/label) in small type on the
  slide or paragraph where the claim lives. Never invent content to fill a slide.
- **No product branding** in the file. No "Nemesis", no logos — the student presents
  this as their own work aid. Neutral, professional design only.
- Drafts, not submissions: you never submit or upload the deliverable anywhere.

## Slide deck format

- 16:9 sections, one `<section class="slide">` per slide; first slide = title + subtitle
  + date; content slides ≤ 5 bullets or one focused diagram/table; last slide =
  references list. 6–10 slides is the sweet spot.
- Base CSS (adapt colors/spacing, keep structure):

```html
<style>
  * { margin: 0; box-sizing: border-box; }
  html { scroll-snap-type: y mandatory; }
  body { font: 18px/1.55 -apple-system, "Segoe UI", sans-serif; color: #1a1a1a; background: #eceff1; }
  .slide { width: 100vw; height: 100vh; scroll-snap-align: start; padding: 7vh 9vw;
    display: flex; flex-direction: column; justify-content: center; background: #fff;
    border-bottom: 1px solid #e0e0e0; page-break-after: always; position: relative; }
  h1 { font-size: 2.6em; letter-spacing: -0.02em; line-height: 1.15; }
  h2 { font-size: 1.7em; letter-spacing: -0.01em; margin-bottom: 0.8em; }
  ul { padding-left: 1.1em; } li { margin: 0.45em 0; }
  .kicker { text-transform: uppercase; letter-spacing: 0.1em; font-size: 0.7em;
    color: #b3382e; font-weight: 600; margin-bottom: 1.2em; }
  .cite { position: absolute; bottom: 4vh; left: 9vw; right: 9vw; font-size: 0.65em;
    color: #777; }
  .num { position: absolute; bottom: 4vh; right: 5vw; font-size: 0.7em; color: #aaa; }
  @media print { .slide { height: 100vh; } @page { size: landscape; margin: 0; } }
</style>
```

## Report / handout format

- A4-ish document: title block (title, course, date), section headings, short paragraphs,
  tables where they beat prose, references section at the end with PMIDs as
  `https://pubmed.ncbi.nlm.nih.gov/<id>/` links.
- Base CSS: max-width 46rem centered, 16px/1.65 system sans, h1 2em with a thin bottom
  rule, h2 1.3em with 2em top margin, tables full-width with 1px #ddd borders and a
  shaded header row, `.cite` footnote size #777, `@page { margin: 2cm }` for print.

## Example ending of a reply

"Saved to Library → Exports. Print → Save as PDF when you need the file.
[Preview: ACE inhibitor cough — 6 slides](#preview/%2FUsers%2Fjane%2FDocuments%2FNemesis%20Library%2FExports%2FACE%20inhibitor%20cough.html)"
