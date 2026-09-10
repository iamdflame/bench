/**
 * A position, what is wrong with it, and who answered when we called them.
 *
 * The two halves of this product have never been joined. One half knows that
 * roughly a quarter of live PancakeSwap V3 positions are sitting outside their
 * range earning nothing; the other half knows which agents answer the phone.
 * Nobody has ever been able to walk in with a position and walk out with an
 * agent, which is the entire transaction this marketplace exists to host.
 *
 * The findings here are deliberately conservative. A position we cannot price
 * is still reported as in or out of range, and a position whose pool we cannot
 * read is reported as unknown rather than guessed at.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isAddress, type Address } from "viem";
import type { Category } from "@/lib/config";
import { listings, type Listing } from "@/lib/market/listing";
import {
  currentBlock,
  positionIdsOf,
  readPositions,
  readVenus,
  type PositionReading,
  type VenusReading,
} from "./positions";

export type Finding =
  | {
      kind: "out-of-range";
      severity: "act" | "watch";
      tokenId: string;
      pair: string;
      ticksOut: number;
      title: string;
      detail: string;
      category: Category;
    }
  | {
      kind: "in-range";
      severity: "fine";
      tokenId: string;
      pair: string;
      title: string;
      detail: string;
      category: Category;
    }
  | {
      kind: "closed";
      severity: "fine";
      tokenId: string;
      pair: string;
      title: string;
      detail: string;
      category: Category;
    }
  | {
      kind: "unknown";
      severity: "watch";
      tokenId: string;
      pair: string;
      title: string;
      detail: string;
      category: Category;
    }
  | {
      kind: "not-found";
      severity: "watch";
      tokenId: string;
      pair: string;
      title: string;
      detail: string;
      category: Category;
    }
  | {
      kind: "liquidatable" | "thin-headroom" | "healthy";
      severity: "act" | "watch" | "fine";
      tokenId: null;
      pair: string;
      title: string;
      detail: string;
      category: Category;
    };

export interface Diagnosis {
  input: string;
  kind: "wallet" | "position";
  blockNumber: string;
  positions: PositionReading[];
  venus: VenusReading | null;
  findings: Finding[];
  /** Categories worth hiring for, most urgent first. */
  needed: Category[];
  /** Population context, from the committed report. */
  population: { outOfRange: number; live: number; share: number; anchorBlock: number } | null;
}

/** The one committed figure this page leans on, read rather than retyped. */
export function population(): Diagnosis["population"] {
  try {
    const raw = JSON.parse(
      readFileSync(join(process.cwd(), "docs/advantage/results/EXPLORE.json"), "utf8"),
    ) as { live?: number; outOfRange?: number; anchorBlock?: number };
    if (!raw.live || !raw.outOfRange) return null;
    return {
      outOfRange: raw.outOfRange,
      live: raw.live,
      share: (raw.outOfRange / raw.live) * 100,
      anchorBlock: raw.anchorBlock ?? 0,
    };
  } catch {
    return null;
  }
}

const pairOf = (p: PositionReading) =>
  `${p.symbol0 ?? p.token0.slice(0, 6)}/${p.symbol1 ?? p.token1.slice(0, 6)} ${p.fee / 10_000}%`;

function positionFinding(p: PositionReading): Finding {
  const pair = pairOf(p);
  if (p.closed) {
    return {
      kind: "closed",
      severity: "fine",
      tokenId: p.tokenId,
      pair,
      title: `Position #${p.tokenId} is closed`,
      detail: "Its liquidity is zero, so there is nothing in it to manage.",
      category: "rebalancing",
    };
  }
  if (p.inRange === null) {
    return {
      kind: "unknown",
      severity: "watch",
      tokenId: p.tokenId,
      pair,
      title: `Position #${p.tokenId} could not be checked`,
      detail:
        "Its pool would not answer, so we cannot say whether it is in range. That is our reading failing, not a finding about the position.",
      category: "rebalancing",
    };
  }
  if (!p.inRange) {
    return {
      kind: "out-of-range",
      severity: "act",
      tokenId: p.tokenId,
      pair,
      ticksOut: p.ticksOut,
      title: `Position #${p.tokenId} is out of range and earning nothing`,
      detail: `The ${pair} pool is trading ${p.ticksOut.toLocaleString("en-GB")} ticks outside your range of ${p.tickLower.toLocaleString("en-GB")} to ${p.tickUpper.toLocaleString("en-GB")}. Liquidity outside the range collects no fees.`,
      category: "rebalancing",
    };
  }
  return {
    kind: "in-range",
    severity: "fine",
    tokenId: p.tokenId,
    pair,
    title: `Position #${p.tokenId} is in range`,
    detail: `The ${pair} pool is inside your range, so it is earning fees. A rebalancer would watch it rather than move it.`,
    category: "rebalancing",
  };
}

