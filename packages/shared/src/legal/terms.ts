// The Terms of Use, as data. Rendered by apps/web/app/legal/terms and landing/app/terms. Edit the
// words here and only here; the landing copy is generated from this file.
//
// Merged 2026-09-05 from two copies that had drifted apart: the landing site had the licence,
// academic-integrity and liability sections, the app had the "not professional advice" and
// acceptable-use sections and still called the plan "Paid Plus". There is one plan, called Nemesis.
//
// Nemesis is a study tool for learners in ANY field. Medicine, law, engineering and finance appear
// below as examples beside each other, never as the subject.

import { LEGAL_CONTACT_EMAIL, LEGAL_EFFECTIVE_DATE, LEGAL_VERSION, type LegalDocument } from "./types.ts";

export const TERMS: LegalDocument = {
  title: "Terms of Use",
  effectiveDate: LEGAL_EFFECTIVE_DATE,
  version: LEGAL_VERSION,
  lead:
    "These terms cover your use of Nemesis, the app and the website. Using Nemesis means you agree to them. If you do not agree, do not use Nemesis.",
  sections: [
    {
      id: "licence",
      heading: "Your licence",
      paragraphs: [
        "Nemesis is licensed to you personally, for your own studies. Do not resell it, share your account, or take the service apart to copy how it works.",
      ],
    },
    {
      id: "account",
      heading: "Your account",
      paragraphs: [
        "You are responsible for keeping your account secure and for what you upload to it. Only upload material you have the right to use. Check that using Nemesis with it is allowed by your school.",
      ],
    },
    {
      id: "integrity",
      heading: "Academic integrity",
      paragraphs: [
        "Nemesis produces drafts and study material. It cannot submit coursework and it never sends anything on your behalf. What you submit, and whether it follows your school's rules, is your decision and your responsibility. Use Nemesis in the way your school permits.",
      ],
    },
    {
      id: "what-nemesis-is",
      heading: "What Nemesis is, and is not",
      paragraphs: [
        "Nemesis is educational software for learners in any field. It helps you read, understand and revise material. It is not professional advice, and it is not a substitute for a qualified person in any discipline, whether that is a clinician, a lawyer, an engineer, an accountant or an instructor.",
        "Do not make a decision that affects health, legal standing, money or physical safety on the basis of Nemesis output alone. Those decisions need a qualified person who knows your situation.",
        "Nemesis is not an emergency service and is not monitored. If someone is in danger, call your local emergency number.",
      ],
    },
    {
      id: "answers",
      heading: "Answers can be wrong",
      paragraphs: [
        "Answers are produced by AI models. They can be wrong, out of date or incomplete, even when they sound confident. Nemesis shows you where an answer came from so you can check it. A cited source can still be outdated, contested, misread, or wrong about your particular case. Verify anything that matters: grades, deadlines and citations included.",
      ],
    },
    {
      id: "your-content",
      heading: "Your content",
      paragraphs: [
        "You own what you upload and what you write in Nemesis. You give us permission to store it and process it only to run the service for you: to answer your questions, build your study material and keep your library in sync across your devices.",
        "To produce answers, the content you upload or type may be sent to the AI model and document-reading providers listed in the Privacy Policy. We do not use your content to train AI models, and we do not permit those providers to train on it either.",
        "You can export your notes and cards at any time. Delete your account and we delete the account and the work stored in it.",
      ],
    },
    {
      id: "billing",
      heading: "Subscriptions and billing",
      paragraphs: [
        "There is one plan, called Nemesis. You can pay for it monthly or yearly. On the web, payments are handled by Stripe. On iPhone, payments are handled by the App Store.",
        "There is no free trial. Your plan renews at the end of each period until you cancel. Prices are shown before you pay, and if a price changes we tell you before your next renewal.",
        "You can cancel at any time from Settings. Your access continues until the end of the period you have already paid for, and you are not charged again.",
      ],
    },
    {
      id: "refunds",
      heading: "Refunds",
      paragraphs: [
        "We do not refund a partial period. If you cancel halfway through a month or a year, you keep access to the end of that period instead. Where the law where you live requires a refund, we follow that law.",
        "If you were charged twice, or charged after you cancelled, we refund that charge. Email " + LEGAL_CONTACT_EMAIL + " and we will sort it out.",
        "Subscriptions bought through the App Store are refunded by Apple under its own rules.",
      ],
    },
    {
      id: "acceptable-use",
      heading: "Acceptable use",
      paragraphs: [
        "Do not attack the service, bypass usage limits, scrape protected endpoints, share your account, or use Nemesis to produce content meant to harm someone. We can suspend an account that does these things.",
      ],
    },
    {
      id: "warranty",
      heading: "No warranty",
      paragraphs: [
        "Nemesis is provided as is. We work to keep it accurate and dependable, but we do not promise it is free of errors or always available.",
      ],
    },
    {
      id: "liability",
      heading: "Liability",
      paragraphs: [
        "To the fullest extent the law allows, our liability to you is limited to the amount you paid for Nemesis in the twelve months before the claim.",
      ],
    },
    {
      id: "changes",
      heading: "Changes to these terms",
      paragraphs: [
        "If these terms or the Privacy Policy change in a way that matters to you, we ask you to read and agree to the new version in the app before you continue. The version you agreed to is recorded on your account.",
      ],
    },
    {
      id: "contact",
      heading: "Contact",
      paragraphs: ["Questions about these terms: " + LEGAL_CONTACT_EMAIL],
    },
  ],
};

/** The short standing line shown at the point of use, near answers. */
export const POINT_OF_USE_DISCLAIMER = "Educational research, not professional advice.";

/** The sections of the Terms that make up the Disclaimer page. */
export const DISCLAIMER_SECTION_IDS = ["what-nemesis-is", "answers", "integrity"] as const;
