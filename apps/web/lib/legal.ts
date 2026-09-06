// Legal / consent constants, shared by the signup consent, the re-consent gate and the
// point-of-use disclaimer.
//
// Nemesis is an academic research and study tool for learners in ANY field, and not professional
// advice in any of them. Liability cover is an explicit, recorded consent at signup plus a light
// standing line at the point of use.
//
// 🔴 THE WORDING WAS MEDICAL UNTIL 2026-08-25 ("not personal medical advice", "talk to your
// pharmacist"). Owner: *"remove medical disclaimer claims, this is a general research tool not a
// medical tool."* Medicine is now one example among several rather than the subject.
//
// 🔴 SINCE 2026-09-05 THE WORDS LIVE IN packages/shared/src/legal AND THE VERSION COMES FROM THERE.
// The app and the landing site each held their own copy of the Terms and the Privacy Policy, and
// they drifted (the app's still sold a "Paid Plus" plan). Both now render the shared data. Bumping
// LEGAL_VERSION there is what makes every signed-in user see the re-consent dialog
// (components/workspace/onboarding/terms-reconsent-gate.tsx); before that, a bump was recorded on
// new accounts and asked nothing of existing ones.

import { LEGAL_VERSION, POINT_OF_USE_DISCLAIMER as SHARED_POINT_OF_USE_DISCLAIMER } from "@nemesis/shared";

// Stored on the user (auth user_metadata.tos_version) at signup and at re-consent, so we can tell
// WHICH version a user accepted. Equal to the shared LEGAL_VERSION by construction.
export const TOS_VERSION: string = LEGAL_VERSION;

// The short, persistent line shown at the point of use (near answers), and the headline of
// /legal/disclaimer.
export const POINT_OF_USE_DISCLAIMER: string = SHARED_POINT_OF_USE_DISCLAIMER;

/**
 * True when this account has not agreed to the current Terms and Privacy Policy. An account with
 * no recorded version at all (older accounts, before the version was stamped) counts as not agreed,
 * so it is asked once.
 */
export function needsReconsent(userMetadata: Record<string, unknown> | null | undefined): boolean {
  const recorded = userMetadata?.tos_version;
  return typeof recorded !== "string" || recorded !== TOS_VERSION;
}
