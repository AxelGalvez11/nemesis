// generated from packages/shared/src/legal, do not edit by hand
//
// Regenerate with:  node packages/shared/scripts/sync-legal-to-landing.mjs
// apps/web/lib/legal-sync.test.ts fails when this file and the shared source differ.

// ---- types.ts ----
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

// ---- subprocessors.ts ----
// The outside companies that receive some user data so Nemesis can work. This list is built from
// what the code actually calls. Every entry names the file where the call was found, so the list
// can be checked against the code and not against memory. If a provider is removed from the code,
// remove it here in the same change.


export interface Subprocessor {
  name: string;
  /** What the provider does for Nemesis, in one phrase. */
  purpose: string;
  /** What it receives from or about the user, in one phrase. */
  receives: string;
  /** True when the provider only sees user content if the main provider is down. */
  fallbackOnly?: boolean;
}

export const SUBPROCESSORS: Subprocessor[] = [
  // found at supabase/functions/nemesis-llm/index.ts (DEEPSEEK_BASE), apps/web/lib/vision/deepseek.ts,
  // supabase/functions/ask/llm.ts
  {
    name: "DeepSeek",
    purpose: "the main model that writes answers, study material and reads pictures",
    receives: "your questions, chat history, the parts of your files needed for an answer, and images you upload",
  },
  // found at apps/web/lib/vision/gemini.ts, apps/web/lib/pdf/vision.ts, supabase/functions/nemesis-media/index.ts
  {
    name: "Google Gemini",
    purpose: "reads pictures, diagrams and scanned pages when the main model cannot, and makes generated images",
    receives: "page images and figures from your files, and image prompts",
  },
  // found at apps/web/lib/notebooks/mistral-ocr.ts
  {
    name: "Mistral",
    purpose: "turns scanned or photographed pages into text (OCR)",
    receives: "page images from files you upload",
  },
  // found at apps/web/lib/notebooks/llamaparse-ocr.ts
  {
    name: "LlamaParse (LlamaIndex)",
    purpose: "parses complex documents into text and tables",
    receives: "files you upload",
  },
  // found at supabase/functions/nemesis-speak/index.ts (api.x.ai/v1/tts), apps/web/lib/learn/speech-route.ts
  {
    name: "xAI",
    purpose: "reads answers and quiz questions aloud (text to speech)",
    receives: "the text being spoken",
  },
  // found at supabase/functions/nemesis-transcribe/index.ts, apps/web/app/api/live-audio/token/route.ts
  {
    name: "AssemblyAI",
    purpose: "turns lecture recordings and dictation into text",
    receives: "audio you record or dictate",
  },
  // found at apps/web/lib/speech/azure/config.ts, apps/web/lib/speech/pronunciation.ts
  {
    name: "Microsoft Azure Speech",
    purpose: "scores pronunciation in speaking drills and reads text aloud",
    receives: "audio from speaking drills and the text being spoken",
  },
  // found at supabase/functions/nemesis-search/brave.ts
  {
    name: "Brave Search",
    purpose: "web search when an answer needs current sources",
    receives: "the search query built from your question",
  },
  // found at supabase/functions/ask/rerank.ts (api.voyageai.com/v1/rerank)
  {
    name: "Voyage AI",
    purpose: "ranks which passages best match a question",
    receives: "your question and short candidate passages",
  },
  // found at supabase/functions/nemesis-llm/index.ts (GLM_BASE, QWEN_BASE, KIMI_BASE, ANTHROPIC_BASE):
  // these only receive a request when DeepSeek is unavailable.
  {
    name: "Z.ai (GLM)",
    purpose: "answers when the main model is down",
    receives: "the same request the main model would have received",
    fallbackOnly: true,
  },
  {
    name: "Alibaba Cloud (Qwen)",
    purpose: "answers when the main model is down",
    receives: "the same request the main model would have received",
    fallbackOnly: true,
  },
  {
    name: "Moonshot AI (Kimi)",
    purpose: "answers when the main model is down",
    receives: "the same request the main model would have received",
    fallbackOnly: true,
  },
  {
    name: "Anthropic (Claude)",
    purpose: "answers when the main model is down",
    receives: "the same request the main model would have received",
    fallbackOnly: true,
  },
  // found at apps/web/lib/supabase.ts, supabase/functions/*, supabase/migrations
  {
    name: "Supabase",
    purpose: "database, file storage and sign in",
    receives: "your account, your library, chats, notes, cards, calendar and uploaded files",
  },
  // found at apps/web/lib/stripe.ts, apps/web/lib/stripe-customer.ts
  {
    name: "Stripe",
    purpose: "payments on the web",
    receives: "your email, plan and payment details (we never see your card number)",
  },
  // found at supabase/functions/revenuecat-webhook/index.ts, supabase/functions/_shared/revenuecat.ts
  {
    name: "RevenueCat",
    purpose: "app store subscriptions on iPhone",
    receives: "your account id and subscription status from the app store",
  },
  // found at apps/web/vercel.json (the app and this website are deployed on Vercel)
  {
    name: "Vercel",
    purpose: "hosts the app and the website",
    receives: "the requests your browser makes, including your IP address",
  },
  // found at apps/web/lib/posthog.ts, apps/web/lib/posthog-server.ts, landing/lib/posthog.ts
  {
    name: "PostHog",
    purpose: "usage statistics and error reports",
    receives: "which pages and features you use and how much, never the content of your work",
  },
  // found at supabase/functions/_shared/sentry.ts (server-side error reports only)
  {
    name: "Sentry",
    purpose: "error reports from our servers",
    receives: "error messages and technical details, never the content of your work",
  },
  // found at apps/web/lib/email.ts (api.resend.com), supabase/functions/research/resend.ts
  {
    name: "Resend",
    purpose: "sends email from Nemesis",
    receives: "your email address and the message being sent",
  },
  // found at apps/web/lib/workspace/composio-client.ts, apps/web/app/api/composio/route.ts
  {
    name: "Composio",
    purpose: "connects outside apps you choose, such as Google Calendar or Canvas LMS",
    receives: "only the account you connect and the actions you ask for, and only after you connect it",
  },
];

