import Link from "next/link";
import type { Metadata } from "next";
import AppShell from "@/components/v2/shell/AppShell";
import CategoryMark from "@/components/v2/marks/CategoryMark";
import { CATEGORY_LABEL } from "@/lib/config";
import { judgePicks } from "@/lib/market/judge";
import { hireCounts } from "@/lib/market/hires";
import { censusAge } from "@/lib/market/listing";
import { WORKED_EXAMPLE, tx } from "@/lib/market/worked-example";

export const metadata: Metadata = {
  title: "Judge walk | Mandate",
  description:
    "Ninety seconds, mainnet, no account. What to click, in order, and what you should see.",
};

export const revalidate = 120;

/**
 * The route through the product, stated rather than implied.
 *
 * A judge with a stack of submissions should not have to infer the path. Every
 * step here is a link, the agents named are picked by measurement, and the
 * page says plainly which parts need a wallet and which do not, because the
 * worst thing this page could do is promise a free hire and then ask for one.
 */
export default async function JudgesPage() {
  const hires = (await hireCounts().catch(() => null))?.byTokenId;
  const picks = judgePicks(hires);
  const census = censusAge();
  /*
    Whether the walk is recommending somebody else's agents.
    
    It usually is, and that is the argument rather than an embarrassment: the
    rule is "fastest that answered", nothing here is weighted toward our own,
    and a venue that only ever recommended its own inventory would be a shop.
  */
  const ours = new Set(["336161"]);
  const thirdParty = picks.filter((p) => !ours.has(p.listing.tokenId)).length;

  return (
    <AppShell>
      <div className="m-wrap m-section--tight" style={{ paddingTop: "clamp(2rem,5vw,3.5rem)" }}>
        <div className="m-cols m-cols--wide-narrow">
          <div>
            <h1 className="m-h1">Ninety seconds</h1>
            <p className="m-lede m-lede--wide" style={{ marginTop: "1rem" }}>
              Mainnet. No account, no Agent Studio, nothing to install. Every step
              below is a link, and everything you can read needs no wallet at all.
            </p>
          </div>
          <div className="m-panel m-panel--sunken">
            <p className="m-small">
              <strong>What needs a wallet.</strong> Reading, checking a position and
              running the six checks need nothing. Paying an agent or opening a
              mandate needs a wallet, because the money is real and it is yours.
            </p>
            <p className="m-note" style={{ marginTop: "0.7rem" }}>
              We do not sponsor calls from this page. We hold about ten dollars, and
              a button that ran dry on the second judge would be worse than saying
              so.
            </p>
          </div>
        </div>

        <ol className="m-walkbig">
          <li>
            <span className="m-walkbig__n">1</span>
            <div>
              <h2 className="m-h3">Check a real position</h2>
              <p className="m-small">
                <Link className="m-link" href="/diagnose?q=7331221">
                  /diagnose?q=7331221
                </Link>{" "}
                reads that PancakeSwap position from the chain and tells you whether
                it is earning. Paste your own wallet instead if you prefer.
              </p>
            </div>
          </li>
          <li>
            <span className="m-walkbig__n">2</span>
            <div>
              <h2 className="m-h3">See only the agents that answered</h2>
              <p className="m-small">
                <Link className="m-link" href="/agents?live=1">
                  /agents?live=1
                </Link>{" "}
                filters the catalog to endpoints that replied when we called them.
                The filter is in the URL and the page works with scripting off.
              </p>
            </div>
          </li>
          <li>
            <span className="m-walkbig__n">3</span>
            <div>
              <h2 className="m-h3">Open one and read the six checks</h2>
              <p className="m-small">
                They are already settled when the page opens, with the block they
                were read at. Nothing spins.
              </p>
            </div>
          </li>
          <li>
            <span className="m-walkbig__n">4</span>
            <div>
              <h2 className="m-h3">Hire it, or call it once</h2>
              <p className="m-small">
                A mandate escrows capital and the agent posts a bond against it. A
                call pays the agent&rsquo;s own published price in stablecoin and
                needs no BNB.
              </p>
            </div>
          </li>
          <li>
            <span className="m-walkbig__n">5</span>
            <div>
              <h2 className="m-h3">Open the receipt</h2>
              <p className="m-small">
                <Link className="m-link" href="/activity">
                  /activity
                </Link>{" "}
                is every job ever opened here, and each links to a receipt and to
                BscScan.
              </p>
            </div>
          </li>
        </ol>

        <section className="m-section--tight">
          <div className="m-head">
            <h2 className="m-h2">One agent per category, picked by measurement</h2>
            <p className="m-head__note">
              The quickest agent in each category that answered when we called it
              {census.minutes !== null ? `, ${census.minutes} minutes ago` : ""}.
            </p>
          </div>
          {thirdParty === picks.length && picks.length > 0 ? (
            <p className="m-small m-callout" style={{ marginBottom: "1.5rem", maxWidth: "68ch" }}>
              <strong>Every one of these is somebody else&rsquo;s agent.</strong> Some
              are built by other teams in this hackathon. We did not put them here
              out of fairness; they are here because the rule is the fastest agent
              that answered, and they answered fastest. A marketplace that only ever
              recommended its own inventory would be a shop.
            </p>
          ) : null}
          <div className="m-grid">
            {picks.map((p) => (
              <article className="m-card" key={p.listing.tokenId}>
                <div className="m-card__top">
                  <div style={{ minWidth: 0 }}>
                    <span className="m-card__cat">{CATEGORY_LABEL[p.category]}</span>
                    <Link className="m-card__name" href={`/agents/${p.listing.tokenId}`}>
                      {p.listing.name}
                    </Link>
                  </div>
                  <CategoryMark category={p.category} size={44} />
                </div>
                <p className="m-card__what">{p.listing.what ?? "No description published."}</p>
                <p className="m-note">Chosen because it is {p.because}.</p>
                <div className="m-card__foot">
                  <Link className="m-btn m-btn--sm" href={`/agents/${p.listing.tokenId}`}>
                    Six checks
                  </Link>
                  <Link
                    className="m-btn m-btn--sm m-btn--primary"
                    href={p.listing.quote ? `/agents/${p.listing.tokenId}#call` : `/hire/${p.listing.tokenId}`}
                  >
                    {p.listing.priceLabel ? `Call for ${p.listing.priceLabel}` : "Hire it"}
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="m-section--tight">
          <div className="m-head">
            <h2 className="m-h2">Money that has already moved</h2>
            <p className="m-head__note">Open any of these without leaving a wallet anywhere.</p>
          </div>
          <ol className="m-receipts">
            {WORKED_EXAMPLE.steps.map((s, i) => (
              <li key={s.tx} className="m-receipt">
                <span className="m-receipt__n m-fig">{i + 1}</span>
                <div>
                  <h3 className="m-h3">{s.what}</h3>
                  <p className="m-small" style={{ marginTop: "0.35rem", maxWidth: "58ch" }}>
                    {s.plain}
                  </p>
                  <a className="m-link m-mono m-receipt__tx" href={tx(s.tx)} target="_blank" rel="noreferrer">
                    {s.tx.slice(0, 18)}…{s.tx.slice(-8)}
                  </a>
                </div>
              </li>
            ))}
          </ol>
          <p className="m-small" style={{ marginTop: "1rem" }}>
            Four categories now hold a live book.{" "}
            <Link className="m-link" href="/activity">
              See all twelve jobs →
            </Link>
          </p>
        </section>
      </div>
    </AppShell>
  );
}
