/**
 * The assay office, as tools an MCP client can call.
 *
 * The register is a website, and a judge or a buyer reaches it by opening a
 * browser and reading it. An agent cannot. This is the same office served over
 * JSON-RPC so that Claude Code, Cursor, or any other MCP client can ask the
 * questions directly, which is also how BNB Agent Studio expects a skill to
 * arrive.
 *
 * --- what this server can and cannot do ---------------------------------
 *
 * The reads are the whole product and they need nothing: no key, no account,
 * no signature. `assay_agent` runs the same six checks the site runs, against
 * the same chain, and returns the same fineness.
 *
 * The writes act, from the right place. Opening a mandate escrows capital,
 * hiring spends money and revoking is an authorised action, so they sign only
 * in the local stdio server, with MCP_SIGNER_KEY, a key the person running it
 * holds. There, `hire_over_x402` pays and returns the work, `hire_erc8183`
 * funds a job, `open_mandate` opens one and `revoke_session` ends a key. The
 * hosted endpoint never signs: it returns the exact transaction or challenge
 * and `executed: false`. A tool that reported success for a transaction it
 * never sent would be the unverifiable claim this register exists to strike
 * out, so every result says which of the two happened.
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
import { MARKET_ADDRESS, marketClient, readMandate, walletFor } from "@/lib/chain/market";
import { encodeFunctionData, parseAbi, parseEther, toHex, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { randomBytes } from "node:crypto";
import { MARKET_V2 } from "@/lib/chain/deployments";
import { MANDATE_MARKET_V2_ABI } from "@/lib/chain/abiV2";
import { openMandate as sendOpenMandate, openMandateArgs } from "@/lib/chain/marketV2";
import { readKey } from "@/lib/chain/keystore";
import { getProbes } from "@/lib/data/probes";
import { TRANSFER_TYPES, USD1, USD1_DOMAIN } from "@/lib/x402";
import { IDENTITY_REGISTRY } from "@/lib/config";
import { toJson } from "@/lib/chain/session-store";

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

/**
 * Who is calling, and whether this process may sign for them.
 *
 * The hosted endpoint passes nothing and gets `{ canSign: false }`: it runs on
 * a deployment whose PRIVATE_KEY belongs to the operator, never to a caller,
 * so no write tool there ever signs. The local stdio server passes
 * `{ canSign: true }` and signs with MCP_SIGNER_KEY, a key the person running
 * it put in their own environment. Nothing here reads PRIVATE_KEY.
 */
export interface ToolContext {
  canSign: boolean;
}
const HOSTED: ToolContext = { canSign: false };
type Handler = (args: Args, ctx: ToolContext) => Promise<unknown>;

function signerFor(ctx: ToolContext): { key: Hex; address: Address } | null {
  if (!ctx.canSign) return null;
  const raw = process.env.MCP_SIGNER_KEY;
  if (!raw) return null;
  const key = (raw.startsWith("0x") ? raw : `0x${raw}`) as Hex;
  return { key, address: privateKeyToAccount(key).address };
}

/** Results cross a JSON boundary; bigints must not reach it raw. */
const plain = <T>(v: T): unknown => JSON.parse(toJson(v));

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
      "Collapsed on name and description, normalised for case and whitespace, and blind to the owner. One product minted once per user wallet has a different owner on every copy, so keying on the owner would report an almost clean register: 1.02x against 1.23x. Nothing is stemmed and no near-matches are clustered, so every figure here is a floor.",
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
  says so in the payload rather than only in the tool description, so a client
  that ignores descriptions still cannot mistake the result for a receipt.
*/

const DRY =
  "Nothing was sent. The hosted endpoint never signs; run the stdio server with MCP_SIGNER_KEY set in your own environment and this tool sends it from that key.";

