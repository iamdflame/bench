/**
 * The two types that carry the Data Quality criterion.
 *
 * The brief asks for "real-time, accurate data that goes beyond basic counts",
 * such that a user "can make a genuinely informed call on which agent to
 * hire". A number on its own cannot do that. `94.2%` is not information until
 * you know what it is a share of, over what window, read at what block, and by
 * what method — and whether the alternative to `94.2%` was `0%` or "we could
 * not measure it".
 *
 * So there are exactly two shapes for a fact in this product:
 *
 *   Measurement   a number that knows where it came from. It cannot be built
 *                 without a block and a method, and the renderer refuses one
 *                 that lacks either.
 *
 *   Maybe<T>      known with a value, or unknown with a reason. There is no
 *                 third state, and `0` is never a stand-in for absence. "No
 *                 reviews" and "we could not read the reviews" are different
 *                 claims and only one of them is about the agent.
 *
 * Everything downstream — the board, the API, the MCP server — is built from
 * these, which is why a check can assert the property across the whole product
 * rather than page by page.
 */

/** Where a figure came from. Rendered, because the four are not equally strong. */
export type MeasurementSource =
  | "chain" // read from BSC state or logs. The strongest.
  | "probe" // we called the endpoint ourselves and recorded what happened.
  | "registry" // an ERC-8004 card or 8004scan says so. A claim, not a fact.
  | "bazaar"; // Binance's B402 discovery index says so. Also a claim.

export type MeasurementUnit =
  | "%"
  | "bps"
  | "seconds"
  | "days"
  | "ms"
  | "USD"
  | "BNB"
  | "count"
  | "ratio"
  | "block";

export interface Measurement {
  /** What was measured, in a person's words. "Time in range". */
  name: string;
  value: number;
  unit: MeasurementUnit;
  /**
   * The two halves of a ratio, where there are two.
   *
   * `94.2%` is an assertion; `27.4 of 29.1 days observed` is a measurement.
   * Optional because not every figure is a ratio, but omitted only when the
   * figure genuinely is not one.
   */
  numerator?: number;
  denominator?: number;
  /** "30d rolling", "since registration", "at this block". Never absent. */
  window: string;
  /** When the read completed. ISO 8601. */
  observedAt: string;
  /** The BSC block the read was pinned to. A read with no block is not one. */
  block: bigint;
  /** Slug into /data, where the computation is written out. */
  method: string;
  source: MeasurementSource;
  /** Which chain. A figure that does not know its chain cannot be aggregated. */
  chainId: number;
}

export type Maybe<T> = { known: true; value: T } | { known: false; reason: string };

export const known = <T>(value: T): Maybe<T> => ({ known: true, value });
export const unknown = <T>(reason: string): Maybe<T> => ({ known: false, reason });

/** Narrowing helper, so a caller never reaches `.value` on an unknown. */
export const isKnown = <T>(m: Maybe<T>): m is { known: true; value: T } => m.known;

/** The value, or a fallback the caller names out loud. Never a silent zero. */
export const orElse = <T>(m: Maybe<T>, fallback: T): T => (m.known ? m.value : fallback);

/** Map without unwrapping, so the reason survives the transformation. */
export function mapMaybe<T, U>(m: Maybe<T>, f: (t: T) => U): Maybe<U> {
  return m.known ? known(f(m.value)) : unknown(m.reason);
}

/**
 * Build a Measurement, refusing the ones that cannot be checked.
 *
 * This throws rather than returning an invalid object, and it throws at
 * construction rather than at render, because a figure without a block reaches
 * the screen as a plausible number and that is the failure this whole type
 * exists to prevent. Every construction site in this codebase goes through
 * here.
 */
export function measure(m: {
  name: string;
  value: number;
  unit: MeasurementUnit;
  numerator?: number;
  denominator?: number;
  window: string;
  block: bigint;
  method: string;
  source: MeasurementSource;
  chainId: number;
  observedAt?: string;
}): Measurement {
  if (!m.method) throw new Error(`measurement "${m.name}" has no method: it could not be reproduced`);
  if (typeof m.block !== "bigint" || m.block <= 0n)
    throw new Error(`measurement "${m.name}" has no block: it is not pinned to anything`);
  if (!Number.isFinite(m.value)) throw new Error(`measurement "${m.name}" is not a finite number`);
  if (!m.window) throw new Error(`measurement "${m.name}" has no window: a rate without a period is not a rate`);
  return {
    name: m.name,
    value: m.value,
    unit: m.unit,
    ...(m.numerator === undefined ? {} : { numerator: m.numerator }),
    ...(m.denominator === undefined ? {} : { denominator: m.denominator }),
    window: m.window,
    observedAt: m.observedAt ?? new Date().toISOString(),
    block: m.block,
    method: m.method,
    source: m.source,
    chainId: m.chainId,
  };
}

/**
 * The wire form.
 *
 * `bigint` does not survive `JSON.stringify` and does not cross the React
 * server/client boundary, so anything leaving the server as data — the public
 * API, a client component's props — goes through here. The block becomes a
 * decimal string and stays a number a reader can check, rather than being
 * dropped because it was inconvenient.
 */
export interface WireMeasurement extends Omit<Measurement, "block"> {
  block: string;
}

export const toWire = (m: Measurement): WireMeasurement => ({ ...m, block: m.block.toString() });
export const fromWire = (m: WireMeasurement): Measurement => ({ ...m, block: BigInt(m.block) });

export type WireMaybe<T> = { known: true; value: T } | { known: false; reason: string };
