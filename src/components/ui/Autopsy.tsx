import type { Autopsy } from "@/lib/autopsy";
import Command from "./Command";
import { EXPLORER } from "@/lib/config";

const fmt = (v: number | null, dp = 2) => (v === null ? "—" : v.toFixed(dp));

/**
 * The reputation autopsy.
 *
 * The official score, the score that survives de-duplication, and the wallets
 * responsible for the difference — with the command that reproduces it.
 *
 * The gap between the two figures is the whole argument. Publishing only the
 * corrected number would be a second unexplained score, which is the thing
 * this product exists to distrust; publishing both, with the evidence and a
 * command, lets a reader check instead of believe.
 */
export default function AutopsyPanel({ autopsy }: { autopsy: Autopsy }) {
  const a = autopsy;
  const inflated =
    a.officialScore !== null &&
    a.dedupedScore !== null &&
    Math.abs(a.officialScore - a.dedupedScore) > 0.005;
  const wiped = a.cleanFeedbacks === 0;
  const flaggedFeedbacks = Math.max(0, a.officialFeedbacks - a.cleanFeedbacks);
  /** The busiest flagged wallet sets the scale for the volume chart. */
  const peak = Math.max(1, ...a.flagged.map((f) => f.feedbacks));

  return (
    <section className="panel autopsy" aria-labelledby="autopsy-title">
      <div className="panel__head">
        <h2 id="autopsy-title" className="mark-label">
          Reputation autopsy
        </h2>
        <span className="mark-label">
          {a.populationRead
            ? `${a.populationSampled.toLocaleString()} reviewer profile${a.populationSampled === 1 ? "" : "s"} sampled`
            : "registry sample unavailable"}
        </span>
      </div>

      <div className="panel__body">
        <div className="au__scores">
          <div className="au__score">
            <span className="mark-label">Official explorer score</span>
            <span className="au__fig num">{fmt(a.officialScore, 2)}</span>
            <span className="au__note num">
              {a.officialFeedbacks} feedback{a.officialFeedbacks === 1 ? "" : "s"} ·{" "}
              {a.reviewers} wallet{a.reviewers === 1 ? "" : "s"}
            </span>
          </div>

          <span className="au__rule" aria-hidden />

          <div className="au__score au__score--after">
            <span className="mark-label">After de-duplication</span>
            <span className="au__fig num" data-wiped={wiped ? "1" : undefined}>
              {wiped ? "0.00" : fmt(a.dedupedScore, 2)}
            </span>
            <span className="au__note num">
              {wiped
                ? "nothing survives"
                : `${a.cleanFeedbacks} feedback${a.cleanFeedbacks === 1 ? "" : "s"} · ${a.cleanReviewers} wallet${a.cleanReviewers === 1 ? "" : "s"}`}
            </span>
          </div>
        </div>

        {a.officialFeedbacks > 0 ? (
          <>
            {/* Provenance of this agent's reputation, at 1:1 scale. */}
            <div className="au__prov" role="img"
              aria-label={`${flaggedFeedbacks} of ${a.officialFeedbacks} feedbacks written by flagged wallets`}>
              <span
                className="au__prov-seg au__prov-seg--flagged"
                style={{ flexGrow: flaggedFeedbacks }}
              />
              <span
                className="au__prov-seg au__prov-seg--clean"
                style={{ flexGrow: Math.max(0, a.cleanFeedbacks) }}
              />
            </div>
            <p className="au__caption num">
              {flaggedFeedbacks} of {a.officialFeedbacks} feedbacks written by wallets
              flagged as coordinated
              {a.flaggedShare > 0 ? ` · ${a.flaggedShare.toFixed(0)}%` : ""}
            </p>
          </>
        ) : null}

        {/*
          A de-duplication judged against a corpus of one is not a
          de-duplication. When the registry-wide walk fails, the page says so
          and offers no verdict — the same standard it holds the registry to.
        */}
        {!a.populationRead ? (
          <p className="small au__unread">
            The registry-wide feedback corpus could not be read — the upstream index
            returned a database error — so coordination could only be judged against this
            agent&rsquo;s own {a.reviewers} reviewer{a.reviewers === 1 ? "" : "s"}. That is
            not enough to draw a conclusion from, and none is drawn: the two figures above
            are the same number because nothing was removed, not because nothing was
            wrong. Run the command below when the index recovers.
          </p>
        ) : null}

        {a.populationRead && a.flagged.length ? (
          <>
            <p className="small au__lede">
              {a.flagged.length} of this agent&rsquo;s {a.reviewers} reviewer
              {a.reviewers === 1 ? "" : "s"} {a.flagged.length === 1 ? "is" : "are"} part
              of a coordinated cohort, judged against{" "}
              {a.populationSampled.toLocaleString()} reviewer profiles across the registry
              rather than this agent alone — a wallet that left one review here is
              unremarkable until you see the two hundred it left elsewhere.
            </p>

            {/* Registry-wide volume. The signal is the shape, not the score. */}
            <ul className="au__flagged">
              {a.flagged.slice(0, 8).map((f) => (
                <li key={f.address} className="au__flagged-row">
                  <a
                    className="au__addr num"
                    href={`${EXPLORER}/address/${f.address}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {f.address.slice(0, 10)}…{f.address.slice(-4)}
                  </a>
                  <span className="au__flagged-bar">
                    <i style={{ width: `${(f.feedbacks / peak) * 100}%` }} />
                  </span>
                  <span className="au__flagged-fig num">
                    {f.feedbacks} across {f.agentsReviewed}
                  </span>
                </li>
              ))}
            </ul>

            {a.reasons.length ? (
              <ul className="au__reasons">
                {a.reasons.map((r) => (
                  <li key={r} className="num">
                    {r}
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ) : a.populationRead ? (
          <p className="small au__lede">
            No coordinated cohort found among this agent&rsquo;s reviewers, judged against{" "}
            {a.populationSampled.toLocaleString()} reviewer profile
            {a.populationSampled === 1 ? "" : "s"} across the registry.{" "}
            {inflated ? "" : "The official score stands."}
          </p>
        ) : null}

        <Command
          note={`Thresholds: Jaccard ${a.thresholds.jaccard}, cardinality tolerance ${a.thresholds.cardinalityTolerance}, cohort minimum ${a.thresholds.cohortMin}.${a.populationRead ? "" : " Reads the registry corpus directly, so it succeeds where this page could not."}`}
        >
          {a.reproduce}
        </Command>
      </div>
    </section>
  );
}
