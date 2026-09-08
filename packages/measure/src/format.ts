/**
 * Turning a Measurement into the two or three lines a person actually reads.
 *
 * Formatting lives here rather than in components for one reason: the rule
 * that a figure never appears without its provenance has to be enforceable,
 * and it can only be enforced if there is exactly one place that turns a
 * number into a string. A component that interpolates `${value}%` has escaped
 * the system, and `tools/checks/measurement.ts` fails the build when one does.
 *
 * Digits are grouped and fixed-width by convention here and by
 * `font-variant-numeric: tabular-nums` in the stylesheet. A column that
 * reflows when a value refreshes destroys credibility faster than a wrong
 * number does, because the wrong number at least looks like a measurement.
 */

import type { Measurement, MeasurementUnit, Maybe } from "./types";

const DP: Record<MeasurementUnit, number> = {
  "%": 1,
  bps: 0,
  seconds: 0,
  days: 1,
  ms: 0,
  USD: 2,
  BNB: 4,
  count: 0,
  ratio: 2,
  block: 0,
};

const SUFFIX: Partial<Record<MeasurementUnit, string>> = {
  "%": "%",
  bps: " bps",
  seconds: "s",
  days: "d",
  ms: " ms",
  count: "",
  ratio: "",
  block: "",
};

const PREFIX: Partial<Record<MeasurementUnit, string>> = { USD: "$" };

/** The number itself. Grouped, fixed decimals, with its unit attached. */
export function formatValue(value: number, unit: MeasurementUnit, opts: { sign?: boolean } = {}): string {
  const dp = DP[unit] ?? 2;
  const abs = Math.abs(value);
  const grouped = abs.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
  const sign = value < 0 ? "−" : opts.sign && value > 0 ? "+" : "";
  const body = `${PREFIX[unit] ?? ""}${grouped}${SUFFIX[unit] ?? ""}`;
  if (unit === "BNB") return `${sign}${body} BNB`;
  return `${sign}${body}`;
}

export const displayValue = (m: Measurement, opts?: { sign?: boolean }) =>
  formatValue(m.value, m.unit, opts ?? {});

/**
 * The second line: what the number is a share of.
 *
 * Returns null rather than an empty string when there is no ratio, so a
 * caller has to decide what to render instead rather than emitting a stray
 * separator.
 */
export function displayBasis(m: Measurement): string | null {
  if (m.numerator === undefined || m.denominator === undefined) return null;
  const dp = m.unit === "count" ? 0 : 1;
  const n = m.numerator.toLocaleString("en-US", { maximumFractionDigits: dp });
  const d = m.denominator.toLocaleString("en-US", { maximumFractionDigits: dp });
  return `${n} of ${d}`;
}

/**
 * The provenance line. Block, age, source, method — in that order.
 *
 * This is the highest-leverage string in the product. It is what turns a
 * board row from a claim into a reading, and it appears under every figure on
 * every surface, including on our own agents.
 */
export function displayProvenance(m: Measurement, now = Date.now()): string {
  const age = humanAge(m.observedAt, now);
  const src =
    m.source === "chain"
      ? "read from chain"
      : m.source === "probe"
        ? "we called it"
        : m.source === "registry"
          ? "registry says"
          : "B402 says";
  return `block ${m.block.toLocaleString("en-US")} · ${age} · ${src}`;
}

export function humanAge(iso: string, now = Date.now()): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "age unknown";
  const s = Math.max(0, Math.round((now - then) / 1000));
  if (s < 5) return "just now";
  if (s < 90) return `${s}s ago`;
  const mins = Math.round(s / 60);
  if (mins < 90) return `${mins}m ago`;
  const h = Math.round(mins / 60);
  if (h < 36) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

/**
 * How stale is too stale.
 *
 * A probe result nobody refreshed inside the window decays to unavailable
 * rather than staying green, which fails in the safe direction: the worst
 * outcome of decaying early is a row that says "not measured recently", and
 * the worst outcome of decaying late is selling a hire on a dead endpoint.
 */
export function freshness(iso: string, staleAfterMs: number, now = Date.now()): "fresh" | "ageing" | "stale" {
  const age = now - new Date(iso).getTime();
  if (!Number.isFinite(age)) return "stale";
  if (age <= staleAfterMs) return "fresh";
  if (age <= staleAfterMs * 3) return "ageing";
  return "stale";
}

/**
 * The one function that renders an unknown.
 *
 * It never returns "0", never returns "", never returns "-". It returns the
 * words "not measured" and, separately, the reason — because a reader who
 * cannot see why a field is empty will assume the worst thing about the agent
 * or the best thing about us, and both are wrong.
 */
export function displayUnknown(m: Maybe<unknown>): { label: string; reason: string } | null {
  if (m.known) return null;
  return { label: "not measured", reason: m.reason };
}

/** Addresses, shortened the way a person actually checks one: both ends. */
export const shortAddress = (a: string) =>
  a && a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;

export const shortHash = (h: string) => (h && h.length > 14 ? `${h.slice(0, 10)}…` : h);

/** A price in its token, for the rail rows. Small numbers keep their digits. */
export function formatPrice(amount: bigint, decimals: number, symbol: string): string {
  const neg = amount < 0n;
  const abs = neg ? -amount : amount;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const frac = abs % base;
  let fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  // Keep at least two decimals for money, and never round a cent to zero.
  if (fracStr.length < 2) fracStr = fracStr.padEnd(2, "0");
  if (fracStr.length > 6) fracStr = fracStr.slice(0, 6);
  return `${neg ? "−" : ""}${whole.toLocaleString("en-US")}.${fracStr} ${symbol}`;
}
