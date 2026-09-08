/**
 * The same marketplace, over MCP.
 *
 * A buyer reaches a marketplace by opening a browser. An agent cannot. So the
 * board, the check and the hire plan are served over the Model Context
 * Protocol too, and an agent in Claude Code or Cursor can browse this
 * marketplace and prepare a hire without a person in the loop.
 *
 * Five tools. Three of them are the product and need no key, no account and
 * nothing signed. The other two are named for actions this server cannot
 * perform, and they say so rather than pretending: putting money in escrow and
 * granting a session are signatures from the caller's own account, and this
 * server holds nobody's keys.
 *
 * Every write-shaped tool returns `executed: false` **in the payload** rather
 * than only in its description, so a client that never reads descriptions
 * still cannot mistake the result for a receipt.
 */

import { NextResponse } from "next/server";
import { JOBS, RAIL_COPY, RAILS, isJobSlug, jobBySlug, resolveChain } from "@bench/shared";
import { readBoardView, findRow } from "@/lib/board";
import { serialise } from "@/lib/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type, mcp-session-id",
} as const;

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

const TOOLS = [
  {
    name: "find_agents",
    description:
      "Search the BENCH board for agents on BNB Smart Chain. Every row says which of the three rails is open — call (pay a cent, it touches nothing), hire (fund an escrow it can only open by delivering), mandate (a capped, expiring session) — and where a rail is closed, the specific condition that closed it. Reads only; nothing is spent.",
    inputSchema: {
      type: "object",
      properties: {
        job: { type: "string", enum: JOBS.map((j) => j.slug), description: "One of the four jobs." },
        rail: { type: "string", enum: RAILS, description: "Only rows where this rail is open." },
        q: { type: "string", description: "Free text over name, description, token id and address." },
        limit: { type: "number", description: "Default 20, maximum 100." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "read_agent",
    description:
      "Everything known about one listing: what it claims, what the chain shows it doing, every probe result, and the reason behind each rail. Reads only.",
    inputSchema: {
      type: "object",
      properties: {
        chainId: { type: "number", enum: [56, 97] },
        id: { type: "string", description: "An ERC-8004 token id, or svc:<url> for a B402 paid endpoint." },
      },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "read_funnel",
    description:
      "The supply funnel with its method and its limitations: how many agents are registered, how many this deployment has read, how many were called, and how many are callable, hireable or mandatable. Includes the endpoint-host concentration. Reads only.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "plan_hire",
    description:
      "Build the engagement for one listing on one rail and return it WITHOUT signing or sending anything. Returns the transaction intents, the guardrails and the number of signatures required. `executed` is false in the payload: this server holds no keys and cannot spend on a caller's behalf.",
    inputSchema: {
      type: "object",
      properties: {
        chainId: { type: "number", enum: [56, 97] },
        id: { type: "string" },
        rail: { type: "string", enum: RAILS },
      },
      required: ["id", "rail"],
      additionalProperties: false,
    },
  },
  {
    name: "counterfactual",
    description:
      "Replay every reference strategy against a PancakeSwap V3 position an address actually holds, and return what each would have done to it. Figures are differences against leaving the position alone, in the pool's second token — not returns. Reads the chain only; needs an address, never a signature, and cannot move anything. Slow: it walks every swap in the window rather than averaging them.",
    inputSchema: {
      type: "object",
      properties: {
        address: { type: "string", description: "An address holding a PancakeSwap V3 position." },
        chainId: { type: "number", enum: [56, 97] },
        hours: {
          type: "number",
          description: "How far back to replay. Defaults to 1; a longer window costs proportionally more time.",
        },
      },
      required: ["address"],
      additionalProperties: false,
    },
  },
  {
    name: "request_quote",
    description:
      "Ask one listing for a signed ERC-8183 quote, so a job can be funded against it. Returns the quote and its terms, or the exact condition that stopped it. Makes an outbound request to the seller; signs nothing and spends nothing.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "A board id, as returned by find_agents." },
        chainId: { type: "number", enum: [56, 97] },
      },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "list_agent",
    description:
      "Check whether an agent would be listed, by calling it live with the same code the worker runs. Give a token id or an endpoint URL. Returns a per-rail verdict with the condition that failed, so a failing check can be fixed rather than guessed at. Makes an outbound request; spends nothing.",
    inputSchema: {
      type: "object",
      properties: {
        subject: { type: "string", description: "An ERC-8004 token id, or an https endpoint URL." },
        chainId: { type: "number", enum: [56, 97] },
      },
      required: ["subject"],
      additionalProperties: false,
    },
  },
] as const;

type Args = Record<string, unknown>;

async function callTool(name: string, args: Args, origin: string): Promise<unknown> {
  const { chainId } = resolveChain(args.chainId as number | undefined);

  switch (name) {
    case "find_agents": {
      const job = typeof args.job === "string" && isJobSlug(args.job) ? args.job : null;
      const rail = RAILS.includes(args.rail as never) ? (args.rail as (typeof RAILS)[number]) : null;
      const view = readBoardView({
        chainId,
        job,
        rail,
        q: typeof args.q === "string" ? args.q : null,
        limit: Math.min(100, Math.max(1, Number(args.limit ?? 20))),
      });
      return serialise({
        rows: view.rows.map((r) => ({
          /*
            The id every other tool consumes.

            Without it a machine could discover an agent and then had no way to
            act on it: `read_agent`, `plan_hire` and `request_quote` all take a
            board id, and the rows carried only a token id and a URL. §8 asks
            for discovery, evaluation and hire without a browser, and the chain
            broke silently between the first step and the third — the sort of
            gap that is invisible from a page, because a page passes the id
            along in a link.
          */
          id: r.key,
          name: r.name,
          tokenId: r.tokenId,
          job: r.job,
          url: `${origin}${r.href}`,
          rails: Object.fromEntries(
            RAILS.map((k) => [k, r.rails[k].open ? { open: true, price: r.rails[k].price } : { open: false, why: r.rails[k].detail ?? r.rails[k].reason }]),
          ),
          track: r.track,
          notMeasured: r.trackMissing,
          calledAt: r.probedAt,
        })),
        total: view.rows.length,
        collapsedByOrigin: view.collapsed,
        readAt: view.generatedAt,
      });
    }

    case "read_agent": {
      const hit = findRow(chainId, String(args.id ?? ""));
      if (!hit) {
        return {
          found: false,
          why: "This deployment has not read that id yet. Call read_funnel to see how far the crawl has reached.",
        };
      }
      return serialise({ found: true, row: hit.row, agent: hit.agent, service: hit.service, url: `${origin}${hit.row.href}` });
    }

    case "read_funnel": {
      const view = readBoardView({ chainId, limit: 1 });
      return serialise({ ...view.snapshot, readAt: view.generatedAt });
    }

    case "plan_hire": {
      const rail = String(args.rail ?? "");
      if (!RAILS.includes(rail as never)) return { executed: false, error: `Unknown rail "${rail}".` };
      const hit = findRow(chainId, String(args.id ?? ""));
      if (!hit) return { executed: false, error: "This deployment has not read that id yet." };
      const state = hit.row.rails[rail as (typeof RAILS)[number]];
      if (!state.open) {
        return {
          executed: false,
          available: false,
          why: state.detail ?? state.reason,
          note: "The rail is closed on this listing, so there is no engagement to plan. The reason above is the condition that failed.",
        };
      }
      const res = await fetch(`${origin}/api/rails/${rail}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chainId, id: args.id, resource: hit.service?.resource ?? null }),
      });
      const payload = (await res.json()) as Record<string, unknown>;
      return {
        ...payload,
        executed: false,
        note:
          "Nothing was signed or sent. " +
          `${RAIL_COPY[rail as (typeof RAILS)[number]].verb} on this rail is a signature from your own account, and this server holds no keys.`,
      };
    }

    case "counterfactual": {
      /*
        The same engine the board and the agent page use, over MCP.

        §8's point is that a machine buyer should be able to answer "is this
        worth hiring" without a browser, and the honest answer to that question
        is this replay rather than a rating. The refusals travel too: an address
        with no position, or a pool with too little history in the window, are
        different facts from a result of zero and are returned as such.
      */
      const { readPositions, replayForPosition } = await import("@bench/counterfactual");
      const { chainClient } = await import("@bench/shared");
      const address = String(args.address ?? "");
      const found = await readPositions(chainId, address);
      if (!found.ok) {
        return { measured: false, why: found.reason, remedy: found.remedy };
      }
      const owned = [...found.positions].sort((a, b) =>
        a.position.liquidity === b.position.liquidity ? 0 : a.position.liquidity > b.position.liquidity ? -1 : 1,
      )[0]!;
      const hours = Math.min(Math.max(Number(args.hours ?? 1) || 1, 0.25), 6);
      const replay = await replayForPosition(chainId, owned, chainClient(chainId) as never, { hours });
      if (!replay) {
        return {
          measured: false,
          why: "That pool traded too little in the window we can read to say anything about it.",
          remedy: "Try a longer window, or a position in a busier pool.",
        };
      }
      return {
        measured: true,
        position: {
          tokenId: owned.tokenId,
          pool: owned.pool,
          feePips: owned.feePips,
          bandTicks: [owned.position.tickLower, owned.position.tickUpper],
          widthTicks: owned.widthTicks,
        },
        window: {
          hours: replay.hours,
          swaps: replay.swaps,
          fromBlock: replay.fromBlock,
          toBlock: replay.toBlock,
          complete: replay.complete,
          shortenedBecause: replay.shortenedBecause,
          via: replay.via,
        },
        unit: "the pool's second token, as a difference against doing nothing",
        rows: replay.rows.map((r) => ({
          strategy: r.strategy,
          name: r.name,
          timeInRangePercent: r.timeInRangePercent,
          recentres: r.recentres,
          vsHold: r.vsHold1.toString(),
        })),
        caution:
          "One window is not a track record. The same replay over a window shifted by a few hundred blocks can change every figure here, and has.",
      };
    }

    case "request_quote": {
      const hit = findRow(chainId, String(args.id ?? ""));
      if (!hit) return { quoted: false, why: "This deployment has not read that id yet." };
      const state = hit.row.rails.hire;
      if (!state.open) {
        return {
          quoted: false,
          why: state.detail ?? state.reason,
          note: "No quote was requested, because the condition above already rules one out.",
        };
      }
      const res = await fetch(`${origin}/api/rails/hire`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chainId, id: args.id }),
      });
      const payload = (await res.json()) as Record<string, unknown>;
      return {
        ...payload,
        quoted: true,
        executed: false,
        note: "A quote is not a commitment. Nothing was signed or sent, and funding it is a signature from your own account.",
      };
    }

    case "list_agent": {
      const res = await fetch(`${origin}/api/v1/check`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subject: args.subject, chainId }),
      });
      return (await res.json()) as unknown;
    }

    default:
      return { error: `Unknown tool "${name}".` };
  }
}

/**
 * A minimal JSON-RPC surface.
 *
 * The MCP HTTP transport is JSON-RPC 2.0 over POST. Implementing the three
 * methods a client actually needs — initialize, tools/list, tools/call —
 * directly keeps a large SDK out of a serverless bundle for a protocol whose
 * wire format is fifty lines.
 */
export async function POST(request: Request) {
  let rpc: { jsonrpc?: string; id?: unknown; method?: string; params?: Record<string, unknown> };
  try {
    rpc = (await request.json()) as typeof rpc;
  } catch {
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } },
      { status: 400, headers: CORS },
    );
  }

  const id = rpc.id ?? null;
  const origin = new URL(request.url).origin;
  const reply = (result: unknown) => NextResponse.json({ jsonrpc: "2.0", id, result }, { headers: CORS });

  switch (rpc.method) {
    case "initialize":
      return reply({
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: {
          name: "bench",
          version: "0.1.0",
          description:
            "Hire an agent to run your money on BNB Chain. Three rails, in ascending order of what you give up: call it, hire it against an escrow, or mandate it with a capped session.",
        },
      });

    case "notifications/initialized":
      return new NextResponse(null, { status: 204, headers: CORS });

    case "tools/list":
      return reply({ tools: TOOLS });

    case "tools/call": {
      const name = String(rpc.params?.name ?? "");
      const args = (rpc.params?.arguments ?? {}) as Args;
      try {
        const out = await callTool(name, args, origin);
        return reply({ content: [{ type: "text", text: JSON.stringify(out, null, 2) }] });
      } catch (e) {
        return reply({
          content: [{ type: "text", text: JSON.stringify({ error: String(e).slice(0, 300) }, null, 2) }],
          isError: true,
        });
      }
    }

    default:
      return NextResponse.json(
        { jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${rpc.method}` } },
        { status: 404, headers: CORS },
      );
  }
}
