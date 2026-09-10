import Link from "next/link";
import CategoryMark from "@/components/v2/marks/CategoryMark";
import type { Listing } from "@/lib/market/listing";

/**
 * One agent, in three sizes, each carrying a hire control.
 *
 * The card used to end at "Details", which put two taps between a person and
 * the only action this site exists for. Every card now offers the hire
 * directly, and the row above it is the evidence for taking it: whether the
 * endpoint answered when we called, how fast, and how it can be paid.
 *
 * Liveness is three states rather than two. An agent nobody has ever called is
 * not a silent agent, and printing "did not answer" over a number we never
 * dialled would be a false claim about somebody else's software.
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
  if (l.probe?.status === 402) {
    return (
      <span className="m-card__signal">
        <span className="m-dot m-dot--live" />
        Quoted us a price
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
      Bond only
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
  const hireHref = forPosition
    ? `/hire/${listing.tokenId}?about=${encodeURIComponent(forPosition)}`
    : `/hire/${listing.tokenId}`;

  if (variant === "row") {
    return (
      <div className="m-row">
        {listing.category ? <CategoryMark category={listing.category} size={34} /> : <span />}
        <span style={{ minWidth: 0 }}>
          <Link href={href} className="m-row__name">
            {listing.name}
          </Link>
          <span className="m-row__what" style={{ display: "block" }}>
            {listing.what ?? "This agent published no description."}
          </span>
        </span>
        <Link className="m-btn m-btn--sm m-btn--primary" href={hireHref}>
          Hire
        </Link>
      </div>
    );
  }

  return (
    <article className={`m-card${variant === "feature" ? " m-card--feature" : ""}`}>
      <div className="m-card__top">
        <div style={{ minWidth: 0 }}>
          {listing.categoryLabel ? (
            <span className="m-card__cat">{listing.categoryLabel}</span>
          ) : null}
          <Link href={href} className="m-card__name">
            {listing.name}
          </Link>
        </div>
        {listing.category ? (
          <CategoryMark
            category={listing.category}
            size={variant === "feature" ? 72 : 44}
            className={listing.hires > 0 ? "m-mark--signal" : ""}
          />
        ) : null}
      </div>

      <p className="m-card__what">
        {listing.what ?? "This agent published no description of what it does."}
      </p>

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
        <Link className="m-btn m-btn--sm m-btn--primary" href={hireHref}>
          {forPosition ? "Hire for this position" : "Hire this agent"}
        </Link>
      </div>
    </article>
  );
}