/** The sub-processor list as a section for the Privacy Policy. */
export function subprocessorsSection(): LegalSection {
  const main = SUBPROCESSORS.filter((s) => !s.fallbackOnly);
  const fallback = SUBPROCESSORS.filter((s) => s.fallbackOnly);
  return {
    id: "service-providers",
    heading: "Service providers",
    paragraphs: [
      "These are the companies that receive some of your data so Nemesis can work. Each one is under a contract that limits what it may do with that data. We do not permit any of them to train models on your content.",
      "If we add a provider that receives your content, we update this list and the date at the top of this policy.",
    ],
    bullets: [
      ...main.map((s) => `${s.name}: ${s.purpose}. Receives ${s.receives}.`),
      `Only when the main model is down, one of these answers instead and receives the same request: ${fallback.map((s) => s.name).join(", ")}.`,
    ],
  };
}

// ---- terms.ts ----
// The Terms of Use, as data. Rendered by apps/web/app/legal/terms and landing/app/terms. Edit the
// words here and only here; the landing copy is generated from this file.
//
// Merged 2026-09-05 from two copies that had drifted apart: the landing site had the licence,
// academic-integrity and liability sections, the app had the "not professional advice" and
// acceptable-use sections and still called the plan "Paid Plus". There is one plan, called Nemesis.
//
// Nemesis is a study tool for learners in ANY field. Medicine, law, engineering and finance appear
// below as examples beside each other, never as the subject.


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

// ---- privacy.ts ----
// The Privacy Policy, as data. Rendered by apps/web/app/legal/privacy and landing/app/privacy.
// Edit the words here and only here; the landing copy is generated from this file.
//
// Merged 2026-09-05 from two copies that had drifted apart. What it describes is what the code
// does:
//   - library, decks, calendar and chat live in Postgres, per user, behind row-level security
//   - a recording is uploaded, transcribed by a speech provider, then deleted from storage
//   - metering records counts, never prompt text
//   - the providers that receive content are listed by name in `subprocessors.ts`


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
