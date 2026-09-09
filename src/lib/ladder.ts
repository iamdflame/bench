/**
 * The Trust Ladder.
 *
 * BNB Chain asked for a front door to every agent on BSC. The honest objection
 * — that a directory lets anyone claim anything at the price of gas — was
 * previously answered by refusing to build a directory. That was intellectually
 * right and strategically wrong: it left every registered agent with nowhere
 * to appear.
 *
 * So every agent appears, and none of them are ranked by what they say. Each
 * sits on a rung, and every rung is a *test the chain can settle*:
 *
 *   0 Registered   it exists in ERC-8004 on BSC
 *   1 Resolvable   its agent card actually parses
 *   2 Live         its endpoint answered a call we made
 *   3 Capable      its wallet has transacted and touched its category's protocols
 *   4 Assayed      a fineness is published on chain, at or above the bar
 *   5 Bonded       it has posted a bond against a live mandate
 *   6 Settled      it has measured, attested epochs behind it
 *
 * The emptiness of the upper rungs is not a gap in the data. It is the finding.
 *
 * Every count here carries the method that produced it, because a funnel whose
 * numbers cannot be re-derived is the same unverifiable claim as an agent card.
 */

import { readAgentIndex } from "@/lib/data/agents";
import {
  logClients,
  MANDATE_MARKET_ABI,
  MARKET_ADDRESS,
  marketClient,
  readAllMandates,
} from "@/lib/chain/market";
import { parseAbiItem, type Address } from "viem";
import { memo, withTimeout } from "@/lib/cache";
import { getField } from "@/lib/data/field";
import { getProbes } from "@/lib/data/probes";
import { HOUSE } from "@/lib/house";
import { collapse, type Duplication } from "@/lib/dedup";

/** The lowest hallmarkable grade, and this market's bar. */
export const HALLMARK_BAR = 375;

export interface Rung {
  n: number;
  name: string;
  /** The test, in one line. Present tense, chain-settled. */
  test: string;
  /**
   * How many agents clear it.
   *
   * `null` means not yet measurable across the whole registry — stated rather
   * than guessed at, because a plausible number here would be a lie.
   */
  population: number | null;
  /** Exactly how this figure was obtained. */
  source: string;
  /** Something a reader can run to check it. */
  verify?: string;
  /** Set when the figure is a floor rather than a total. */
  atLeast?: boolean;
  /**
   * Distinct products behind `population`, where the two differ.
   *
   * A registration is not a product. One agent minted once per user wallet
   * arrives in the registry as hundreds of rows, so a rung that counts rows
   * counts that product hundreds of times. Where this is set, it is the same
   * population collapsed onto distinct name-and-description — owner-blind,
   * because the copies are precisely what differs by owner. See `lib/dedup`.
   */
  distinct?: number;
  /** Rendered under the count when rows and products are not the same number. */
  duplication?: string;
  /**
   * How many of these came up the ladder from the registry.
   *
   * The lower rungs count ERC-8004 entries; the upper rungs count whoever has
   * actually put capital at risk. Those are not yet the same population, and
   * printing one number for both would hide the single most important fact
   * about this market.
   */
  fromRegistry?: number;
  /** Rendered under the count when the two populations differ. */
  discontinuity?: string;
}

export interface LadderReading {
  rungs: Rung[];
  /** The collapse of rung 1's rows onto distinct products. */
  duplication: Duplication;
  /** The fineness the contract currently requires to bid. */
  minFineness: number;
  at: string;
  /** Block the on-chain rungs were read at. */
  blockNumber: string | null;
  /** Where the registry rungs came from. Stated, so nobody has to guess. */
  source: "postgres" | "snapshot";
  capturedAt: string;
  /** Whether rungs 0 and 2 were counted live or carried from the snapshot. */
  registrySource: "live" | "indexer" | "snapshot";
  /** When rungs 0 and 2 were counted. A different clock from `capturedAt`. */
  registryAt: string;
}

const ASSAYED = parseAbiItem("event Assayed(address indexed agent, uint16 fineness, uint64 at)");

