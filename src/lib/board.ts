/**
 * The hiring board, assembled per job.
 *
 * One category, every agent that can do it, in the order a person hiring
 * actually cares about: proven first (own capital at risk, a settled record),
 * ours hallmarked at the top, and everyone else shown honestly — resolvable and
 * live, but not dressed in a score they have not earned.
 *
 * Three sources, blended and ranked, never invented:
 *   - the book: mandates bonded and settled on chain, in this category;
 *   - the house: the agents this office operates itself;
 *   - the registry: third-party agents our crawl classified into this job.
 *
 * Fineness is read from the market contract, and a reading of zero is treated
 * as "not assayed on chain" rather than as a grade of zero — the contract
 * cannot tell the two apart, and printing an unearned zero is the exact thing
 * this product refuses. Cached and block-stamped, like every figure here.
 */

import type { Address } from "viem";
import { CATEGORIES, type Category } from "@/lib/config";
import { readBook, type BookRow } from "@/lib/chain/book";
import { readAgentIndex, type IndexedAgent } from "@/lib/data/agents";
import { HOUSE, houseByWallet } from "@/lib/house";
import { marketClient, MARKET_ADDRESS, MANDATE_MARKET_ABI, bps } from "@/lib/chain/market";
import { memo } from "@/lib/cache";

export interface BoardAgent {
  key: string;
  kind: "house" | "market" | "registry";
  name: string;
  /** Where "View" goes. */
  href: string;
  tokenId: string | null;
  wallet: string | null;
  fineness: number | null;
  /** Own capital at risk right now, or a settled record behind it. */
  proven: boolean;
  ownCapital: boolean;
  epochsSettled: number;
  alpha: string | null;
  /** One honest line describing the row. */
  line: string;
  /** For unmarked/unassayed rows: why there is no score. Never a blank. */
  note?: string;
  /** The mandate this row is bonded against, for the settlement link. */
  mandateId: number | null;
}

export interface Board {
  category: Category;
  agents: BoardAgent[];
  provenCount: number;
  block: string | null;
  at: string;
  /** Deployments the chain would not answer for, named not hidden. */
  unread: string[];
}

/** On-chain fineness for a set of wallets. 0 → null (unmeasured, not a zero). */
async function finenessOf(wallets: string[]): Promise<Map<string, number | null>> {
  const out = new Map<string, number | null>();
  await Promise.all(
    [...new Set(wallets.map((w) => w.toLowerCase()))].map(async (w) => {
      try {
        const f = (await marketClient.readContract({
          address: MARKET_ADDRESS,
          abi: MANDATE_MARKET_ABI,
          functionName: "fineness",
          args: [w as Address],
        })) as number | bigint;
        const n = Number(f);
        out.set(w, n > 0 ? n : null);
      } catch {
        out.set(w, null);
      }
    }),
  );
  return out;
}

