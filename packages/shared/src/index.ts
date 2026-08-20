// Nemesis shared contract — FROZEN at the end of Phase 3 (IMPLEMENTATION_PLAN.md §8).
//
// This is the app <-> backend boundary. Phase 6 (mobile) builds against these
// shapes; changing one after the freeze is a breaking change, so additions
// should be optional fields, not renames/removals.
//
// The answer shape is the deliberate SUPERSET of doc-20 (6 narrative sections,
// incl. safety_notes) and the §8 JSON sketch (plain_english_summary +
// evidence_grade + answer_sections + citations + safety_flags). Freezing the
// superset now means safety_notes has a home and the contract does not reopen
// in Phase 6.

export * from "./answer.ts";
export * from "./claim-relation.ts";
// First-run setup rules. Shared rather than per-app because a student who names
// a course on their laptop and then opens their phone must get the same answer
// about whether they are new, and the same tidying of the same typed words.
export * from "./onboarding.ts";
export * from "./discovery.ts";
export * from "./search.ts";
// How the product writes, shared so the web prompt and the phone prompt cannot
// drift apart. See writing-voice.ts for why this is not a chat skill.
export * from "./writing-voice.ts";
// What a student MEANT, read once for the whole product. The phone used to carry its own copy of
// the classifier this replaced, with one of the thirteen regexes already drifted between them.
export * from "./chat-intent.ts";
// ...and what the product can DO about it, which is arithmetic over facts about our own stream
// rather than a reading of anything.
export * from "./chat-decision.ts";
// The document-level half of the same source guide, for turns that SAVE
// something. Separate from the voice because it costs nothing on the turns it
// does not apply to — see ai-writing-tells.ts for the split.
export * from "./ai-writing-tells.ts";
// Where the student's words end and a stranger's document begins. Shared for the
// same reason as the voice: two prompt strings in two apps, one rule.
export * from "./untrusted-content.ts";
export * from "./evidence.ts";
// Phase-4 evidence-scoring engine (§9): the deterministic tier core. Pure
// functions + signal spec; the LLM only writes rationale/limitations prose.
export * from "./evidence-scoring.ts";
// Phase-5 watchlist/digest (§8/§10): shared shapes + the deterministic doc-12
// digest-ranking comparator (pure, like the §9 tier core).
export * from "./watchlist.ts";
export * from "./digest-ranking.ts";
// My Health Context (user_health_context, 0109): user-owned, read/edit/delete.
export * from "./health-context.ts";
// Phase-6a backend gaps (§8): GET /compare structured comparison shapes.
// (SourceDetail for GET /sources/{id} lives in search.ts alongside SourceRef.)
export * from "./compare.ts";
// THE CANONICAL PLAN: free | nemesis, with billing interval stored separately.
//
// 🔴 NAMED, NOT `export *`, AND DELIBERATELY NOT YET EXPORTING `effectivePlan`.
// `entitlements.ts` still exports the OLD ladder-ranking `effectivePlan`, and
// two modules exporting that name through one barrel is an ambiguity the
// compiler rejects. Until the sale path is migrated (see the PR description),
// the ladder version remains the live one and this module is the destination —
// exporting both under one name would let a caller get whichever the bundler
// happened to pick, which is the worst of the two states.
export {
  annualPerMonthCents,
  annualSavingPercent,
  canonicalPlan,
  effectivePlanCode,
  entitlementPlanCode,
  formatUsdCents,
  FREE_VOICE_SECONDS_MONTH,
  intervalFromStripe,
  intervalLabel,
  isInternalPlan,
  isLegacyPlanCode,
  isPaid,
  NEMESIS_ANNUAL_CENTS,
  NEMESIS_MONTHLY_CENTS,
  NEMESIS_VOICE_SECONDS_MONTH,
  planLabel as canonicalPlanLabel,
  priceCents,
  VOICE_COUNTER_KEY,
  VOICE_ENTITLEMENT_KEY,
  voiceSecondsForCharacters,
  voiceSecondsForPlan,
  type BillingInterval,
  type BillingProvider,
  type Plan,
} from "./plan.ts";

