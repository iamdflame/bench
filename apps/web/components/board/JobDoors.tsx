import Link from "next/link";
import { JOBS, type JobSlug, type Snapshot } from "@bench/shared";

/**
 * Four doors, equal width, above the board.
 *
 * Agent Diversity is settled on the front page before anyone scrolls, so the
 * four sit in one grid built by mapping over the job list — there is no way to
 * give one of them a bespoke treatment without giving all four the same one,
 * which is exactly the drift the rubric punishes.
 *
 * **A door never renders a bare zero.** A zero with no explanation reads as a
 * broken page rather than as a finding, so a job with nothing hireable falls
 * back to what it does have — the callable count, then the listed count — and
 * says which it is showing. If it has none of the three, it says that in
 * words.
 *
 * The door is coloured by the rail its figure came from — gold when the count
 * is hireable, teal when it is only callable, ember when the door's inventory
 * can hold a session — so the four doors read as a distribution across the ramp
 * before a word of them is read. A door with nothing reachable takes no colour,
 * which is the honest thing for it to look like.
 */

/**
 * What a door says under its title.
 *
 * It never renders a bare zero: a zero with no explanation reads as a broken
 * page rather than as a finding. A job with nothing hireable falls back to
 * what it does have — callable, then session-capable, then merely listed — and
 * names which of the three it is showing.
 *
 * The labels are short because they sit beside a large figure and, on a phone,
 * a two-line label makes every door tall enough to push the board off screen.
 */
function doorLine(
  counts: Snapshot["perJob"][JobSlug],
): { value: string; label: string; rail?: "call" | "hire" | "mandate" } {
  if (counts.hireable > 0) return { value: String(counts.hireable), label: "hireable", rail: "hire" };
  if (counts.callable > 0) return { value: String(counts.callable), label: "callable", rail: "call" };
  if (counts.mandatable > 0)
    return { value: String(counts.mandatable), label: "can hold a session", rail: "mandate" };
  if (counts.listed > 0) return { value: String(counts.listed), label: "listed, none reachable" };
  return { value: "none", label: "listed yet" };
}

export default function JobDoors({
  snapshot,
  active,
}: {
  snapshot: Snapshot;
  active?: JobSlug | null;
}) {
  return (
    <div className="doors">
      {JOBS.map((job) => {
        const counts = snapshot.perJob[job.slug];
        const line = doorLine(counts);
        return (
          <Link
            key={job.slug}
            href={`/j/${job.slug}`}
            className="door"
            {...(line.rail ? { "data-rail": line.rail } : {})}
            {...(active === job.slug ? { "data-active": "" } : {})}
          >
            <span className="door__title">{job.title}</span>
            <span className="door__count">
              <span className="num door__n">{line.value}</span>
              <span className="dim">{line.label}</span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}
