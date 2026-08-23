/**
 * Nemesis Lab — the parser inspector's only server call.
 *
 * 🔴🔴 THE RULE THIS FILE EXISTS TO OBEY: THE LAB MAY HAVE SPECIAL OBSERVABILITY, NEVER SPECIAL
 * PARSING. Every byte of reading below is `parseDocument` — the same function the upload route and
 * the background worker call, on the same options, with the same routing. What is different is
 * only what is REPORTED: this route hands back the whole `DocumentModel`, the coverage record, the
 * routing reason and the figure pixels, where production hands back text and stores the rest.
 *
 * 🔴 AND IT REPAIRS NOTHING. There is no normalisation, no beautification, no "the table looked
 * empty so we fell back to the text" anywhere in this file. If the parser assigned a cell to the
 * wrong column, the wrong column is what the owner sees. A page that inspects a parser and quietly
 * improves its output is worse than no page at all, because it converts a real defect into a
 * measurement that says the defect is not there.
 *
 * 🔴 IT WRITES NOTHING. No `persistParse`, no `recordSummary`, no storage upload, no row of any
 * kind. Inspecting a file must not put it in the owner's Library, must not consume a vendor slot's
 * record, and must not leave a `parsed_documents` row behind that a later reader would treat as a
 * real parse of a real source. Persistence happens exactly once, deliberately, when the owner
 * presses "Open in Tutor Lab" — a different route, a different decision.
 *
 * 🔴 UNAUTHENTICATED, AND THAT IS WHY THE GATE IS FIRST. The production upload route resolves a
 * device key before it reads a byte, because it can turn an upload into a Gemini bill. This route
 * has no key to resolve — it is for one person on their own laptop — so the ONLY thing between it
 * and the world is `labRouteRefusal`, which is why the gate is a shared, tested helper rather than
 * an `if` here. See lib/lab/gate.ts.
 */
import { NextResponse } from "next/server";

import { countDocument, documentToText, unitTexts } from "@nemesis/shared";

import { labRouteRefusal } from "@/lib/lab/gate";
import { LAB_LANES, type LabFigureAsset, type LabLane, type LabParseReport } from "@/lib/lab/report";
import { llamaConfigured } from "@/lib/notebooks/llamaparse-ocr";
import { mistralConfigured } from "@/lib/notebooks/mistral-ocr";
import {
  kindFor,
  parseDocument,
  parseWithVendor,
  sniffKind,
  type DocumentKind,
  type ParseOutcome,
} from "@/lib/notebooks/parse-document";
import { visionConfigured } from "@/lib/vision/read";

export const runtime = "nodejs";
/** A picture-heavy lecture with the vision pass armed is minutes of work, exactly as it is on the
 *  worker. The inspector is allowed to be slow; it is never allowed to be a different parse. */
export const maxDuration = 300;

function laneFrom(value: unknown): LabLane {
  return typeof value === "string" && (LAB_LANES as readonly string[]).includes(value) ? (value as LabLane) : "production";
}

/** How many megabytes of figure pixels one inspection may carry back. */
const FIGURE_BUDGET_BYTES = 12 * 1024 * 1024;

function figuresForWire(
  figures: readonly { entry: string; contentKey: string; mime: string; bytes: Uint8Array; width: number | null; height: number | null }[],
): { assets: LabFigureAsset[]; withheld: number } {
  let spent = 0;
  let withheld = 0;
  const assets = figures.map((figure) => {
    const fits = spent + figure.bytes.byteLength <= FIGURE_BUDGET_BYTES;
    if (fits) spent += figure.bytes.byteLength;
    else withheld += 1;
    return {
      bytes: figure.bytes.byteLength,
      contentKey: figure.contentKey,
      dataUrl: fits ? `data:${figure.mime};base64,${Buffer.from(figure.bytes).toString("base64")}` : null,
      entry: figure.entry,
      height: figure.height,
      mime: figure.mime,
      width: figure.width,
    };
  });
  return { assets, withheld };
}

