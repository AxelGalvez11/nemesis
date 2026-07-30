// Nemesis legal copy, kept in one place so the sign-in attestation and the legal screens
// stay in sync. These are the current BETA policies, presented honestly as such — final
// terms and privacy text get an attorney review before public launch (the in-app note
// says so). The product facts that matter here: chats, notes, flashcards, and the
// calendar live in the student's own cloud account (same data on phone and web), chat
// text is processed by AI model providers, and the agent drafts but NEVER submits
// coursework.

/** Shown on the privacy + terms screens: these are the current beta policies. */
export const LEGAL_PRELAUNCH_NOTE =
  "This is Nemesis's current beta policy. Final terms and privacy text get an " +
  "attorney review before public launch.";

/**
 * The entry-screen age / Terms+Privacy attestation.
 *
 * 13, NOT 18 (owner's call, 2026-07-29). The floor was 18 while this text was written from a
 * risk-averse template, and it did two harmful things: it excluded the app's actual audience
 * (high-school seniors and first-year undergraduates are routinely 17), and it contradicted
 * the App Store age rating. An app rated 12+ or 13+ that makes users swear they are 18 reads
 * to a reviewer as two answers to the same question.
 *
 * 🔴 THIS NUMBER AND THE APP STORE AGE RATING MUST MOVE TOGETHER. Changing one alone
 * recreates the contradiction. 13 is also the COPPA floor, which is why the privacy section
 * below can still say we never knowingly collect data from anyone younger.
 */
export const AGE_TOS_ACK =
  "I am 13 or older and agree to the Terms of Service and Privacy Policy.";

export const PRIVACY_SECTIONS: { heading: string; body: string }[] = [
  { heading: "What we collect", body: "Your account email; the chats you send and the answers you get; the notes, flashcards, and calendar events in your account; this phone's push token so we can notify you; and plan + usage counts." },
  { heading: "Where your schoolwork lives", body: "Your chats, notes, flashcards, and calendar are stored in your own Nemesis account in our cloud, so your phone and the web app see the same things. Each account's data is walled off to that account." },
  { heading: "How we use it", body: "To answer the questions you ask, keep your devices in sync, send the notifications you enabled, meter usage against your plan, and keep the service working. Chat text is processed by AI model providers to produce answers; when a question needs the web, the search runs through our service." },
  { heading: "What we don't do", body: "We don't sell your data and we don't share it with ad networks." },
  { heading: "Deletion", body: "Settings → Delete account removes your account and its chats, notes, flashcards, calendar, and device registrations immediately." },
  { heading: "Age", body: "Nemesis is for people aged 13 and older. Consistent with COPPA, we do not knowingly collect data from anyone under 13. Where local law sets a higher age for handling your data on your own say-so, as parts of the EU and UK do for under-16s, a parent or guardian needs to agree for you." },
  { heading: "Contact", body: "Privacy questions: support@enternemesis.com" },
];

export const TERMS_SECTIONS: { heading: string; body: string }[] = [
  { heading: "What Nemesis is", body: "A study system in your account: chat, notes, flashcards, and a calendar, on your phone and the web." },
  { heading: "Drafts, never submissions", body: "Nemesis prepares drafts and study material. It never turns anything in for you. What you submit to your school is your decision and your responsibility." },
  { heading: "Academic integrity", body: "Use Nemesis within your school's rules. You are responsible for how you use what it produces." },
  { heading: "Your files", body: "Your notes, decks, and drafts are yours. We claim no ownership of anything Nemesis makes for you." },
  { heading: "Accuracy", body: "Nemesis can be wrong. Check anything that matters before you rely on it." },
  { heading: "Age & eligibility", body: "Nemesis is for people aged 13 and older. By using it, you confirm you are 13 or older, and that if your country requires a parent or guardian to agree for someone your age, they have." },
  { heading: "Plans & billing", body: "Paid plans renew and cancel where you bought them." },
  { heading: "Liability & termination", body: "Provided “as is,” with limitation of liability. Accounts may be terminated for misuse." },
];
