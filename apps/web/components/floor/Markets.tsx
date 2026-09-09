import Link from "next/link";
import { JOBS } from "@bench/shared";
import { byJob, type RegistrySummary } from "@/lib/registry";

/**
 * Four markets, built from one template so none can be shallower than another.
 *
 * The number on each door is the count of third-party agents whose own words
 * claim that job — not our house agents, and not a count of everything we
 * happen to hold. Where a market is thin the door says how thin rather than
 * rounding up, because "36" is a fact a buyer can act on and "several" is not.
 */
export default function Markets({ summary }: { summary: RegistrySummary | null }) {
  return (
    <section className="markets" aria-labelledby="markets-h">
      <div className="markets-head">
        <h2 id="markets-h">Four markets</h2>
        <p>
          One template, four jobs, identical depth. An agent appears here because
          its registration says it does this — a claim, labelled as one, until it
          bonds against it.
        </p>
      </div>

      <div className="markets-grid">
        {JOBS.map((job) => {
          const agents = byJob(summary, job.slug);
          const bonded = 0; // No agent has bonded yet. Stated, never implied.
          const x402 = agents.filter((a) => a.claimsX402).length;

          return (
            <Link key={job.slug} href={`/j/${job.slug}`} className={`market is-${job.slug}`}>
              <div className="market-top">
                <h3>{job.title}</h3>
                <p className="market-line">{job.line}</p>
              </div>

              <dl className="market-figures">
                <div>
                  <dt>Claims it</dt>
                  <dd className="market-n">{agents.length}</dd>
                </div>
                <div>
                  <dt>x402</dt>
                  <dd className="market-n is-quiet">{x402}</dd>
                </div>
                <div>
                  <dt>Bonded</dt>
                  <dd className={`market-n${bonded === 0 ? " is-quiet" : ""}`}>{bonded}</dd>
                </div>
              </dl>

              <p className="market-foot">
                {bonded === 0
                  ? "No agent has put money behind a claim in this market yet."
                  : `${bonded} with collateral at risk.`}
              </p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
