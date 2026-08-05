# Real-file compatibility matrix

What happens when a document **genuinely written by the application that owns the
format** goes through Nemesis's parsers. Not hand-built XML — every row below is
a file some real copy of Excel, Word or PowerPoint wrote and saved.

## How provenance is established

Producer is read out of the file's **own** `docProps/app.xml`, never from where
the file was downloaded:

```
<Application>Microsoft Excel</Application><AppVersion>15.0300</AppVersion>
```

A link that says "Excel spreadsheet" proves nothing; the `<Application>` tag is
the file describing itself. Any row whose producer cannot be established this way
is marked **unverified** and does not count as coverage.

🔴 **Uncovered producers are listed as gaps, never filled in with hand-built XML.**
A fixture we wrote ourselves tests our idea of the format, which is precisely the
thing a compatibility matrix exists to check.

## Covered

| File | Producer | Result | Units | Tables | Chunks | Notes |
|---|---|---|---|---|---|---|
| `fda-guidance.pdf` | **Acrobat PDFWriter 4.0 / Microsoft Word** | parsed, 458 ms | 37 pages, **37 read** | 0 | 94 | real 37-page government guidance; cites `page 1`, `page 2` |
| `msft-financial-sample.xlsx` | **Microsoft Excel 15.0300** | parsed, 107 ms | 1 sheet | 1 | 73 | 11,216 cells; dates decoded from real serials |
| `worldbank-classes.xlsx` | **Microsoft Excel 16.0300** | parsed, 49 ms | 3 sheets | 3 | 80 | 9,466 cells; two separate table regions found on one sheet |
| `poi-excel-sample.xlsx` | **Microsoft Excel 12.0000** | parsed, <1 ms | 3 sheets | 2 | 4 | formula preserved; empty third sheet reported unread |
| `poi-word-simple.docx` | **Microsoft Office Word 12.0000** | parsed, 8 ms | 2 sections | 0 | 2 | headingless — the page-break fallback made it 2 units, not 1 |
| `poi-word-tables.docx` | **Microsoft Office Word 12.0000** | parsed, 24 ms | 1 section | 1 | 3 | Russian/English/Uzbek runs, hyperlinks and emphasis kept; 5 visuals found, **0 readable, and it says so** |
| `poi-ppt-sample.pptx` | **Microsoft Office PowerPoint 16.0000** | parsed, 10 ms | 2 slides | 0 | 2 | slide titles became labels; speaker notes captured |

### Citations these files produce

Measured ranges, from the files themselves:

```
Sheet1!A1:P701
List of economies!A1:E219
List of economies!A221:B268     <- a second region on the same sheet
compositions!A1:D2086
First Sheet!A1:B2
Sheet Number 2!A6:D7
```

### Does the output match the visible source?

Checked by reading the raw parts out of the zip and comparing:

- **Dates.** `M2` holds `<v>41640</v>` with style index 6. Under the 1900 system
  that serial is 2014-01-01, and the parser produced `2014-01-01`; `41791`
  produced `2014-06-01`. The naive failure here is emitting `41640`.
- **The style decoy, in a real Microsoft file.** This workbook's `cellXfs` list
  includes `numFmtId="44"` (currency), `164` (a custom `m/d/yy h:mm`), `49`
  (text) and `14` (date). A cell's `s` indexes `cellXfs`; reading `cellStyleXfs`
  instead turns every plain number into a date. The parser read the right list —
  confirmed against a file we did not write.
- **Formulas.** `poi-excel-sample.xlsx` cell `D7` carries `SUM(A7:C7)` with the
  cached value `13`. Both survive; the formula is what answers "why is this
  number what it is".
- **Headers and column alignment.** The financial sample's header row comes back
  as `Segment | Country | Product | Discount Band | Units Sold | …`, matching the
  sheet, with values under the headings they belong to.
- **Honest gaps.** `poi-excel-sample.xlsx` has three sheets and one is empty; the
  parse reports `unitsRead: 2` of `unitsFound: 3` with `unitsUnread: [3]` rather
  than quietly claiming it read everything.
