"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A figure that rolls when the chain moves it.
 *
 * Only the characters that actually changed roll, and only vertically, for
 * 180ms. A whole number sliding on every re-render would be the animated
 * counter this system refuses; a single digit turning over is the market
 * telling you which digit moved.
 *
 * The string is rendered per character in a tabular monospace, so the roll
 * costs no layout and nothing beside it shifts.
 */
export default function Roll({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  const previous = useRef(value);
  const [changed, setChanged] = useState<Set<number>>(new Set());
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    if (previous.current === value) return;
    const before = previous.current;
    previous.current = value;

    // Right-aligned comparison: a figure that gains a digit has not changed
    // every column, it has shifted. Compare from the least significant end.
    const next = new Set<number>();
    const pad = Math.max(0, before.length - value.length);
    for (let i = 0; i < value.length; i++) {
      if (value[i] !== before[i + pad]) next.add(i);
    }
    setChanged(next);
    setGeneration((g) => g + 1);
  }, [value]);

  return (
    <span className={className ? `roll ${className}` : "roll"}>
      {[...value].map((ch, i) => (
        <span
          key={`${generation}-${i}`}
          className="roll__ch"
          data-rolling={changed.has(i) ? "1" : undefined}
        >
          {ch === " " ? " " : ch}
        </span>
      ))}
    </span>
  );
}