// MVP web-beta entitlements + usage snapshots (0122).
export * from "./entitlements.ts";
// Missions (scheduled background deep-research runs): types + cadence math + entitlement + labels (pure).
// The cadence math is here so the edge function and mobile clients can advance next_run_at identically.
export * from "./missions.ts";
// Mission "report ready" email: PURE content builder for scheduled research completion notifications.
// The send I/O lives in the research edge function; this module builds user-visible email content.
export * from "./mission-email.ts";
// Deep Research report contract (research-modes): the multi-step, cited REPORT
// produced by plan -> gather -> synthesize -> faithfulness. Additive, optional.
export * from "./research.ts";
// Journal-club appraisal: PURE shaper turning a structured appraisal into a ResearchReport.
export * from "./appraisal-report.ts";
// Publishable-reports: PRISMA-overclaim guard + numbered citation formatter (pure).
export * from "./forbidden-phrases.ts";
export * from "./citation-format.ts";
// Source enrichment: PMID/DOI extraction for source trust badges and cache keying.
export * from "./source-ids.ts";
// Research Map (per-project connection graph): pure node/edge aggregation from saved-item citations.
export * from "./research-map.ts";
// Evidence-base table helpers (publishable-reports): pure citation -> row mapping shared by the
// on-screen report and the docx/pptx exports so both render the same body-of-evidence summary.
export * from "./citation-meta.ts";
// Meta-analysis (deliverables track): pure inverse-variance + DerSimonian-Laird risk-ratio pooling
// with Q / I^2 / tau^2. Real statistics in code — NEVER LLM-guessed. Validated against metafor's
// published BCG analysis (Q = 152.2330). Extraction + go-live are owner-gated, not wired yet.
export * from "./meta-analysis.ts";

// Forest-plot figure: the iconic meta-analysis graphic, computed (PURE) from the pool above. A layout
// model for theme-aware React rendering + an SVG string for the Word/PDF/PPT export. Draws only numbers
// the pool produced — never an LLM-drawn figure.
export * from "./forest-plot.ts";
// Source Attribution (NotebookLM pattern): "Built from N sources · method · date" — a deterministic
// summary of what a report was built from, rendered at the foot of every generated deliverable.
export * from "./report-attribution.ts";

// Structured abstract (Background/Methods/Results/Conclusions) for a meta report. The Results line is
// computed from the real pool — never LLM-stated. Null unless the report actually pooled.
export * from "./meta-abstract.ts";

// Study-type badge: PURE label derived from a citation's PubMed PublicationType / ClinicalTrials.gov
// study_type fields ("Meta-analysis", "Randomized controlled trial", "Interventional trial · Phase 3").
// Never an LLM guess — computed verbatim or omitted (no false badge).
export * from "./study-type.ts";

// "Where the science stands": PURE evidence-MATURITY signal (well_studied / emerging) computed from
// the cited sources' study-type metadata. Positive-only — null (no badge) when there's no signal to
// stand behind. Never an LLM guess; consensus/"contested" is left to the meta engine's heterogeneity.
export * from "./science-state.ts";

// Live-monitoring (WS-D) change detection: PURE dated-diff over an accumulating per-watch known-source
// set. Detects change by diffing source-API results by date, never by diffing engine output (avoids
// retrieval-jitter false alerts). Cold-start baselines silently; per-source classifier flags the loud
// conclusion-mover alerts (new high-tier study / retraction) reusing the study-type metadata.
export * from "./watch-detect.ts";

// Live-monitoring UI: the client WatchEvent shape + the PURE split into loud alerts / quiet "what's
// new" feed / the walled-off news list (the watch detail view renders from this; the news wall is
// re-enforced here defensively).
export * from "./watch-events.ts";

// Monitoring "browse popular topics": the curated, hand-vetted catalog (drugs/conditions/classes) +
// the PURE watch-field builder. The tappable starting points that complement the autocomplete.
export * from "./browse-topics.ts";

// Live-monitoring tier gating: PURE read of the per-plan watch entitlements (limit / daily / email)
// + the allowed-cadence resolver. Defaults to the free-tier floor when keys are absent.
export * from "./watch-entitlements.ts";

