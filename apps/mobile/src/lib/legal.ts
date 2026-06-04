// doc-18 legal/disclaimer copy, kept in one place so the Ask disclaimer, the consent
// gate, and the legal screens stay in sync. The disclaimer + consent strings are
// VERBATIM from doc-18 (Privacy_Legal_Compliance). The privacy/terms bodies render
// doc-18's required-sections lists with an explicit pre-launch note — doc-18 itself
// says final terms must be attorney-drafted, so the app presents the current policy
// honestly rather than claiming attorney-vetted final text. AC10 = these are PRESENT
// and reachable; the binding legal pass is a launch (Phase 7+) gate.

/** doc-18 "Medical disclaimer copy" — verbatim. */
export const MEDICAL_DISCLAIMER =
  "PharmaBro provides educational information from public sources such as FDA labels, " +
  "DailyMed, PubMed, and ClinicalTrials.gov. It does not provide medical advice, " +
  "diagnosis, treatment, or prescribing decisions. Always consult a qualified " +
  "healthcare professional for personal medical decisions.";

/** doc-18 "Health context consent copy" — verbatim. Shown above the HC editor. */
export const HEALTH_CONTEXT_CONSENT =
  "My Health Context is optional. It can help PharmaBro make educational answers more " +
  "relevant, such as noticing that a medication question may involve allergies, " +
  "pregnancy, kidney disease, or another medication.\n\n" +
  "PharmaBro does not diagnose, treat, prescribe, or replace a healthcare professional. " +
  "You can edit or delete this information anytime.";

/** doc-18 "Safety escalation copy" — verbatim (mirrors the ask fn's emergency template). */
export const SAFETY_ESCALATION =
  "This could be urgent. If you may be experiencing a medical emergency, call emergency " +
  "services now. For possible poisoning or overdose in the U.S., contact Poison Control " +
  "at 1-800-222-1222.";

/** Shown on the privacy + terms screens: these are the current pre-launch policies. */
export const LEGAL_PRELAUNCH_NOTE =
  "This is PharmaBro's current pre-launch policy. Final terms and privacy text are " +
  "reviewed by a healthcare/privacy attorney before public launch.";

/** doc-18 "Privacy policy sections to include." */
export const PRIVACY_SECTIONS: { heading: string; body: string }[] = [
  { heading: "What we collect", body: "Your account email, your follows/watchlist, your asked questions, and — only if you choose to add it — your optional My Health Context." },
  { heading: "Health context", body: "Optional and consent-gated. Used only to make educational answers more relevant. Independently editable and deletable at any time." },
  { heading: "How data is used", body: "To answer questions from public sources, track evidence on what you follow, and operate the app. Sources and AI generation are shown so you can review the basis for an answer." },
  { heading: "Model training", body: "Your health data is not used for model training by default." },
  { heading: "Analytics & vendors", body: "Product analytics exclude health details. We do not sell health data or share it with ad networks." },
  { heading: "Retention, deletion & export", body: "You can delete your health context immediately, and request account deletion and data export. Encryption is applied in transit." },
  { heading: "Contact", body: "Privacy questions: privacy@pharmabro.app" },
];

/** doc-18 "Terms of service clauses to include." */
export const TERMS_SECTIONS: { heading: string; body: string }[] = [
  { heading: "Educational use only", body: "PharmaBro is for education. It is not medical advice and creates no provider–patient relationship." },
  { heading: "Your responsibility", body: "Always consult a qualified professional for personal medical decisions. Do not use PharmaBro for emergencies or prescribing." },
  { heading: "Source & accuracy limits", body: "Information comes from public sources that may be incomplete or out of date; source limitations are shown, not hidden." },
  { heading: "Acceptable use", body: "No misuse for prescribing, sourcing unapproved compounds, or emergency care." },
  { heading: "Subscription", body: "Paid tiers (when available) renew per the store's terms; manage or cancel in your store account." },
  { heading: "Liability & termination", body: "Provided “as is,” with limitation of liability. Accounts may be terminated for misuse." },
];
