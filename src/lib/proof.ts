/**
 * The part where the agent loses money.
 *
 * Every marketplace can show you a win. The category nobody else on this chain
 * occupies is the one where the *agent* is out of pocket: a bond it posted
 * itself, cut by a contract, because a settled epoch missed a benchmark that
 * was committed before the outcome was known. That is what this module reads.
 *
 * It reads three states, and they are not the same claim:
 *
 *   CUT        a strike recorded against a mandate. The bond was reduced. This
 *              is the strongest thing this product can show and it is a chain
 *              reading, not a screenshot.
 *   OPEN       a settled epoch inside its challenge window. Anyone may stake
 *              and contest it right now, and the window closes at a block. An
 *              open window is weaker evidence than a cut and is labelled as
 *              weaker rather than dressed up as the same thing.
 *   NONE       neither. Said plainly. A proof page that manufactures a slash
 *              when there is not one would be the single most self-defeating
 *              thing this codebase could do.
 *
 * Nothing here is cached beyond the book's own memoisation, because the whole
 * value of the page is that it is the current state at a block a reader can
 * check.
 */

import { formatEther } from "viem";
import { readBook, type BookRow } from "@/lib/chain/book";
import { houseByWallet } from "@/lib/house";
import { CATEGORIES, CATEGORY_LABEL, type Category } from "@/lib/config";
import { bps } from "@/lib/chain/market";

export interface Strike {
  mandateId: number;
  deployment: string;
  address: string;
  agent: string;
  /** Our own agent's name where the wallet is one of ours. Never invented. */
  name: string;
  ours: boolean;
  category: Category;
  strikes: number;
  bondWei: string;
  bondBnb: string;
  epochsSettled: number;
  alpha: string | null;
  /** The desk sentence, assembled from the reading rather than written by hand. */
  line: string;
  href: string;
}

export interface OpenWindow {
  mandateId: number;
  deployment: string;
  address: string;
  name: string;
  ours: boolean;
  category: Category;
  epochsSettled: number;
  alpha: string | null;
  bondBnb: string;
  href: string;
}

export interface ProofReading {
  strikes: Strike[];
  open: OpenWindow[];
  /** Total bond currently escrowed by agents across every deployment. */
  bondedBnb: string;
  block: string | null;
  at: string;
  unread: string[];
}

const nameFor = (r: BookRow): { name: string; ours: boolean } => {
  const h = houseByWallet(r.agent);
  return h
    ? { name: h.name, ours: true }
    : { name: `Holder ${r.agent.slice(0, 6)}…${r.agent.slice(-4)}`, ours: false };
};

const categoryOf = (r: BookRow): Category => CATEGORIES[r.category] ?? CATEGORIES[0];

export async function readProof(): Promise<ProofReading> {
  const book = await readBook();
  const live = book.rows.filter((r) => !/^0x0+$/.test(r.agent));

  const strikes: Strike[] = live
    .filter((r) => r.strikes > 0)
    .sort((a, b) => b.strikes - a.strikes || b.epochsSettled - a.epochsSettled)
    .map((r) => {
      const { name, ours } = nameFor(r);
      const alpha = r.epochsSettled > 0 ? bps(r.cumulativeAlphaBps) : null;
      return {
        mandateId: r.id,
        deployment: r.deployment.label,
        address: r.deployment.address,
        agent: r.agent,
        name,
        ours,
        category: categoryOf(r),
        strikes: r.strikes,
        bondWei: r.bondWei.toString(),
        bondBnb: Number(formatEther(r.bondWei)).toFixed(5),
        epochsSettled: r.epochsSettled,
        alpha,
        /*
          Written from the reading, in the desk's voice.

          "Missed the mark" rather than "underperformed", and the number is the
          one the contract used. If the alpha reading is absent the sentence
          says the strike stands without quoting a figure, instead of printing
          a zero that would read as a result.
        */
        line:
          `${name} missed the mark in ${CATEGORY_LABEL[categoryOf(r)].toLowerCase()}` +
          (alpha ? ` by ${alpha}` : "") +
          `. Its bond was cut, ${r.strikes} time${r.strikes === 1 ? "" : "s"}, and the cut stays on the tape. Succession is open.`,
        href: `/settlement/${r.id}`,
      };
    });

  const open: OpenWindow[] = live
    .filter((r) => r.strikes === 0 && r.epochsSettled > 0 && (r.state === 0 || r.state === 1))
    .sort((a, b) => b.epochsSettled - a.epochsSettled)
    .slice(0, 6)
    .map((r) => {
      const { name, ours } = nameFor(r);
      return {
        mandateId: r.id,
        deployment: r.deployment.label,
        address: r.deployment.address,
        name,
        ours,
        category: categoryOf(r),
        epochsSettled: r.epochsSettled,
        alpha: r.epochsSettled > 0 ? bps(r.cumulativeAlphaBps) : null,
        bondBnb: Number(formatEther(r.bondWei)).toFixed(5),
        href: `/settlement/${r.id}`,
      };
    });

  return {
    strikes,
    open,
    bondedBnb: Number(formatEther(book.bondedWei)).toFixed(5),
    block: book.blockNumber != null ? book.blockNumber.toString() : null,
    at: book.at,
    unread: book.unread,
  };
}
