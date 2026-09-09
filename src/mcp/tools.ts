/**
 * The assay office, as tools an MCP client can call.
 *
 * The register is a website, and a judge or a buyer reaches it by opening a
 * browser and reading it. An agent cannot. This is the same office served over
 * JSON-RPC so that Claude Code, Cursor, or any other MCP client can ask the
 * questions directly — which is also how BNB Agent Studio expects a skill to
 * arrive.
 *
 * --- what this server can and cannot do ---------------------------------
 *
 * The reads are the whole product and they need nothing: no key, no account,
 * no signature. `assay_agent` runs the same six checks the site runs, against
 * the same chain, and returns the same fineness.
 *
 * The writes are the honest part. Opening a mandate escrows capital, hiring
 * over x402 spends money, and revoking a session is an authorised action on
 * chain — none of which a public server can do on a caller's behalf without
 * holding their keys, and this office does not hold anyone's keys. So the
 * write tools return the exact transaction, challenge or command that performs
 * the action, and say plainly that they have not performed it.
 *
 * That is a smaller claim than "hire an agent from your editor" and it is the
 * true one. A tool that reported success for a transaction it never sent would
 * be the same unverifiable claim this register exists to strike out, and it
 * would be discovered the first time someone checked the chain.
 */

import { assayAgent } from "@/lib/assay";
import { readLadder } from "@/lib/ladder";
import { readAgentIndex } from "@/lib/data/agents";
import { collapse } from "@/lib/dedup";
import { placeAgent, readMarketSets } from "@/lib/rung";
import { HOUSE } from "@/lib/house";
import {
  CATEGORIES,
  CATEGORY_BLURB,
  CATEGORY_LABEL,
  CHAIN_ID,
  type Category,
} from "@/lib/config";
import { MARKET_ADDRESS } from "@/lib/chain/market";

const HOST = process.env.NEXT_PUBLIC_HOST ?? "https://mandate-coral.vercel.app";

/** A tool as the MCP `tools/list` response wants it. */
export interface ToolSpec {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties: false;
  };
}

type Args = Record<string, unknown>;
type Handler = (args: Args) => Promise<unknown>;

const str = (a: Args, k: string): string | undefined =>
  typeof a[k] === "string" ? (a[k] as string) : undefined;
const int = (a: Args, k: string): number | undefined => {
  const v = a[k];
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.trunc(n) : undefined;
};

/* ------------------------------------------------------------------ reads */

const listOffices: Handler = async () => {
  const index = await readAgentIndex();
  return {
    chainId: CHAIN_ID,
    offices: CATEGORIES.map((c) => ({
      id: c,
      name: CATEGORY_LABEL[c],
      what: CATEGORY_BLURB[c],
      registeredAgentsClassifiedHere: index.counts.byCategory[c] ?? 0,
      houseAgents: HOUSE.filter((h) => h.offices.includes(c)).map((h) => ({
        slug: h.slug,
        name: h.name,
        wallet: h.wallet,
      })),
      url: `${HOST}/office/${c}`,
    })),
    note: "Classification is derived from each agent's own words and says what it claims to be. Whether the chain agrees is the Capability check in assay_agent, which is a separate question.",
  };
};

const assay: Handler = async (a) => {
  const chainId = int(a, "chainId") ?? CHAIN_ID;
  const tokenId = str(a, "tokenId") ?? "";
  if (!/^\d{1,20}$/.test(tokenId)) {
    throw new Error("tokenId must be a decimal integer, as minted in the ERC-8004 registry.");
  }

  const r = await assayAgent(chainId, tokenId, undefined, { registryDeadlineMs: 12_000 });
  return {
    chainId: r.chainId,
    tokenId: r.tokenId,
    name: r.name,
    ownerAddress: r.ownerAddress,
    agentWallet: r.agentWallet,
    fineness: r.fineness,
    hallmark: r.hallmark,
    hallmarked: r.fineness >= 375,
    category: r.category,
    categoryConfidence: r.categoryConfidence,
    checks: r.results.map((c) => ({
      id: c.id,
      title: c.title,
      verdict: c.verdict,
      // The claim and the finding are separate fields on purpose: one is what
      // the registration asserts, the other is what the chain showed.
      claim: c.claim,
      finding: c.finding,
      weight: c.weight,
    })),
    // Every figure this office publishes names the line that re-derives it,
    // and a tool result is not exempt.
    verify: `curl ${HOST}/api/v1/assay/${chainId}/${tokenId}`,
    web: `${HOST}/agent/${tokenId}`,
  };
};

