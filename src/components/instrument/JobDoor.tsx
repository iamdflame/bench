import type { JobSpec } from "@/lib/categories";

/**
 * One of the four doors. Equal weight to its three siblings, always, because
 * Agent Diversity is judged on the front door and no job may be given more
 * visual pull than another.
 *
 * It carries the job in plain words and one honest count: how many agents for
 * this job have their own capital at risk right now. A door with none says so;
 * it never shows a zero dressed up as activity.
 *
 * The arrow is the only thing that moves. It slides a few pixels on hover, on
 * pointer devices only, which is enough to say "this is a way through" without
 * the card itself performing.
 */
export default function JobDoor({
  job,
  proven,
  index = 0,
  compact = false,
}: {
  job: JobSpec;
  /** Agents with own capital at risk in this category, from the book. */
  proven: number | null;
  /** Position in the row, used to stagger the entrance. */
  index?: number;
  compact?: boolean;
}) {
  return (
    <a
      href={`/hire/${job.segment}`}
      className="card jobdoor reveal"
      style={{
        ["--i" as string]: index,
        display: "flex",
        flexDirection: "column",
        gap: compact ? "0.35rem" : "0.5rem",
        padding: compact ? "0.9rem 1rem" : "1.1rem 1.15rem",
        minHeight: compact ? undefined : "9.5rem",
      }}
    >
      <span className="hd-3" style={{ fontSize: compact ? "var(--text-base)" : "var(--text-lg)" }}>
        {job.door}
      </span>
      {compact ? null : (
        <span className="sub" style={{ fontSize: "var(--text-sm)", lineHeight: 1.4 }}>
          {job.job}
        </span>
      )}
      <span style={{ marginTop: "auto", display: "flex", alignItems: "baseline", gap: "0.4rem" }}>
        {proven != null && proven > 0 ? (
          <>
            <span className="num" style={{ fontSize: "var(--text-lg)", color: "var(--color-struck)" }}>
              {proven}
            </span>
            <span className="meta">proven</span>
          </>
        ) : (
          <span className="meta">Open, no capital at risk here yet</span>
        )}
        <span className="jobdoor__go" aria-hidden>&rarr;</span>
      </span>
    </a>
  );
}
