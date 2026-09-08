import Link from "next/link";
import type { Reading } from "@/lib/board";

/**
 * What changed since the last probe cycle.
 *
 * Every item here is a diff between two stored readings — not a marquee, not a
 * decoration, and never a number that animates on page load. The plan forbids
 * counters that run without a data event, and a strip of invented movement on
 * a page whose argument is that figures are readings would be the worst
 * possible place to break that.
 *
 * When there is only one reading it says so. A market that has not moved is a
 * fact about the market, and reporting it is more useful than an empty bar.
 */

interface Item {
  label: string;
  value: string;
  tone: "up" | "down" | "flat";
}

function diff(now: Reading, before: Reading): Item[] {
  const items: Item[] = [];

  const delta = (label: string, a: number, b: number) => {
    const d = a - b;
    if (d === 0) return;
    items.push({
      label,
      value: `${d > 0 ? "+" : "−"}${Math.abs(d)}`,
      tone: d > 0 ? "up" : "down",
    });
  };

  delta("callable", now.totals.callable, before.totals.callable);
  delta("hireable", now.totals.hireable, before.totals.hireable);
  delta("can hold a session", now.totals.mandatable, before.totals.mandatable);
  delta("listed", now.totals.listed, before.totals.listed);

  /*
    Which rows moved, not just how many. A count that went from 11 to 11 while
    one endpoint died and another came up is not a quiet cycle, and only the
    identities show that.
  */
  const was = new Set(before.callable);
  const is = new Set(now.callable);
  const cameUp = now.callable.filter((k) => !was.has(k)).length;
  const wentQuiet = before.callable.filter((k) => !is.has(k)).length;
  if (cameUp > 0) items.push({ label: "came online", value: String(cameUp), tone: "up" });
  if (wentQuiet > 0) items.push({ label: "went quiet", value: String(wentQuiet), tone: "down" });

  return items;
}

export default function Ticker({ history, probed }: { history: Reading[]; probed: number }) {
  const now = history[history.length - 1];
  const before = history[history.length - 2];

  const items: Item[] = now && before ? diff(now, before) : [];

  return (
    <div className="ticker" role="status" aria-label="What changed since the last probe cycle">
      <span className="ticker__item">
        <span className="ticker__label">since last cycle</span>
      </span>

      {items.length > 0 ? (
        items.map((i) => (
          <span key={i.label} className="ticker__item">
            <span className={`num ticker__${i.tone}`}>{i.value}</span>
            <span className="ticker__label">{i.label}</span>
          </span>
        ))
      ) : (
        <span className="ticker__item">
          <span className="ticker__label">
            {now && before
              ? "nothing changed — same rows open, same counts"
              : "first reading stored; changes appear after the next cycle"}
          </span>
        </span>
      )}

      <span className="ticker__item">
        <span className="num">{probed.toLocaleString("en-US")}</span>
        <span className="ticker__label">called in total</span>
      </span>

      {now ? (
        <span className="ticker__item">
          <span className="ticker__label">at block</span>
          <span className="num">{Number(now.block).toLocaleString("en-US")}</span>
        </span>
      ) : null}

      <span className="ticker__item">
        <Link href="/data" className="ticker__label" style={{ textDecoration: "underline" }}>
          how this is counted
        </Link>
      </span>
    </div>
  );
}
