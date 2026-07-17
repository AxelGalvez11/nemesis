// Nemesis legal copy, kept in one place so the sign-in attestation and the legal screens
// stay in sync. These are the current BETA policies, presented honestly as such — final
// terms and privacy text get an attorney review before public launch (the in-app note
// says so). The product facts that matter here: the agent runs on the student's Mac,
// library files stay on that Mac, missions sync through our servers, and the agent
// drafts but NEVER submits coursework.

/** Shown on the privacy + terms screens: these are the current beta policies. */
export const LEGAL_PRELAUNCH_NOTE =
  "This is Nemesis's current beta policy. Final terms and privacy text get an " +
  "attorney review before public launch.";

/** The entry-screen 18+ / Terms+Privacy attestation. */
export const AGE_TOS_ACK =
  "I am 18 or older and agree to the Terms of Service and Privacy Policy.";

export const PRIVACY_SECTIONS: { heading: string; body: string }[] = [
  { heading: "What we collect", body: "Your account email; the missions you send (the request, its status, and the result summary); the devices you link — your Mac and this phone, including a push token so we can notify you; and plan + usage counts." },
  { heading: "Where your schoolwork lives", body: "The agent runs on your Mac, and your library files stay on your Mac. Missions sync through our servers so your phone and your Mac see the same list." },
  { heading: "How we use it", body: "To run the missions you ask for, sync your devices, send the notifications you enabled, meter usage against your plan, and keep the service working. Mission text is processed by AI model providers to produce results." },
  { heading: "What we don't do", body: "We don't sell your data, we don't share it with ad networks, and we don't reach into the files on your Mac from the cloud." },
  { heading: "Deletion", body: "Settings → Delete account removes your account, your missions, and your device registrations immediately. Files on your Mac are untouched — they're yours." },
  { heading: "Age", body: "Nemesis is for adults 18 and older and is not directed to minors. Consistent with COPPA, we do not knowingly collect data from anyone under 13." },
  { heading: "Contact", body: "Privacy questions: support@enternemesis.com" },
];

export const TERMS_SECTIONS: { heading: string; body: string }[] = [
  { heading: "What Nemesis is", body: "A study agent that runs on your Mac. This app sends it work and shows you what it did." },
  { heading: "Drafts, never submissions", body: "The agent prepares drafts and study material. It never turns anything in for you. What you submit to your school is your decision and your responsibility." },
  { heading: "Academic integrity", body: "Use Nemesis within your school's rules. You are responsible for how you use what it produces." },
  { heading: "Your files", body: "Your notes, decks, and drafts are yours. We claim no ownership of anything the agent makes for you." },
  { heading: "Accuracy", body: "The agent can be wrong. Check anything that matters before you rely on it." },
  { heading: "Age & eligibility", body: "Nemesis is for adults 18 and older. By using it, you confirm you are 18 or older." },
  { heading: "Plans & billing", body: "Paid plans renew and cancel where you bought them." },
  { heading: "Liability & termination", body: "Provided “as is,” with limitation of liability. Accounts may be terminated for misuse." },
];
