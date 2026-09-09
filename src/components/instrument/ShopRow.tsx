import type { ShopAgent } from "@/lib/shops";

/**
 * Somebody else's agent, on our board, with a Hire button that works.
 *
 * This row is the argument. A register that lists three hundred thousand
 * agents and only lets you hire its own is a shop with a directory attached;
 * the hall is the thing, and the hall has tenants. So a competitor's agent
 * gets a real row, a real ticket and a real grant.
 *
 * What it does not get is a borrowed hallmark. There is no fineness here, no
 * alpha, no bond, because none of those exist for an agent that has never
 * staked anything with us, and inventing them would be the exact unearned
 * claim this product refuses. Instead the row carries three true things: who
 * operates it, what they have published about it (their words, linked), and
 * whether the contract behind it is verified.
 */
export default function ShopRow({
  shop,
  segment,
  houseName,
  index = 0,
}: {
  shop: ShopAgent;
  segment: string;
  houseName: string | null;
  index?: number;
}) {
  return (
    <li
      className="card agent-row reveal-scroll"
      style={{ ["--i" as string]: Math.min(index, 6), padding: "1rem 1.1rem" }}
    >
      <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: "15rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
            <span className="hd-3" style={{ fontSize: "var(--text-base)" }}>{shop.name}</span>
            <span className="chip">
              {shop.operator.name} · shop
            </span>
            {shop.silent ? (
              <span className="chip">silent</span>
            ) : shop.reached ? (
              /* We called it and it answered. Our measurement, not its card. */
              <span className="chip chip--live">
                <span className="dot dot--live" />
                reached{shop.latencyMs != null ? ` · ${shop.latencyMs} ms` : ""}
              </span>
            ) : (
              <span className="chip">endpoint advertised, not yet called</span>
            )}
            {shop.verified ? null : <span className="chip chip--fail">contract unverified</span>}
          </div>

          <p className="sub" style={{ fontSize: "var(--text-sm)", marginTop: "0.25rem" }}>
            {shop.silent
              ? "Registered on chain, but its card advertises no endpoint. Nothing has answered a call, so there is nothing to hire yet."
              : "Operated by someone else. No bond posted here, so we cannot slash it. You can revoke it in one tap."}
            {shop.siblings > 1 ? (
              <>
                {" "}
                Its holder wallet carries {shop.siblings} registrations, so it is one operator here
                rather than {shop.siblings}.
              </>
            ) : null}
          </p>

          {shop.caveat ? (
            <p className="meta" style={{ marginTop: "0.35rem", lineHeight: 1.45 }}>
              {shop.caveat}
              {shop.caveatSource ? (
                <>
                  {" "}
                  <a className="link-accent" href={shop.caveatSource} target="_blank" rel="noopener noreferrer">
                    their writeup ↗
                  </a>
                </>
              ) : null}
            </p>
          ) : null}
        </div>

        <div style={{ display: "flex", gap: "1.25rem", alignItems: "center", marginLeft: "auto", flexWrap: "wrap" }}>
          <div style={{ textAlign: "right" }}>
            <div className="meta">bond here</div>
            <div className="num" style={{ fontSize: "var(--text-base)", color: "var(--color-ink-3)" }}>none</div>
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <a href={`/agents/${shop.tokenId}`} className="btn btn--sm">View</a>
            {shop.silent ? (
              <span className="chip" title="Nothing has answered a call from this agent, so there is no authority to grant.">
                Hire off
              </span>
            ) : (
              <a href={`/hire/${shop.tokenId}?job=${segment}`} className="btn btn--sm">Hire</a>
            )}
          </div>
        </div>
      </div>

      {!shop.silent && houseName ? (
        <p className="meta" style={{ marginTop: "0.6rem", paddingTop: "0.55rem", borderTop: "1px solid var(--color-line)" }}>
          {houseName} is the bonded alternative in this job: it has posted its own capital and can be
          cut if it misses.
        </p>
      ) : null}
    </li>
  );
}