- **Slides against their own XML.** `poi-ppt-sample.pptx` holds two slides in the
  zip and two came back. Slide 1's text runs in the file are `Title of the first
  slide`, `Subtitle of the first slide`, `This bit is in italic green`; the chunk
  contains all three, keeps the italic as emphasis, and also carries the speaker
  note (`I am the notes of the first slide`) that is stored in a separate part
  and is easy to miss entirely. Each slide's title became its locator label.

## LibreOffice

LibreOffice 26.2.5.2 was installed and used to **re-save real documents through
its own export filters** — which is exactly what happens when someone opens a
colleague's file in LibreOffice and saves it. Every output says so itself:

```
<Application>LibreOffice/26.2.5.2$MacOSX_AARCH64 LibreOffice_project/cd7284b4…</Application>
```

| File | Producer | Result | Units | Tables | Chunks |
|---|---|---|---|---|---|
| `libreoffice/msft-financial-sample.xlsx` | **LibreOffice Calc 26.2.5** | parsed, 263 ms | 1 sheet | 1 | 73 |
| `libreoffice/poi-excel-sample.xlsx` | **LibreOffice Calc 26.2.5** | parsed, 3 ms | 3 sheets | 2 | 4 |
| `libreoffice/poi-ppt-sample.pptx` | **LibreOffice Impress 26.2.5** | parsed | 2 slides | 0 | 2 |
| `libreoffice/poi-word-simple.docx` | **LibreOffice Writer 26.2.5** | parsed, 3 ms | 2 sections | 0 | 2 |

🔴 **The result that matters is that the output is IDENTICAL to the Microsoft
originals.** Same chunk counts (73, 4, 2), the same measured ranges
(`Sheet1!A1:P701`, `First Sheet!A1:B2`, `Sheet Number 2!A6:D7`), the same dates
(`2014-01-01`), the same preserved formula (`SUM(A7:C7)` → `13`), the same slide
labels and speaker notes. Not "it opened" — the same answers, cell for cell, from
a different producer's bytes.

## Google Sheets

Ten workbooks pulled through Google's own export endpoint
(`/export?format=xlsx`) from documents published publicly.

**Producer fingerprint, verified structurally** rather than asserted: a Google
export contains **zero `docProps` entries at all** and adds `xl/persons/person.xml`.
Excel writes 2 docProps entries, LibreOffice writes 3, and both always write an
`<Application>` tag. The absence is the signature.

**10 parsed, 0 failed.** Highlights:

| File | Size | Sheets | Tables | Chunks | Cells | Dates | Formulas |
|---|---|---|---|---|---|---|---|
| `gs-1lkNJ0uQwb.xlsx` | 258 KB | 15 read / 15 | 14 | 510 | 10,529 | 1,076 | **4,423** |
| `gs-17PIrAN80z.xlsx` | 1.2 MB | 3 read / 4 | 3 | 2,476 | 47,696 | 0 | 0 |
| `gs-1wZhPLMCHK.xlsx` | 789 KB | 3 read / 3 | 2 | 1,516 | 11,162 | 0 | 0 |
| `gs-1TJAIiWmwY.xlsx` | 100 KB | 4 read / 4 | 5 | 61 | 6,481 | 93 | 0 |
| `gs-1_2BimdmWN.xlsx` | 15 KB | 1 read / 1 | **7** | 11 | 113 | 0 | 13 |

Worth noting from real data rather than fixtures:

- **Korean workbooks came through with their sheet names intact as locator
  labels** — `식당 및 카페, 베이커리!A11:K2471` and `시트1!B5:E11`. Field-agnostic
  and script-agnostic, on documents nobody wrote for this test.
- One sheet of a four-sheet workbook was **not** read and the coverage says so,
  rather than reporting four of four.
- Seven distinct table regions were found on a single sheet.

**One honest wart:** a workbook whose sheet is literally named `.` cites as
`.!A3:T15`. That is the sheet's real name, so the citation is correct and reads
badly. Not worth inventing a nicer name for — that would be inference.

## Gaps — genuinely uncovered

| Producer | Status | Why |
|---|---|---|
| **Google Docs / Slides** | **unverified** | only Sheets exports were obtained; no public Docs or Slides document was found to export |
| **Apple Pages / Numbers / Keynote** | **unverified** | none of the three is installed. Installing them needs an App Store sign-in, which Claude must not perform — this row needs the owner, or it stays a gap |

One acquisition route worth recording as closed: the SheetJS `test_files`
repository — organised by producer, and the obvious single source for most of
these — is **blocked by GitHub itself** (HTTP 403, terms-of-service block), not
merely missing.

---

# Final status matrix

🔴 **Everything below is marked from something directly exercised in this
session, or marked `unverified`. Nothing is inferred from "the code looks right".**

| | PDF | DOCX | PPTX | XLSX | TXT | Markdown |
|---|---|---|---|---|---|---|
| **Web production** | accepted by the route, **unverified** in prod | accepted, **unverified** in prod | accepted, **unverified** in prod | 🔴 **rejected — not a `FileKind`** | 🔴 **rejected** | 🔴 **rejected** |
| **iOS production** | in the picker, **unverified** | in the picker, **unverified** | in the picker, **unverified** | 🔴 **not in the picker** | 🔴 not offered | 🔴 not offered |
| **Producers tested** | Acrobat PDFWriter 4.0 (1 real file) | MS Word 12 (×2), LibreOffice Writer 26.2 (×1) | MS PowerPoint 16 (×1), LibreOffice Impress 26.2 (×1) | Excel 12/15/16 (×3), LibreOffice Calc (×2), **Google Sheets (×10)** | none | none |
| **Parsing** | ✅ 37 pages found, 37 read, 94 chunks | ✅ | ✅ | ✅ 15 real files, 0 failures | 🔴 **no parser exists** | 🔴 **no parser exists** |
| **Segmentation** | ✅ page units | ⚠️ **partial** — works only when the file has ZERO heading styles | ✅ slide units | ✅ sheets + multiple regions per sheet | — | — |
| **Retrieval** | unverified | unverified | unverified | ✅ **the only format proven storage → `match_source_chunks`** | — | — |
| **Citations** | ✅ `page 1` at parse + chunk | ⚠️ **`this document`** — see limitation | ✅ `slide 1` | ✅ `Forecast!B12:F19` through **all** stages | — | — |
| **Preview rendering** | **unverified** | **unverified** | **unverified** | **unverified** | — | — |
| **Limitations** | 🔴 **no `DocumentParser` face** — cannot enter the pipeline. OCR/vision path never exercised on a real scan | 🔴 **ONE styled title switches the fallback off entirely** (60 clauses → 3 units; the same + one Heading 1 → 1 unit of 4,305 tokens). 🔴 A body that is one paragraph of `w:br` lines is unbounded. 🔴 `citeLocator` ignores a section's `index`, so citations still read `this document` | figures are not extracted | 🔴 **unreachable by any user** | — | — |
| **Embedding** | 🔴 OFF | 🔴 OFF | 🔴 OFF | 🔴 OFF | 🔴 OFF | 🔴 OFF |

## The finding that governs all of it

🔴 **Nothing in production calls `ingestSource`.** No route, no edge function,
nothing. The four-layer pipeline is built, typechecked and tested, and the only
code that constructs its `parsers` map is a test fixture.

So no format can pass the first gate — *real upload/import path* — until the
pipeline is wired into a route. Three things block that independently:

1. **PDF has no `DocumentParser` face.** DOCX, PPTX and XLSX each expose one;
   PDF does not, so the most common academic format cannot be put in the map.
2. **XLSX is not an accepted upload kind.** `type FileKind = "pdf" | "docx" |
   "pptx" | "image"`, with no `xl/workbook.xml` probe and no XLSX type in the iOS
   picker. The most thoroughly validated parser here is unreachable.
3. **TXT and Markdown have no parser at all**, though `docKindFor` already maps
   them to `text`.

The honest reading: **DOCX and PPTX are the only formats both uploadable and
pipeline-ready**, and even they are unverified end to end in production.

## Correction — DOCX segmentation is partial, not done

Measured directly, after the change landed:

```
60 numbered clauses, no heading anywhere        ->  3 units, largest 2,009 tokens   OK
the same 60 clauses + ONE "AGREEMENT" title     ->  1 unit,  4,305 tokens           NOT FIXED
headingless, whole body one w:br paragraph      ->  1 unit,  4,303 tokens           NOT FIXED
```

🔴 **The fallback is gated on the document using no heading style ANYWHERE.** A
contract with a title, a filing with a cover-page heading, a manual with one
"Contents" heading — the ordinary shapes — all still collapse to a single unit,
which is the bug the work was meant to kill. The earlier claim that this was
proven on a real Word file was true only because that file happens to contain no
heading styles at all.

🔴 **A headingless document whose body is a single paragraph is still unbounded**
— how plain-text and OCR conversions routinely arrive, using `w:br` line breaks
instead of paragraph marks. This is a literal miss against "no headingless
document may become one unbounded unit". Retrieval still works (the chunker
splits the text); what is lost is locator granularity.

Neither is a threshold tweak. Closing the first means running the fallback
*inside* any unit still over the ceiling, which collides with the separate hard
requirement that heading-based documents stay behaviourally unchanged. Closing
the second means cutting one paragraph into several blocks, which changes what a
block means for every format.