/** The `document`/`figures` half of a report, for the two outcome shapes that carry one. */
function documentPart(outcome: ParseOutcome): Pick<LabParseReport, "document" | "counts" | "unitText" | "figures" | "figuresWithheld"> {
  const parsed = outcome.ok || outcome.reason === "no-text" ? outcome.document : null;
  const raw = outcome.ok || outcome.reason === "no-text" ? (outcome.figures ?? []) : [];
  if (!parsed) return { counts: null, document: null, figures: [], figuresWithheld: 0, unitText: null };
  const model = parsed.model ?? null;
  const { assets, withheld } = figuresForWire(raw);
  return {
    counts: model ? countDocument(model) : null,
    document: {
      coverage: parsed.coverage,
      kind: parsed.kind,
      // 🔴 THE MODEL'S OWN SERIALISATION WHEN THERE IS A MODEL, and the parse's `text` when there is
      // not. They are the same string on every lane that produces structure — `parseDocument`
      // derives `text` from the model — and printing `documentToText` here keeps the Markdown tab
      // honest about which one it is showing when a lane produced no structure at all.
      model,
      readBy: parsed.readBy ?? null,
      routeReason: parsed.routeReason ?? null,
      skippedFigures: parsed.skippedFigures ?? null,
      text: model ? documentToText(model) : parsed.text,
      title: parsed.title,
    },
    figures: assets,
    figuresWithheld: withheld,
    unitText: model ? unitTexts(model) : null,
  };
}

export async function POST(req: Request): Promise<Response> {
  const refusal = labRouteRefusal();
  if (refusal) return refusal;

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Attach a file to inspect." }, { status: 400 });
  }
  const lane = laneFrom(form?.get("lane"));
  // 🔴 OFF UNLESS ASKED, MATCHING `ParseOptions.lookAtFigures`'s OWN DEFAULT. Opening the inspector
  // must never bill a vision call; the owner arms it per inspection.
  const lookAtFigures = form?.get("figures") === "look";

  const bytes = new Uint8Array(await file.arrayBuffer());
  // pdf.js DETACHES the buffer it is handed. The vendor lane needs the bytes after the router has
  // already read them, so every lane gets its own copy rather than one lane working by luck.
  const forParse = bytes.slice();
  const kind = kindFor(file.name, file.type) ?? sniffKind(bytes);

  const configured = {
    llamaparse: llamaConfigured(),
    mistral: mistralConfigured(),
    vision: visionConfigured(),
  };

  const startedAt = Date.now();
  let outcome: ParseOutcome;
  let laneRan: LabLane | "none" = lane;
  let laneNote: string | null = null;

  if (lane === "vendor") {
    // 🔴 THE PAID REFERENCE, AND IT ONLY EVER RUNS BECAUSE THE OWNER PRESSED THIS. Never on open,
    // never as a default, never as a silent second opinion beside the production lane.
    if (!kind) {
      outcome = { ok: false, reason: "unsupported" };
      laneRan = "none";
      laneNote = "Nemesis does not recognise this file type, so no lane ran.";
    } else {
      const vendored = await parseWithVendor(forParse, file.name, file.type, kind, { vendorAllowed: true });
      if (vendored) {
        outcome = vendored;
      } else {
        // 🔴 A LANE THAT DID NOT RUN MUST NOT RENDER AS AGREEMENT. `parseWithVendor` returns null
        // both when no vendor reads this format and when the vendor's key is absent, and an empty
        // result shown beside a native result looks exactly like "the two parsers agree". Say which.
        outcome = { ok: false, reason: "unsupported" };
        laneRan = "none";
        laneNote = vendorNote(kind, configured);
      }
    }
  } else {
    outcome = await parseDocument(forParse, file.name, file.type, {
      lookAtFigures,
      vendorAllowed: lane === "production",
    });
  }

  const elapsedMs = Date.now() - startedAt;

  const report: LabParseReport = {
    configured,
    elapsedMs,
    fileBytes: bytes.byteLength,
    fileName: file.name,
    fileType: file.type,
    kind,
    lane,
    laneNote,
    laneRan,
    lookedAtFigures: lookAtFigures,
    outcome: outcome.ok ? { ok: true } : { ok: false, reason: outcome.reason },
    ...documentPart(outcome),
  };

  return NextResponse.json(report);
}

/** Why the vendor lane produced nothing, in the owner's words rather than a null. */
function vendorNote(kind: DocumentKind, configured: { mistral: boolean; llamaparse: boolean }): string {
  if (kind === "pdf") {
    return configured.mistral
      ? "The paid PDF reader declined this file."
      : "No paid PDF reader is configured here (MISTRAL_API_KEY is unset), so this lane did not run. This is not agreement with the native read.";
  }
  if (kind === "docx" || kind === "pptx") {
    return configured.llamaparse
      ? "The paid Office reader declined this file."
      : "No paid Office reader is configured here (LLAMAPARSE_API_KEY is unset), so this lane did not run. This is not agreement with the native read.";
  }
  return `No paid parser reads ${kind} files. Nemesis always reads these itself.`;
}