const openMandate: Handler = async (a, ctx) => {
  const categoryArg = str(a, "category");
  if (!categoryArg || !(CATEGORIES as readonly string[]).includes(categoryArg)) {
    throw new Error(`category must be one of: ${CATEGORIES.join(", ")}`);
  }
  const category = categoryArg as Category;
  const capital = str(a, "capitalBnb") ?? "0.0002";
  if (!/^\d+(\.\d{1,18})?$/.test(capital)) throw new Error("capitalBnb must be a decimal amount of BNB.");
  const value = parseEther(capital);
  if (value < parseEther("0.0002")) throw new Error("capitalBnb must be at least 0.0002, the market's minimum.");

  const callArgs = openMandateArgs({
    category: CATEGORIES.indexOf(category) as 0 | 1 | 2 | 3,
    benchmark: 0,
    toleranceBps: 500,
    feeBps: 1000,
    slashBps: 2500,
    epochLength: 3600,
    epochsTotal: 24,
    strikes: 3,
    catastrophicBps: -1000,
    bondFloorBps: 2000,
  });
  const data = encodeFunctionData({ abi: MANDATE_MARKET_V2_ABI, functionName: "openMandate", args: callArgs } as never);
  const terms = {
    category,
    capitalBnb: capital,
    benchmark: "Hold, the only benchmark the settlement engine derives today",
    epoch: "3600 s, 24 epochs, 3 strikes, 25% slash, 10% fee on outperformance",
  };
  const s = signerFor(ctx);
  if (!s) {
    return {
      executed: false,
      reason: DRY,
      transaction: { chainId: CHAIN_ID, to: MARKET_V2, value: value.toString(), data },
      terms,
      web: `${HOST}/agents?category=${category}`,
    };
  }
  const hash = await sendOpenMandate(walletFor(s.key), callArgs, value);
  return {
    executed: true,
    from: s.address,
    transaction: hash,
    explorer: `https://bscscan.com/tx/${hash}`,
    terms,
    thenWhat: "Agents bid by posting a bond. Award one, and each epoch settles against a benchmark committed before the outcome.",
    web: `${HOST}/activity`,
  };
};

const HOUSE_AGENTS = ["grid-1", "range-1", "yield-1", "guard-1"];

const hireOverX402: Handler = async (a, ctx) => {
  const tokenId = str(a, "tokenId");
  const agent = str(a, "agent");
  const query = str(a, "query");
  if (tokenId !== undefined && !/^\d{1,20}$/.test(tokenId)) throw new Error("tokenId must be a decimal integer.");
  if (!tokenId && !agent) throw new Error(`give tokenId (a registry agent) or agent (one of ${HOUSE_AGENTS.join(", ")}).`);

  let url: string;
  if (agent) {
    if (!HOUSE_AGENTS.includes(agent)) throw new Error(`agent must be one of ${HOUSE_AGENTS.join(", ")}.`);
    if (query && !/^[\w=&.:%-]{1,300}$/.test(query)) throw new Error("query must be a plain query string, like wallet=0x... or position=123.");
    url = `${HOST}/api/x402/house/${agent}${query ? `?${query}` : ""}`;
  } else {
    const q = getProbes().quotes?.[tokenId!];
    if (!q) return { executed: false, reason: "We have no measured x402 price for this agent. Its endpoint either did not answer 402 or has never been called.", tokenId };
    if (!q.payable) return { executed: false, reason: `Cannot be paid by signature: ${q.unpayable}`, endpoint: q.endpoint };
    url = q.endpoint;
  }

  const first = await fetch(url, { signal: AbortSignal.timeout(20_000) }).catch(() => null);
  if (!first) return { executed: false, reason: "The endpoint did not answer.", url };
  const challenge = (await first.json().catch(() => null)) as { accepts?: { scheme: string; asset: string; payTo: Address; maxAmountRequired: string; network: string }[] } | null;
  if (first.status !== 402) return { executed: false, reason: `Expected a 402 with terms, got ${first.status}.`, url, body: challenge };

  const s = signerFor(ctx);
  if (!s) return { executed: false, reason: DRY, url, challenge };
  const req = challenge?.accepts?.[0];
  if (!req || req.scheme !== "exact" || req.asset.toLowerCase() !== USD1.toLowerCase()) {
    return { executed: false, reason: "This tool pays x402 v1 'exact' in USD1 only, the one stable on BSC that can be paid by signature.", challenge };
  }
  const account = privateKeyToAccount(s.key);
  const authorization = {
    from: account.address,
    to: req.payTo,
    value: BigInt(req.maxAmountRequired),
    validAfter: 0n,
    validBefore: BigInt(Math.floor(Date.now() / 1000) + 120),
    nonce: toHex(randomBytes(32)),
  };
  const signature = await account.signTypedData({ domain: USD1_DOMAIN, types: TRANSFER_TYPES, primaryType: "TransferWithAuthorization", message: authorization });
  const header = Buffer.from(
    JSON.stringify({
      x402Version: 1,
      scheme: "exact",
      network: req.network,
      payload: { signature, authorization: { ...authorization, value: authorization.value.toString(), validAfter: "0", validBefore: authorization.validBefore.toString() } },
    }),
  ).toString("base64");
  const second = await fetch(url, { headers: { "X-PAYMENT": header }, signal: AbortSignal.timeout(60_000) });
  const receipt = second.headers.get("x-payment-response");
  return {
    executed: second.status === 200,
    paidBy: account.address,
    status: second.status,
    settlement: receipt ? (JSON.parse(Buffer.from(receipt, "base64").toString()) as { transaction?: string }).transaction ?? null : null,
    work: await second.json().catch(() => null),
  };
};