async function assembleBoard(category: Category): Promise<Board> {
  const catIndex = CATEGORIES.indexOf(category);
  const [book, index] = await Promise.all([readBook(), readAgentIndex()]);

  const rows = book.rows.filter((r) => r.category === catIndex && !/^0x0+$/.test(r.agent));
  // Distinct agents in this category with capital at risk or a settled record.
  const provenWallets = new Set(
    rows.filter((r) => r.bondWei > 0n || r.epochsSettled > 0).map((r) => r.agent.toLowerCase()),
  );

  const fineness = await finenessOf([
    ...rows.map((r) => r.agent),
    ...HOUSE.map((h) => h.wallet),
  ]);

  const agents: BoardAgent[] = [];
  const seen = new Set<string>();

  // 1. Our house agents in this office, whether or not they are bonded yet.
  for (const h of HOUSE.filter((h) => h.offices.includes(category))) {
    const w = h.wallet.toLowerCase();
    seen.add(w);
    const holding = rows
      .filter((r) => r.agent.toLowerCase() === w)
      .sort((a, b) => b.epochsSettled - a.epochsSettled)[0];
    const proven = provenWallets.has(w);
    const epochsSettled = holding?.epochsSettled ?? 0;
    agents.push({
      key: `house-${h.slug}`,
      kind: "house",
      name: h.name,
      href: h.tokenId ? `/agents/${h.tokenId}` : `/registry`,
      tokenId: h.tokenId,
      wallet: h.wallet,
      fineness: fineness.get(w) ?? null,
      proven,
      ownCapital: proven && (holding?.bondWei ?? 0n) > 0n,
      epochsSettled,
      alpha: holding && epochsSettled > 0 ? bps(holding.cumulativeAlphaBps) : null,
      line: proven
        ? `Ours, with own capital at risk${epochsSettled > 0 ? ` · ${epochsSettled} epoch${epochsSettled === 1 ? "" : "s"} settled` : ""}.`
        : "Ours. Operated on mainnet; awaiting a bonded mandate in this office.",
      note: fineness.get(w) == null ? "Not assayed to a fineness on chain yet." : undefined,
      mandateId: holding?.id ?? null,
    });
  }

  // 2. Market holders in this category that are not ours.
  for (const r of rows) {
    const w = r.agent.toLowerCase();
    if (seen.has(w)) continue;
    seen.add(w);
    const house = houseByWallet(w);
    const proven = r.bondWei > 0n || r.epochsSettled > 0;
    agents.push({
      key: `market-${r.deployment.label}-${r.id}`,
      kind: house ? "house" : "market",
      name: house?.name ?? `Holder ${w.slice(0, 6)}…${w.slice(-4)}`,
      href: `/settlement/${r.id}`,
      tokenId: house?.tokenId ?? null,
      wallet: r.agent,
      fineness: fineness.get(w) ?? null,
      proven,
      ownCapital: r.bondWei > 0n,
      epochsSettled: r.epochsSettled,
      alpha: r.epochsSettled > 0 ? bps(r.cumulativeAlphaBps) : null,
      line: `Bonded on ${r.deployment.label}${r.epochsSettled > 0 ? ` · ${r.epochsSettled} epoch${r.epochsSettled === 1 ? "" : "s"} settled` : " · awaiting first settlement"}.`,
      note: fineness.get(w) == null ? "Bonded, but no fineness published on chain." : undefined,
      mandateId: r.id,
    });
  }

  // 3. Third-party registry agents classified into this job. Honest rows only:
  // resolvable, sometimes live, never scored to a grade they have not earned.
  const registry: IndexedAgent[] = index.agents
    .filter((a) => a.category === category && a.tokenId)
    .sort(
      (a, b) =>
        Number(Boolean(b.endpointVerified)) - Number(Boolean(a.endpointVerified)) ||
        b.confidence - a.confidence ||
        b.feedbacks - a.feedbacks,
    )
    .slice(0, 12);

  for (const a of registry) {
    agents.push({
      key: `registry-${a.tokenId}`,
      kind: "registry",
      name: a.name ?? `Agent ${a.tokenId}`,
      href: `/agents/${a.tokenId}`,
      tokenId: a.tokenId,
      wallet: a.owner,
      fineness: null,
      proven: false,
      ownCapital: false,
      epochsSettled: 0,
      alpha: null,
      line: a.endpointVerified
        ? "Registered, resolvable, endpoint answered. Not assayed to a fineness yet."
        : "Registered and resolvable. Endpoint unverified; not assayed yet.",
      note: "Anyone can assay it on demand, which turns a registry entry into a graded one.",
      mandateId: null,
    });
  }

  // Rank: proven first, then a real fineness, then a live endpoint, ours ahead
  // of a stranger at equal standing.
  agents.sort(
    (a, b) =>
      Number(b.proven) - Number(a.proven) ||
      (b.fineness ?? -1) - (a.fineness ?? -1) ||
      b.epochsSettled - a.epochsSettled ||
      Number(a.kind === "registry") - Number(b.kind === "registry"),
  );

  return {
    category,
    agents,
    provenCount: provenWallets.size,
    block: book.blockNumber != null ? book.blockNumber.toString() : null,
    at: book.at,
    unread: book.unread,
  };
}

export function readBoard(category: Category): Promise<Board> {
  return memo(`board:${category}`, { freshMs: 20_000, staleMs: 120_000 }, () =>
    assembleBoard(category),
  );
}

export interface WalletRecord {
  wallet: string;
  mandates: {
    id: number;
    category: Category;
    deployment: string;
    epochsSettled: number;
    alpha: string | null;
    strikes: number;
    live: boolean;
    bondWei: string;
  }[];
  totalEpochs: number;
  totalStrikes: number;
  cumulativeAlpha: string | null;
  block: string | null;
  at: string;
}

/**
 * A wallet's realized track record, straight from the book.
 *
 * This is what turns an agent page from a claim into a record: the mandates this
 * wallet actually holds on chain, the epochs it has settled against benchmarks
 * pinned before the outcome, the alpha it earned, and every time it was slashed.
 * A third-party agent whose wallet has never bonded returns an empty record —
 * honestly, never a zero — and that absence is itself the finding.
 */
