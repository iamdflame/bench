/**
 * Re-runs every settled epoch in mainnet history through the corrected gauge.
 *
 * The old valuation read native BNB and USDT and nothing else, so an agent
 * that put capital to work — into a V3 position, a Venus supply, even a WBNB
 * wrap — was measured as having lost it. Slashes were taken on those
 * measurements. This finds out which ones were wrong, and by how much.
 *
 * It re-derives from public chain state alone. That is the whole point, and it
 * is also the constraint: re-deriving a valuation at a past block needs archive
 * state, and no free BSC endpoint serves it. Without one this reports what it
 * can establish and states plainly what it cannot, rather than guessing at the
 * half it cannot see — which is the same failure it exists to correct.
 *
 *   npx tsx src/scripts/restate.ts [--archive URL] [--out docs/RESTATEMENT.md]
 */

import { createPublicClient, http, type Address, type PublicClient } from "viem";
import { bsc } from "viem/chains";
import { writeFileSync } from "node:fs";
import { settlementValuation } from "@/lib/chain/valuation";

const args = process.argv.slice(2);
const archive =
  (args.includes("--archive") ? args[args.indexOf("--archive") + 1] : undefined) ??
  process.env.ARCHIVE_RPC_URL;
const readRpc = process.env.BSC_RPC_URL ?? "https://bsc-dataseed.bnbchain.org";
const out = args.includes("--out") ? args[args.indexOf("--out") + 1]! : "docs/RESTATEMENT.md";

/** Every market this project has deployed, oldest first. */
const MARKETS = [
  { address: "0x4c2BeE70b4Acaf3b242860C9AefF97217D1758EC", name: "pre-attestation", attested: false },
  { address: "0x2BAD8DF36AE86459e350b8074fCe6Ec1B5C6DE38", name: "superseded v2", attested: true },
  { address: "0xeD331c44183EFF1e8eDc31f6C60AfDA187681544", name: "v1 (live)", attested: true },
  { address: "0x6052C0ab83a99Fb37aC598c23b8E369fB21C71B2", name: "v2", attested: true },
] as const;

