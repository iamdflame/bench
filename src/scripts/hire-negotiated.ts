/**
 * Hires an ERC-8183 seller that negotiates first, over A2A.
 *
 *   npx tsx --env-file=.env src/scripts/hire-negotiated.ts [chainhelix-grid] [run]
 *
 * Studio's escrow rail has a half our earlier hires skipped. ChainHelix's
 * gridtrader does not take a job off the street: you send `negotiate` over
 * A2A with the job spec, it answers with a wallet-signed quote (price,
 * negotiation hash, provider signature), and that envelope is what gets
 * anchored on chain as the job's task. Fund it, then send `notify_funded` so
 * the seller starts work. Delivery arrives as the `submit` transaction on the
 * job, and the escrow releases after the policy's dispute window.
 *
 * Nothing here trusts the seller's own words about who it is: the provider is
 * the address the ERC-8004 registry reports for the token, checked against
 * every address we control before a single $U moves.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { formatEther, getAddress, keccak256, parseAbi, parseEther, toBytes, verifyMessage, type Address, type Hex } from "viem";
import { marketClient } from "@/lib/chain/market";
import { IDENTITY_REGISTRY } from "@/lib/config";
import { DEMO_ADDRESS } from "@/lib/demo";

const U_TOKEN = "0xcE24439F2D9C6a2289F741120FE202248B666666".toLowerCase();
const MAX_PRICE = parseEther("0.6");
const OUT = join(process.cwd(), "src/data/hires.json");

/** Every address this operation controls. A quote from one of these is refused. */
const OURS = new Set(
  [
    DEMO_ADDRESS,
    "0xd6d11Aa5046dc5C7BE8d63B9223b60D7AD94cBe9",
    "0x090d19610cdb4d6bb011d9EB579910Ac3296BB0a",
    "0x6F29B50ebaF733D980EadfeB3253347d8a12A69C",
    "0xd9E5837E28F1C36e591aff7869CE177c71C7F4A4",
    "0x004c7Ae8077560c75fE5687dA39E7bE0697ddBFD",
    "0xbebF6B026e1fFC06A3c8d3C1b57b8142BF027454",
    "0x7e91367c77E561F0d99C2B42925aF29cd90AE838",
    "0x81762d5214fCB6fB3b102beF9D69d13A56c1a2d0",
  ].map((a) => a.toLowerCase()),
);

interface Target {
  tokenId: string;
  who: string;
  category: string;
  a2a: string;
  /** The job spec, as the seller's work skill defines it. Sent as a JSON string. */
  spec: Record<string, unknown>;
  deliverables: string;
  standards: string;
}

const TARGETS: Record<string, Target> = {
  "chainhelix-grid": {
    tokenId: "269224",
    who: "ChainHelix gridtrader",
    category: "grid-trading",
    a2a: "https://agents.chainhelix.io/gridtrader/",
    spec: { price: 716.0, budgetUsd: 100, levels: 5, spanPct: 2 },
    deliverables: "A symmetric buy/sell grid ladder for the mark price and budget given, as JSON, with each level's side, price and USD size",
    standards: "Deterministic arithmetic, equal USD size per level, answered as sent",
  },
};


/*
  The job description a Studio seller verifies.

  A seller that negotiates does not read the task we type; it reads the task
  it signed. `@bnbagent/sdk`'s `buildJobDescription` is the canonical form of
  that: keys sorted, non-ASCII escaped, the quote's own hash and signature
  carried alongside. Anchoring anything else, even the same facts in another
  order, is a job the seller will refuse to work: ChainHelix answered our
  first attempt with "no signed quote anchored in job description". This
  rebuilds that form byte for byte, and then checks the rebuild against the
  seller's own hash and signature before a single token is escrowed.
*/
function sortValue(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortValue);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) out[k] = sortValue((v as Record<string, unknown>)[k]);
    return out;
  }
  return v;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value)).replace(/[\u007f-\uffff]/g, (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

/** Square brackets become round ones and control characters go, as the SDK does. */
function sanitizeForClaim(s: unknown): string {
  const text = typeof s === "string" ? s : String(s);
  let out = "";
  for (const ch of text.replaceAll("[", "(").replaceAll("]", ")")) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 32 || ch === "\t" || ch === "\n") out += ch;
  }
  return out;
}