const REGISTRY = parseAbi(["function ownerOf(uint256) view returns (address)", "function getAgentWallet(uint256) view returns (address)"]);

async function providerOf(tokenId: string): Promise<Address> {
  const wallet = (await marketClient
    .readContract({ address: IDENTITY_REGISTRY as Address, abi: REGISTRY, functionName: "getAgentWallet", args: [BigInt(tokenId)] })
    .catch(() => null)) as Address | null;
  if (wallet && !/^0x0{40}$/i.test(wallet)) return wallet;
  return (await marketClient.readContract({ address: IDENTITY_REGISTRY as Address, abi: REGISTRY, functionName: "ownerOf", args: [BigInt(tokenId)] })) as Address;
}

const hireErc8183: Handler = async (a, ctx) => {
  const tokenId = str(a, "tokenId") ?? "";
  if (!/^\d{1,20}$/.test(tokenId)) throw new Error("tokenId must be a decimal integer.");
  const task = str(a, "task") ?? "";
  if (task.length < 8 || task.length > 2000) throw new Error("task must describe the work in 8 to 2,000 characters.");
  const budget = str(a, "budget") ?? "0.1";
  if (!/^\d+(\.\d{1,18})?$/.test(budget) || Number(budget) <= 0 || Number(budget) > 10) throw new Error("budget is in $U, above 0 and at most 10.");
  const provider = await providerOf(tokenId);
  const s = signerFor(ctx);
  const escrow = "Funds an ERC-8183 escrow in $U. The provider is paid when it submits work and the job settles; if it never submits, the budget is refundable after expiry.";
  if (!s) return { executed: false, reason: DRY, tokenId, provider, budget: `${budget} $U`, escrow, via: "Altana hireErc8183Agent: createJob, registerJob, setBudget, approve exactly the budget, fund, in one batch" };
  if (provider.toLowerCase() === s.address.toLowerCase()) throw new Error("Refusing: the provider is your own address.");
  const sdk = (await import("@altananetwork/sdk")) as unknown as {
    BNB: unknown;
    signerFromPrivateKey: (k: Hex) => unknown;
    hireErc8183Agent: (w: { address: Address }, signer: unknown, p: { provider: Address; task: string; budget: bigint }, o: { network: unknown }) => Promise<{ jobId: bigint; transactionHash?: Hex; expiredAt: bigint }>;
  };
  const r = await sdk.hireErc8183Agent({ address: s.address }, sdk.signerFromPrivateKey(s.key), { provider, task, budget: parseEther(budget) }, { network: sdk.BNB });
  return plain({ executed: true, from: s.address, tokenId, provider, jobId: r.jobId, transaction: r.transactionHash ?? null, expiresAt: r.expiredAt, escrow });
};

