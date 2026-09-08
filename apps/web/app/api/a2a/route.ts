/**
 * A2A — the marketplace as an agent other agents can talk to.
 *
 * §8's thesis is that the volume comes from agents hiring agents, and TermiX's
 * own front page says the same. So BENCH has to be reachable by something that
 * has never seen a browser: discover it from its card, ask it what it can do,
 * ask it to do one, read the answer.
 *
 * ---------------------------------------------------------------------------
 * Why this is a thin skin over MCP rather than a second implementation
 * ---------------------------------------------------------------------------
 *
 * A2A and MCP are both JSON-RPC over POST. The difference is vocabulary —
 * `message/send` with parts, against `tools/call` with arguments — not
 * capability. Writing the marketplace twice would produce two surfaces that
 * disagree the first time one is changed, and the disagreement would be
 * invisible until somebody hired the wrong thing through the stale one.
 *
 * So there is exactly one engine. This translates, and the agent card points
 * both `a2a_endpoint` and `mcp_server` at surfaces backed by it.
 *
 * ---------------------------------------------------------------------------
 * What it will not do
 * ---------------------------------------------------------------------------
 *
 * Nothing here signs or sends. Every action that moves value comes back with
 * `executed: false` **in the payload**, not merely described as unsigned in
 * prose a machine will not read. The caller signs, and this server holds no
 * key to sign with — which is the same promise the browser surfaces make and
 * has to survive being made to a machine.
 */

import { NextResponse } from "next/server";
import { POST as mcpPost } from "../mcp/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, GET, OPTIONS",
  "access-control-allow-headers": "content-type",
} as const;

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

/** The skills this agent offers, in A2A's shape. Derived from the MCP tools. */
async function skills(origin: string): Promise<unknown> {
  const res = await mcpPost(
    new Request(`${origin}/api/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    }),
  );
  const body = (await res.json()) as { result?: { tools?: { name: string; description: string }[] } };
  return (body.result?.tools ?? []).map((t) => ({
    id: t.name,
    name: t.name,
    description: t.description,
    inputModes: ["application/json"],
    outputModes: ["application/json"],
  }));
}

/**
 * A GET returns the card, so an agent that found this URL alone can orient.
 *
 * A2A discovery normally starts at `/.well-known/agent-card.json`; answering
 * here too costs nothing and means a caller that guessed the endpoint is not
 * met with a 405 and no way forward.
 */
export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  return NextResponse.json(
    {
      protocol: "a2a",
      name: "BENCH",
      description:
        "The hiring layer for agents on BNB Smart Chain. Find an agent that can do a job, see what it would have done to your own position, and put it to work at a level of authority you choose.",
      card: `${origin}/.well-known/agent-card.json`,
      endpoint: `${origin}/api/a2a`,
      transport: "json-rpc-2.0",
      methods: ["message/send", "skills/list"],
      skills: await skills(origin),
      note: "Actions that move value return executed:false with the transaction for you to sign. This server holds no keys.",
    },
    { headers: { ...CORS, "cache-control": "public, s-maxage=300" } },
  );
}

interface Part {
  kind?: string;
  text?: string;
  data?: Record<string, unknown>;
}

/**
 * Pull a skill and its arguments out of an A2A message.
 *
 * A2A carries a message as parts. A `data` part is the machine-friendly form
 * and is used when present; a bare `text` part is accepted as the skill name so
 * a caller experimenting by hand is not forced to construct the full envelope
 * before it can see anything work.
 */
function readInvocation(params: Record<string, unknown>): { skill: string; args: Record<string, unknown> } | null {
  const message = (params.message ?? params) as { parts?: Part[]; skill?: string; data?: unknown };
  const parts = Array.isArray(message.parts) ? message.parts : [];

  const dataPart = parts.find((p) => p.data && typeof p.data === "object");
  if (dataPart?.data) {
    const d = dataPart.data;
    const skill = String(d.skill ?? d.tool ?? d.name ?? params.skill ?? "");
    if (!skill) return null;
    const args = (d.arguments ?? d.args ?? d.input ?? {}) as Record<string, unknown>;
    return { skill, args };
  }

  const textPart = parts.find((p) => typeof p.text === "string");
  const skill = String(message.skill ?? params.skill ?? textPart?.text ?? "").trim();
  return skill ? { skill, args: (params.arguments ?? {}) as Record<string, unknown> } : null;
}

export async function POST(request: Request) {
  const origin = new URL(request.url).origin;
  let body: { jsonrpc?: string; id?: unknown; method?: string; params?: Record<string, unknown> };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32700, message: "That is not JSON." } },
      { status: 400, headers: CORS },
    );
  }

  const id = body.id ?? null;
  const reply = (result: unknown) => NextResponse.json({ jsonrpc: "2.0", id, result }, { headers: CORS });
  const fail = (code: number, message: string) =>
    NextResponse.json({ jsonrpc: "2.0", id, error: { code, message } }, { headers: CORS });

  if (body.method === "skills/list") return reply({ skills: await skills(origin) });

  if (body.method !== "message/send" && body.method !== "tasks/send") {
    return fail(
      -32601,
      `This agent speaks message/send and skills/list. It received "${body.method ?? "nothing"}". Its card is at ${origin}/.well-known/agent-card.json.`,
    );
  }

  const invocation = readInvocation(body.params ?? {});
  if (!invocation) {
    return fail(
      -32602,
      "No skill was named. Send a data part shaped { skill, arguments }, or the skill name as text. skills/list returns what is available.",
    );
  }

  /*
    Delegated to the one engine rather than reimplemented. A tool that does not
    exist comes back as an error from there, so the two surfaces cannot drift
    into offering different things.
  */
  const res = await mcpPost(
    new Request(`${origin}/api/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: invocation.skill, arguments: invocation.args },
      }),
    }),
  );
  const out = (await res.json()) as {
    result?: { content?: { type: string; text: string }[]; isError?: boolean };
    error?: { code: number; message: string };
  };

  if (out.error) return fail(out.error.code, out.error.message);

  const text = out.result?.content?.map((c) => c.text).join("\n") ?? "{}";
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    data = { text };
  }

  /*
    An A2A task, completed synchronously. Every skill here answers in one round
    trip — none of them waits on a chain confirmation, because none of them
    sends anything — so returning a pending task id would be a lie about the
    shape of the work.
  */
  return reply({
    kind: "task",
    id: `bench-${Date.now().toString(36)}`,
    status: { state: out.result?.isError ? "failed" : "completed" },
    artifacts: [
      {
        name: invocation.skill,
        parts: [{ kind: "data", data }],
      },
    ],
    note: "Anything that moves value carries executed:false and the transaction for you to sign. This server holds no keys.",
  });
}