function descriptionContent(env: Record<string, any>): Record<string, unknown> {
  const response = env.response ?? {};
  const request = env.request ?? {};
  const t = response.terms ?? {};
  if (!response.accepted) throw new Error("cannot anchor a rejected negotiation");
  if (!t.price) throw new Error("the quote names no price");
  if (!t.currency) throw new Error("the quote names no currency");
  const terms: Record<string, unknown> = {
    deliverables: sanitizeForClaim(t.deliverables ?? ""),
    quality_standards: sanitizeForClaim(t.quality_standards ?? ""),
  };
  if (Array.isArray(t.success_criteria) && t.success_criteria.length) {
    terms.success_criteria = t.success_criteria.map((c: unknown) => sanitizeForClaim(c));
  }
  const content: Record<string, unknown> = {
    version: 1,
    negotiated_at: env.negotiated_at ?? response.negotiated_at ?? Math.floor(Date.now() / 1000),
    task: sanitizeForClaim(request.task_description ?? ""),
    terms,
    price: t.price,
    currency: t.currency,
  };
  const expires = env.quote_expires_at ?? response.quote_expires_at;
  if (expires !== undefined && expires !== null) content.quote_expires_at = expires;
  if (env.chain_id !== undefined && env.chain_id !== null) content.chain_id = env.chain_id;
  if (env.verifying_contract) content.verifying_contract = getAddress(String(env.verifying_contract));
  return content;
}

function buildJobDescription(env: Record<string, any>): string {
  const content = descriptionContent(env);
  if (env.negotiation_hash) content.negotiation_hash = env.negotiation_hash;
  if (env.provider_sig) content.provider_sig = env.provider_sig;
  return canonicalJson(content);
}

/** The seller's hash and signature, checked against the description we rebuilt. */
async function verifyQuote(env: Record<string, any>, provider: Address): Promise<{ hashMatches: boolean; signedBy: boolean }> {
  const rebuilt = keccak256(toBytes(canonicalJson(descriptionContent(env))));
  const hashMatches = rebuilt.toLowerCase() === String(env.negotiation_hash).toLowerCase();
  const signedBy = await verifyMessage({ address: provider, message: String(env.negotiation_hash), signature: env.provider_sig as Hex }).catch(() => false);
  return { hashMatches, signedBy };
}

const args = process.argv.slice(2);
const run = args.includes("run");
const name = args.find((a) => a !== "run") ?? "chainhelix-grid";

interface A2AResult {
  status: number;
  data: Record<string, any> | null;
  raw: unknown;
}

async function a2a(url: string, data: unknown, messageId: string): Promise<A2AResult> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "message/send",
      params: { message: { role: "user", messageId, parts: [{ kind: "data", data }] } },
    }),
    signal: AbortSignal.timeout(90_000),
  });
  const raw = (await res.json().catch(() => null)) as any;
  const part = raw?.result?.parts?.find((p: any) => p.kind === "data") ?? null;
  return { status: res.status, data: part?.data ?? null, raw };
}

async function ownerOf(tokenId: string): Promise<Address> {
  return (await marketClient.readContract({
    address: IDENTITY_REGISTRY as Address,
    abi: parseAbi(["function ownerOf(uint256 tokenId) view returns (address)"]),
    functionName: "ownerOf",
    args: [BigInt(tokenId)],
  })) as Address;
}

function keep(path: string, body: unknown): string {
  const abs = join(process.cwd(), path);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, `${JSON.stringify(body, null, 2)}\n`);
  return path;
}