const readLadderTool: Handler = async () => {
  const l = await readLadder();
  return {
    chainId: CHAIN_ID,
    readAt: l.at,
    blockNumber: l.blockNumber,
    rungs: l.rungs.map((r) => ({
      rung: r.n,
      name: r.name,
      test: r.test,
      // null is a real answer here: it means not yet measurable across the
      // whole registry, and a plausible number would be a lie.
      population: r.population,
      isFloor: Boolean(r.atLeast),
      distinctProducts: r.distinct,
      method: r.source,
      verify: r.verify,
    })),
    duplication: {
      rowsMeasured: l.duplication.counted,
      distinctProducts: l.duplication.distinct,
      duplicateRows: l.duplication.duplicateRows,
      collapseRatio: Number(l.duplication.collapse.toFixed(3)),
    },
  };
};

const searchRegister: Handler = async (a) => {
  const rung = int(a, "rung");
  const categoryArg = str(a, "category");
  const category =
    categoryArg && (CATEGORIES as readonly string[]).includes(categoryArg)
      ? (categoryArg as Category)
      : undefined;
  const limit = Math.min(100, Math.max(1, int(a, "limit") ?? 25));
  const offset = Math.max(0, int(a, "offset") ?? 0);
  const query = str(a, "query")?.trim().toLowerCase();

  const index = await readAgentIndex();
  const sets = await readMarketSets();

  let rows = index.agents;
  if (category) rows = rows.filter((r) => r.category === category);
  if (query) {
    rows = rows.filter((r) =>
      `${r.name ?? ""} ${r.description ?? ""}`.toLowerCase().includes(query),
    );
  }

  const placed = rows.map((r) => ({ agent: r, place: placeAgent(r, sets) }));
  const filtered =
    rung === undefined ? placed : placed.filter((p) => p.place.rung === rung);

  return {
    chainId: CHAIN_ID,
    matched: filtered.length,
    returned: Math.min(limit, Math.max(0, filtered.length - offset)),
    offset,
    /*
      Coverage travels with every answer, because without it a small result is
      indistinguishable from a small registry. We have read 3,808 of 303,391.
    */
    coverage: {
      rowsRead: index.agents.length,
      registryTotal: index.registry.registered,
      note: "Filters apply to the rows this office has read, not to the whole registry. An agent absent here is unindexed, not disproven.",
    },
    agents: filtered.slice(offset, offset + limit).map(({ agent, place }) => ({
      tokenId: agent.tokenId,
      name: agent.name,
      owner: agent.owner,
      category: agent.category,
      rung: place.rung,
      whyNotHigher: place.reason,
      endpointVerified: Boolean(agent.endpointVerified),
      web: `${HOST}/agent/${agent.tokenId}`,
    })),
  };
};

const checkDuplication: Handler = async (a) => {
  const top = Math.min(50, Math.max(1, int(a, "top") ?? 10));
  const index = await readAgentIndex();
  const d = collapse(index.agents);
  return {
    chainId: CHAIN_ID,
    rowsMeasured: d.counted,
    rowsSkippedWithoutNameOrDescription: d.unnamed,
    distinctProducts: d.distinct,
    duplicateRows: d.duplicateRows,
    duplicateShare: Number((d.duplicateShare * 100).toFixed(1)),
    collapseRatio: Number(d.collapse.toFixed(3)),
    method:
      "Collapsed on name and description, normalised for case and whitespace, and blind to the owner. One product minted once per user wallet has a different owner on every copy, so keying on the owner would report an almost clean register — 1.02x against 1.23x. Nothing is stemmed and no near-matches are clustered, so every figure here is a floor.",
    scope: `Measured over the ${d.counted.toLocaleString()} rows this office has read, not the ${index.registry.registered.toLocaleString()} registered. The ratio is not extrapolated, because a ratio measured on a crawl ordered by token id need not hold across the whole registry.`,
    mostRegistered: d.clusters.slice(0, top).map((c) => ({
      name: c.name,
      registrations: c.count,
      distinctOwners: c.owners,
      // One owner registering the same card repeatedly and one product minted
      // per user are different findings; the shape is here so they can be told
      // apart rather than added together.
      shape: c.owners === 1 ? "one owner, repeated registrations" : "minted per holder",
      tokenIds: c.tokenIds.slice(0, 12),
    })),
    verify: "npm run dedup",
  };
};

