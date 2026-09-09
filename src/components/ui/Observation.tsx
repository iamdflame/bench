"use client";

import { useEffect, useState } from "react";
import { EXPLORER } from "@/lib/config";
import Roll from "./Roll";

/**
 * Every figure carries the block it was read at.
 *
 * This is the highest-leverage component in the system and it is three lines
 * of markup. `14.2%` is a claim. `14.2% · block 119,901,707 · 4m ago` is a
 * measurement — it names the state the number came from, so anyone can go and
 * read that state themselves and disagree.
 *
 * A product that exists to punish unverifiable assertions cannot render an
 * unstamped number anywhere. So this wraps them all.
 */
export default function Observation({
  value,
  block,
  at,
  tone,
  size = "body",
  showBlock = true,
  label,
}: {
  /** The figure itself, already formatted. Rendered monospaced and tabular. */
  value?: React.ReactNode;
  /** Block the value was read at. Links to the explorer. */
  block?: bigint | number | string | null;
  /** When it was read. Drives the age, which updates in place. */
  at?: string | number | Date | null;
  /** Metal the figure is struck in. Defaults to plain ink. */
  tone?: string;
  size?: "body" | "large" | "small";
  /** Set false where the block is stamped once for a whole table. */
  showBlock?: boolean;
  /** All-caps punch label above the figure. */
  label?: string;
}) {
  const age = useAge(at);
  const blockText = block === null || block === undefined ? null : formatBlock(block);

  return (
    <span className={`obs obs--${size}`}>
      {label ? <span className="mark-label obs__label">{label}</span> : null}
      {value !== undefined ? (
        <span className="obs__value num" style={tone ? { color: tone } : undefined}>
          {/* A figure that arrives as a plain string can roll the digit that
              moved; anything richer is rendered as given. */}
          {typeof value === "string" ? <Roll value={value} /> : value}
        </span>
      ) : null}
      {(blockText && showBlock) || age ? (
        <span className="obs__stamp">
          {blockText && showBlock ? (
            <a
              className="obs__block num"
              href={`${EXPLORER}/block/${String(block)}`}
              target="_blank"
              rel="noreferrer"
              title="The chain state this figure was read from"
            >
              block {blockText}
            </a>
          ) : null}
          {/* Server and client disagree about "now" by construction, and that
              is not an error worth a console warning. */}
          {age ? (
            <span className="obs__age num" suppressHydrationWarning>
              {age}
            </span>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}

const formatBlock = (b: bigint | number | string) =>
  BigInt(b).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/**
 * Age of a reading, refreshed in place.
 *
 * Starts empty so the server and the first client paint agree, then fills and
 * ticks. A stale figure that silently keeps claiming "4m ago" is worse than no
 * age at all, so this updates rather than being rendered once.
 */
export function useAge(at: string | number | Date | null | undefined): string | null {
  const [age, setAge] = useState<string | null>(null);

  useEffect(() => {
    if (at === null || at === undefined) {
      setAge(null);
      return;
    }
    const t = new Date(at).getTime();
    if (!Number.isFinite(t)) return;
    const tick = () => setAge(formatAge(Date.now() - t));
    tick();
    const id = setInterval(tick, 15_000);
    return () => clearInterval(id);
  }, [at]);

  return age;
}

export function formatAge(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