async function main() {
  const t = TARGETS[name];
  if (!t) throw new Error(`unknown target ${name}; known: ${Object.keys(TARGETS).join(", ")}`);
  const pk = process.env.PRIVATE_KEY;
  if (!pk) throw new Error("PRIVATE_KEY is required (the principal's Altana account)");
  const key = (pk.startsWith("0x") ? pk : `0x${pk}`) as Hex;

  const provider = await ownerOf(t.tokenId);
  if (OURS.has(provider.toLowerCase())) throw new Error(`#${t.tokenId} resolves to ${provider}, which is one of ours`);
  console.log(`#${t.tokenId} ${t.who}: provider ${provider}, not one of ours`);

  const negotiation = await a2a(
    t.a2a,
    {
      skill: "negotiate",
      task_description: JSON.stringify(t.spec),
      terms: { deliverables: t.deliverables, quality_standards: t.standards },
    },
    `mandate-negotiate-${Date.now()}`,
  );
  const envelope = negotiation.data;
  const accepted = envelope?.response?.accepted === true;
  if (!accepted) throw new Error(`the seller refused to quote: ${JSON.stringify(envelope?.response ?? negotiation.raw).slice(0, 300)}`);

  const price = BigInt(envelope!.response.terms.price as string);
  const currency = String(envelope!.response.terms.currency ?? "").toLowerCase();
  if (currency !== U_TOKEN) throw new Error(`it prices in ${currency}, not $U`);
  if (price > MAX_PRICE) throw new Error(`it quoted ${formatEther(price)} $U, above the ${formatEther(MAX_PRICE)} this hire may spend`);
  console.log(
    `quote: ${formatEther(price)} $U, expires ${new Date(Number(envelope!.response.quote_expires_at) * 1000).toISOString()}, ` +
      `negotiation ${envelope!.negotiation_hash}`,
  );

  const check = await verifyQuote(envelope!, provider);
  console.log(`quote check: hash rebuilds ${check.hashMatches}, signed by the provider ${check.signedBy}`);
  if (!check.hashMatches) throw new Error("the quote's negotiation_hash does not match the description we would anchor; not funding");
  if (!check.signedBy) throw new Error("the quote's signature does not recover to the provider; not funding");
  const description = buildJobDescription(envelope!);
  console.log(`description to anchor: ${description.length} bytes`);

  if (!run) {
    console.log("plan only. Re-run with `run` to fund it.");
    return;
  }

  const sdk = (await import("@altananetwork/sdk")) as unknown as {
    BNB: unknown;
    signerFromPrivateKey: (k: Hex) => unknown;
    hireErc8183Agent: (
      wallet: { address: Address },
      signer: unknown,
      params: { provider: Address; task: string; budget: bigint },
      opts: { network: unknown },
    ) => Promise<{ jobId: bigint; transactionHash?: Hex; status: string; expiredAt: bigint }>;
    getErc8183Job: (network: unknown, jobId: bigint) => Promise<Record<string, unknown>>;
  };
  const signer = sdk.signerFromPrivateKey(key);
  const hire = await sdk.hireErc8183Agent(
    { address: DEMO_ADDRESS as Address },
    signer,
    // The seller's own signed quote, in the canonical form its runtime parses,
    // so the chain carries the terms it signed rather than a sentence of ours.
    { provider, task: description, budget: price },
    { network: sdk.BNB },
  );
  console.log(`funded job ${hire.jobId}: ${hire.transactionHash ?? "(relayed)"}`);

  const notice = await a2a(t.a2a, { skill: "notify_funded", job_id: Number(hire.jobId) }, `mandate-funded-${Date.now()}`);
  console.log(`notify_funded: ${JSON.stringify(notice.data ?? notice.raw).slice(0, 300)}`);

  const job = await sdk.getErc8183Job(sdk.BNB, hire.jobId).catch(() => null);
  const evidence = keep(`docs/evidence/${new Date().toISOString().slice(0, 10)}-8183-${hire.jobId}.json`, {
    target: t,
    provider,
    negotiation: negotiation.raw,
    hire: { jobId: hire.jobId.toString(), tx: hire.transactionHash ?? null, expiredAt: Number(hire.expiredAt) },
    notifyFunded: notice.raw,
    jobAtHire: job ? JSON.parse(JSON.stringify(job, (_, v) => (typeof v === "bigint" ? v.toString() : v))) : null,
  });

  const history = existsSync(OUT) ? (JSON.parse(readFileSync(OUT, "utf8")) as { hires: unknown[] }) : { hires: [] };
  history.hires.push({
    tokenId: t.tokenId,
    who: t.who,
    provider,
    providerVia: "the registry's ownerOf",
    ownerOf: provider,
    oursChecked: [...OURS],
    jobId: hire.jobId.toString(),
    tx: hire.transactionHash ?? null,
    budget: formatEther(price),
    token: "$U",
    expiredAt: Number(hire.expiredAt),
    statusAtHire: job ? String(job.status ?? "") : null,
    task: JSON.stringify(t.spec),
    category: t.category,
    negotiated: {
      negotiationHash: envelope!.negotiation_hash,
      providerSig: envelope!.provider_sig,
      quotedAt: Number(envelope!.response.negotiated_at),
      expiresAt: Number(envelope!.response.quote_expires_at),
      estimatedSeconds: Number(envelope!.response.estimated_completion_seconds ?? 0),
      terms: envelope!.response.terms,
    },
    evidence,
    at: new Date().toISOString(),
  });
  writeFileSync(OUT, `${JSON.stringify(history, null, 2)}\n`);
  console.log(`recorded in src/data/hires.json and ${evidence}`);
}

main().catch((e) => {
  console.error((e as Error).message.split("\n")[0]);
  process.exitCode = 1;
});