/** Agents with a fineness published on chain at or above the bar. */
async function readAssayed(): Promise<{ count: number; agents: Address[] } | null> {
  const deploy = BigInt(process.env.NEXT_PUBLIC_MARKET_DEPLOY_BLOCK ?? process.env.MARKET_DEPLOY_BLOCK ?? "0");
  if (!MARKET_ADDRESS) return null;

  for (const client of logClients) {
    try {
      const head = await client.getBlockNumber();
      const from = deploy > 0n ? deploy : head - 50_000n;
      const seen = new Set<string>();
      const span = 4_000n;
      for (let cursor = from; cursor <= head; cursor += span) {
        const to = cursor + span - 1n > head ? head : cursor + span - 1n;
        const logs = await client.getLogs({ address: MARKET_ADDRESS, event: ASSAYED, fromBlock: cursor, toBlock: to });
        for (const l of logs) {
          const a = l.args as { agent?: Address };
          if (a.agent) seen.add(a.agent.toLowerCase());
        }
      }
      // The event records every publication; standing is whatever the
      // contract says now, since an agent can be demoted.
      const agents: Address[] = [];
      for (const addr of seen) {
        const f = (await marketClient.readContract({
          address: MARKET_ADDRESS,
          abi: MANDATE_MARKET_ABI,
          functionName: "fineness",
          args: [addr as Address],
        })) as number;
        if (Number(f) >= HALLMARK_BAR) agents.push(addr as Address);
      }
      return { count: agents.length, agents };
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * The ladder, memoised.
 *
 * Rung 4 scans event logs from the deploy block in 4,000-block windows, which
 * takes seventeen seconds against a free provider — long enough that the front
 * page simply did not paint. The reading itself is unchanged; it is just not
 * recomputed for every visitor inside the same minute, and the page stamps the
 * block and the age of what it is showing.
 */
export async function readLadder(): Promise<LadderReading> {
  return memo("ladder", { freshMs: 45_000, staleMs: 10 * 60_000 }, readLadderUncached);
}

/** How long ago a reading was taken, in words, for the method line. */
function ago(iso: string | undefined): string {
  if (!iso) return "at an unrecorded time";
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return "just now";
  const m = Math.round(ms / 60_000);
  if (m < 1) return "less than a minute ago";
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} hour${h === 1 ? "" : "s"} ago`;
  return `${Math.round(h / 24)} days ago`;
}

async function readLadderUncached(): Promise<LadderReading> {
  const index = await readAgentIndex();
  const registry = index.registry;
  const probes = getProbes();

  /*
    How many of the rows we parsed are the same product wearing different ids.

    Measured over rung 1's population and no further. The registry's own count
    at rung 0 stays a count of registrations, because a collapse ratio measured
    on a crawl ordered by token id is not a ratio that holds across all
    303,391 of them, and extrapolating it would be the kind of guess this
    ladder exists to refuse.
  */
  const duplication = collapse(index.agents);

  // Rungs 5 and 6 come from the market itself.
  let bonded: number | null = null;
  let settled: number | null = null;
  let blockNumber: string | null = null;
  let bondedFromRegistry = 0;
  let settledFromRegistry = 0;
  try {
    const mandates = await readAllMandates();
    blockNumber = (await marketClient.getBlockNumber()).toString();
    const holders = new Set(
      mandates.filter((m) => !/^0x0+$/.test(m.agent)).map((m) => m.agent.toLowerCase()),
    );
    bonded = holders.size;
    const settledHolders = new Set(
      mandates
        .filter((m) => m.epochsSettled > 0 && !/^0x0+$/.test(m.agent))
        .map((m) => m.agent.toLowerCase()),
    );
    settled = settledHolders.size;

    /*
      How many of the market's holders are registry entries.

      This was the constant `0` with a sentence beside it saying the two
      populations "do not yet overlap at all". That was true when it was
      written and it is the kind of sentence that goes on being served after it
      stops being true, so it is counted rather than asserted: a holder counts
      if some ERC-8004 registration we can see is owned by that wallet.

      The check runs over every population the register knows — the crawl, the
      field read from the chain, and this office's own registered agents — so a
      third party bonding here moves the number without anyone editing copy.
    */
    const registryOwners = new Set<string>();
    for (const a of index.agents) if (a.owner) registryOwners.add(a.owner.toLowerCase());
    for (const a of getField().agents) registryOwners.add(a.owner.toLowerCase());
    for (const h of HOUSE) if (h.tokenId) registryOwners.add(h.wallet.toLowerCase());

    for (const w of holders) if (registryOwners.has(w)) bondedFromRegistry++;
    for (const w of settledHolders) if (registryOwners.has(w)) settledFromRegistry++;
  } catch {
    bonded = null;
    settled = null;
  }

  /*
    Rung 4 is a log scan from the deploy block, and it is the only slow part of
    this reading. On a warm memo it costs nothing; cold, against a serverless
    function with a hard limit, it was taking long enough to time out the whole
    funnel — which turned one unmeasurable rung into no ladder at all.

    Bounded, it degrades the way every other unmeasurable rung already does:
    the population is null and the source says why.
  */
  const assayed = await withTimeout(readAssayed().catch(() => null), 12_000);

  // The bar the contract actually enforces, not the one we would like it to.
  let minFineness = 0;
  try {
    minFineness = Number(
      await marketClient.readContract({
        address: MARKET_ADDRESS,
        abi: MANDATE_MARKET_ABI,
        functionName: "minFineness",
      }),
    );
  } catch {
    minFineness = 0;
  }

  const rungs: Rung[] = [
    {
      n: 0,
      name: "Registered",
      test: "Exists in the ERC-8004 Identity Registry on BSC.",
      population: registry.registered,
      source:
        index.registrySource === "live"
          ? `Counted by 8004scan on chain 56, read ${ago(index.registryAt)}. Costs one transaction and proves nothing.`
          : index.registrySource === "indexer"
            ? `8004scan would not answer for this reading, so this is the count our own crawler recorded ${ago(index.registryAt)}. Costs one transaction and proves nothing.`
            : "Carried from the last committed snapshot: neither 8004scan nor our crawler could be reached, so this count is as old as the file rather than as old as the page.",
      verify: "curl 'https://api.8004scan.io/api/v1/agents?chain_id=56&limit=1'",
    },
    {
      n: 1,
      name: "Resolvable",
      test: "Its agent card parses into something readable.",
      population: index.agents.length,
      atLeast: true,
      distinct: duplication.distinct,
      duplication:
        duplication.duplicateRows === 0
          ? undefined
          : `${duplication.distinct.toLocaleString()} distinct products, not ${duplication.counted.toLocaleString()} agents: ${duplication.duplicateRows.toLocaleString()} of these rows (${(duplication.duplicateShare * 100).toFixed(1)}%) are a product already listed under another token id. The largest is "${duplication.clusters[0].name}", registered ${duplication.clusters[0].count.toLocaleString()} times across ${duplication.clusters[0].owners.toLocaleString()} distinct owners. Collapsed on name and description and blind to the owner, because one registration per user wallet is exactly how these copies differ.`,
      source: `A floor, not a total: ${index.agents.length.toLocaleString()} cards have been fetched and parsed so far, read from ${index.source === "postgres" ? "the index" : "a committed snapshot"} that \`npm run index\` builds. The rest are unindexed, not disproven.`,
      // Re-derives both figures this rung publishes: the rows read and the
      // products they collapse onto. `npm run index` rebuilds the index, which
      // is provenance rather than verification — a fresh crawl reads a
      // different population and so cannot check this one.
      verify: "npm run dedup",
    },
    {
      n: 2,
      name: "Live",
      test: "Its endpoint answered a call we made.",
      population: probes.answered > 0 ? probes.answered : registry.withEndpoint,
      atLeast: probes.answered > 0,
      source:
        probes.answered > 0
          ? `A floor, and our own call rather than someone else's flag: ${probes.answered} of ${probes.probed} endpoints answered when this office called them ${ago(probes.at)}, with the status and latency of each recorded. Everything outside those ${probes.probed} is unprobed, not silent. For comparison, 8004scan's own verification flag reports ${registry.withEndpoint} across the whole registry.`
          : "Endpoint verified against the registry's own record rather than by a call we made — no census of ours has run.",
      verify: "npm run probe",
    },
    {
      n: 3,
      name: "Capable",
      test: "Its wallet has transacted and touched the protocols its category implies.",
      population: null,
      source:
        "Measured per agent on request, not yet swept across the registry — that needs the 8004scan Pro tier. A number here would be a guess, so there isn't one.",
      verify: "npm run assay -- <tokenId>",
    },
    {
      n: 4,
      name: "Assayed",
      test: `A fineness is published on chain at or above ${HALLMARK_BAR}, the lowest hallmarkable grade.`,
      population: assayed?.count ?? null,
      source: assayed
        ? `Read from the market contract now, so a demoted agent drops off. The bar is currently ${minFineness}: ${minFineness === 0 ? "the gate is open, which is why agents below it hold mandates" : "enforced on every bid"}.`
        : "Not measured for this reading: the scan from the deploy block did not finish inside the budget. A number here would be a guess, so there isn't one.",
      verify: "npm run adjudicator",
    },
    {
      n: 5,
      name: "Bonded",
      test: "It has its own capital at risk against a live mandate.",
      population: bonded,
      fromRegistry: bondedFromRegistry,
      discontinuity:
        bonded === null
          ? undefined
          : bondedFromRegistry === 0
            ? "None of these came up the ladder. The wallets holding mandates are not ERC-8004 entries, so the registry's population and the market's do not overlap at all."
            : bondedFromRegistry === bonded
              ? `Every holder is an ERC-8004 registration: the token id and the wallet at risk are the same key.`
              : `${bondedFromRegistry} of ${bonded} holders are ERC-8004 registrations, so for those the token id and the wallet at risk are the same key. The rest are wallets with no registration behind them.`,
      source: "Distinct holders across every mandate the market has opened.",
      verify: "npm run market",
    },
    {
      n: 6,
      name: "Settled",
      test: "It has epochs settled against measurements committed before the outcome was known.",
      population: settled,
      fromRegistry: settledFromRegistry,
      discontinuity:
        settled === null
          ? undefined
          : settledFromRegistry === 0
            ? `No registry agent has ever settled an epoch here. That gap, between ${registry.registered.toLocaleString()} registrations and nobody with a measured track record, is the whole reason this market exists.`
            : `${settledFromRegistry} registry agent${settledFromRegistry === 1 ? " has" : "s have"} settled epochs here, against ${registry.registered.toLocaleString()} registrations. The gap is the reason this market exists; it is no longer total.`,
      source: "Distinct agents with at least one settled epoch.",
      verify: "npx mandate-verify --mandate 0 --chain 56 --deployment v1",
    },
  ];

  return {
    rungs,
    duplication,
    source: index.source,
    minFineness,
    at: new Date().toISOString(),
    blockNumber,
    capturedAt: index.capturedAt,
    registrySource: index.registrySource ?? "snapshot",
    registryAt: index.registryAt ?? index.capturedAt,
  };
}
