import Link from "next/link";
import CategoryMark from "@/components/v2/marks/CategoryMark";
import type { Listing } from "@/lib/market/listing";
import { hireHref, hirePath, primaryRail } from "@/lib/market/hire-law";

/**
 * One agent, in three sizes.
 *
 * The card offers a hire only when the hire law finds a rail this site can
 * honour: a price the agent quoted that we can pay, or a job in this market
 * the agent actually bids on. Otherwise it says why, in the place the button
 * would have been. It used to end every card in "Hire this agent", which for
 * an agent we do not operate opened a job only our own keeper ever bid on.
 *
 * Liveness is three states rather than two. An agent nobody has ever called is
 * not a silent agent, and printing "did not answer" over a number we never
 * dialled would be a false claim about somebody else's software. Agents that
 * did not answer stay listed, dimmed, never hidden.
 */

function Liveness({ l }: { l: Listing }) {
  if (l.liveness === "live") {
    const ms = l.probe?.latencyMs;
    return (
      <span className="m-card__signal" title={`We called ${l.probe?.endpoint}`}>
        <span className="m-dot m-dot--live" />
        Answered in {ms != null ? (ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`) : "time"}
      </span>
    );
  }
  if (l.liveness === "silent") {
    return (
      <span className="m-card__signal" title={`We called ${l.probe?.endpoint} and nothing came back`}>
        <span className="m-dot m-dot--cold" />
        Silent when called
      </span>
    );
  }
  if (l.liveness === "no-endpoint") {
    return (
      <span className="m-card__signal" title="Its registry card names no endpoint to call">
        <span className="m-dot m-dot--cold" />
        No endpoint published
      </span>
    );
  }
  return (
    <span className="m-card__signal" title="No request has been sent to this agent yet">
      <span className="m-dot m-dot--cold" />
      Not called yet
    </span>
  );
}

function Price({ l }: { l: Listing }) {
  if (l.quote?.payable) {
    return (
      <span className="m-card__signal">
        <span className="m-dot m-dot--live" />
        {l.priceLabel} a call
      </span>
    );
  }
  if (l.probe?.status === 402) {
    return (
      <span className="m-card__signal" title={l.quote?.unpayable ?? undefined}>
        <span className="m-dot" />
        Quoted a price we cannot pay
      </span>
    );
  }
  if (l.declaresPayment) {
    return (
      <span className="m-card__signal">
        <span className="m-dot" />
        Says it charges per call
      </span>
    );
  }
  return (
    <span className="m-card__signal">
      <span className="m-dot m-dot--cold" />
      No price quoted
    </span>
  );
}

export default function AgentCard({
  listing,
  variant = "standard",
  forPosition,
}: {
  listing: Listing;
  variant?: "feature" | "standard" | "row";
  /**
   * The wallet or position this card is being offered as a fix for.
   *
   * Carried into the hire link so the ticket opens knowing what it is being
   * hired about. Sending somebody from a diagnosed position to a blank form
   * makes them type back the thing they just pasted.
   */
  forPosition?: string;
}) {
  const href = `/agents/${listing.tokenId}`;
  const verdict = hirePath(listing);
  const act = hireHref(listing.tokenId, verdict, forPosition);
  const rail = primaryRail(verdict);
  const label =
    rail?.kind === "x402" ? `Call it for ${rail.price}` : forPosition ? "Hire for this position" : "Hire this agent";
  const dim = listing.liveness !== "live";

  if (variant === "row") {
    return (
      <div className={`m-row${dim ? " m-row--dim" : ""}`}>
        {listing.category ? <CategoryMark category={listing.category} size={34} /> : <span />}
        <span style={{ minWidth: 0 }}>
          <Link href={href} className="m-row__name">
            {listing.name}
          </Link>
          {verdict.ours ? <span className="m-ours"> operated by Mandate</span> : null}
          <span className="m-row__what" style={{ display: "block" }}>
            {listing.what ?? "This agent published no description."}
          </span>
        </span>
        {act ? (
          <Link className="m-btn m-btn--sm m-btn--primary" href={act}>
            {rail?.kind === "x402" ? "Call" : "Hire"}
          </Link>
        ) : (
          <Link className="m-btn m-btn--sm" href={href} title={verdict.reason ?? undefined}>
            Why not
          </Link>
        )}
      </div>
    );
  }

  return (
    <article className={`m-card${variant === "feature" ? " m-card--feature" : ""}${dim ? " m-card--dim" : ""}`}>
      <div className="m-card__top">
        <div style={{ minWidth: 0 }}>
          {listing.categoryLabel ? <span className="m-card__cat">{listing.categoryLabel}</span> : null}
          <Link href={href} className="m-card__name">
            {listing.name}
          </Link>
          {verdict.ours ? <span className="m-ours">operated by Mandate</span> : null}
        </div>
        {listing.category ? (
          <CategoryMark
            category={listing.category}
            size={variant === "feature" ? 72 : 44}
            className={listing.hires > 0 ? "m-mark--signal" : ""}
          />
        ) : null}
      </div>

      <p className="m-card__what">{listing.what ?? "This agent published no description of what it does."}</p>

      {variant === "feature" && listing.hires > 0 ? (
        <p className="m-small m-callout">
          The only agent on this market that has actually been hired. Its mandate,
          bond and settlement are all readable on chain.
        </p>
      ) : null}

      <div className="m-card__signals">
        <Liveness l={listing} />
        <Price l={listing} />
      </div>

      <div className="m-card__foot">
        <Link className="m-btn m-btn--sm" href={href}>
          What it does
        </Link>
        {act ? (
          <Link className="m-btn m-btn--sm m-btn--primary" href={act}>
            {label}
          </Link>
        ) : null}
      </div>
      {act ? null : <p className="m-card__why">{verdict.reason}</p>}
    </article>
  );
}