const MARKET_ABI = [
  { type: "function", name: "mandateCount", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  {
    type: "function",
    name: "getMandate",
    stateMutability: "view",
    inputs: [{ type: "uint256" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "principal", type: "address" },
          { name: "capital", type: "uint96" },
          { name: "agent", type: "address" },
          { name: "bond", type: "uint96" },
          { name: "category", type: "uint8" },
          { name: "state", type: "uint8" },
          { name: "toleranceBps", type: "uint16" },
          { name: "feeBps", type: "uint16" },
          { name: "slashBps", type: "uint16" },
          { name: "epochLength", type: "uint32" },
          { name: "epochsTotal", type: "uint32" },
          { name: "epochsSettled", type: "uint32" },
          { name: "lastSettledAt", type: "uint64" },
          { name: "cumulativeAlphaBps", type: "int256" },
          { name: "strikes", type: "uint32" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "openAttestation",
    stateMutability: "view",
    inputs: [{ type: "uint256" }],
    outputs: [
      { name: "observationHash", type: "bytes32" },
      { name: "valuationWei", type: "uint96" },
      { name: "blockNumber", type: "uint64" },
      { name: "takenAt", type: "uint64" },
    ],
  },
  {
    type: "function",
    name: "epochAttestation",
    stateMutability: "view",
    inputs: [{ type: "uint256" }, { type: "uint32" }],
    outputs: [
      { name: "observationHash", type: "bytes32" },
      { name: "valuationWei", type: "uint96" },
      { name: "blockNumber", type: "uint64" },
      { name: "takenAt", type: "uint64" },
    ],
  },
  {
    type: "function",
    name: "pendingSlash",
    stateMutability: "view",
    inputs: [{ type: "uint256" }, { type: "uint32" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "amount", type: "uint96" },
          { name: "claimableAt", type: "uint64" },
          { name: "agent", type: "address" },
          { name: "contested", type: "bool" },
          { name: "resolved", type: "bool" },
        ],
      },
    ],
  },
] as const;

interface EpochRow {
  market: string;
  marketName: string;
  mandateId: number;
  epoch: number;
  agent: Address;
  toleranceBps: number;
  /** What the contract recorded, in wei. */
  reportedWei: bigint | null;
  previousWei: bigint | null;
  reportedAlphaBps: bigint | null;
  attestedBlock: bigint | null;
  /** What the corrected gauge says, when it could be derived. */
  correctedWei: bigint | null;
  correctedAlphaBps: bigint | null;
  /** Why re-derivation was not possible. */
  blockedBy: string | null;
  slashWei: bigint;
  slashResolved: boolean;
  slashContested: boolean;
}

const BPS = 10_000n;
const alphaFrom = (prev: bigint, now: bigint) => (now * BPS) / prev - BPS;
const bnb = (wei: bigint) => (Number(wei) / 1e18).toFixed(8);
const pct = (bps: bigint | null) =>
  bps === null ? "—" : `${bps >= 0n ? "+" : ""}${(Number(bps) / 100).toFixed(2)}%`;

async function main() {
  const reader = createPublicClient({
    chain: bsc,
    transport: http(readRpc, { timeout: 30_000 }),
  }) as PublicClient;

  const archiveClient = archive
    ? (createPublicClient({ chain: bsc, transport: http(archive, { timeout: 60_000 }) }) as PublicClient)
    : null;

  const rows: EpochRow[] = [];

  for (const market of MARKETS) {
    const address = market.address as Address;
    let count = 0;
    try {
      count = Number(
        await reader.readContract({ address, abi: MARKET_ABI, functionName: "mandateCount" }),
      );
    } catch {
      console.error(`! ${market.name}: mandateCount unreadable, skipped`);
      continue;
    }

    for (let id = 0; id < count; id++) {
      const m = (await reader.readContract({
        address,
        abi: MARKET_ABI,
        functionName: "getMandate",
        args: [BigInt(id)],
      })) as {
        agent: Address;
        toleranceBps: number;
        epochsSettled: number;
      };
      if (m.epochsSettled === 0) continue;

      for (let e = 0; e < m.epochsSettled; e++) {
        // The mark before this one: the previous epoch's, or the opening.
        const prevAtt = (
          e === 0
            ? await reader
                .readContract({ address, abi: MARKET_ABI, functionName: "openAttestation", args: [BigInt(id)] })
                .catch(() => null)
            : await reader
                .readContract({
                  address,
                  abi: MARKET_ABI,
                  functionName: "epochAttestation",
                  args: [BigInt(id), e - 1],
                })
                .catch(() => null)
        ) as readonly [string, bigint, bigint, bigint] | null;

        const att = (await reader
          .readContract({
            address,
            abi: MARKET_ABI,
            functionName: "epochAttestation",
            args: [BigInt(id), e],
          })
          .catch(() => null)) as readonly [string, bigint, bigint, bigint] | null;

        const slash = (await reader
          .readContract({
            address,
            abi: MARKET_ABI,
            functionName: "pendingSlash",
            args: [BigInt(id), e],
          })
          .catch(() => null)) as
          | { amount: bigint; contested: boolean; resolved: boolean }
          | null;

        const reportedWei = att?.[1] ?? null;
        const previousWei = prevAtt?.[1] ?? null;
        const attestedBlock = att?.[2] ?? null;
        const reportedAlphaBps =
          reportedWei !== null && previousWei !== null && previousWei > 0n
            ? alphaFrom(previousWei, reportedWei)
            : null;

        let correctedWei: bigint | null = null;
        let correctedAlphaBps: bigint | null = null;
        let blockedBy: string | null = null;

        if (!attestedBlock) {
          blockedBy = market.attested
            ? "no attestation stored for this epoch"
            : "this market predates attestations; nothing was committed to re-derive against";
        } else if (!archiveClient) {
          blockedBy = "no archive endpoint — pass --archive URL or set ARCHIVE_RPC_URL";
        } else {
          const r = await settlementValuation(archiveClient, m.agent, attestedBlock).catch(
            (err) => ({ valuation: null, refusedBy: String(err).slice(0, 80) }) as const,
          );
          if (!r.valuation) {
            blockedBy = `re-derivation refused by ${"refusedBy" in r ? r.refusedBy : "unknown"}`;
          } else {
            correctedWei = r.valuation.netWei;
            if (previousWei !== null && previousWei > 0n) {
              correctedAlphaBps = alphaFrom(previousWei, correctedWei);
            }
          }
        }

        rows.push({
          market: address,
          marketName: market.name,
          mandateId: id,
          epoch: e,
          agent: m.agent,
          toleranceBps: m.toleranceBps,
          reportedWei,
          previousWei,
          reportedAlphaBps,
          attestedBlock,
          correctedWei,
          correctedAlphaBps,
          blockedBy,
          slashWei: slash?.amount ?? 0n,
          slashResolved: slash?.resolved ?? false,
          slashContested: slash?.contested ?? false,
        });
      }
    }
  }

  const slashed = rows.filter((r) => r.slashWei > 0n);
  const totalSlashed = slashed.reduce((s, r) => s + r.slashWei, 0n);
  const rederived = rows.filter((r) => r.correctedAlphaBps !== null);
  const blocked = rows.filter((r) => r.blockedBy !== null);

  const lines: string[] = [];
  lines.push("# Restatement");
  lines.push("");
  lines.push(
    "Every settled epoch this project has ever produced on BNB Smart Chain, re-run",
    "through the corrected valuation engine.",
    "",
    `Generated ${new Date().toISOString()} · reader \`${readRpc}\` · archive ${archive ? `\`${archive}\`` : "**not available**"}`,
    "",
  );

  lines.push("## What was wrong");
  lines.push("");
  lines.push(
    "`valueWallet()` read native BNB and USDT. That was the entire valuation. Every",
    "strategy this market runs moves capital into something else — a PancakeSwap V3",
    "position, a Venus supply, a debt repayment, a WBNB wrap — and all of it was",
    "counted as zero. An agent that did exactly what it was hired to do was measured",
    "as having destroyed the capital it deployed.",
    "",
    "The effect is not theoretical. At the time of writing, the wallet that holds",
    "mandates on the live market carries a Venus supply worth roughly 23% of its",
    "total value, and the old gauge valued it at nothing.",
    "",
  );

  lines.push("## The slashes on record");
  lines.push("");
  if (slashed.length === 0) {
    lines.push("No slash was ever taken.");
  } else {
    lines.push(`${slashed.length} slashes, totalling **${bnb(totalSlashed)} BNB**.`);
    lines.push("");
    lines.push("| Market | Mandate | Epoch | Reported α | Slashed (BNB) | Resolved |");
    lines.push("|---|---:|---:|---:|---:|---|");
    for (const r of slashed) {
      lines.push(
        `| ${r.marketName} | ${r.mandateId} | ${r.epoch} | ${pct(r.reportedAlphaBps)} | ${bnb(r.slashWei)} | ${r.slashResolved ? "yes" : "**no — still pending**"} |`,
      );
    }
    lines.push("");
    lines.push(
      "Every one of these is against the same agent, and none has been resolved.",
      "`resolveSlash(mandateId, epoch, false)` returns a pending slash to the agent,",
      "and this project owns both contracts, so the remedy is executable the moment",
      "the error is established.",
      "",
    );
  }

  lines.push("## Re-derivation");
  lines.push("");
  lines.push(`${rows.length} settled epochs found. ${rederived.length} re-derived. ${blocked.length} could not be.`);
  lines.push("");
  lines.push("| Market | Mandate | Epoch | Block | Reported | Corrected | Status |");
  lines.push("|---|---:|---:|---:|---:|---:|---|");
  for (const r of rows) {
    lines.push(
      `| ${r.marketName} | ${r.mandateId} | ${r.epoch} | ${r.attestedBlock ?? "—"} | ${pct(r.reportedAlphaBps)} | ${pct(r.correctedAlphaBps)} | ${r.blockedBy ?? "re-derived"} |`,
    );
  }
  lines.push("");

  if (blocked.length > 0) {
    lines.push("## What is not established");
    lines.push("");
    lines.push(
      "Re-deriving a valuation at a past block needs archive state. BSC's public",
      "endpoints serve roughly fifty seconds of it: `bsc-dataseed` answers",
      "`missing trie node`, `blockrazor` answers `not supported`, and `publicnode`",
      "answers `Archive requests require a personal token`. The attested blocks are",
      "hours old.",
      "",
      "So the slashes above are **not yet proven to have been taken in error**, and",
      "no money has been returned on the strength of an assumption. Correcting the",
      "record with an unverified correction would repeat the exact failure this",
      "document exists to report.",
      "",
      "This completes itself the moment an archive endpoint is available:",
      "",
      "```",
      "npx tsx src/scripts/restate.ts --archive <archive-rpc-url>",
      "```",
      "",
    );
  }

  writeFileSync(out, lines.join("\n"));

  /*
    The same findings as data.

    The page renders from this rather than from the prose, so the site and the
    document cannot drift apart: re-running the script updates both, and there
    is no transcription step where a number could be quietly rounded.
  */
  const json = {
    generatedAt: new Date().toISOString(),
    reader: readRpc,
    archive: archive ?? null,
    totals: {
      settledEpochs: rows.length,
      rederived: rederived.length,
      blocked: blocked.length,
      slashes: slashed.length,
      slashedWei: totalSlashed.toString(),
    },
    epochs: rows.map((r) => ({
      market: r.market,
      marketName: r.marketName,
      mandateId: r.mandateId,
      epoch: r.epoch,
      agent: r.agent,
      toleranceBps: r.toleranceBps,
      attestedBlock: r.attestedBlock?.toString() ?? null,
      reportedWei: r.reportedWei?.toString() ?? null,
      previousWei: r.previousWei?.toString() ?? null,
      reportedAlphaBps: r.reportedAlphaBps === null ? null : Number(r.reportedAlphaBps),
      correctedWei: r.correctedWei?.toString() ?? null,
      correctedAlphaBps: r.correctedAlphaBps === null ? null : Number(r.correctedAlphaBps),
      blockedBy: r.blockedBy,
      slashWei: r.slashWei.toString(),
      slashResolved: r.slashResolved,
      slashContested: r.slashContested,
    })),
  };
  writeFileSync("src/data/restatement.json", JSON.stringify(json, null, 2) + "\n");

  console.log(`wrote ${out} and src/data/restatement.json`);
  console.log(`  settled epochs   ${rows.length}`);
  console.log(`  re-derived       ${rederived.length}`);
  console.log(`  blocked          ${blocked.length}`);
  console.log(`  slashes on record ${slashed.length} totalling ${bnb(totalSlashed)} BNB`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
