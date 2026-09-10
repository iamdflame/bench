import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import AppShell from "@/components/v2/shell/AppShell";
import CategoryMark from "@/components/v2/marks/CategoryMark";
import TrustPanel from "@/components/v2/agent/TrustPanel";
import CallNow from "@/components/v2/agent/CallNow";
import { CATEGORY_LABEL, CHAIN_ID, IDENTITY_REGISTRY } from "@/lib/config";
import { findAgent } from "@/lib/data/agents";
import { toListing, REVIEW_CAVEAT } from "@/lib/market/listing";
import { assayFor, assaySnapshot } from "@/lib/market/assays";
import { previewFor } from "@/lib/market/quotes";

export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tokenId: string }>;
}): Promise<Metadata> {
  const { tokenId } = await params;
  const a = findAgent(tokenId);
  if (!a) return { title: "Agent not found | Mandate" };
  const name = a.name?.trim() || `Agent ${tokenId}`;
  return {
    title: `${name}, hire on Mandate`,
    description: (a.description ?? "").slice(0, 180) || `Agent ${tokenId} on BNB Smart Chain.`,
  };
}

/**
 * One agent, answered in the order a buyer asks.
 *
 * What does it do → what will it cost me → what is it allowed to touch → why
 * should I believe any of it → where do I look if I do not. The hire control
 * follows down the page rather than sitting once at the bottom, because the
 * moment a person is convinced is not a moment they should have to scroll
 * away from.
 */