const revokeSession: Handler = async (a, ctx) => {
  const keyId = str(a, "keyId");
  const mandateId = int(a, "mandateId");
  if (keyId === undefined && (mandateId === undefined || mandateId < 0)) {
    throw new Error("mandateId is required and must be a non-negative integer, or pass keyId, a KeyStore key id on your own account.");
  }
  const s = signerFor(ctx);
  if (!s || !keyId) {
    return {
      executed: false,
      reason: s ? "Pass keyId to revoke a key on your own account." : DRY,
      what: "Revocation ends a session key's authority on chain: the account refuses its next call, and the KeyStore reports it not valid.",
      httpAlternative: { method: "POST", url: `${HOST}/api/desk/revoke`, form: { id: "the session id shown on /desk", token: "the operator token" } },
      web: `${HOST}/desk`,
    };
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(keyId)) throw new Error("keyId must be a 32-byte hex string.");
  const entry = await readKey(s.address, keyId as Hex);
  if (!entry.publicKey) throw new Error("The KeyStore has no key with that id on your account.");
  if (!entry.valid) return { executed: false, reason: "That key is already not valid.", keystore: plain(entry) };
  const { AltanaWalletProvider } = await import("@bnbagent/sdk/wallets");
  const r = await new AltanaWalletProvider({ privateKey: s.key }).revokeSession(entry.publicKey);
  const after = await readKey(s.address, keyId as Hex);
  return { executed: true, account: s.address, transaction: r.transactionHash ?? null, keystoreValidAfter: after.valid };
};

const readReceipt: Handler = async (a) => {
  const jobId = str(a, "jobId");
  const mandateId = int(a, "mandateId");
  const tx = str(a, "tx");
  if (jobId !== undefined) {
    if (!/^\d{1,20}$/.test(jobId)) throw new Error("jobId must be a decimal integer.");
    const sdk = (await import("@altananetwork/sdk")) as unknown as { BNB: unknown; getErc8183Job: (n: unknown, id: bigint) => Promise<unknown> };
    return plain({ kind: "erc8183-job", jobId, job: await sdk.getErc8183Job(sdk.BNB, BigInt(jobId)) });
  }
  if (mandateId !== undefined) {
    if (mandateId < 0) throw new Error("mandateId must be non-negative.");
    return plain({ kind: "mandate", market: MARKET_ADDRESS, mandate: await readMandate(mandateId), web: `${HOST}/receipts/${mandateId}` });
  }
  if (tx !== undefined) {
    if (!/^0x[0-9a-fA-F]{64}$/.test(tx)) throw new Error("tx must be a 32-byte transaction hash.");
    const r = await marketClient.getTransactionReceipt({ hash: tx as Hex });
    return plain({ kind: "transaction", status: r.status, block: r.blockNumber, from: r.from, to: r.to, gasUsed: r.gasUsed, logs: r.logs.length, explorer: `https://bscscan.com/tx/${tx}` });
  }
  throw new Error("Give jobId, mandateId or tx.");
};

/* ------------------------------------------------------------------ table */