export async function readWalletRecord(wallet: string | null): Promise<WalletRecord | null> {
  if (!wallet || /^0x0+$/.test(wallet)) return null;
  const book = await readBook();
  const w = wallet.toLowerCase();
  const rows = book.rows.filter((r) => r.agent.toLowerCase() === w);
  if (rows.length === 0) {
    return {
      wallet,
      mandates: [],
      totalEpochs: 0,
      totalStrikes: 0,
      cumulativeAlpha: null,
      block: book.blockNumber != null ? book.blockNumber.toString() : null,
      at: book.at,
    };
  }
  const totalEpochs = rows.reduce((t, r) => t + r.epochsSettled, 0);
  const alphaBps = rows.reduce((t, r) => t + r.cumulativeAlphaBps, 0n);
  return {
    wallet,
    mandates: rows
      .sort((a, b) => b.epochsSettled - a.epochsSettled)
      .map((r) => ({
        id: r.id,
        category: CATEGORIES[r.category] ?? "rebalancing",
        deployment: r.deployment.label,
        epochsSettled: r.epochsSettled,
        alpha: r.epochsSettled > 0 ? bps(r.cumulativeAlphaBps) : null,
        strikes: r.strikes,
        live: r.state === 0 || r.state === 1,
        bondWei: r.bondWei.toString(),
      })),
    totalEpochs,
    totalStrikes: rows.reduce((t, r) => t + r.strikes, 0),
    cumulativeAlpha: totalEpochs > 0 ? bps(alphaBps) : null,
    block: book.blockNumber != null ? book.blockNumber.toString() : null,
    at: book.at,
  };
}

export interface Headline {
  name: string;
  category: Category;
  fineness: number | null;
  alpha: string | null;
  epochsSettled: number;
  strikes: number;
  href: string;
  mandateId: number;
  deployment: string;
  block: string | null;
  at: string;
  /** True when this is one of our own operated agents. */
  ours: boolean;
}

/**
 * The single strongest, truest proof to feature on the hero.
 *
 * The proof with the most settled epochs, then the best running alpha — a real
 * track record, not a slogan. Prefers one of ours, because leading with our own
 * agent running real capital is the whole positioning. Returns null when there
 * is nothing settled to show, so the hero never invents a hallmark.
 */
export async function readHeadline(): Promise<Headline | null> {
  return memo("headline", { freshMs: 20_000, staleMs: 120_000 }, async () => {
    const book = await readBook();
    const candidates = book.rows.filter(
      (r) => !/^0x0+$/.test(r.agent) && (r.epochsSettled > 0 || r.bondWei > 0n),
    );
    if (candidates.length === 0) return null;
    candidates.sort(
      (a, b) =>
        b.epochsSettled - a.epochsSettled ||
        Number(b.cumulativeAlphaBps - a.cumulativeAlphaBps) ||
        Number(b.bondWei - a.bondWei),
    );
    const r = candidates[0];
    const w = r.agent.toLowerCase();
    const house = houseByWallet(w);
    const fin = await finenessOf([r.agent]);
    return {
      name: house?.name ?? `Holder ${w.slice(0, 6)}…${w.slice(-4)}`,
      category: CATEGORIES[r.category] ?? "rebalancing",
      fineness: fin.get(w) ?? null,
      alpha: r.epochsSettled > 0 ? bps(r.cumulativeAlphaBps) : null,
      epochsSettled: r.epochsSettled,
      strikes: r.strikes,
      href: `/settlement/${r.id}`,
      mandateId: r.id,
      deployment: r.deployment.label,
      block: book.blockNumber != null ? book.blockNumber.toString() : null,
      at: book.at,
      ours: Boolean(house),
    };
  });
}

/** Just the proven counts per category, for the four doors on the hero. */
export async function readProvenCounts(): Promise<{
  counts: Record<Category, number>;
  block: string | null;
  at: string;
}> {
  return memo("proven-counts", { freshMs: 20_000, staleMs: 120_000 }, async () => {
    const book = await readBook();
    const counts = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<Category, number>;
    for (const c of CATEGORIES) {
      const i = CATEGORIES.indexOf(c);
      const wallets = new Set(
        book.rows
          .filter((r) => r.category === i && !/^0x0+$/.test(r.agent) && (r.bondWei > 0n || r.epochsSettled > 0))
          .map((r: BookRow) => r.agent.toLowerCase()),
      );
      counts[c] = wallets.size;
    }
    return { counts, block: book.blockNumber != null ? book.blockNumber.toString() : null, at: book.at };
  });
}
