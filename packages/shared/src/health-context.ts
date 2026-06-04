// My Health Context shapes (user_health_context table, 0109). User-owned and
// independently deletable (doc-18 "Health context deletion"), gated by the uhc_owner
// RLS policy. Optional/educational: it can make answers more relevant but the app
// never diagnoses from it. Additive to the frozen contract, like watchlist.ts.

/** kidney/liver flags (0109 CHECK). */
export type OrganFlag = "yes" | "no" | "unknown";

/** A My Health Context record (one row per user; user_id is UNIQUE). */
export interface HealthContext {
  age_range: string | null;
  sex: string | null;
  pregnancy_status: string | null;
  allergies: string[];
  medications: string[];
  supplements: string[];
  conditions: string[];
  kidney_disease_flag: OrganFlag | null;
  liver_disease_flag: OrganFlag | null;
  goals: string[];
  /** doc-18 consent: the version the user accepted when they last saved. */
  consent_version: string | null;
  updated_at: string | null;
}

/** The editable subset the app writes (consent_version + user_id are set on save). */
export type HealthContextInput = Omit<HealthContext, "consent_version" | "updated_at">;
