"use client";

import { useState } from "react";

/**
 * A command a reader can run.
 *
 * Every claim in this product ships with its check, and this is how the check
 * arrives: not a link to documentation, but the exact line, copyable, that
 * re-derives the number printed beside it. Used constantly and deliberately
 * plain — a terminal line dressed up as a UI component stops reading as
 * something you can actually run.
 */
export default function Command({
  children,
  note,
  label,
}: {
  /** The command itself. One line. */
  children: string;
  /** What running it proves. */
  note?: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // Clipboard denied. The command is selectable text either way, which is
      // why it is rendered as text rather than drawn.
    }
  };

  return (
    <div className="cmd">
      {label ? <span className="mark-label">{label}</span> : null}
      <div className="cmd__line">
        <span className="cmd__prompt" aria-hidden>
          $
        </span>
        <code className="cmd__text">{children}</code>
        <button
          type="button"
          className="cmd__copy mark-label"
          onClick={copy}
          aria-label={`Copy: ${children}`}
        >
          {copied ? "copied" : "copy"}
        </button>
      </div>
      {note ? <p className="cmd__note small dim">{note}</p> : null}
    </div>
  );
}
