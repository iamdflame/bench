/**
 * A worked example per job, found on chain.
 *
 * §10.2 asks each job board to carry "a worked example with a real mainnet
 * transaction". The tempting version is a plausible illustration with round
 * numbers, which is the exact thing this product exists to refuse: an example
 * nobody can open is a claim.
 *
 * So the examples are found rather than written. This scans the head window
 * for the event each job's work actually leaves on BNB Smart Chain — a
 * liquidity change on PancakeSwap's position manager, a pool swap, a Venus
 * supply, a Venus repayment — decodes one, and records the transaction hash
 * with the values it carried. The page renders those values and links the
 * transaction.
 *
 * None of these are ours. They are other people doing the job, which is the
 * point: it shows a reader what the job *is* before asking them to hire
 * somebody to do it.
 *
 * The scan is bounded to the window free providers serve. When nothing is
 * found for a job the example is absent and the page says so, rather than
 * falling back to an invented one.
 */

import { decodeEventLog, formatUnits, parseAbiItem, type Address, type Log } from "viem";
import { LIQUID_POOLS, VENUES, chainClient, logClients, type JobSlug, type SupportedChain } from "@bench/shared";

export interface WorkedExample {
  job: JobSlug;
  /** One sentence: what happened, in the units of the job. */
  what: string;
  /** The figures it carried, each named. */
  values: { label: string; value: string }[];
  txHash: string;
  block: string;
  at: string;
  /** The contract the event came from, for the reader who wants to check. */
  venue: string;
  /** What this shows a reader about the job itself. */
  teaches: string;
}

/* The events each job's work actually leaves. */
const INCREASE = parseAbiItem(
  "event IncreaseLiquidity(uint256 indexed tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)",
);
const DECREASE = parseAbiItem(
  "event DecreaseLiquidity(uint256 indexed tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)",
);
/*
  PancakeSwap's V3 Swap carries two more fields than Uniswap's.

  The protocol-fee pair at the end changes the signature, and therefore the
  topic hash, so the seven-field Uniswap form matches nothing on this chain.
  It is a silent miss rather than an error — the scan simply returns empty —
  which is the worst way for it to be wrong, and it is why this comment exists.
*/
const V3_SWAP = parseAbiItem(
  "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint128 protocolFeesToken0, uint128 protocolFeesToken1)",
);
const VENUS_MINT = parseAbiItem("event Mint(address minter, uint256 mintAmount, uint256 mintTokens)");
const VENUS_REPAY = parseAbiItem(
  "event RepayBorrow(address payer, address borrower, uint256 repayAmount, uint256 accountBorrows, uint256 totalBorrows)",
);

/** The window free BSC providers actually serve. Measured, not guessed. */
const WINDOW = 4_800n;

async function scan(
  chainId: SupportedChain,
  address: Address | Address[] | undefined,
  event: Parameters<typeof decodeEventLog>[0]["abi"][number],
  fromBlock: bigint,
  toBlock: bigint,
): Promise<Log[]> {
  for (const reader of logClients(chainId)) {
    try {
      return (await reader.getLogs({
        ...(address ? { address } : {}),
        event: event as never,
        fromBlock,
        toBlock,
      })) as Log[];
    } catch {
      // Next host. A provider declining a range is ordinary here.
    }
  }
  return [];
}

const abs = (n: bigint) => (n < 0n ? -n : n);

