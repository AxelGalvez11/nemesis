// Where an AI tool learns how to sign in to the door at /api/mcp (RFC 9728, the path form MCP clients ask for first):
// the resource is the door and the authorization server is this project's Supabase Auth.

import { getPublicOrigin, metadataCorsOptionsRequestHandler, protectedResourceHandler } from "mcp-handler";

import { supabaseUrl } from "@/lib/env";

export function GET(req: Request) {
  // Without the project's address the document would name "/auth/v1", which no client can use: say so plainly instead.
  if (!supabaseUrl) return Response.json({ error: "Sign-in for AI tools is not configured on this server." }, { status: 503 });
  return protectedResourceHandler({ authServerUrls: [`${supabaseUrl}/auth/v1`], resourceUrl: `${getPublicOrigin(req)}/api/mcp` })(req);
}

export const OPTIONS = metadataCorsOptionsRequestHandler();