/* ----------------------------------------------------------------- writes */

/*
  These do not execute. Each returns what performing the action requires, and
  says so in the payload rather than only in the tool description — a client
  that ignores descriptions still cannot mistake the result for a receipt.
*/

const NO_KEYS =
  "This server holds no keys and has sent nothing. The action below is yours to sign.";

const openMandate: Handler = async (a) => {
  const categoryArg = str(a, "category");
  if (!categoryArg || !(CATEGORIES as readonly string[]).includes(categoryArg)) {
    throw new Error(`category must be one of: ${CATEGORIES.join(", ")}`);
  }
  const category = categoryArg as Category;

  return {
    executed: false,
    reason: NO_KEYS,
    what: "Opening a mandate escrows the principal's capital in the market contract and invites bonded agents to bid for it. It is a transaction from the principal's own wallet.",
    contract: { address: MARKET_ADDRESS ?? "not configured in this deployment", chainId: CHAIN_ID },
    call: {
      function: "openMandate(uint8 category, uint256 amount, uint64 epochLength)",
      category,
      categoryIndex: CATEGORIES.indexOf(category),
      amount: "the capital to put at risk, in wei",
      epochLength: "seconds per settled epoch",
    },
    command: `npm run market -- open --category ${category}`,
    thenWhat:
      "Agents bid by posting their own bond. Award the mandate, and each epoch settles against a benchmark committed to chain before the outcome is known.",
    web: `${HOST}/floor`,
  };
};

const hireOverX402: Handler = async (a) => {
  const tokenId = str(a, "tokenId") ?? "";
  if (!/^\d{1,20}$/.test(tokenId)) throw new Error("tokenId must be a decimal integer.");
  const categoryArg = str(a, "category");
  const category =
    categoryArg && (CATEGORIES as readonly string[]).includes(categoryArg)
      ? categoryArg
      : "grid-trading";

  const resource = `${HOST}/api/x402/agent/${tokenId}/simulate`;

  /*
    Ask the paywalled endpoint for its own terms rather than restating them
    here. A price copied into a tool description goes stale silently; a 402
    challenge read from the endpoint is whatever it is charging now.
  */
  let challenge: unknown = null;
  let reachable = true;
  try {
    const res = await fetch(resource, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ category }),
    });
    challenge = await res.json();
  } catch {
    reachable = false;
  }

  return {
    executed: false,
    reason: NO_KEYS,
    what: "Hiring runs the agent's strategy against live chain state and returns the calls it would make. It is paid for over x402: the endpoint answers 402 with its terms, the caller pays, and repeats the request with an x-payment header.",
    resource,
    method: "POST",
    paymentChallenge: reachable
      ? challenge
      : "The endpoint could not be reached from this server, so its current terms are unknown. Request it directly to read them.",
    howToPay:
      "An x402-capable client pays the challenge and retries with the x-payment header. This server cannot pay on your behalf.",
    note: "The simulation sends nothing on chain either: the strategy is a pure function from chain state to the calls it is permitted to make, so a simulation is the real decision with execution withheld.",
  };
};

const revokeSession: Handler = async (a) => {
  const mandateId = int(a, "mandateId");
  if (mandateId === undefined || mandateId < 0) {
    throw new Error("mandateId is required and must be a non-negative integer.");
  }
  return {
    executed: false,
    reason: NO_KEYS,
    what: "Revocation withdraws a session key's authority: the agent's allowlist, spend cap and expiry stop applying because the session is dismissed. The wallet then refuses every call with UnauthorizedCall.",
    command: `npm run grant -- revoke ${mandateId}`,
    httpAlternative: {
      method: "POST",
      url: `${HOST}/api/sessions/revoke`,
      body: { mandateId },
      header: "x-operator-token",
      note: "In this deployment the principal, the operator and the adjudicator are one party, so the HTTP route is authorised by an operator token. A market with third-party principals would have the principal sign revocation from their own wallet, which is how the contract already treats dismissal.",
    },
    web: `${HOST}/authority`,
  };
};

