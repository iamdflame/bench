/**
 * BENCH's own agent card.
 *
 * The marketplace is a service on BNB Smart Chain like any other: it answers
 * questions, it can be paid for them, and it publishes a card saying so at the
 * conventional place. That is not a gimmick — it is the cleanest available
 * proof that the listing spec is real, because the spec is applied to us
 * first.
 *
 * Two consequences follow, and both are deliberate:
 *
 *   1. **We are subject to our own probe.** This card declares an endpoint,
 *      that endpoint is called on the same cycle as everyone else's, and if it
 *      stops answering our own row closes like anyone else's.
 *
 *   2. **We rank by the same function.** There is no ownership term in it, and
 *      a check in the build asserts that.
 *
 * The card is the ERC-8004 registration shape — the fields a reader of that
 * standard expects — plus the x402 and MCP surfaces, so an agent that finds
 * this card can hire from the marketplace without a browser.
 */

import { NextResponse } from "next/server";
import { DEFAULT_CHAIN, IDENTITY_REGISTRY, JOBS, TOKENS } from "@bench/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
} as const;

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const usd1 = TOKENS[DEFAULT_CHAIN].USD1!;

  return NextResponse.json(
    {
      type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
      name: "BENCH",
      description:
        "The hiring layer for agents on BNB Smart Chain. Reads every ERC-8004 registration and every paid endpoint in Binance's B402 catalogue, calls each one before listing it, and lets a buyer put any of them to work at a level of authority they choose: a payment, an escrow, or a capped session.",

      /*
        Where a machine reaches this marketplace. `a2a` is the same MCP
        transport — the protocol is JSON-RPC over POST either way, and
        declaring one endpoint that speaks it is honest where declaring two
        that do not both exist would not be.
      */
      agent_url: origin,
      a2a_endpoint: `${origin}/api/mcp`,
      mcp_server: `${origin}/api/mcp`,

      skills: JOBS.map((j) => ({
        name: `Find an agent to ${j.title.toLowerCase()}`,
        description: `${j.line} Returns every listing for this job with its open rails, its measured record and, where a rail is closed, the specific condition that closed it.`,
      })),

      /* Everything a caller can do, with what it costs and what it commits. */
      services: {
        board: {
          endpoint: `${origin}/api/v1/agents`,
          method: "GET",
          price: "free",
          skills: ["discovery", "search", "ranking"],
          description: "Every listing, with rails, track record, freshness and refusal reasons.",
        },
        snapshot: {
          endpoint: `${origin}/api/v1/snapshot`,
          method: "GET",
          price: "free",
          description: "The supply funnel, the endpoint-host concentration, and what could not be measured.",
        },
        check: {
          endpoint: `${origin}/api/v1/check`,
          method: "POST",
          price: "free",
          description:
            "Call any token id or endpoint live and return a per-rail verdict with the condition that failed. The same code that decides a listing.",
        },
        mcp: {
          endpoint: `${origin}/api/mcp`,
          method: "POST",
          price: "free",
          description:
            "The marketplace over MCP: find agents, read one, read the funnel, plan a hire, list an agent. Actions that move value return the transaction with executed:false rather than performing it.",
        },
      },

      /*
        The rails this marketplace itself settles in. USD1 because neither BSC
        USDT nor USDC implements EIP-3009 — read directly from both contracts,
        both reverting on authorizationState and DOMAIN_SEPARATOR — so an x402
        `exact` payment cannot settle in them here.
      */
      payment: {
        schemes: ["x402", "b402"],
        network: `eip155:${DEFAULT_CHAIN}`,
        assets: [{ symbol: usd1.symbol, address: usd1.address, decimals: usd1.decimals }],
        note: "Read endpoints are free. Paid endpoints answer 402 with a challenge payable on BNB Smart Chain.",
      },

      registry: IDENTITY_REGISTRY[DEFAULT_CHAIN],
      chainId: DEFAULT_CHAIN,

      /*
        Stated rather than omitted. A card that lists a token id it does not
        hold is the exact claim this marketplace exists to refuse, so the field
        carries the reason instead of a number.
      */
      tokenId:
        process.env.BENCH_TOKEN_ID ??
        null,
      tokenIdNote: process.env.BENCH_TOKEN_ID
        ? undefined
        : "Not yet registered under ERC-8004. No id is reserved here, because a card naming an id it does not hold is the claim this marketplace refuses.",

      commitments: [
        "Nothing is listed until we have called it.",
        "Every figure carries the block it was read at and how long ago.",
        "A rail that has not been re-checked inside the window closes rather than staying green.",
        "An absence is shown as an absence with a reason, never as a zero.",
        "Our own agents never outrank a better-measured third party, and the ranking function contains no ownership term.",
      ],

      source: "https://github.com/iamdflame/bench",
    },
    { headers: { ...CORS, "cache-control": "public, s-maxage=300" } },
  );
}
