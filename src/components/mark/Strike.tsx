"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The strike — the signature interaction of the product.
 *
 * A mark does not fade in. It is struck: the punch descends under its own
 * mass, lands, the row takes the impact, and the heat bleeds out of the metal.
 * The timing is in `globals.css` and is not negotiable — 260ms total, with the
 * impact at 90ms.
 *
 * Two rules keep this from becoming decoration:
 *
 *   1. Nothing moves unless the chain moved. `when` is the key of the event
 *      that caused the strike (a block, a tx hash, an assay timestamp). The
 *      animation runs when that key *changes*, never on a route render.
 *   2. It never runs on first paint unless the caller asks. A page full of
 *      punches landing on load is exactly the counter-driven ornament this
 *      system refuses.
 */
export default function Strike({
  when,
  onMount = false,
  children,
  className,
}: {
  /** The chain event this strike belongs to. A change here strikes the mark. */
  when?: string | number | null;
  /** Strike on first paint. Only for a mark that is itself the whole screen. */
  onMount?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const [striking, setStriking] = useState(false);
  const previous = useRef<string | number | null | undefined>(onMount ? undefined : when);

  useEffect(() => {
    if (previous.current === when) return;
    const first = previous.current === undefined && !onMount;
    previous.current = when;
    if (first) return;
    setStriking(true);
  }, [when, onMount]);

  return (
    <span
      className={className ? `strike ${className}` : "strike"}
      data-striking={striking ? "1" : undefined}
      onAnimationEnd={() => setStriking(false)}
    >
      {children}
    </span>
  );
}