export async function findExamples(chainId: SupportedChain): Promise<WorkedExample[]> {
  const client = chainClient(chainId);
  const head = await client.getBlockNumber();
  const from = head > WINDOW ? head - WINDOW : 0n;
  const out: WorkedExample[] = [];
  const at = new Date().toISOString();

  const stamp = async (log: Log) => ({
    txHash: log.transactionHash ?? "",
    block: String(log.blockNumber ?? head),
  });

  /* ------------------------------------------------- keep an LP in range */
  for (const ev of [INCREASE, DECREASE]) {
    const logs = await scan(chainId, VENUES.pancakeV3PositionManager as Address, ev, from, head);
    const hit = logs.find((l) => l.transactionHash);
    if (!hit) continue;
    const decoded = decodeEventLog({ abi: [ev], data: hit.data, topics: hit.topics }) as {
      eventName: string;
      args: { tokenId: bigint; liquidity: bigint; amount0: bigint; amount1: bigint };
    };
    const adding = decoded.eventName === "IncreaseLiquidity";
    out.push({
      job: "rebalancing",
      what: adding
        ? `Somebody added liquidity to PancakeSwap V3 position ${decoded.args.tokenId}.`
        : `Somebody withdrew liquidity from PancakeSwap V3 position ${decoded.args.tokenId} — the first half of a recentre.`,
      values: [
        { label: "Position", value: String(decoded.args.tokenId) },
        { label: "Liquidity moved", value: decoded.args.liquidity.toString() },
        { label: "Token 0", value: formatUnits(decoded.args.amount0, 18) },
        { label: "Token 1", value: formatUnits(decoded.args.amount1, 18) },
      ],
      ...(await stamp(hit)),
      at,
      venue: "PancakeSwap V3 position manager",
      teaches: adding
        ? "This is what the second half of a recentre looks like: liquidity going back in around the current price. An agent hired for this job does it when the fees it would collect are worth more than the gas and the loss of moving."
        : "This is the first half of a recentre: liquidity coming out of a range the price has left. On its own it earns nothing — the job is only done when it goes back in around the new price.",
    });
    break;
  }

  /* -------------------------------------------------------- run a grid */
  {
    /*
      Filtered by pool, not by topic alone. Free BSC providers refuse an
      `eth_getLogs` with no `address` outright, so a topic-only swap scan
      errors on every host and silently finds nothing — which is how this
      example was missing on the first attempt.
    */
    const pool = LIQUID_POOLS[0]!;
    const logs = await scan(chainId, pool.pool, V3_SWAP, head - 200n, head);
    const hit = logs.at(-1) ?? logs.find((l) => l.transactionHash);
    if (hit) {
      const d = decodeEventLog({ abi: [V3_SWAP], data: hit.data, topics: hit.topics }) as {
        args: { amount0: bigint; amount1: bigint; recipient: Address; tick: number };
      };
      const zeroIn = d.args.amount0 > 0n;
      out.push({
        job: "grid",
        what: `A swap filled on the PancakeSwap V3 ${pool.pair} pool — one leg of the kind of ladder a grid maintains.`,
        values: [
          { label: "Direction", value: zeroIn ? "token 0 in, token 1 out" : "token 1 in, token 0 out" },
          { label: "In", value: formatUnits(abs(zeroIn ? d.args.amount0 : d.args.amount1), 18) },
          { label: "Out", value: formatUnits(abs(zeroIn ? d.args.amount1 : d.args.amount0), 18) },
          { label: "Pool tick after", value: String(d.args.tick) },
        ],
        ...(await stamp(hit)),
        at,
        venue: `PancakeSwap V3 ${pool.pair} pool`,
        teaches:
          "A grid is a ladder of these. Note that the event comes from the pool and not from the router — the routers emit nothing at all, which is why a capability scan that watches a router finds nothing however much an agent trades.",
      });
    }
  }

  /* ------------------------------------------------------- chase yield */
  {
    const logs = await scan(
      chainId,
      [VENUES.venusVBNB, VENUES.venusVUSDT] as Address[],
      VENUS_MINT,
      from,
      head,
    );
    const hit = logs.find((l) => l.transactionHash);
    if (hit) {
      const d = decodeEventLog({ abi: [VENUS_MINT], data: hit.data, topics: hit.topics }) as {
        args: { minter: Address; mintAmount: bigint; mintTokens: bigint };
      };
      out.push({
        job: "yield",
        what: "Somebody supplied capital to a Venus market — the move a yield agent makes when a better net rate is worth the gas.",
        values: [
          { label: "Supplied", value: formatUnits(d.args.mintAmount, 18) },
          { label: "vTokens received", value: formatUnits(d.args.mintTokens, 8) },
          { label: "Supplier", value: `${d.args.minter.slice(0, 10)}…` },
        ],
        ...(await stamp(hit)),
        at,
        venue: "Venus",
        teaches:
          "Supplying is the easy half. The job is deciding whether the extra rate pays back this transaction's gas before the rate changes again — which is why the board measures switching payback in days rather than counting moves.",
      });
    }
  }

  /* ----------------------------------------------------- protect a loan */
  {
    const logs = await scan(
      chainId,
      [VENUES.venusVBNB, VENUES.venusVUSDT] as Address[],
      VENUS_REPAY,
      from,
      head,
    );
    const hit = logs.find((l) => l.transactionHash);
    if (hit) {
      const d = decodeEventLog({ abi: [VENUS_REPAY], data: hit.data, topics: hit.topics }) as {
        args: { payer: Address; borrower: Address; repayAmount: bigint; accountBorrows: bigint };
      };
      const selfRepay = d.args.payer.toLowerCase() === d.args.borrower.toLowerCase();
      out.push({
        job: "health",
        what: selfRepay
          ? "A borrower repaid part of their own Venus loan — exactly the action a health-factor agent takes, before the threshold rather than after."
          : "Somebody repaid a loan on another account's behalf, which is what a liquidation looks like from the inside.",
        values: [
          { label: "Repaid", value: formatUnits(d.args.repayAmount, 18) },
          { label: "Debt remaining", value: formatUnits(d.args.accountBorrows, 18) },
          { label: "Paid by", value: selfRepay ? "the borrower" : `${d.args.payer.slice(0, 10)}…` },
        ],
        ...(await stamp(hit)),
        at,
        venue: "Venus",
        teaches: selfRepay
          ? "Doing this early costs gas. Not doing it costs the ten percent liquidation penalty Venus charges. The whole job is the gap between those two numbers."
          : "This is the outcome the job exists to prevent: somebody else repaying your loan and taking the penalty as their fee.",
      });
    }
  }

  return out;
}