/* ------------------------------------------------------------------ table */

export const TOOLS: Array<ToolSpec & { handler: Handler }> = [
  {
    name: "list_offices",
    description:
      "The four offices this market runs — grid trading, rebalancing, yield optimisation and health factor — with how many registered agents are classified into each and which house agents work there. No key required.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    handler: listOffices,
  },
  {
    name: "assay_agent",
    description:
      "Run the full assay against any ERC-8004 agent on BNB Smart Chain: six checks — identity, custody, activity, capability, reputation, performance — returning a millesimal fineness. Below 375 no hallmark is struck. Works for any token id, including agents being pitched elsewhere. Free, no key, nothing to sign.",
    inputSchema: {
      type: "object",
      properties: {
        tokenId: { type: "string", description: "ERC-8004 token id, a decimal integer." },
        chainId: { type: "number", description: `Chain id. Defaults to ${CHAIN_ID}.` },
      },
      required: ["tokenId"],
      additionalProperties: false,
    },
    handler: assay,
  },
  {
    name: "read_ladder",
    description:
      "The trust ladder: seven rungs from Registered to Settled, each with the test that settles it, how many agents clear it, and the command that re-derives the figure. A rung that cannot yet be measured returns null rather than a guess.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    handler: readLadderTool,
  },
  {
    name: "search_register",
    description:
      "Browse the register by rung, category or free text. Every answer carries coverage, so a small result can be told apart from a small registry. Each agent comes back with the reason it is not on a higher rung.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Free text matched against name and description." },
        category: { type: "string", enum: [...CATEGORIES], description: "Office to filter to." },
        rung: { type: "number", description: "Ladder rung, 0 to 6." },
        limit: { type: "number", description: "Max rows, 1-100. Default 25." },
        offset: { type: "number", description: "Rows to skip. Default 0." },
      },
      additionalProperties: false,
    },
    handler: searchRegister,
  },
  {
    name: "check_duplication",
    description:
      "How many rows in the register are the same product wearing different token ids. Collapses on name and description, blind to the owner, because a product minted once per user wallet has a different owner on every copy. Returns the collapse ratio and the most-registered products.",
    inputSchema: {
      type: "object",
      properties: {
        top: { type: "number", description: "How many clusters to return, 1-50. Default 10." },
      },
      additionalProperties: false,
    },
    handler: checkDuplication,
  },
  {
    name: "open_mandate",
    description:
      "PREPARES a mandate. Returns the contract call and command that open one, and does NOT send a transaction — this server holds no keys. Opening a mandate escrows the principal's own capital.",
    inputSchema: {
      type: "object",
      properties: {
        category: { type: "string", enum: [...CATEGORIES], description: "Which office." },
      },
      required: ["category"],
      additionalProperties: false,
    },
    handler: openMandate,
  },
  {
    name: "hire_over_x402",
    description:
      "PREPARES a paid hire. Reads the live x402 payment challenge from the agent's endpoint and returns its terms. Does NOT pay — this server holds no keys and cannot spend on your behalf.",
    inputSchema: {
      type: "object",
      properties: {
        tokenId: { type: "string", description: "The agent to hire, a decimal token id." },
        category: { type: "string", enum: [...CATEGORIES], description: "Strategy to run." },
      },
      required: ["tokenId"],
      additionalProperties: false,
    },
    handler: hireOverX402,
  },
  {
    name: "revoke_session",
    description:
      "PREPARES a revocation of an agent's session authority. Returns the command and the authorised HTTP route, and does NOT revoke — that is an authorised action this server cannot take for you.",
    inputSchema: {
      type: "object",
      properties: {
        mandateId: { type: "number", description: "The mandate whose session to revoke." },
      },
      required: ["mandateId"],
      additionalProperties: false,
    },
    handler: revokeSession,
  },
];

export const TOOL_SPECS: ToolSpec[] = TOOLS.map(({ name, description, inputSchema }) => ({
  name,
  description,
  inputSchema,
}));

/** Dispatch one call. Throws for an unknown tool or bad arguments. */
export async function callTool(name: string, args: Args = {}): Promise<unknown> {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) throw new Error(`Unknown tool: ${name}`);
  return tool.handler(args ?? {});
}
