// The outside companies that receive some user data so Nemesis can work. This list is built from
// what the code actually calls. Every entry names the file where the call was found, so the list
// can be checked against the code and not against memory. If a provider is removed from the code,
// remove it here in the same change.

import type { LegalSection } from "./types.ts";

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