// Live-monitoring email digest: PURE builder of the same-day digest of LOUD alerts (alerts-only; the
// quiet feed + walled news are never emailed). The send/schedule is owner-gated; this is the content core.
export * from "./watch-digest.ts";

// Score feature ("Percentile Engine" / Strava-for-longevity): two PURE, non-diagnostic primitives.
//   • percentile.ts — places a raw biomarker value on a reference-population percentile (NOT a clinical
//     threshold). Seed reference data is ILLUSTRATIVE pending real NHANES/cohort ingestion (see file).
//   • health-score.ts — rolls metric percentiles up into pillar scores + one composite rank, with an
//     evidence-weight hook the "living score" turns. Wellness framings only; never a disease label.
export * from "./percentile.ts";
export * from "./health-score.ts";

// Missions: scheduled background research (cadence/deliver types, entitlement + next-run helpers).
export * from "./missions.ts";
// Evidence distribution charts (study-design mix + publications-by-year): PURE, deterministic SVG-layout
// builders over the report's real citation metadata (studyTypeLabel / citationYear). Null when the data is
// too thin to be honest. Rendered behind NEXT_PUBLIC_ENGINE_VISUALS (default off).
export * from "./evidence-charts.ts";

// Evidence map points (Litmaps scatter plot): x = publication year, y = evidence weight, r = support score.
// Pure geometry module for rendering citation sources on a 2D plane.
export * from "./evidence-map-points.ts";

// Gap test-runner (meta): the comparability gate between a gap's extracted studies and the meta engine
// — clusters by outcome, pools comparable clusters via poolRiskRatio, abstains honestly otherwise.
// PURE; reuses the computed-statistics engine (never LLM-guessed). Extraction + UI wiring are owner-gated.
export * from "./gap-meta-test.ts";

// Field-router (beyond-medicine prerequisite): PURE, deterministic classifier that maps a query to a
// field (→ source-set + in-silico executability) and to the safety systems to engage. Safety is
// signal-driven and additive — a health/drug signal keeps the medical floor on even inside a CS query.
// Deterministic spine; an LLM classifier is the owner-gated refinement that feeds the same contract.
export * from "./field-router.ts";

// Auto-depth: PURE depth picker for the simplified "Auto" composer mode — fast vs thorough from the
// query shape (length / multi-part / comparison markers). Deterministic; an LLM router refines later.
export * from "./auto-depth.ts";

// Real-World Signal (researcher-facing): PURE aggregation of patient-reported outcomes into descriptive
// per-intervention COUNTS — never an effect estimate — graded at the lowest (anecdotal) tier and walled
// from the cited evidence, abstaining below a minimum-reports floor. A hypothesis-generation / gap-detection
// signal for researchers (feeds the discovery engine), not consumer advice. Safety pass over reported
// stacks + sourcing are owner-gated follow-ups.
export * from "./realworld-signal.ts";

// Stack safety (Real-World Signal Phase B): PURE checker that flags WELL-ESTABLISHED dangerous drug/
// supplement combinations in a reported regimen, for a researcher's review. A curated, conservative SEED
// (clinical review + a licensed source pending) — a flag means a known danger; absence of a flag != safe.
export * from "./stack-safety.ts";

// Per-claim Evidence Meter (trust layer): PURE, DETERMINISTIC, design-weighted score for a single
// answer point's cited sources — score = design weight × support-level multiplier, plus a small
// capped corroboration bonus. Never vote-counted: one meta-analysis outscores any pile of weak
// mentions. "contested" label is reserved for a future scite-contrast signal, not wired here.
export * from "./claim-meter.ts";

// Per-claim reference markers for deliverable exports (PPT/DOCX/PDF): claimRefMarker renders the
// " [1,3]" tag a claim's bullet line carries; referenceLines renders the numbered reference list
// (with URL/DOI) in the same chunk_tag digit order, so a marker always points at the right line.
export * from "./claim-refs.ts";

