// The shape every legal document shares. Plain data, so that the app and the landing site can
// each render the same words inside their own page shell, and so a test can compare the two.

export interface LegalSection {
  /** Anchor id for the heading. Optional; a page may link to a section by it. */
  id?: string;
  heading: string;
  paragraphs: string[];
  /** Short list items rendered after the paragraphs. */
  bullets?: string[];
}

export interface LegalDocument {
  title: string;
  /** Shown to the reader, for example "September 5, 2026". */
  effectiveDate: string;
  /** Machine version, YYYY-MM-DD. Stored on the account when the user agrees. */
  version: string;
  /** One opening paragraph above the sections. */
  lead: string;
  sections: LegalSection[];
}

/**
 * The version of the Terms and the Privacy Policy that a user must have agreed to. Bump this when
 * either document changes in a way a user should see again. The app stores it on the account at
 * signup and asks anyone with an older (or missing) version to agree again.
 */
export const LEGAL_VERSION = "2026-09-05";

/** The same date, written for a reader. */
export const LEGAL_EFFECTIVE_DATE = "September 5, 2026";

/** Where questions about either document go. */
export const LEGAL_CONTACT_EMAIL = "support@enternemesis.com";
