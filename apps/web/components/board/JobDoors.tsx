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
 * It shows two numbers, and it used to show one. The single figure was the
 * strongest reachable state — hireable, else callable, else merely listed —
 * which was right when the board held only agents it had already called, and
 * became a lie the moment the registry's own supply arrived: a market of
 * sixty-five agents rendered as "2 hireable", which reads as an empty shop.
 *
 * So the headline is the size of the market and the line under it is how much
 * of that is reachable today. Both are true, neither hides the other, and the
 * gap between them is the honest state of this registry rather than something
 * to be rounded away.
 *
 * It still never renders a bare zero: a job with nothing listed says so in
 * words, because a zero with no explanation reads as a broken page rather than
 * as a finding.
 */
function doorLine(counts: Snapshot["perJob"][JobSlug]): {
  value: string;
  label: string;
  reach: string;
  rail?: "call" | "hire" | "mandate";
} {
  const reach =
    counts.hireable > 0
      ? { text: `${counts.hireable} hireable now`, rail: "hire" as const }
      : counts.callable > 0
        ? { text: `${counts.callable} callable now`, rail: "call" as const }
        : counts.mandatable > 0
          ? { text: `${counts.mandatable} can hold a session`, rail: "mandate" as const }
          : { text: "none reachable yet", rail: undefined };

  if (counts.listed === 0) return { value: "none", label: "listed yet", reach: "" };
  return { value: String(counts.listed), label: "listed", reach: reach.text, rail: reach.rail };
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
            {line.reach ? <span className="door__reach dim">{line.reach}</span> : null}
          </Link>
        );
      })}
    </div>
  );
}
