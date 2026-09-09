/**
 * Every market this office has run, named.
 *
 * There are three, and until now the site could not say so coherently: the
 * footer linked one, `/start` printed a second, the README claimed a third,
 * and the verifier defaulted to a fourth answer. A visitor comparing them
 * would have found three different contracts all describing themselves as *the*
 * market.
 *
 * The instinct is to pick the newest and delete the others. That would be
 * wrong here, because all three hold real mandates with real settled epochs,
 * including the grid mandate that lost 21% — and a market that quietly stops
 * displaying its worst result when it redeploys is doing the precise thing this
 * product exists to catch.
 *
 * So: one canonical deployment that new mandates open on, and every earlier
 * deployment kept, labelled, and still readable. The book spans all of them.
 */

import type { Address } from "viem";

export type DeploymentStatus = "canonical" | "superseded";

export interface Deployment {
  address: Address;
  /** Short label shown against every row and figure this contract produced. */
  label: string;
  status: DeploymentStatus;
  chainId: number;
  /** Ordering for display: the canonical deployment first, then most recent. */
  rank: number;
  /**
   * Why it was replaced. Shown on superseded ledgers rather than left for a
   * reader to infer from an address they do not recognise.
   */
  note: string;
}

/**
 * The canonical market. New mandates open here and this is the address the
 * footer, the ticket and every "verify on BscScan" link point at.
 */
export const MARKET_V2 = "0x6052C0ab83a99Fb37aC598c23b8E369fB21C71B2" as Address;
export const MARKET_V1 = "0xeD331c44183EFF1e8eDc31f6C60AfDA187681544" as Address;
export const MARKET_V0 = "0x4c2BeE70b4Acaf3b242860C9AefF97217D1758EC" as Address;

export const DEPLOYMENTS: Deployment[] = [
  {
    address: MARKET_V2,
    label: "v2",
    status: "canonical",
    chainId: 56,
    rank: 0,
    note: "Attestations, BEP-20 mandates, per-category benchmarks and challenge bonds.",
  },
  {
    address: MARKET_V1,
    label: "v1",
    status: "superseded",
    chainId: 56,
    rank: 1,
    note: "Superseded by v2. Its mandates and settled epochs are still readable, and still counted in the book.",
  },
  {
    address: MARKET_V0,
    label: "v0",
    status: "superseded",
    chainId: 56,
    rank: 2,
    note: "The first deployment. Holds the grid mandate that lost 21%, which stays on the tape.",
  },
];

/** The deployment new mandates open on. */
export const CANONICAL = DEPLOYMENTS[0];

const BY_ADDRESS = new Map(DEPLOYMENTS.map((d) => [d.address.toLowerCase(), d]));

export function deploymentFor(address: string | null | undefined): Deployment | null {
  return address ? (BY_ADDRESS.get(address.toLowerCase()) ?? null) : null;
}

/**
 * The label a mandate id carries in the URL and on screen.
 *
 * Mandate 0 exists on all three contracts and means three different things, so
 * a bare `/mandate/0` is ambiguous. Canonical ids stay bare for the short link
 * a judge will paste; everything else is qualified.
 */
export function mandatePath(address: string, id: number): string {
  const d = deploymentFor(address);
  if (!d || d.status === "canonical") return `/mandate/${id}`;
  /*
    A separate path rather than /mandate/<label>/<id>: Next.js will not accept
    two different slug names at one level, so `[id]` and `[deployment]` cannot
    both sit under /mandate. Naming the older books /ledger keeps the canonical
    mandate at the short URL a judge will paste.
  */
  return `/ledger/${d.label}/${id}`;
}

/** BscScan for the chain a deployment lives on. Never a bare explorer root. */
export function explorerFor(chainId: number): string {
  return chainId === 97 ? "https://testnet.bscscan.com" : "https://bscscan.com";
}

export function addressUrl(address: string, chainId = 56): string {
  return `${explorerFor(chainId)}/address/${address}`;
}
