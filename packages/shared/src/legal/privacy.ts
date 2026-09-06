// The Privacy Policy, as data. Rendered by apps/web/app/legal/privacy and landing/app/privacy.
// Edit the words here and only here; the landing copy is generated from this file.
//
// Merged 2026-09-05 from two copies that had drifted apart. What it describes is what the code
// does:
//   - library, decks, calendar and chat live in Postgres, per user, behind row-level security
//   - a recording is uploaded, transcribed by a speech provider, then deleted from storage
//   - metering records counts, never prompt text
//   - the providers that receive content are listed by name in `subprocessors.ts`

import { subprocessorsSection } from "./subprocessors.ts";
import { LEGAL_CONTACT_EMAIL, LEGAL_EFFECTIVE_DATE, LEGAL_VERSION, type LegalDocument } from "./types.ts";

export const PRIVACY: LegalDocument = {
  title: "Privacy Policy",
  effectiveDate: LEGAL_EFFECTIVE_DATE,
  version: LEGAL_VERSION,
  lead:
    "This policy covers the Nemesis app and the website. It explains where your work is kept, what we collect, who else sees it, and what we will never do with it.",
  sections: [
    {
      id: "storage",
      heading: "Where your work is stored",
      paragraphs: [
        "Your library, notes, flashcards, practice tests, calendar and chats are stored in your Nemesis account on our servers, so they are there on every device you sign in from. Each account's data is separated at the database level: one account's work cannot be read by another.",
      ],
    },
    {
      id: "collect",
      heading: "What we collect",
      paragraphs: ["We collect what we need to run your account and nothing more."],
      bullets: [
        "Account information: the email address you sign up with, and your subscription status.",
        "Your work: the files you upload, the questions you ask, the answers you get, and the notes, cards and calendar entries you make.",
        "Metering: counts of how much you have used, never the content, to apply plan limits.",
        "Technical logs: errors and request details needed to keep the service running.",
      ],
    },
    {
      id: "use",
      heading: "How we use it",
      paragraphs: [
        "We use your data to sign you in, answer your questions, build your study material, apply plan limits, handle billing, find and fix bugs, and investigate abuse. That is the whole list.",
      ],
    },
    {
      id: "ai",
      heading: "AI and your content",
      paragraphs: [
        "When you ask Nemesis something, that question, the relevant parts of your files, and your recent chat are sent to an AI model provider to produce the answer. When you upload a file, it may be sent to a document-reading provider to turn pages, scans and pictures into text. The providers are named in the Service providers section below.",
        "Your content is used for nothing else. We do not use it to train AI models, and we do not permit our providers to train on it. You own your content.",
        "Learners study every subject there is, so questions and answers may touch sensitive ground, including health, law and personal circumstances. Nemesis is not professional advice in any of those areas, and it is not an emergency service.",
      ],
    },
    {
      id: "recordings",
      heading: "Recordings",
      paragraphs: [
        "When you record a lecture or dictate, the audio is uploaded so it can be turned into text, and it is deleted from our storage as soon as the transcript comes back. The transcript and the notes made from it stay in your library. Transcription is done by a speech provider, which receives the audio for that purpose and nothing else.",
      ],
    },
    {
      id: "connected-apps",
      heading: "Connected apps",
      paragraphs: [
        "You can connect outside apps such as Google Calendar or your school's learning platform. Nothing is connected until you choose to connect it. When you do, Nemesis reads and writes only what you ask it to, through a connection service, and you can disconnect at any time from Settings.",
      ],
    },
    {
      id: "analytics",
      heading: "Usage statistics and error reports",
      paragraphs: [
        "We record which pages and features are used, and errors that happen, so we can find bugs and see what people actually use. This never includes the content of your chats, notes, files or recordings. You can opt out at any time from Settings.",
      ],
    },
    {
      id: "payments",
      heading: "Payments",
      paragraphs: [
        "Payments on the web are processed by Stripe, and on iPhone by the App Store. We never see or store your card number. We keep your plan and payment status so we know what you have access to.",
      ],
    },
    {
      id: "email",
      heading: "Email",
      paragraphs: [
        "The email address you sign up with is used to run your account and to tell you about the product you signed up for, and nothing else. Nemesis never sends email or submits coursework on your behalf.",
      ],
    },
    {
      id: "website",
      heading: "This website",
      paragraphs: [
        "The website sets no advertising trackers. We measure how the site itself is used: the pages you visit, the links you click, and where you arrived from. That is one cookie, and it is the only one we set. We do not record your screen and we do not capture what you type.",
      ],
    },
    {
      id: "never",
      heading: "What we never do",
      paragraphs: [],
      bullets: [
        "No selling or sharing of personal data.",
        "No advertising and no ad tracking.",
        "No training AI models on your content, by us or by our providers.",
      ],
    },
    {
      id: "controls",
      heading: "Your controls",
      paragraphs: [
        "Your work is yours. You can export your notes and cards at any time, on any plan or none. You can delete your account from Settings. Deleting it removes the account and the work stored in it.",
      ],
    },
    subprocessorsSection(),
    {
      id: "changes",
      heading: "Changes to this policy",
      paragraphs: [
        "If this policy changes in a way that matters to you, we ask you to read and agree to the new version in the app before you continue.",
      ],
    },
    {
      id: "contact",
      heading: "Contact",
      paragraphs: ["Questions about this policy: " + LEGAL_CONTACT_EMAIL],
    },
  ],
};