// Report title cleanup: strip the Ask flow's "\n\nFocus: …" scoping suffix, normalize + cap for the
// Library / workspace rows. PURE, display-only.
export * from "./report-title.ts";

// Relative "time until" ("in 2 h" / "in 3 d" / "due now") for the Scheduled surface. PURE.
export * from "./relative-time.ts";

// Visible credits (Manus-style usage surface): PURE display model over the existing entitlement + usage
// + watch/mission counts. Display-only — reads what the backend reports, never enforces or charges.
export * from "./credits.ts";
// Cross-client Anki text / Quizlet paste import. Kept pure so web and iOS
// accept the exact same rows and quality bounds.
export * from "./study-import.ts";
export * from "./study-creation-preferences.ts";
export * from "./workspace-agent-tools.ts";
// Cross-surface second-brain retrieval contract and prompt formatter. Web and
// iOS use the same bounds, graph vocabulary, and injection fence.
export * from "./word-overlap.ts";
export * from "./course-filing.ts";
// The recording-notes prompt. It lives in shared because THREE surfaces compose
// one, and a private copy is how the phone quietly shipped worse notes for days
// in July while every signal read as success.
export * from "./recording-note.ts";
export * from "./study-occlusion.ts";
export * from "./occlusion-suggest.ts";
export * from "./brain-context.ts";
export * from "./history-artifacts.ts";
export * from "./workspace-commands.ts";
export * from "./destructive-tools.ts";
// The other delete gate. `destructive-tools` asks whether a human approved this
// one; `acceptance-cleanup` asks whether the thing is even ours to remove —
// after a test that renamed a real folder made it look freshly created.
export * from "./acceptance-cleanup.ts";
// The browser-extension wire and the gate it comes through. Shared because the
// extension and the web app must agree on the shape, and because the SANITISER
// is the app's own defence — it runs on the receiving side precisely so a
// spoofed or compromised sender changes nothing.
export * from "./lms-import.ts";
// One upload ceiling for web and phone. Shared because it was wrong in four
// places at once, and because a limit that appears twice eventually disagrees
// with itself.
export * from "./upload-limits.ts";
// What was read out of an uploaded document, and what was not. Shared because the
// record crosses the extraction route's JSON, the `parsed_documents.coverage`
// column, the web client and the phone — and because a partial read presented as
// a complete one is the same defect on every one of those surfaces.
export * from "./extraction-coverage.ts";
// The canonical shape every parsed document takes: units → blocks. Shared because
// the same document is chunked for retrieval, cited in an answer, reopened in the
// reader and turned into study material — and those four had been reading four
// different flattenings of it. Its rule travels with it: a locator is only ever
// as specific as the format can honestly support.
export * from "./document-model.ts";
export * from "./document-emphasis.ts";
// A third-party reader, normalised into the model above and nowhere else. Shared
// because the adapter is the ONLY place Docling exists as far as Nemesis is
// concerned: everything downstream — chunking, citations, facts, artifacts —
// receives a DocumentModel and a coverage record and cannot tell which program
// produced them. Exporting it here rather than reaching into the file by path is
// what keeps that boundary a single door instead of a habit.
export * from "./docling-adapter.ts";
// Cutting a document along its own seams instead of every N characters. Shared
// because the pieces retrieval returns are the pieces an answer cites, and a
// chunk that split a table row is a set of values under the wrong column names —
// which retrieves confidently and answers wrongly.
export * from "./document-chunks.ts";
export * from "./document-furniture.ts";
export * from "./document-envelope.ts";
export * from "./document-artifacts.ts";
// Citations that are found rather than believed. Shared because a model asked to
// cite will produce a page number, and that number is a guess dressed as a fact —
// right often enough to look reliable, wrong often enough to matter, and the same
// shape either way. Nothing here trusts a claimed location.
export * from "./document-citations.ts";
// Facts pulled out by SHAPE, never by subject vocabulary — a table of shares that
// sums to a whole is a weighting scheme whether it divides a moot court score or
// a weld inspection, and the heading path carries whatever the document called
// it. A keyword list here would be a hidden claim about who the student is.
export * from "./document-facts.ts";