function venusFinding(v: VenusReading): Finding | null {
  if (!v.active) return null;
  if (v.shortfallUsd > 0) {
    return {
      kind: "liquidatable",
      severity: "act",
      tokenId: null,
      pair: "Venus",
      title: "This Venus position is already liquidatable",
      detail: `It is $${v.shortfallUsd.toFixed(2)} underwater. Anybody can liquidate it right now, and the penalty comes out of your collateral.`,
      category: "health-factor",
    };
  }
  // The agent's own floor: headroom under a quarter of the borrow is thin.
  if (v.liquidityUsd > 0 && v.liquidityUsd < 50) {
    return {
      kind: "thin-headroom",
      severity: "watch",
      tokenId: null,
      pair: "Venus",
      title: "This Venus position has very little headroom",
      detail: `Spare borrowing capacity is $${v.liquidityUsd.toFixed(2)}. A move against you closes that quickly, and liquidation is automatic.`,
      category: "health-factor",
    };
  }
  return {
    kind: "healthy",
    severity: "fine",
    tokenId: null,
    pair: "Venus",
    title: "This Venus position has headroom",
    detail: `Spare borrowing capacity is $${v.liquidityUsd.toFixed(2)} with no shortfall. A monitor would watch it rather than act.`,
    category: "health-factor",
  };
}

export async function diagnose(input: string, hires?: Map<string, number>): Promise<Diagnosis | null> {
  const trimmed = input.trim();
  const isWallet = isAddress(trimmed);
  const isPosition = /^\d+$/.test(trimmed);
  if (!isWallet && !isPosition) return null;

  const blockNumber = (await currentBlock().catch(() => 0n)).toString();

  let positions: PositionReading[] = [];
  let venus: VenusReading | null = null;

  if (isWallet) {
    const ids = await positionIdsOf(trimmed as Address).catch(() => []);
    positions = await readPositions(ids).catch(() => []);
    venus = await readVenus(trimmed as Address);
  } else {
    positions = await readPositions([BigInt(trimmed)]).catch(() => []);
  }

  const findings: Finding[] = positions.map(positionFinding);

  /*
    An id the position manager will not answer for is a finding, not a blank.

    A burned NFT reverts `positions(tokenId)`, and dropping the row left the
    page showing nothing at all for an id somebody had just typed in. An empty
    result that looks identical to "we found no problems" is the worst possible
    answer to a question about money.
  */
  if (isPosition && positions.length === 0) {
    findings.push({
      kind: "not-found",
      severity: "watch",
      tokenId: trimmed,
      pair: "PancakeSwap V3",
      title: `PancakeSwap does not recognise position #${trimmed}`,
      detail:
        "The position manager will not answer for that id. That usually means the position was closed and its NFT burned, or the number belongs to a different chain. Check the number on the position itself.",
      category: "rebalancing",
    });
  }
  const v = venus ? venusFinding(venus) : null;
  if (v) findings.push(v);

  const rank = { act: 0, watch: 1, fine: 2 } as const;
  findings.sort((a, b) => rank[a.severity] - rank[b.severity]);

  const needed = [
    ...new Set(findings.filter((f) => f.severity !== "fine").map((f) => f.category)),
  ];

  return {
    input: trimmed,
    kind: isWallet ? "wallet" : "position",
    blockNumber,
    positions,
    venus,
    findings,
    needed,
    population: population(),
  };
}

/** Agents in a category that answered when we called them, quickest first. */
export function respondersFor(category: Category, hires?: Map<string, number>, limit = 4): Listing[] {
  return listings(hires)
    .filter((l) => l.category === category && l.liveness === "live")
    .sort((a, b) => (a.probe?.latencyMs ?? 1e9) - (b.probe?.latencyMs ?? 1e9))
    .slice(0, limit);
}
