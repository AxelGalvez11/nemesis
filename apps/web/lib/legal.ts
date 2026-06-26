// Legal / consent constants — shared by the signup consent gate and the point-of-use disclaimer.
//
// Positioning (owner, 2026-06-25): PharmaOrb is an evidence/research tool, not personal medical
// advice. The per-answer "talk to your pharmacist" steer was removed; liability cover moves to an
// explicit, recorded consent at signup + a light standing disclaimer at the point of use.

// Bump when the consent copy / Terms / Disclaimer change materially. Stored on the user at signup
// (auth user_metadata.tos_version) so we can tell WHICH version a user accepted; the account's
// server-side created_at is the authoritative acceptance time.
export const TOS_VERSION = "2026-06-25";

// The short, persistent line shown at the point of use (near answers).
export const POINT_OF_USE_DISCLAIMER = "Educational research, not medical advice.";
