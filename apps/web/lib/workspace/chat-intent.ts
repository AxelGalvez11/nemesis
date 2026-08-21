/**
 * The web app's binding to the shared turn decision.
 *
 * 🔴 THE MODULE ITSELF MOVED TO `@nemesis/shared` (chat-intent.ts), so the phone and the browser
 * read a sentence exactly once — see that file's header for why, and for what the four regex piles
 * it replaced used to get wrong. What is app-specific is only the SKILL CATALOG: the two apps offer
 * genuinely different expertise (this one has syllabus-intake and lecture-intake; the phone does
 * not), so each binds its own and the packet builder takes it as an argument.
 */

import { intentContract as sharedContract, intentMessages as sharedMessages, skillMenu as sharedMenu, type IntentContext, type IntentMessage, type IntentSkill } from "@nemesis/shared";

import { CHAT_SKILLS } from "@/lib/workspace/chat-skills";

export {
  DEFAULT_INTENT,
  INTENT_HISTORY_TURNS,
  INTENT_TIMEOUT_MS,
  intentStateBlock,
  readChatIntent,
  type ChatIntent,
  type ChatMode,
  type IntentContext,
  type IntentExchange,
  type IntentSkill,
  type WorkspaceUse,
} from "@nemesis/shared";

/** This app's catalog, in the shape the packet needs. */
const CATALOG: readonly IntentSkill[] = CHAT_SKILLS;

export function skillMenu(catalog: readonly IntentSkill[] = CATALOG): string {
  return sharedMenu(catalog);
}

export function intentContract(catalog: readonly IntentSkill[] = CATALOG): string {
  return sharedContract(catalog);
}

export function intentMessages(input: {
  ask: string;
  context: IntentContext;
  catalog?: readonly IntentSkill[];
}): IntentMessage[] {
  return sharedMessages({ ask: input.ask, catalog: input.catalog ?? CATALOG, context: input.context });
}
