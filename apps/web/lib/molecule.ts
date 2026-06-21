// PubChem renders a clean, useful 2D structure for SMALL molecules — but a sprawling, near-useless
// tangle for biologics/peptides (monoclonal antibodies, GLP-1 peptides, insulins, fusion proteins).
// And it still returns a valid PNG for them, so the component's onError fallback won't hide it. So we
// suppress the structure image for those by name here, returning null → the figure renders nothing.
//
// Heuristic by international-nonproprietary-name stem: -mab (antibodies), -cept (fusion proteins),
// -tide (peptides incl. semaglutide / tirzepatide / liraglutide), plus insulins and a few named
// protein drugs. Imperfect (a rare peptide hormone like calcitonin slips through) but it catches the
// common, heavily-queried biologics; a false positive merely omits an image, never shows a wrong one.
const BIOLOGIC_STEM = /(?:mab|cept|tide)$/;
const BIOLOGIC_WORD = /\b(?:insulin|interferon|peginterferon|immunoglobulin|filgrastim|epoetin|darbepoetin|somatropin)\b/i;

/**
 * The PubChem structure-image URL for a drug, or null when no useful small-molecule depiction exists
 * (a biologic/peptide, or an empty name). Pure.
 */
export function pubchemMoleculeUrl(drug: string): string | null {
  const name = drug.trim();
  if (!name) return null;
  const lastWord = name.toLowerCase().split(/\s+/).pop() ?? "";
  if (BIOLOGIC_STEM.test(lastWord) || BIOLOGIC_WORD.test(name)) return null;
  return `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(name)}/PNG?image_size=large`;
}
