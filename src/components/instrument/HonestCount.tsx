/**
 * A figure that never lies about its own freshness.
 *
 * Every number on this site is a reading taken at a block and an age, and the
 * whole product's credibility rests on never presenting a cached figure as a
 * live one. So a count carries where it came from, and, the part that matters
 *, it renders three different absences differently:
 *
 *   value present            the number, with its block and age beneath it.
 *   value null, measured     "none", a real, current reading of zero.
 *   value null, unread       "couldn't read", the source did not answer. This
 *                            is a statement about the provider, not the subject,
 *                            and it is never allowed to look like a zero.
 */
export function ago(at: string | number | Date | null | undefined): string {
  if (at == null) return "at an unrecorded time";
  const ms = Date.now() - new Date(at).getTime();
  if (!Number.isFinite(ms)) return "at an unrecorded time";
  if (ms < 0) return "just now";
  const m = Math.round(ms / 60_000);
  if (m < 1) return "moments ago";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function blockLabel(block: bigint | number | string | null | undefined): string | null {
  if (block == null) return null;
  const n = typeof block === "bigint" ? Number(block) : Number(block);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n >= 1_000_000) return `block ${(n / 1000).toFixed(0)}k`;
  return `block ${n.toLocaleString()}`;
}

export default function HonestCount({
  value,
  label,
  unit,
  block,
  at,
  unread = false,
  size = "md",
  emptyWord = "none",
}: {
  value: number | string | null | undefined;
  label?: string;
  unit?: string;
  block?: bigint | number | string | null;
  at?: string | number | Date | null;
  /** The source did not answer. Distinct from a measured zero/none. */
  unread?: boolean;
  size?: "sm" | "md" | "lg";
  /** What a measured absence says. "none", "0", "no epoch settled"… */
  emptyWord?: string;
}) {
  const present = value != null && value !== "";
  const numSize =
    size === "lg" ? "var(--text-3xl)" : size === "sm" ? "var(--text-lg)" : "var(--text-2xl)";

  const blk = blockLabel(block);
  const stampParts = [blk, at != null ? `read ${ago(at)}` : null].filter(Boolean);
  const stamp = stampParts.join(" · ");

  return (
    <div>
      {label ? <div className="meta" style={{ marginBottom: "0.15rem" }}>{label}</div> : null}
      {unread ? (
        <div
          className="num"
          style={{ fontSize: numSize, color: "var(--color-ink-3)", fontStyle: "italic" }}
          title="The source did not answer. This is not a zero."
        >
          couldn&rsquo;t read
        </div>
      ) : present ? (
        <div className="num" style={{ fontSize: numSize, color: "var(--color-touchstone)", lineHeight: 1.05 }}>
          {typeof value === "number" ? value.toLocaleString() : value}
          {unit ? <span style={{ fontSize: "0.5em", color: "var(--color-ink-3)", marginLeft: "0.25em" }}>{unit}</span> : null}
        </div>
      ) : (
        <div className="num" style={{ fontSize: numSize, color: "var(--color-ink-3)" }}>
          {emptyWord}
        </div>
      )}
      {stamp ? <div className="meta" style={{ marginTop: "0.2rem" }}>{stamp}</div> : null}
    </div>
  );
}
