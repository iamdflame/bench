"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The fineness reveal.
 *
 * When an assay lands the numeral counts up from zero over 400ms. It runs on
 * the result arriving, never on a route render — nothing moves unless the
 * chain moved — and it is rendered tabular so the figure occupies its final
 * width from the first frame and nothing beside it reflows.
 *
 * Under `prefers-reduced-motion` the token collapses to 0ms and the final
 * value is painted immediately, which is the correct end state rather than a
 * degraded one.
 */
export default function CountUp({
  value,
  className,
}: {
  value: number | null;
  className?: string;
}) {
  const [shown, setShown] = useState<number | null>(value);
  const from = useRef<number | null>(value);

  useEffect(() => {
    if (value === null) {
      setShown(null);
      from.current = null;
      return;
    }
    if (from.current === value) return;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      from.current = value;
      setShown(value);
      return;
    }

    const start = performance.now();
    const duration = 400;
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // Decelerating: the count arrives rather than stopping dead.
      const eased = 1 - (1 - t) ** 3;
      setShown(Math.round(value * eased));
      if (t < 1) raf = requestAnimationFrame(step);
      else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return <span className={className}>{shown === null ? "—" : shown}</span>;
}
