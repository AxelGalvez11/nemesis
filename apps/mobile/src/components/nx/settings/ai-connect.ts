/**
 * Connecting an outside AI (Claude, ChatGPT, anything that speaks MCP) to Nemesis.
 *
 * The door is /api/mcp on the web app, guarded by Supabase Auth's OAuth 2.1 server
 * (apps/web/lib/agents/agent-auth.ts). That OAuth server is still switched off, so a
 * Connect button today would send the student through a flow that cannot finish.
 * Flip AI_CONNECT_READY once OAuth is on; the screens then draw Connect and Copy link.
 *
 * Still missing even then: an endpoint that lists which AI tools this account has
 * approved (and when), their recent actions, and a revoke call. Until those exist the
 * screens cannot say "Connected on Sep 14", show activity, or offer Disconnect.
 */
import * as Clipboard from 'expo-clipboard';
import * as WebBrowser from 'expo-web-browser';

export const AI_CONNECT_READY = false;

export const MCP_URL = 'https://app.enternemesis.com/api/mcp';

const CONNECTOR_PAGES = {
  claude: 'https://claude.ai/settings/connectors',
  gpt: 'https://chatgpt.com/#settings/Connectors',
} as const;

/** Copy the Nemesis link, then open the AI's own connector settings to paste it. */
export async function startConnect(kind: keyof typeof CONNECTOR_PAGES): Promise<void> {
  await Clipboard.setStringAsync(MCP_URL).catch(() => false);
  await WebBrowser.openBrowserAsync(CONNECTOR_PAGES[kind]).catch(() => null);
}

export async function copyConnectLink(): Promise<boolean> {
  return Clipboard.setStringAsync(MCP_URL).catch(() => false);
}
