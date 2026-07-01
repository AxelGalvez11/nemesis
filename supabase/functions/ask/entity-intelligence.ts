// Small, explicit entity-intelligence layer for terms that are health-relevant but not drug labels.
//
// The classifier extracts drug/supplement/compound mentions. User language is messier than that:
// brands, misspellings, slang, and consumer products often need to be translated into biomedical
// search terms without sending them through FDA-label/openFDA lanes. Keep this catalog conservative,
// transparent, and easy to extend.

export type EntityKind = "drug" | "supplement" | "peptide" | "consumer_product" | "condition" | "unknown";

export interface EntityCandidate {
  /** The literal alias that matched user text or classifier mentions. */
  raw: string;
  normalized: string;
  kind: EntityKind;
  assumptions: string[];
  biomedical_terms: string[];
  use_drug_label_lane: boolean;
}

interface KnownEntity {
  normalized: string;
  kind: EntityKind;
  aliases: readonly string[];
  display_alias: string;
  biomedical_terms: readonly string[];
  use_drug_label_lane: boolean;
}

const KNOWN_ENTITIES: readonly KnownEntity[] = [
  {
    normalized: "Celsius energy drink",
    kind: "consumer_product",
    aliases: ["celsius", "celcius", "celsuis"],
    display_alias: "Celsius",
    biomedical_terms: [
      "Celsius energy drink",
      "energy drink",
      "caffeine",
      "taurine",
      "guarana",
      "toxicity",
      "adverse effects",
      "arrhythmia",
    ],
    use_drug_label_lane: false,
  },
  {
    normalized: "Red Bull energy drink",
    kind: "consumer_product",
    aliases: ["red bull", "redbull"],
    display_alias: "Red Bull",
    biomedical_terms: ["energy drink", "caffeine", "taurine", "toxicity", "adverse effects", "arrhythmia"],
    use_drug_label_lane: false,
  },
  {
    normalized: "Monster Energy drink",
    kind: "consumer_product",
    aliases: ["monster", "monster energy"],
    display_alias: "Monster",
    biomedical_terms: ["energy drink", "caffeine", "taurine", "toxicity", "adverse effects", "arrhythmia"],
    use_drug_label_lane: false,
  },
  {
    normalized: "Prime Energy drink",
    kind: "consumer_product",
    aliases: ["prime energy", "prime drink"],
    display_alias: "Prime Energy",
    biomedical_terms: ["energy drink", "caffeine", "toxicity", "adverse effects", "arrhythmia"],
    use_drug_label_lane: false,
  },
  {
    normalized: "dandruff",
    kind: "condition",
    aliases: ["white flakes", "flakes in my hair", "dry flakes", "flaky scalp", "white flakes in my hair"],
    display_alias: "white flakes in my hair",
    biomedical_terms: ["dandruff", "seborrheic dermatitis", "flaky scalp", "scalp scaling", "dry scalp"],
    use_drug_label_lane: false,
  },
];

function norm(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

function hasWord(haystack: string, needle: string): boolean {
  const esc = norm(needle).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!esc) return false;
  return new RegExp(`(?:^|\\s)${esc}(?:\\s|$)`).test(haystack);
}

function toCandidate(entity: KnownEntity, raw: string): EntityCandidate {
  return {
    raw,
    normalized: entity.normalized,
    kind: entity.kind,
    assumptions: [`Interpreting "${entity.display_alias}" as ${entity.normalized}.`],
    biomedical_terms: [...entity.biomedical_terms],
    use_drug_label_lane: entity.use_drug_label_lane,
  };
}

export function resolveKnownEntity(raw: string): EntityCandidate | null {
  const n = norm(raw);
  if (!n) return null;
  for (const entity of KNOWN_ENTITIES) {
    const alias = entity.aliases.find((a) => norm(a) === n);
    if (alias) return toCandidate(entity, alias);
  }
  return null;
}

export function resolveKnownEntities(question: string, mentions: readonly string[]): EntityCandidate[] {
  const out = new Map<string, EntityCandidate>();
  const q = norm(question);

  for (const mention of mentions) {
    const entity = resolveKnownEntity(mention);
    if (entity) out.set(entity.normalized, entity);
  }

  for (const entity of KNOWN_ENTITIES) {
    const alias = entity.aliases.find((a) => hasWord(q, a));
    if (alias) out.set(entity.normalized, toCandidate(entity, alias));
  }

  return [...out.values()];
}

export function isKnownEntityMention(mention: string): boolean {
  return resolveKnownEntity(mention) !== null;
}