export const TOOLS: Array<ToolSpec & { handler: Handler }> = [
  {
    name: "list_offices",
    description:
      "The four offices this market runs (grid trading, rebalancing, yield optimisation and health factor), with how many registered agents are classified into each and which house agents work there. No key required.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    handler: listOffices,
  },
  {
    name: "assay_agent",
    description:
      "Run the full assay against any ERC-8004 agent on BNB Smart Chain: six checks (identity, custody, activity, capability, reputation, performance), returning a millesimal fineness. Below 375 no hallmark is struck. Works for any token id, including agents being pitched elsewhere. Free, no key, nothing to sign.",
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
      "Opens a bonded mandate on MandateMarketV2. Over the hosted endpoint it PREPARES the exact transaction and does NOT send it. Over the local stdio server with MCP_SIGNER_KEY set, it sends it from that key and returns the hash. Escrows the signer's own capital.",
    inputSchema: {
      type: "object",
      properties: {
        category: { type: "string", enum: [...CATEGORIES], description: "Which office." },
        capitalBnb: { type: "string", description: "Capital to escrow, in BNB. Default and minimum 0.0002." },
      },
      required: ["category"],
      additionalProperties: false,
    },
    handler: openMandate,
  },
  {
    name: "hire_over_x402",
    description:
      "Buys one answer from an agent over x402: a registry agent by token id (using its measured price), or one of our reference agents (grid-1, range-1, yield-1, guard-1). Over the hosted endpoint it reads the live 402 terms and does NOT pay. Over stdio with MCP_SIGNER_KEY set, it signs an EIP-3009 USD1 authorization and returns the work and the settlement hash.",
    inputSchema: {
      type: "object",
      properties: {
        tokenId: { type: "string", description: "A registry agent, a decimal token id." },
        agent: { type: "string", enum: ["grid-1", "range-1", "yield-1", "guard-1"], description: "One of our reference agents instead." },
        query: { type: "string", description: "Inputs for a reference agent, like wallet=0x... or position=7408923." },
      },
      additionalProperties: false,
    },
    handler: hireOverX402,
  },
  {
    name: "revoke_session",
    description:
      "Ends a session key's authority. Over the hosted endpoint it does NOT revoke and returns the authorised route. Over stdio with MCP_SIGNER_KEY set and a keyId, it revokes that key on the signer's own Altana account and returns the transaction and the KeyStore's answer afterwards.",
    inputSchema: {
      type: "object",
      properties: {
        mandateId: { type: "number", description: "The mandate whose session to revoke (hosted: returns the route)." },
        keyId: { type: "string", description: "A KeyStore key id on the signer's own account (stdio only)." },
      },
      additionalProperties: false,
    },
    handler: revokeSession,
  },
  {
    name: "hire_erc8183",
    description:
      "Hires a registry agent through ERC-8183 with Altana's hireErc8183Agent: funds an escrow in $U that pays the provider when it submits. Over the hosted endpoint it does NOT send anything and returns the provider and terms. Over stdio with MCP_SIGNER_KEY set, it funds the job from that key's Altana account.",
    inputSchema: {
      type: "object",
      properties: {
        tokenId: { type: "string", description: "The agent to hire, a decimal token id." },
        task: { type: "string", description: "What you want done, 8 to 2,000 characters." },
        budget: { type: "string", description: "Budget in $U, default 0.1." },
      },
      required: ["tokenId", "task"],
      additionalProperties: false,
    },
    handler: hireErc8183,
  },
  {
    name: "read_receipt",
    description:
      "Reads a receipt from the chain: an ERC-8183 job by jobId, a mandate by mandateId, or any transaction by hash. Read only, no key.",
    inputSchema: {
      type: "object",
      properties: {
        jobId: { type: "string", description: "An ERC-8183 job id." },
        mandateId: { type: "number", description: "A mandate id on the current market." },
        tx: { type: "string", description: "A transaction hash." },
      },
      additionalProperties: false,
    },
    handler: readReceipt,
  },
];

export const TOOL_SPECS: ToolSpec[] = TOOLS.map(({ name, description, inputSchema }) => ({
  name,
  description,
  inputSchema,
}));

/**
 * Dispatch one call. Throws for an unknown tool or bad arguments.
 *
 * `ctx` defaults to the hosted context, which never signs. Only the stdio
 * server passes `{ canSign: true }`.
 */
export async function callTool(name: string, args: Args = {}, ctx: ToolContext = HOSTED): Promise<unknown> {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) throw new Error(`Unknown tool: ${name}`);
  return tool.handler(args ?? {}, ctx);
}
