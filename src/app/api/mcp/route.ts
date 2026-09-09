/**
 * The assay office over MCP, hosted.
 *
 * The stdio server is the local install; this is the same tools reachable at a
 * URL, which is what a remote MCP client and a Smithery listing consume:
 *
 *   claude mcp add --transport http mandate https://<host>/api/mcp
 *
 * Streamable HTTP in its stateless JSON form — one POST carrying one JSON-RPC
 * message, one JSON response, no session to keep and no stream to hold open.
 * That is the shape this deployment can actually honour: it runs on serverless
 * functions with no shared memory between invocations, so a server that handed
 * out session ids would be promising continuity it cannot keep. Every tool
 * here is a fresh read anyway, so there is no session state worth having.
 *
 * The tools, and the reason the write tools do not write, are in `mcp/tools`.
 */

import { callTool, TOOL_SPECS } from "@/mcp/tools";
import { INSTRUCTIONS, PROTOCOL_VERSION, SERVER_INFO } from "@/mcp/info";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, GET, OPTIONS",
  "access-control-allow-headers": "content-type, mcp-protocol-version, mcp-session-id",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS },
  });

/** A JSON-RPC error object, as the transport expects it. */
const rpcError = (id: unknown, code: number, message: string) =>
  json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

const result = (id: unknown, value: unknown) =>
  json({ jsonrpc: "2.0", id, result: value });

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

/**
 * A plain GET is a person in a browser, not a client.
 *
 * The spec uses GET to open a server-initiated stream, which this server does
 * not offer. Rather than the bare 405 that implies, it says what this endpoint
 * is and how to connect to it.
 */
export function GET() {
  return json({
    server: SERVER_INFO,
    protocolVersion: PROTOCOL_VERSION,
    transport: "streamable-http (stateless JSON; no server-initiated stream)",
    tools: TOOL_SPECS.map((t) => t.name),
    connect: "claude mcp add --transport http mandate <this-url>",
    instructions: INSTRUCTIONS,
  });
}

export async function POST(request: Request) {
  let message: { jsonrpc?: string; id?: unknown; method?: string; params?: unknown };
  try {
    message = await request.json();
  } catch {
    return rpcError(null, -32700, "Parse error: body is not JSON.");
  }

  if (Array.isArray(message)) {
    return rpcError(null, -32600, "Batched requests are not supported by this server.");
  }

  const { id, method, params } = message;

  /*
    A notification has no id and expects no body — `notifications/initialized`
    is the one that matters here. Answering it with a JSON-RPC result is a
    protocol violation that some clients tolerate and others disconnect over.
  */
  if (id === undefined || id === null) {
    return new Response(null, { status: 202, headers: CORS });
  }

  switch (method) {
    case "initialize":
      return result(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS,
      });

    case "ping":
      return result(id, {});

    case "tools/list":
      return result(id, { tools: TOOL_SPECS });

    case "tools/call": {
      const p = (params ?? {}) as { name?: string; arguments?: Record<string, unknown> };
      if (!p.name) return rpcError(id, -32602, "tools/call requires a tool name.");
      try {
        const value = await callTool(p.name, p.arguments ?? {});
        return result(id, {
          content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
        });
      } catch (error) {
        // A tool that failed is a result the model can read and act on, not a
        // transport error. Only an unknown method is a protocol error.
        const text = error instanceof Error ? error.message : String(error);
        return result(id, { content: [{ type: "text", text }], isError: true });
      }
    }

    default:
      return rpcError(id, -32601, `Method not found: ${method}`);
  }
}
