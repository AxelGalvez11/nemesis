// The door outside AI tools come in through (docs/space/PLAN.md, M11; owner 2026-09-11: "Outside AI connects in").
//
// A remote MCP server over Streamable HTTP. ChatGPT, Claude and other clients find out how to sign in from
// /.well-known/oauth-protected-resource/api/mcp, sign the person in through Supabase Auth's OAuth 2.1 server, and the
// person approves them on /oauth/consent. Every call carries that token; verifyAgentToken refuses anything else, and
// each tool acts through a client holding the person's own token, so row security bounds it exactly as it bounds them.

import { createClient } from "@supabase/supabase-js";
import type { AuthInfo } from "@modelcontextprotocol/server";
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { z } from "zod";

import { addFlashcards, addPracticeTest, AgentActionError, type AgentDb, createPage, listDecks, listPages, readPage } from "@/lib/agents/agent-actions";
import { agentOf, verifyAgentToken } from "@/lib/agents/agent-auth";
import { supabaseAnonKey, supabaseUrl } from "@/lib/env";

export const runtime = "nodejs";
export const maxDuration = 60;

type ToolResult = { content: Array<{ type: "text"; text: string }>; isError?: boolean };

const reply = (value: unknown): ToolResult => ({ content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }] });

/** Runs a tool as the person behind the token, turning a refusal into a sentence the AI can pass on. */
async function asPerson(auth: AuthInfo | undefined, run: (db: AgentDb, userId: string) => Promise<unknown>): Promise<ToolResult> {
  const agent = agentOf(auth);
  if (!agent || !auth) return { isError: true, content: [{ type: "text", text: "Sign in to Nemesis again, then retry." }] };
  const db = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${auth.token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  try {
    return reply(await run(db, agent.userId));
  } catch (error) {
    const message = error instanceof AgentActionError ? error.message : "Nemesis could not do that just now. Try again in a moment.";
    if (!(error instanceof AgentActionError)) console.error(JSON.stringify({ event: "mcp_tool_failed", client_id: agent.clientId, user_id: agent.userId, message: error instanceof Error ? error.message : String(error) }));
    return { isError: true, content: [{ type: "text", text: message }] };
  }
}

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "list_pages",
      {
        title: "List workspace pages",
        description: "List pages in the person's Nemesis workspace (recently opened ones first, then the ones at the top of their sidebar), with ids for read_page.",
        inputSchema: z.object({}),
      },
      async (_args, ctx) => asPerson(ctx.http?.authInfo, (db) => listPages(db)),
    );
    server.registerTool(
      "read_page",
      {
        title: "Read a workspace page",
        description: "Read one page of the person's Nemesis workspace as plain text, by an id from list_pages. Use it to build flashcards, tests and study guides from their own notes.",
        inputSchema: z.object({ page_id: z.string().min(1).max(100) }),
      },
      async ({ page_id }, ctx) => asPerson(ctx.http?.authInfo, (db) => readPage(db, page_id)),
    );
    server.registerTool(
      "create_page",
      {
        title: "Create a workspace page",
        description:
          "Create a page in the person's private Nemesis workspace from Markdown (headings, bulleted and numbered lists, checklists, quotes, paragraphs). " +
          "Use it for study guides, summaries, outlines and notes. The page appears in their sidebar under Private. Say in one line what you made; do not repeat the page in your reply.",
        inputSchema: z.object({ title: z.string().min(1).max(200), markdown: z.string().max(100_000) }),
      },
      async ({ title, markdown }, ctx) => asPerson(ctx.http?.authInfo, (db) => createPage(db, { title, markdown })),
    );
    server.registerTool(
      "list_decks",
      {
        title: "List flashcard decks",
        description: "List the names of the person's flashcard decks in Nemesis Study, to add cards to one that exists.",
        inputSchema: z.object({}),
      },
      async (_args, ctx) => asPerson(ctx.http?.authInfo, (db) => listDecks(db)),
    );
    server.registerTool(
      "create_flashcards",
      {
        title: "Create flashcards",
        description:
          "Add flashcards to a deck in the person's Nemesis Study, creating the deck when none has that name. Write each card yourself: one idea per card, " +
          "a short question or cue on the front, the answer on the back. Nemesis schedules them for review. Say how many cards went into which deck; do not list the cards in your reply.",
        inputSchema: z.object({
          deck: z.string().min(1).max(200),
          cards: z.array(z.object({ front: z.string().min(1).max(2_000), back: z.string().min(1).max(2_000) })).min(1).max(200),
        }),
      },
      async ({ deck, cards }, ctx) => asPerson(ctx.http?.authInfo, (db, userId) => addFlashcards(db, userId, { deck, cards })),
    );
    server.registerTool(
      "create_practice_test",
      {
        title: "Create a practice test",
        description:
          "Save a practice test the person takes in Nemesis Study. Each question is multiple choice (2 to 6 options, `answer` the 0-based index of the right one) " +
          "or typed (no options, `answer` written out, optional also_accept). Add a one-line explanation to each. Say that the test is ready in Study; do not print the questions or answers in your reply.",
        inputSchema: z.object({
          title: z.string().min(1).max(200),
          questions: z
            .array(
              z.object({
                question: z.string().min(1).max(500),
                options: z.array(z.string().min(1).max(500)).max(6).optional(),
                answer: z.union([z.number().int().min(0), z.string().min(1).max(500)]),
                explanation: z.string().max(500).optional(),
                also_accept: z.array(z.string().max(500)).max(10).optional(),
              }),
            )
            .min(1)
            .max(25),
        }),
      },
      async ({ title, questions }, ctx) => asPerson(ctx.http?.authInfo, (db, userId) => addPracticeTest(db, userId, { title, questions })),
    );
  },
  { serverInfo: { name: "Nemesis", version: "1.0.0" } },
);

const authorized = withMcpAuth(handler, (_req, token) => verifyAgentToken(token, { supabaseUrl, anonKey: supabaseAnonKey }), {
  required: true,
  resourceMetadataPath: "/.well-known/oauth-protected-resource/api/mcp",
});

export { authorized as DELETE, authorized as GET, authorized as POST };
