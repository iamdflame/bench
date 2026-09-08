import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  RAILS,
  RAIL_COPY,
  REFUSAL_TEXT,
  addressUrl,
  jobBySlug,
  resolveChain,
  tokenUrl,
  type RailName,
  type RailRefusal,
} from "@bench/shared";
import Nav from "@/components/board/Nav";
import Footer from "@/components/board/Footer";
import { findRow } from "@/lib/board";
import ForYourPosition, { PositionForm } from "@/components/board/ForYourPosition";
import Ladder from "@/components/board/Ladder";
import { Suspense } from "react";

/*
  Every agent in the registry has a page, so this route is dynamic and the
  lookup falls through to the chain when the crawl has not reached an id yet.
  A marketplace that 404s on an id a competitor is pitching is not the front
  door for every agent on this chain.
*/
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ chain: string; id: string }>;
}): Promise<Metadata> {
  const { chain, id } = await params;
  const { chainId } = resolveChain(chain);
  const hit = findRow(chainId, decodeURIComponent(id));
  return {
    title: hit ? hit.row.name : `Agent ${decodeURIComponent(id)}`,
    description: hit?.row.description?.slice(0, 180) ?? "An agent on BNB Smart Chain, with what it can actually do.",
  };
}

export default async function AgentPage({
  params,
  searchParams,
}: {
  params: Promise<{ chain: string; id: string }>;
  searchParams: Promise<{ position?: string }>;
}) {
  const { chain, id: rawId } = await params;
  const { position } = await searchParams;
  const { chainId } = resolveChain(chain);
  const id = decodeURIComponent(rawId);
  const hit = findRow(chainId, id);

  if (!hit) {
    return (
      <>
        <Nav />
        <main className="shell" style={{ paddingBlock: 40, maxWidth: "72ch" }}>
          <h1 className="h1">We have not read this one yet.</h1>
          <p className="prose" style={{ marginTop: 12 }}>
            Token <span className="num">{id}</span> is not in the part of the registry this deployment has
            crawled. That is a statement about our crawl, not about the agent: the registry is read
            continuously, walking back from the head, and the depth reached so far is on{" "}
            <Link href="/data" className="nav__link" style={{ textDecoration: "underline" }}>
              the data page
            </Link>
            .
          </p>
          <p className="prose" style={{ marginTop: 12 }}>
            You can read it directly from the chain in the meantime.
          </p>
          <p style={{ marginTop: 16 }}>
            <a className="btn" href={tokenUrl(chainId, "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432", id)}>
              Open it on BscScan
            </a>
          </p>
        </main>
        <Footer />
      </>
    );
  }

  const { row, agent, service } = hit;
  const job = row.job ? jobBySlug(row.job) : null;
  const anyOpen = RAILS.some((r) => row.rails[r].open);

  return (
    <>
      <Nav />
      <main className="shell" style={{ paddingBlock: 28 }}>
        {/* ------------------------------------------------------ who it is */}
        <section style={{ maxWidth: "78ch" }}>
          <div className="row wrap" style={{ gap: 10 }}>
            <h1 className="h1">{row.name}</h1>
            {row.isOurs ? <span className="chip chip--ours">operated by BENCH</span> : null}
            {job ? (
              <Link href={`/j/${job.slug}`} className="chip">
                {job.title}
              </Link>
            ) : (
              <span className="chip chip--refused">unclassified</span>
            )}
          </div>

          <p className="provenance" style={{ marginTop: 8 }}>
            {row.tokenId ? (
              <>
                ERC-8004 · <span className="num">{chainId}:{row.tokenId}</span>
              </>
            ) : (
              <>a paid endpoint indexed by B402, with no on-chain agent identity</>
            )}
            {row.address ? (
              <>
                {" · "}
                <a className="nav__link" href={addressUrl(chainId, row.address)} style={{ textDecoration: "underline" }}>
                  {row.address.slice(0, 8)}…{row.address.slice(-6)}
                </a>
              </>
            ) : null}
          </p>

          <p className="lede" style={{ marginTop: 14 }}>
            {agent?.description ||
              service?.description ||
              "Its registration carries no description, so there is nothing here it claims about itself."}
          </p>

          {row.jobReason ? (
            <p className="provenance" style={{ marginTop: 8 }}>
              Not filed under a job: {row.jobReason}
            </p>
          ) : null}
        </section>

        {/* -------------------------------------------- what it would have done */}
        {/*
          The plan's first discontinuity, and the only question a person
          actually has: not what this agent says about itself, but what it would
          have done to their money. It sits directly under the name, above the
          record and above the rails, because everything below it is context for
          this.
        */}
        <section className="panel" style={{ marginTop: 22, padding: 18 }} aria-labelledby="cf-h">
          <h2 id="cf-h" className="h3" style={{ fontSize: "var(--text-sm)" }}>
            What this would have done to your position
          </h2>
          <p className="prose" style={{ marginTop: 8, maxWidth: "76ch" }}>
            Replayed against the real trades in your own pool — every swap, the fees they actually paid,
            gas at the price the chain quoted, and the cost of the swap a recentre needs. Losses are shown
            the same way gains are.
          </p>

          <PositionForm action={`/a/${chainId}/${encodeURIComponent(id)}`} address={position} />

          {position ? (
            <Suspense
              fallback={
                <p className="provenance" style={{ marginTop: 14 }}>
                  Walking the pool&rsquo;s swaps. This takes a few seconds — it is reading every trade in the
                  window rather than an average of them.
                </p>
              }
            >
              <ForYourPosition chainId={chainId} address={position} />
            </Suspense>
          ) : (
            <p className="provenance" style={{ marginTop: 12 }}>
              No address given, so nothing is replayed. The scheduled run against a synthetic position is on{" "}
              <Link href="/data" className="nav__link" style={{ textDecoration: "underline" }}>
                /data
              </Link>
              .
            </p>
          )}
        </section>

        {/* ------------------------------------------- what it has done */}
        <section className="panel" style={{ marginTop: 22, padding: 18 }} aria-labelledby="did-h">
          <h2 id="did-h" className="meta" style={{ marginBottom: 12 }}>
            What it has actually done
          </h2>
          {agent && agent.track.length > 0 ? (
            <div style={{ display: "grid", gap: 18, gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))" }}>
              {agent.track.map((m) => (
                <div key={m.name} className="metric">
                  <span className="metric-value">
                    {m.value.toLocaleString("en-US", {
                      minimumFractionDigits: m.unit === "count" ? 0 : m.unit === "%" ? 1 : 2,
                      maximumFractionDigits: m.unit === "count" ? 0 : m.unit === "%" ? 1 : 2,
                    })}
                    {m.unit === "%" ? "%" : m.unit === "count" || m.unit === "ratio" ? "" : ` ${m.unit}`}
                  </span>
                  <span className="metric-label">{m.name}</span>
                  {m.numerator !== undefined && m.denominator !== undefined ? (
                    <span className="metric-basis">
                      {m.numerator.toLocaleString("en-US")} of {m.denominator.toLocaleString("en-US")}
                    </span>
                  ) : null}
                  <span className="provenance">
                    block {m.block.toLocaleString("en-US")} · {m.window} · {m.method}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="unmeasured">
              not measured
              <span className="unmeasured__why">{row.trackMissing}</span>
            </p>
          )}
        </section>

        {/* ---------------------------------------------- put it to work */}
        <section style={{ marginTop: 22 }} aria-labelledby="work-h">
          <h2 id="work-h" className="meta" style={{ marginBottom: 10 }}>
            Put it to work
          </h2>
          <div className="rail-choice">
            {RAILS.map((r) => {
              const state = row.rails[r];
              const copy = RAIL_COPY[r];
              const href = `/hire/${chainId}/${encodeURIComponent(row.tokenId ?? `svc:${service?.resource ?? ""}`)}?rail=${r}`;
              const inner = (
                <>
                  <div className="between">
                    <span className={`chip ${state.open ? `chip--${r}` : "chip--refused"}`}>{copy.verb}</span>
                    <span className="num meta">{state.open ? (state.price ? state.price : "priced on what it earns") : "unavailable"}</span>
                  </div>
                  <p className="meta" style={{ marginTop: 8, lineHeight: 1.5 }}>
                    {state.open
                      ? `${copy.gives} ${copy.holds}`
                      : (state.detail ?? (state.reason ? REFUSAL_TEXT[state.reason as RailRefusal] : "Not available."))}
                  </p>
                  <p className="provenance" style={{ marginTop: 8 }}>{copy.standard}</p>
                </>
              );
              return state.open ? (
                <Link key={r} href={href} className="rail-card" data-selected={r}>
                  {inner}
                </Link>
              ) : (
                <div key={r} className="rail-card" aria-disabled="true">
                  {inner}
                </div>
              );
            })}
          </div>
          {!anyOpen ? (
            <p className="refusal" style={{ marginTop: 14, maxWidth: "72ch" }}>
              There is nothing you can do with this agent right now, and the three reasons above are the
              specific conditions that failed. It stays listed rather than being hidden, because a row you
              searched for and found unhireable has told you something true.
            </p>
          ) : null}
        </section>

        {/* ------------------------------------------------ what we checked */}
        {/* --------------------------------------------------- §15, the ladder */}
        <section className="panel" style={{ marginTop: 22, padding: 18 }} aria-labelledby="ladder-h">
          <h2 id="ladder-h" className="meta" style={{ marginBottom: 12 }}>
            Where this stands, and what proved it
          </h2>
          <Ladder row={row} agent={agent} service={service} />
        </section>

        <section className="panel" style={{ marginTop: 22, padding: 18 }} aria-labelledby="checks-h">
          <h2 id="checks-h" className="meta" style={{ marginBottom: 12 }}>
            Every check we ran, in full
          </h2>
          <dl className="terms">
            <dt>Endpoint</dt>
            <dd className="num" style={{ wordBreak: "break-all" }}>
              {agent?.endpoint ?? service?.resource ?? "none declared"}
            </dd>

            <dt>We called it</dt>
            <dd>
              {row.probedAt ? (
                <>
                  {new Date(row.probedAt).toISOString().replace("T", " ").slice(0, 19)} UTC
                  {row.latencyMs !== null ? ` · answered in ${row.latencyMs} ms` : ""}
                  {agent?.probe?.status !== null && agent?.probe?.status !== undefined
                    ? ` · HTTP ${agent.probe.status}`
                    : service?.probe?.status
                      ? ` · HTTP ${service.probe.status}`
                      : ""}
                </>
              ) : (
                <span className="unmeasured">never — it has not come up in the probe queue yet</span>
              )}
            </dd>

            <dt>Same bytes to three inputs</dt>
            <dd>
              {agent?.probe?.identicalAcrossInputs === true ? (
                <span style={{ color: "var(--color-error)" }}>
                  yes — it returned byte-identical output to three different requests, so it is not reading
                  them. No rail is sold on it.
                </span>
              ) : agent?.probe?.identicalAcrossInputs === false ? (
                "no — it answered three different inputs differently, which is what a service does"
              ) : (
                <span className="unmeasured">
                  not tested
                  <span className="unmeasured__why">
                    The three-input check is skipped for a payment challenge, which is supposed to be
                    identical whatever you send: it is the price, not the answer.
                  </span>
                </span>
              )}
            </dd>

            {row.mismatch ? (
              <>
                <dt>Listing vs reality</dt>
                <dd style={{ color: "var(--color-rail-mandate)" }}>{row.mismatch}</dd>
              </>
            ) : null}

            <dt>Host</dt>
            <dd>
              <span className="num">{row.originHost ?? "none"}</span>
              {row.originCohortSize > 1 ? (
                <>
                  {" "}
                  — {row.originCohortSize} listings resolve to this host.{" "}
                  <Link href="/data#origins" className="nav__link" style={{ textDecoration: "underline" }}>
                    why that matters
                  </Link>
                </>
              ) : null}
            </dd>

            <dt>Reputation</dt>
            <dd>
              {agent && agent.reputation.known ? (
                <>
                  {agent.reputation.value.filtered} after filtering, from{" "}
                  {agent.reputation.value.records} records, {agent.reputation.value.flaggedWallets} of whose
                  writers flag as a coordinated cohort
                </>
              ) : (
                <span className="unmeasured">
                  not measured
                  <span className="unmeasured__why">
                    {agent?.reputation.known === false ? agent.reputation.reason : "No reputation source applies to a B402 endpoint."}
                  </span>
                </span>
              )}
            </dd>

            <dt>Classified from</dt>
            <dd>
              {agent && agent.jobEvidence.length > 0 ? (
                <>its own words: {agent.jobEvidence.map((p) => `"${p}"`).join(", ")}</>
              ) : (
                <span className="unmeasured">nothing in its own text matched one of the four jobs</span>
              )}
            </dd>
          </dl>
        </section>

        <p className="provenance" style={{ marginTop: 18 }}>
          Reproduce every line on this page:{" "}
          <span className="num">npm run probe -- --limit 999</span> and{" "}
          <span className="num">npm run metrics</span>
        </p>
      </main>
      <Footer />
    </>
  );
}