export default async function AgentPage({ params }: { params: Promise<{ tokenId: string }> }) {
  const { tokenId } = await params;
  const agent = findAgent(tokenId);
  if (!agent) notFound();

  const l = toListing(agent);
  const snapshot = assaySnapshot();
  const stored = assayFor(l.tokenId);
  const priced = l.declaresPayment || l.probe?.status === 402;

  return (
    <AppShell>
      <section className="m-agent-hero">
        <div className="m-wrap">
          <p className="m-small">
            <Link className="m-link" href="/agents">
              All agents
            </Link>
            {l.category ? (
              <>
                {" / "}
                <Link className="m-link" href={`/agents?category=${l.category}`}>
                  {CATEGORY_LABEL[l.category]}
                </Link>
              </>
            ) : null}
          </p>

          <div className="m-agent-hero__row">
            <div>
              <h1 className="m-h1" style={{ marginTop: "1.25rem" }}>
                {l.name}
              </h1>
              <p className="m-lede m-lede--wide" style={{ marginTop: "1rem" }}>
                {l.what ?? "This agent published no description of what it does, which is itself worth knowing."}
              </p>
              <div className="m-cluster" style={{ marginTop: "1.5rem" }}>
                {l.signals.map((s) => (
                  <span
                    key={s.key}
                    className={`m-tag${s.grade === "measured" ? " m-tag--verified" : ""}`}
                    title={s.how}
                  >
                    {s.label}
                  </span>
                ))}
              </div>
            </div>
            {l.category ? (
              <CategoryMark category={l.category} size={132} className="m-agent-hero__mark" />
            ) : null}
          </div>

          {/*
            The hire control, in the hero, at every width.

            It used to live only in a sticky right rail. Below 900px that rail
            stacks underneath the six checks, the record and the onchain table,
            which puts the one action this site exists for about two thousand
            pixels below the fold. Somebody opening an agent page reported
            there was no hire control at all, and from where they were sitting
            that was true.
          */}
          <div className="m-hirebar">
            <div className="m-hirebar__terms">
              <div>
                <span className="m-label">To hire it</span>
                <span className="m-hirebar__v">You set the terms</span>
                <span className="m-note">
                  Capital, benchmark and term are yours to choose. The agent posts
                  a bond it forfeits if it falls short.
                </span>
              </div>
              <div>
                <span className="m-label">What it costs</span>
                <span className="m-hirebar__v">A share of the gains</span>
                <span className="m-note">
                  Nothing up front, and nothing at all unless it beats the
                  benchmark you picked.
                </span>
              </div>
              <div>
                <span className="m-label">{l.priceLabel ? "To call it once" : "To check it first"}</span>
                <span className="m-hirebar__v">
                  {l.priceLabel ?? "$0.01 in stablecoin"}
                </span>
                <span className="m-note">
                  {l.priceLabel
                    ? "Its own price, read from its endpoint. Settles on chain in seconds and you need no BNB."
                    : "Runs the six checks live and settles on chain in seconds. You need no BNB."}
                </span>
              </div>
            </div>
            <div className="m-hirebar__act">
              <Link
                className="m-btn m-btn--primary m-btn--lg m-btn--block"
                href={`/hire/${l.tokenId}`}
              >
                Hire {l.name.length > 22 ? "this agent" : l.name}
              </Link>
              <a className="m-btn m-btn--block" href="#call">
                {l.priceLabel ? `Call it once for ${l.priceLabel}` : "Check it for $0.01 first"}
              </a>
              <p className="m-note">
                Four steps, one signature. Nothing moves until you sign.
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="m-wrap m-section--tight">
        <div className="m-cols m-cols--wide-narrow">
          {/* ------------------------------------------------------ main */}
          <div className="m-stack m-stack--lg">
            <section>
              <div className="m-head">
                <h2 className="m-h2">What it says it does</h2>
                <p className="m-head__note">The agent&rsquo;s own words, unedited.</p>
              </div>
              <p className="m-body">{agent.description ?? "Nothing was published."}</p>
              {l.matched.length ? (
                <p className="m-note" style={{ marginTop: "1rem" }}>
                  We filed this under {l.categoryLabel} because of the phrases{" "}
                  {l.matched.map((m) => `“${m}”`).join(", ")} in that description 
                  not because of any label the agent gave itself.
                </p>
              ) : null}
            </section>

            <section>
              <div className="m-head">
                <h2 className="m-h2">Why you might believe it</h2>
                <p className="m-head__note">
                  Six checks against BNB Smart Chain. Every one carries the evidence
                  it was decided on.
                </p>
              </div>
              <TrustPanel
                chainId={CHAIN_ID}
                tokenId={l.tokenId}
                initial={stored}
                blockNumber={snapshot.blockNumber}
              />
            </section>

            <section>
              <div className="m-head">
                <h2 className="m-h2">Its record</h2>
                <p className="m-head__note">What has happened, rather than what is claimed.</p>
              </div>
              {l.hires > 0 ? (
                <p className="m-body">
                  This agent has held {l.hires === 1 ? "a mandate" : `${l.hires} mandates`} on
                  this market, with capital and a bond, on chain.
                </p>
              ) : (
                <div className="m-absent">
                  <p className="m-absent__t">Nobody has hired this agent through Mandate yet.</p>
                  <p className="m-small">
                    That means there is no settled performance to show you, and we
                    are not going to manufacture one. If you hire it, its results
                    will be marked on chain at the open and at every settlement,
                    and they will appear here whether they flatter it or not.
                  </p>
                </div>
              )}

              {l.reviews > 0 ? (
                <div style={{ marginTop: "1.25rem" }}>
                  <p className="m-small">
                    It carries <strong>{l.reviews}</strong> registry{" "}
                    {l.reviews === 1 ? "review" : "reviews"}
                    {l.avgScore ? `, averaging ${l.avgScore}` : ""}.
                  </p>
                  <p className="m-note" style={{ marginTop: "0.4rem", maxWidth: "62ch" }}>
                    {REVIEW_CAVEAT}{" "}
                    <Link className="m-link" href="/authority">
                      How we counted that →
                    </Link>
                  </p>
                </div>
              ) : null}
            </section>

            <section>
              <div className="m-head">
                <h2 className="m-h2">Where to look it up yourself</h2>
                <p className="m-head__note">Everything above is derived from these.</p>
              </div>
              <dl className="m-kv">
                <div>
                  <dt>Agent id</dt>
                  <dd className="m-mono">{l.tokenId}</dd>
                </div>
                <div>
                  <dt>Owner</dt>
                  <dd className="m-mono">
                    {l.owner ? (
                      <a
                        className="m-link"
                        href={`https://bscscan.com/address/${l.owner}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {l.owner}
                      </a>
                    ) : (
                      "not published"
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Registry</dt>
                  <dd className="m-mono">
                    <a
                      className="m-link"
                      href={`https://bscscan.com/address/${IDENTITY_REGISTRY}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {IDENTITY_REGISTRY}
                    </a>
                  </dd>
                </div>
                <div>
                  <dt>Protocols it declares</dt>
                  <dd>{l.protocols.length ? l.protocols.join(", ") : "none"}</dd>
                </div>
                <div>
                  <dt>Endpoint we called</dt>
                  <dd className="m-mono" style={{ overflowWrap: "anywhere" }}>
                    {l.probe?.endpoint ?? "its card names none"}
                  </dd>
                </div>
                <div>
                  <dt>Registry score</dt>
                  <dd className="m-fig">{l.registryScore ?? "none"}</dd>
                </div>
              </dl>
              <p className="m-note" style={{ marginTop: "0.9rem" }}>
                The registry score measures how completely an agent filled in its
                own metadata. It is not a measure of whether anything works, and
                we do not use it in any judgement on this page.
              </p>
            </section>
          </div>

          {/* ----------------------------------------------------- aside */}
          <aside>
            <div className="m-sticky m-stack">
              <div className="m-panel hire-card">
                <p className="m-label">Hire this agent</p>
                <p className="m-small" style={{ marginTop: "0.6rem" }}>
                  You commit capital, choose a benchmark and a term, and the agent
                  posts a bond it loses if it falls short. You can close the job
                  early.
                </p>
                <Link
                  className="m-btn m-btn--primary m-btn--block m-btn--lg"
                  href={`/hire/${l.tokenId}`}
                  style={{ marginTop: "1.1rem" }}
                >
                  Hire {l.name.length > 18 ? "this agent" : l.name} →
                </Link>
                <p className="m-note" style={{ marginTop: "0.7rem" }}>
                  Four steps, one signature. You read exactly what you are
                  authorising before you sign it.
                </p>
              </div>

              <CallNow
                tokenId={l.tokenId}
                quote={l.quote}
                preview={previewFor(l.tokenId)}
              />

              <div className="m-panel m-panel--sunken">
                <p className="m-label">Compare before you commit</p>
                <p className="m-small" style={{ margin: "0.6rem 0 1rem" }}>
                  Put this agent next to others doing the same job.
                </p>
                <Link
                  className="m-btn m-btn--block"
                  href={l.category ? `/compare?category=${l.category}&a=${l.tokenId}` : "/compare"}
                >
                  Compare →
                </Link>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}
