import Link from "next/link";
import type { Snapshot } from "@bench/shared";

/**
 * The honesty line under a board, as figures rather than as a paragraph.
 *
 * It used to be five lines of monospace prose, which is the least readable
 * combination available: monospace is for figures a reader compares in a
 * column, not for sentences a reader follows across a line.
 *
 * The content is unchanged — how many are registered, how many we have read,
 * how many were called, how many answered — but each is a figure with a label,
 * which is what those numbers are. The one genuinely prose-shaped part, the
 * reason a count is unknown, still renders as a sentence, because a reason is
 * a sentence.
 */

export default function Strip({
  snapshot,
  collapsed,
}: {
  snapshot: Snapshot;
  collapsed?: number;
}) {
  const s = snapshot;

  return (
    <div className="strip" role="group" aria-label="How this board was counted">
      {s.registry.registered.known ? (
        <span className="strip__item">
          <span className="strip__n">{s.registry.registered.value.toLocaleString("en-US")}</span>
          <span className="strip__label">registered on BSC</span>
        </span>
      ) : null}

      <span className="strip__item">
        <span className="strip__n">{s.registry.read.toLocaleString("en-US")}</span>
        <span className="strip__label">read by us</span>
      </span>

      <span className="strip__item">
        <span className="strip__n">{s.totals.bazaar.toLocaleString("en-US")}</span>
        <span className="strip__label">paid endpoints from B402</span>
      </span>

      <span className="strip__item">
        <span className="strip__n">{s.totals.probed.toLocaleString("en-US")}</span>
        <span className="strip__label">called</span>
      </span>

      <span className="strip__item">
        <span className="strip__n">{s.totals.callable.toLocaleString("en-US")}</span>
        <span className="strip__label">answered a challenge we can pay here</span>
      </span>

      {collapsed && collapsed > 0 ? (
        <span className="strip__item">
          <span className="strip__n">{collapsed.toLocaleString("en-US")}</span>
          <span className="strip__label">collapsed by host, all on the register</span>
        </span>
      ) : null}

      <span className="strip__item">
        <Link href="/data" className="strip__label" style={{ textDecoration: "underline" }}>
          how we count
        </Link>
      </span>

      {/*
        The one part that is genuinely a sentence. A count that could not be
        established has a reason, and a reason does not compress into a figure.
      */}
      {!s.registry.registered.known ? (
        <span className="strip__item" style={{ borderRight: 0 }}>
          <span className="strip__label">{s.registry.registered.reason}</span>
        </span>
      ) : null}
    </div>
  );
}
