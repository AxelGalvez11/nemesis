// Legal / consent constants — shared by the signup consent gate and the point-of-use disclaimer.
//
// Nemesis is an academic research and study tool for learners in ANY field, and not professional
// advice in any of them. Liability cover is an explicit, recorded consent at signup plus a light
// standing line at the point of use.
//
// 🔴 THE WORDING WAS MEDICAL UNTIL 2026-08-25 ("not personal medical advice", "talk to your
// pharmacist"). Owner: *"remove medical disclaimer claims, this is a general research tool not a
// medical tool."* Medicine is now one example among several rather than the subject, here and on
// /legal/disclaimer.

// Bump when the consent copy / Terms / Disclaimer change materially. Stored on the user at signup
// (auth user_metadata.tos_version) so we can tell WHICH version a user accepted; the account's
// server-side created_at is the authoritative acceptance time.
// 🔴 BUMPED 2026-08-25 BECAUSE THE DISCLAIMER MATERIALLY CHANGED, which is exactly what the note
// above says to bump for. It stopped being a medical disclaimer and became a general one, so a user
// who accepted the July version accepted different words and we should be able to tell them apart.
export const TOS_VERSION = "2026-08-25";

// The short, persistent line shown at the point of use (near answers).
// 🔴 NOTHING RENDERS THIS TODAY — checked 2026-08-25, it is exported and never imported. Kept
// rather than deleted because the signup consent it pairs with is live and this is the other half
// of that design, but do not mistake it for something a learner is currently seeing.
export const POINT_OF_USE_DISCLAIMER = "Educational research, not professional advice.";
