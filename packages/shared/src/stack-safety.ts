// Stack safety — PURE, deterministic. The Real-World Signal's "safety pass": scan a reported regimen
// (a set of co-taken interventions) for WELL-ESTABLISHED dangerous combinations and FLAG them for a
// researcher's attention. This is the thing qi.health skips — it surfaces patient-reported drug/supplement
// stacks with no danger check; we flag the textbook-dangerous ones.
//
// HONESTY / SAFETY SCOPE (read this): the rule set is a CURATED, CONSERVATIVE SEED of high-severity,
// textbook interaction classes — it is NOT a comprehensive interaction database. It MUST be clinically
// reviewed (and ideally backed by a licensed interaction source) before it goes live. Semantics: a flag
// means "this pair is a RECOGNIZED danger — verify"; the ABSENCE of a flag does NOT mean a combo is safe.
// It flags for review; it never gives advice and never claims to be exhaustive. Word-boundary matching
// (so "ace" can't match "acetaminophen"). No LLM, no network. Surfaced only behind the Real-World Signal
// flag. See docs/superpowers/specs/2026-06-29-realworld-signal-tier-plan.md (Phase B).

export type DangerSeverity = "high" | "moderate";

interface DangerRule {
  id: string;
  label: string;
  severity: DangerSeverity;
  /** Fires when the regimen hits BOTH groups. Lowercased name/class stems, matched at a word boundary. */
  groupA: string[];
  groupB: string[];
  caution: string;
}

export interface DangerFlag {
  ruleId: string;
  label: string;
  severity: DangerSeverity;
  caution: string;
  /** The regimen items that triggered the flag, so a researcher sees exactly which pair. */
  matched: string[];
}

// CURATED SEED — high-severity, textbook interaction classes ONLY. Pending clinical review + a licensed
// source before go-live. Each rule fires only when the regimen contains an item from BOTH groups, so a
// single common drug never false-flags on its own.
const RULES: readonly DangerRule[] = [
  {
    id: "serotonin_syndrome",
    label: "Serotonin syndrome risk",
    severity: "high",
    groupA: ["maoi", "phenelzine", "tranylcypromine", "isocarboxazid", "selegiline", "linezolid"],
    groupB: ["ssri", "snri", "sertraline", "fluoxetine", "paroxetine", "citalopram", "escitalopram", "venlafaxine", "duloxetine", "tramadol", "st john", "triptan", "mdma"],
    caution: "MAO inhibitors combined with serotonergic agents can cause life-threatening serotonin syndrome.",
  },
  {
    id: "major_bleeding",
    label: "Major bleeding risk",
    severity: "high",
    groupA: ["warfarin", "anticoagulant", "apixaban", "rivaroxaban", "dabigatran", "edoxaban", "heparin"],
    groupB: ["nsaid", "ibuprofen", "naproxen", "aspirin", "clopidogrel", "ketorolac", "diclofenac"],
    caution: "Anticoagulants combined with NSAIDs or antiplatelets sharply raise the risk of major bleeding.",
  },
  {
    id: "hyperkalemia",
    label: "Hyperkalemia risk",
    severity: "high",
    groupA: ["lisinopril", "ramipril", "enalapril", "ace inhibitor", "losartan", "valsartan", "arb"],
    groupB: ["spironolactone", "eplerenone", "amiloride", "triamterene", "potassium"],
    caution: "ACE inhibitors/ARBs with potassium-sparing diuretics or potassium can cause dangerous hyperkalemia.",
  },
  {
    id: "nitrate_pde5_hypotension",
    label: "Severe hypotension risk",
    severity: "high",
    groupA: ["nitrate", "nitroglycerin", "isosorbide"],
    groupB: ["sildenafil", "tadalafil", "vardenafil", "viagra", "cialis"],
    caution: "Nitrates with PDE5 inhibitors can cause profound, dangerous hypotension.",
  },
  {
    id: "cns_respiratory_depression",
    label: "Respiratory depression risk",
    severity: "high",
    groupA: ["opioid", "oxycodone", "morphine", "fentanyl", "hydrocodone", "codeine", "tramadol", "oxycontin"],
    groupB: ["benzodiazepine", "alprazolam", "diazepam", "lorazepam", "clonazepam", "xanax", "valium"],
    caution: "Opioids combined with benzodiazepines can cause fatal respiratory depression.",
  },
  {
    id: "methotrexate_toxicity",
    label: "Methotrexate toxicity risk",
    severity: "high",
    groupA: ["methotrexate"],
    groupB: ["nsaid", "ibuprofen", "naproxen", "trimethoprim", "sulfamethoxazole", "bactrim"],
    caution: "Methotrexate combined with NSAIDs or trimethoprim can raise methotrexate to toxic levels.",
  },
];

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function matchesAny(text: string, stems: readonly string[]): boolean {
  return stems.some((s) => new RegExp(`\\b${escapeRe(s)}`).test(text));
}

/**
 * Flag well-established dangerous combinations within a reported regimen. PURE + deterministic.
 * A rule fires only when at least two DISTINCT regimen items hit groupA and groupB respectively.
 */
export function flagDangerousCombos(regimen: readonly string[]): DangerFlag[] {
  const items = regimen.map((r) => ({ raw: r.trim(), t: r.toLowerCase() })).filter((x) => x.raw.length > 0);
  const flags: DangerFlag[] = [];
  for (const rule of RULES) {
    const a = items.filter((x) => matchesAny(x.t, rule.groupA));
    const b = items.filter((x) => matchesAny(x.t, rule.groupB));
    if (a.length === 0 || b.length === 0) continue;
    // Require two DISTINCT items — a single item matching both groups isn't a combination.
    const matched = [...new Set([...a, ...b].map((x) => x.raw))];
    if (matched.length < 2) continue;
    flags.push({ ruleId: rule.id, label: rule.label, severity: rule.severity, caution: rule.caution, matched });
  }
  return flags;
}
