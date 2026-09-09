/**
 * An agent's career in this market.
 *
 * The brief asks how an agent has performed. The contract has held that all
 * along — `cumulativeAlphaBps`, `strikes`, `epochsSettled` per mandate — and
 * nothing rendered it, so the answer existed and was invisible.
 *
 * Every row here is a chain read. Nothing is aggregated into a single score:
 * a career is a list of things that happened, and collapsing it into a number
 * would be the kind of summary this market exists to distrust.
 */

import { parseAbiItem, type Address } from "viem";
import {
  CATEGORY_NAMES,
  logClients,
  MANDATE_MARKET_ABI,
  MARKET_ADDRESS,
  marketClient,
  readAllMandates,
  STATE_NAMES,
  type MandateView,
} from "@/lib/chain/market";
import { memo } from "@/lib/cache";

const SETTLED = parseAbiItem(
  "event EpochSettled(uint256 indexed mandateId, uint32 indexed epoch, address indexed agent, int256 realizedAlphaBps, uint96 feePaid, uint96 slashed)",
);
const DISMISSED = parseAbiItem(
  "event AgentDismissed(uint256 indexed mandateId, address indexed agent, string reason)",
);

export interface EpochRow {
  mandateId: number;
  epoch: number;
  alphaBps: string;
  feePaidWei: string;
  slashedWei: string;
  txHash: string;
  blockNumber: number;
}

export interface DismissalRow {
  mandateId: number;
  reason: string;
  txHash: string;
  blockNumber: number;
}

export interface MandateRow {
  id: number;
  category: string;
  state: string;
  capitalWei: string;
  bondWei: string;
  epochsSettled: number;
  epochsTotal: number;
  cumulativeAlphaBps: string;
  strikes: number;
}

export interface Career {
  agent: Address;
  mandates: MandateRow[];
  epochs: EpochRow[];
  dismissals: DismissalRow[];
  totals: {
    mandates: number;
    epochs: number;
    feesEarnedWei: string;
    slashedWei: string;
    dismissals: number;
  };
  /** False when the logs could not be read; the epoch list is then incomplete. */
  logsRead: boolean;
  verify: string;
}

const EMPTY_CAREER = (agent: Address): Career => ({
  agent,
  mandates: [],
  epochs: [],
  dismissals: [],
  totals: { mandates: 0, epochs: 0, feesEarnedWei: "0", slashedWei: "0", dismissals: 0 },
  logsRead: false,
  verify: "",
});

/** Every mandate this wallet has held, and what happened in each. */
export async function readCareer(agent: Address): Promise<Career> {
  const wallet = agent.toLowerCase();
  let mandates: MandateView[] = [];
  try {
    mandates = (await readAllMandates()).filter((m) => m.agent?.toLowerCase() === wallet);
  } catch {
    return EMPTY_CAREER(agent);
  }

  const rows: MandateRow[] = mandates.map((m) => ({
    id: m.id,
    category: CATEGORY_NAMES[m.category] ?? String(m.category),
    state: STATE_NAMES[m.state] ?? String(m.state),
    capitalWei: m.capital.toString(),
    bondWei: m.bond.toString(),
    epochsSettled: m.epochsSettled,
    epochsTotal: m.epochsTotal,
    cumulativeAlphaBps: m.cumulativeAlphaBps.toString(),
    strikes: m.strikes,
  }));

  const epochs: EpochRow[] = [];
  const dismissals: DismissalRow[] = [];
  let logsRead = false;

  const deploy = BigInt(
    process.env.NEXT_PUBLIC_MARKET_DEPLOY_BLOCK ?? process.env.MARKET_DEPLOY_BLOCK ?? "0",
  );

  for (const client of logClients) {
    try {
      const head = await client.getBlockNumber();
      const from = deploy > 0n ? deploy : head > 200_000n ? head - 200_000n : 0n;
      const span = 4_000n;
      for (let cursor = from; cursor <= head; cursor += span) {
        const to = cursor + span - 1n > head ? head : cursor + span - 1n;
        const [settled, fired] = await Promise.all([
          client.getLogs({
            address: MARKET_ADDRESS,
            event: SETTLED,
            args: { agent },
            fromBlock: cursor,
            toBlock: to,
          }),
          client.getLogs({
            address: MARKET_ADDRESS,
            event: DISMISSED,
            args: { agent },
            fromBlock: cursor,
            toBlock: to,
          }),
        ]);
        for (const l of settled) {
          const a = l.args as {
            mandateId?: bigint;
            epoch?: number;
            realizedAlphaBps?: bigint;
            feePaid?: bigint;
            slashed?: bigint;
          };
          epochs.push({
            mandateId: Number(a.mandateId ?? 0n),
            epoch: Number(a.epoch ?? 0),
            alphaBps: (a.realizedAlphaBps ?? 0n).toString(),
            feePaidWei: (a.feePaid ?? 0n).toString(),
            slashedWei: (a.slashed ?? 0n).toString(),
            txHash: l.transactionHash ?? "",
            blockNumber: Number(l.blockNumber ?? 0n),
          });
        }
        for (const l of fired) {
          const a = l.args as { mandateId?: bigint; reason?: string };
          dismissals.push({
            mandateId: Number(a.mandateId ?? 0n),
            reason: a.reason ?? "",
            txHash: l.transactionHash ?? "",
            blockNumber: Number(l.blockNumber ?? 0n),
          });
        }
      }
      logsRead = true;
      break;
    } catch {
      continue;
    }
  }

  epochs.sort((a, b) => a.blockNumber - b.blockNumber);

  const fees = epochs.reduce((s, e) => s + BigInt(e.feePaidWei), 0n);
  const slashed = epochs.reduce((s, e) => s + BigInt(e.slashedWei), 0n);

  return {
    agent,
    mandates: rows,
    epochs,
    dismissals,
    totals: {
      mandates: rows.length,
      epochs: epochs.length,
      feesEarnedWei: fees.toString(),
      slashedWei: slashed.toString(),
      dismissals: dismissals.length,
    },
    logsRead,
    verify: rows.length
      ? `npx mandate-verify --mandate ${rows[0]!.id} --chain 56`
      : "",
  };
}

/**
 * A career for a wallet, memoised.
 *
 * Every settled epoch comes from an event log scan, and a scan that has to be
 * redone for each visitor puts a page into the tens of seconds. The reading is
 * the same one; it is simply not repeated inside the same half-minute.
 */
export async function readCareerForWallet(wallet: string | null | undefined): Promise<Career | null> {
  if (!wallet || !/^0x[0-9a-fA-F]{40}$/.test(wallet)) return null;
  const key = `career:${wallet.toLowerCase()}`;
  return memo(key, { freshMs: 30_000, staleMs: 10 * 60_000 }, async () => {
    const career = await readCareer(wallet as Address);
    return career.mandates.length || career.epochs.length ? career : null;
  });
}

export { marketClient, MANDATE_MARKET_ABI };
