/**
 * The vocabulary of an assay.
 *
 * An assay never returns an opinion. Every verdict carries the claim it tested,
 * the finding that contradicted or confirmed it, and evidence a judge can click
 * through to a block explorer. If a check cannot produce evidence, it returns
 * `inconclusive` rather than inventing a number.
 */

export type AssayId =
  | "identity"
  | "custody"
  | "activity"
  | "capability"
  | "reputation"
  | "performance";

export type Verdict = "pass" | "fail" | "inconclusive";

export interface Evidence {
  kind: "tx" | "address" | "block" | "rpc" | "api" | "note";
  label: string;
  value: string;
  /** Block explorer or API URL, when the evidence is externally verifiable. */
  url?: string;
}

export interface AssayResult {
  id: AssayId;
  title: string;
  /** What the registry asserts. */
  claim: string;
  /** What the chain shows. */
  finding: string;
  verdict: Verdict;
  /** 0..1 within this assay, before weighting. */
  score: number;
  /** Millesimal points this assay contributes at a perfect score. */
  weight: number;
  evidence: Evidence[];
  /** Milliseconds spent, surfaced in the live bench. */
  ms?: number;
  /**
   * What the chain actually showed this agent touching.
   *
   * Only the capability assay sets this, and it is the input to the session
   * scope: authority is derived from it rather than from the category the
   * agent claims. `complete` matters as much as the list — a scan the provider
   * refused proves nothing, and must never be read as "touched nothing".
   */
  proven?: {
    protocols: string[];
    complete: boolean;
    scannedBlocks: string;
  };
}

/**
 * Millesimal fineness — the real assay-office unit. 999 is pure; 375 is the
 * lowest grade that may legally carry a hallmark in the UK. We use the same
 * ladder because it is honest about what most of the registry is: base metal.
 */
export const HALLMARK_LADDER = [
  { min: 999, mark: "999", name: "Fine", note: "Essentially pure." },
  { min: 916, mark: "916", name: "22 carat", note: "Very high purity." },
  { min: 750, mark: "750", name: "18 carat", note: "High purity." },
  { min: 585, mark: "585", name: "14 carat", note: "Sound." },
  { min: 375, mark: "375", name: "9 carat", note: "Lowest hallmarkable grade." },
  { min: 0, mark: "—", name: "Base metal", note: "Below hallmarking standard." },
] as const;

export type Hallmark = (typeof HALLMARK_LADDER)[number];

export const hallmarkFor = (fineness: number): Hallmark =>
  HALLMARK_LADDER.find((h) => fineness >= h.min) ?? HALLMARK_LADDER.at(-1)!;

export const isHallmarked = (fineness: number) => fineness >= 375;

export interface AssayReport {
  chainId: number;
  tokenId: string;
  agentId: string;
  name: string | null;
  ownerAddress: string | null;
  agentWallet: string | null;
  /** What the registry scored it, for contrast. Not used in our maths. */
  registryScore: number | null;
  /** 0..1000 millesimal. */
  fineness: number;
  hallmark: Hallmark;
  category: string | null;
  categoryConfidence: number;
  results: AssayResult[];
  assayedAt: string;
  ms: number;
}

/** Absence of evidence is impurity. An assay office does not grade unproven metal. */
export function computeFineness(results: AssayResult[]): number {
  const total = results.reduce((sum, r) => sum + r.weight, 0);
  if (total === 0) return 0;
  const earned = results.reduce((sum, r) => sum + r.weight * clamp01(r.score), 0);
  return Math.round((earned / total) * 1000);
}

export const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);
