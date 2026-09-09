/**
 * The assay office over stdio, for a local MCP client.
 *
 * This is the install a judge runs:
 *
 *   claude mcp add mandate -- npx -y tsx /path/to/src/mcp/stdio.ts
 *
 * or, from a checkout, `npm run mcp`. Cursor and any other MCP client take the
 * same command. Nothing here needs a key, an account or a signature — the
 * reads are the product, and the writes return what they would take rather
 * than pretending to have done it. See `tools.ts` for why.
 *
 * stdout belongs to the protocol. Anything this process wants to say to a
 * human goes to stderr, because a stray log line on stdout is a parse error at
 * the other end and the client simply disconnects.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { callTool, TOOL_SPECS } from "@/mcp/tools";
import { SERVER_INFO } from "@/mcp/info";

const server = new Server(SERVER_INFO, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOL_SPECS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    const result = await callTool(name, (args ?? {}) as Record<string, unknown>);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (error) {
    /*
      A failed tool is reported as a tool result with isError, not as a
      protocol error: the model can read it, correct the argument and try
      again, which a JSON-RPC error code does not let it do.
    */
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: message }],
      isError: true,
    };
  }
});

async function main() {
  await server.connect(new StdioServerTransport());
  console.error(`MANDATE MCP server ready — ${TOOL_SPECS.length} tools over stdio.`);
}

main().catch((error) => {
  console.error("MANDATE MCP server failed to start:", error);
  process.exit(1);
});
