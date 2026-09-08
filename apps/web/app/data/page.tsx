import type { Metadata } from "next";
import Link from "next/link";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { JOBS, txUrl } from "@bench/shared";
import Nav from "@/components/board/Nav";
import Footer from "@/components/board/Footer";
import { readBoardView, getBoard } from "@/lib/board";

/**
 * Where every number on this site comes from.
 *
 * The rule this page exists to serve: a measurement nobody else can obtain is
 * indistinguishable from one nobody else can falsify. So each figure carries
 * the command that re-derives it, each finding carries its population and its
 * method, and the limitations are printed in the same type as the results
 * rather than in a footnote.
 */
export const revalidate = 60;

export const metadata: Metadata = {
  title: "Data",
  description:
    "How every number on this marketplace is derived: the sweep, the probe, the rails, the origin clustering, and what we could not measure.",
};

interface Proofs {
  proofs: {
    id: string;
    title: string;
    what: string;
    why: string;
    target: string;
    txHash: string;
    block: number;
    amountText: string;
    reproduce: string;
    assertions: { n: number; claim: string; result: string; detail: string }[];
    passed: number;
    failed: number;
    inconclusive: number;
  }[];
  findings: {
    id: string;
    title: string;
    detail: string;
    whyItMatters: string;
    reproduce: string;
    population?: number;
    breakdown?: Record<string, number>;
  }[];
}

function readProofs(): Proofs | null {
  for (const p of [join(process.cwd(), "data", "proofs.json"), join(process.cwd(), "apps/web/data", "proofs.json")]) {
    if (existsSync(p)) {
      try {
        return JSON.parse(readFileSync(p, "utf8")) as Proofs;
      } catch {
        return null;
      }
    }
  }
  return null;
}

/**
 * The transaction a proof turns on, whichever kind of proof it is.
 *
 * A payment proof is settled by its own transfer; a session proof is settled by
 * its revocation, because "we ended it, here is the hash" is the claim that
 * matters and the grant itself is only half the story.
 */
function proofTx(p: { txHash?: string; revokeTx?: string }): `0x${string}` | null {
  const h = p.txHash ?? p.revokeTx;
  return h ? (h as `0x${string}`) : null;
}

/** What that transaction shows, in the units the proof is actually about. */
function proofLabel(p: {
  txHash?: string;
  revokeTx?: string;
  amountText?: string;
  block?: number;
  capText?: string;
}): string {
  if (p.txHash && p.amountText) {
    return p.block
      ? `${p.amountText} on chain, block ${p.block.toLocaleString("en-US")}`
      : `${p.amountText} on chain`;
  }
  if (p.revokeTx) return p.capText ? `revoked on chain, cap was ${p.capText}` : "revoked on chain";
  return "on chain";
}

export default async function DataPage() {
  const view = readBoardView({ limit: 1 });
  const s = view.snapshot;
  const proofs = readProofs();
  const cf = getBoard().counterfactual ?? null;
  const grade = getBoard().grade ?? null;

  return (
    <>
      <Nav path="/data" />
      <main className="shell" style={{ paddingBlock: 28 }}>
        <section style={{ maxWidth: "74ch" }}>
          <h1 className="h1">Where every number here comes from</h1>
          <p className="lede" style={{ marginTop: 10 }}>
            Each figure on this site carries the block it was read at and how it was derived. This page is
            the derivation. Everything on it can be re-run from a checkout with the command beside it.
          </p>
        </section>

        {/* ------------------------------------------------------- the funnel */}
        <section style={{ marginTop: 28 }} aria-labelledby="funnel-h">
          <h2 id="funnel-h" className="h3">
            The funnel
          </h2>
          <table className="board" style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th scope="col">Stage</th>
                <th scope="col">Count</th>
                <th scope="col">How it is established</th>
              </tr>
            </thead>
            <tbody>
              <Stage
                label="Registered on BNB Smart Chain"
                value={s.registry.registered.known ? s.registry.registered.value.toLocaleString("en-US") : null}
                reason={s.registry.registered.known ? null : s.registry.registered.reason}
                how="The registry contract has no totalSupply — it reverts — so this is the highest token id minted, read from the identity registry's own mint events."
              />
              <Stage
                label="Read by this deployment"
                value={s.registry.read.toLocaleString("en-US")}
                reason={null}
                how="Mints are Transfer events from the zero address, walked backwards from the head in 5,000-block windows. The card at each tokenURI is then fetched and parsed."
              />
              <Stage
                label="Paid endpoints in B402 Bazaar"
                value={s.totals.bazaar.toLocaleString("en-US")}
                reason={null}
                how="Binance's own discovery index for x402-payable endpoints, paginated at 100."
              />
              <Stage
                label="Called by us"
                value={s.totals.probed.toLocaleString("en-US")}
                reason={null}
                how="Each endpoint is fetched directly. Non-payment endpoints get three different inputs; a byte-identical answer to all three fails the listing."
              />
              <Stage
                label="Callable — a challenge we can pay here"
                value={String(s.totals.callable)}
                reason={null}
                how="A live 402 whose challenge names an amount, a payee and an asset that can actually settle on this chain."
              />
              <Stage
                label="Hireable — a signed ERC-8183 quote"
                value={String(s.totals.hireable)}
                reason={null}
                how="A negotiation request for a specific job, answered with an accepted, unexpired quote."
              />
              <Stage
                label="Mandatable — capability shown on chain"
                value={String(s.totals.mandatable)}
                reason={null}
                how="The job's canonical calls intersected with the venues the chain shows the wallet using. An incomplete scan refuses rather than narrows."
              />
            </tbody>
          </table>
          <p className="provenance" style={{ marginTop: 10 }}>
            Read at block {Number(s.cutoff.block).toLocaleString("en-US")} ·{" "}
            <span className="num">npm run sweep &amp;&amp; npm run bazaar &amp;&amp; npm run probe</span>
          </p>
        </section>

        {/* ------------------------------------------------------- the proofs */}
        {proofs && proofs.proofs.length > 0 ? (
          <section style={{ marginTop: 34 }} aria-labelledby="proofs-h">
            <h2 id="proofs-h" className="h3">
              What this marketplace has actually done
            </h2>
            {proofs.proofs.map((p) => (
              <div key={p.id} className="panel" style={{ marginTop: 14, padding: 18 }}>
                <h3 className="h3" style={{ fontSize: "var(--text-sm)" }}>
                  {p.title}
                </h3>
                <p className="prose" style={{ marginTop: 8 }}>
                  {p.what}
                </p>
                <p className="prose" style={{ marginTop: 8 }}>
                  {p.why}
                </p>
                <ul className="stack" style={{ gap: 4, marginTop: 12 }}>
                  {p.assertions.map((a) => (
                    <li key={a.n} className="provenance">
                      {/*
                        Three outcomes, not two. An inconclusive assertion is one
                        where the call failed for a reason that cannot be credited
                        to the thing being tested — it is neither a pass nor a
                        failure, and colouring it like a failure would make an
                        honest report look like a broken rail. It renders dim,
                        with the mark the script itself uses.
                      */}
                      <span
                        style={{
                          color:
                            a.result === "proven"
                              ? "var(--color-rail-call)"
                              : a.result === "failed"
                                ? "var(--color-error)"
                                : "var(--color-dim)",
                        }}
                      >
                        {a.result === "proven" ? "✓" : a.result === "failed" ? "✗" : "?"}
                      </span>{" "}
                      {a.claim} — <span className="dim">{a.detail}</span>
                    </li>
                  ))}
                </ul>
                {/*
                  A proof is not always a payment.

                  The first one was, so this line read `p.amountText` and
                  `p.block` directly and the build crashed the moment a proof of
                  a different shape arrived — a session grant, which has a
                  revocation transaction and no amount at all. The tally is the
                  part every proof has; the link is whatever transaction that
                  particular proof turns on, and a proof that turns on no single
                  transaction says so rather than rendering "undefined".
                */}
                <p className="provenance" style={{ marginTop: 12 }}>
                  {p.passed} proven · {p.failed} failed · {p.inconclusive} inconclusive
                  {proofTx(p) ? (
                    <>
                      {" · "}
                      <a
                        className="nav__link"
                        style={{ textDecoration: "underline" }}
                        href={txUrl(56, proofTx(p)!)}
                      >
                        {proofLabel(p)}
                      </a>
                    </>
                  ) : null}
                </p>
                <p className="provenance" style={{ marginTop: 6 }}>
                  reproduce: <span className="num">{p.reproduce}</span>
                </p>
              </div>
            ))}
          </section>
        ) : null}

        {/* ----------------------------------------------- the counterfactual */}
        {cf ? (
          <section style={{ marginTop: 34 }} aria-labelledby="cf-h">
            <h2 id="cf-h" className="h3">
              What each strategy would have done, replayed against real trades
            </h2>
            <p className="prose" style={{ marginTop: 10, maxWidth: "76ch" }}>
              Every row below was replayed over the same {cf.swaps.toLocaleString("en-US")} swaps of the
              PancakeSwap V3 {cf.pair} pool, {cf.hours} hours of it, from the pool&rsquo;s own events. Fees are
              computed from the trades that actually happened rather than from an assumed rate: a position
              earns the pool&rsquo;s fee on each swap, in proportion to its share of the liquidity that was in
              range at that moment. Gas is charged at the price the chain quoted, and the swap a recentre
              needs pays the pool&rsquo;s fee and a price impact bounded by the depth at that block.
            </p>
            <p className="prose" style={{ marginTop: 10, maxWidth: "76ch" }}>
              {cf.positionNote}
            </p>

            <div style={{ overflowX: "auto", marginTop: 16 }}>
              <table className="board">
                <thead>
                  <tr>
                    <th scope="col">Strategy</th>
                    <th scope="col">In range</th>
                    <th scope="col">Recentres</th>
                    <th scope="col">Gas</th>
                    <th scope="col">Net</th>
                    <th scope="col">Against doing nothing</th>
                  </tr>
                </thead>
                <tbody>
                  {cf.rows.map((r) => {
                    const vs = Number(r.vsHold);
                    return (
                      <tr key={r.strategy}>
                        <td>
                          <span className="row__name">{r.name}</span>
                          <span className="provenance clamp1" style={{ display: "block" }}>
                            {r.describes}
                          </span>
                        </td>
                        <td className="num">{r.timeInRangePercent.toFixed(1)}%</td>
                        <td className="num">{r.recentres}</td>
                        <td className="num">{Number(r.gasCost).toFixed(3)}</td>
                        <td className="num">{Number(r.net).toFixed(2)}</td>
                        <td
                          className="num"
                          style={{
                            color:
                              r.strategy === "hold"
                                ? "var(--color-dim)"
                                : vs > 0
                                  ? "var(--color-rail-call)"
                                  : "var(--color-rail-mandate)",
                          }}
                        >
                          {r.strategy === "hold" ? "—" : `${vs > 0 ? "+" : ""}${vs.toFixed(2)}`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/*
              The result, said out loud rather than left for a reader to infer
              from a column of negative numbers. An engine that could only
              report wins would be a brochure, and the row that loses is the
              one that makes the rest of the page worth believing.
            */}
            {/*
              The reading, said out loud rather than left for someone to infer
              from a column of signed numbers — and the caveat that matters more
              than the reading. An engine that only reported wins would be a
              brochure; one that reported a single window as a track record
              would be worse, because it would be a brochure wearing arithmetic.
            */}
            <p className="prose" style={{ marginTop: 14, maxWidth: "76ch" }}>
              {(() => {
                const acting = cf.rows.filter((r) => r.strategy !== "hold");
                const winners = acting.filter((r) => Number(r.vsHold) > 0);
                const losers = acting.filter((r) => Number(r.vsHold) <= 0);
                const busiest = [...acting].sort((a, b) => b.recentres - a.recentres)[0];
                if (winners.length === 0) {
                  return `On this window every strategy was worse than leaving the position alone, and each of them held the price in range far more of the time. The swap a recentre needs cost more than the extra fees were worth. An agent that keeps a position in range is not the same as an agent that makes money, and the difference is the whole reason to measure rather than to advertise.`;
                }
                if (losers.length > 0 && busiest && Number(busiest.vsHold) <= 0) {
                  return `${busiest.name} held the price in range ${busiest.timeInRangePercent.toFixed(0)}% of the window — as much as anything above it — and still finished ${Math.abs(Number(busiest.vsHold)).toFixed(2)} ${cf.token0Symbol} behind doing nothing, across ${busiest.recentres} recentres. Time in range is not the same as money, and a row that loses is what makes the rows that win worth reading.`;
                }
                return `Figures in ${cf.token0Symbol}, against an identical position left alone over the same window.`;
              })()}
            </p>

            <p className="prose" style={{ marginTop: 10, maxWidth: "76ch" }}>
              <strong>This is one window, not a track record.</strong> The same replay run eight minutes
              earlier — a window shifted by a few hundred blocks — moved every figure in this table, and
              turned one of the winners above into a loss. Which side of a band the price happens to sit on
              when the clock starts decides when a recentre fires and what it costs. Treat a single row as
              evidence that the measurement is real, not as a forecast; a record is many of these, and
              accumulating them is what settled hires are for.
            </p>

            {cf.shortenedBecause ? (
              <p className="unmeasured" style={{ marginTop: 12 }}>
                the window is shorter than it was asked to be
                <span className="unmeasured__why">{cf.shortenedBecause}</span>
              </p>
            ) : null}
            {cf.dilution ? (
              <p className="unmeasured" style={{ marginTop: 12 }}>
                this position is large relative to the pool
                <span className="unmeasured__why">{cf.dilution}</span>
              </p>
            ) : null}

            <p className="provenance" style={{ marginTop: 12, lineHeight: 1.6 }}>
              pool {cf.pool} · fee {(cf.feePips / 10_000).toFixed(2)}% · blocks{" "}
              {Number(cf.fromBlock).toLocaleString("en-US")}–{Number(cf.toBlock).toLocaleString("en-US")} ·{" "}
              {cf.complete ? "every range served" : "some ranges refused"} · gas {cf.gasPriceWei} wei ·
              read via {cf.via ?? "an unnamed host"}
              <br />
              reproduce: <span className="num">{cf.reproduce}</span>
            </p>
          </section>
        ) : null}

        {/* -------------------------------------------- how wrong we were */}
        {grade ? (
          <section style={{ marginTop: 34 }} aria-labelledby="grade-h">
            <h2 id="grade-h" className="h3">
              How wrong that table was
            </h2>
            <p className="prose" style={{ marginTop: 10, maxWidth: "76ch" }}>
              The window above is a replay of trades that had already happened, which proves the arithmetic
              and says nothing about tomorrow. So the same strategies, the same pool and the same position
              were replayed again over the window that came <em>after</em> it — blocks{" "}
              {Number(grade.actualWindow.fromBlock).toLocaleString("en-US")} onward, which nothing in the
              published table had seen. The difference is our forecast error, and it is published whichever
              way it points.
            </p>

            {grade.refusedBecause ? (
              <p className="unmeasured" style={{ marginTop: 12 }}>
                not gradeable yet
                <span className="unmeasured__why">{grade.refusedBecause}</span>
              </p>
            ) : (
              <>
                <div style={{ overflowX: "auto", marginTop: 16 }}>
                  <table className="board">
                    <thead>
                      <tr>
                        <th scope="col">Strategy</th>
                        <th scope="col">We said</th>
                        <th scope="col">It did</th>
                        <th scope="col">We were wrong by</th>
                        <th scope="col">Same direction</th>
                      </tr>
                    </thead>
                    <tbody>
                      {grade.rows.map((r) => {
                        const err = Number(r.error);
                        return (
                          <tr key={r.strategy}>
                            <td>
                              <span className="row__name">{r.name}</span>
                              <span className="provenance clamp1" style={{ display: "block" }}>
                                {r.projectedRecentres} recentre{r.projectedRecentres === 1 ? "" : "s"} then,{" "}
                                {r.actualRecentres} after
                              </span>
                            </td>
                            <td className="num">{Number(r.projected).toFixed(2)}</td>
                            <td className="num">{Number(r.actual).toFixed(2)}</td>
                            <td
                              className="num"
                              style={{
                                color: err === 0 ? "var(--color-dim)" : "var(--color-rail-mandate)",
                              }}
                            >
                              {err > 0 ? "+" : ""}
                              {err.toFixed(2)}
                            </td>
                            <td style={{ color: r.directionHeld ? "var(--color-rail-call)" : "var(--color-dim)" }}>
                              {r.directionHeld ? "held" : "flipped"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/*
                  When every error points the same way it is not noise, it is
                  bias, and naming it is the whole point of publishing this. A
                  reader can correct for a bias they have been told about; they
                  cannot correct for one buried in an average.
                */}
                {(() => {
                  const errs = grade.rows.map((r) => Number(r.error));
                  const allPositive = errs.length > 1 && errs.every((e) => e > 0);
                  const allNegative = errs.length > 1 && errs.every((e) => e < 0);
                  const mean = errs.reduce((a, b) => a + b, 0) / Math.max(errs.length, 1);
                  return (
                    <p className="prose" style={{ marginTop: 14, maxWidth: "76ch" }}>
                      <strong>
                        {grade.directionsHeld} of {grade.rows.length} kept the sign they were projected
                        with.
                      </strong>{" "}
                      {grade.directionsHeld === grade.rows.length
                        ? "Every strategy that was ahead stayed ahead and every one behind stayed behind, so the ranking held. "
                        : grade.directionsHeld === 0
                          ? "Not one of them did — a single window told us nothing durable about this pool, and saying so is more useful than the table above pretending otherwise. "
                          : "The rest changed sign, which is the clearest possible demonstration that one window is not a track record. "}
                      {allPositive || allNegative ? (
                        <>
                          Every error points the same way, which makes it bias rather than noise: the replay{" "}
                          <strong>{allPositive ? "overstates losses" : "overstates gains"}</strong> by{" "}
                          {Math.abs(mean).toFixed(2)} {grade.token0Symbol} on average here, and the
                          overstatement grows with how often a strategy acts. That is the cost model doing
                          what it was built to do — the slippage bound is deliberately pessimistic, because a
                          cost reported too low is a marketplace that told somebody to hire the wrong agent.
                          Now it is measured rather than asserted, and a reader can correct for it.
                        </>
                      ) : (
                        "The magnitudes moved in both directions, which is what a single window cannot tell you in advance."
                      )}
                    </p>
                  );
                })()}

                <p className="provenance" style={{ marginTop: 12, lineHeight: 1.6 }}>
                  projected over {grade.projectedWindow.hours}h and{" "}
                  {grade.projectedWindow.swaps.toLocaleString("en-US")} swaps · graded over{" "}
                  {grade.actualWindow.hours}h and {grade.actualWindow.swaps.toLocaleString("en-US")} swaps ·{" "}
                  {grade.actualWindow.complete ? "every range served" : "some ranges refused"} · figures in{" "}
                  {grade.token0Symbol}
                  <br />
                  reproduce: <span className="num">{grade.reproduce}</span>
                </p>
              </>
            )}
          </section>
        ) : null}

        {/* ------------------------------------------------------ the findings */}
        {proofs && proofs.findings.length > 0 ? (
          <section style={{ marginTop: 34 }} aria-labelledby="findings-h">
            <h2 id="findings-h" className="h3">
              What the measurements found
            </h2>
            {proofs.findings.map((f) => (
              <div key={f.id} id={f.id} className="panel" style={{ marginTop: 14, padding: 18 }}>
                <h3 className="h3" style={{ fontSize: "var(--text-sm)", maxWidth: "62ch" }}>
                  {f.title}
                </h3>
                <p className="prose" style={{ marginTop: 10 }}>
                  {f.detail}
                </p>
                {f.breakdown ? (
                  <dl className="terms" style={{ marginTop: 12 }}>
                    {Object.entries(f.breakdown).map(([k, v]) => (
                      <div key={k} style={{ display: "contents" }}>
                        <dt className="num">{v.toLocaleString("en-US")}</dt>
                        <dd>{humanKey(k)}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
                <p className="prose" style={{ marginTop: 12 }}>
                  {f.whyItMatters}
                </p>
                <p className="provenance" style={{ marginTop: 10 }}>
                  reproduce: <span className="num">{f.reproduce}</span>
                </p>
              </div>
            ))}
          </section>
        ) : null}

        {/* ------------------------------------------------------- the origins */}
        <section id="origins" style={{ marginTop: 34 }} aria-labelledby="origins-h">
          <h2 id="origins-h" className="h3">
            Endpoint concentration, and why the board collapses it
          </h2>
          <p className="prose" style={{ marginTop: 10 }}>
            A directory of a hundred thousand rows is not a hundred thousand things. Endpoints cluster
            hard on a small number of hosts, so a board ranked by count would put one operator&rsquo;s batch
            registration above everything a person could actually hire. The host is a first-class field on
            every row here, the cohort size travels with it, and a host above five listings is collapsed to
            its distinct services with the remainder stated. Nothing is hidden — the register lists every
            one — but nothing is padded either.
          </p>
          {s.origins.length > 0 ? (
            <table className="board" style={{ marginTop: 14 }}>
              <thead>
                <tr>
                  <th scope="col">Host</th>
                  <th scope="col">Listings</th>
                  <th scope="col">Share of everything declaring an endpoint</th>
                </tr>
              </thead>
              <tbody>
                {s.origins.slice(0, 12).map((o) => (
                  <tr key={o.host}>
                    <td className="num">{o.host}</td>
                    <td className="num">{o.count}</td>
                    <td className="num">{(o.share * 100).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="unmeasured" style={{ marginTop: 12 }}>
              not measured
              <span className="unmeasured__why">Nothing with an endpoint has been read yet.</span>
            </p>
          )}
        </section>

        {/* -------------------------------------------------------- the methods */}
        <section style={{ marginTop: 34 }} aria-labelledby="methods-h">
          <h2 id="methods-h" className="h3">
            How each job is measured
          </h2>
          <p className="prose" style={{ marginTop: 10 }}>
            Four jobs, four different measurements. A single score reused four times would be easier to
            build and would tell a person nothing about whether to hand this agent a lending position.
          </p>
          {JOBS.map((job) => (
            <div key={job.slug} style={{ marginTop: 18 }}>
              <h3 className="h3" style={{ fontSize: "var(--text-sm)" }}>
                <Link href={`/j/${job.slug}`} className="nav__link">
                  {job.title}
                </Link>
              </h3>
              <dl className="terms" style={{ marginTop: 8 }}>
                {job.metrics.map((m) => (
                  <div key={m.key} id={m.method} style={{ display: "contents" }}>
                    <dt>{m.label}</dt>
                    <dd>
                      {m.means}{" "}
                      <span className="dim">
                        ({m.better === "higher" ? "higher is better" : "lower is better"}, in {m.unit})
                      </span>
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </section>

        {/* ---------------------------------------------------------- the rules */}
        <section style={{ marginTop: 34 }} aria-labelledby="rules-h">
          <h2 id="rules-h" className="h3">
            Rules this marketplace holds itself to
          </h2>
          <ul className="stack" style={{ gap: 12, marginTop: 12, maxWidth: "74ch" }}>
            <Rule title="Our own agents never outrank a better-measured third party.">
              There is no ownership term anywhere in the ranking function. A check in the build constructs
              a third-party row that measures better than one of ours and fails if ours sorts first.
            </Rule>
            <Rule title="An absence is never a zero.">
              A field is either known with a value or unknown with a reason. &ldquo;No reviews&rdquo; and
              &ldquo;we could not read the reviews&rdquo; are different claims and only one of them is about
              the agent.
            </Rule>
            <Rule title="A green rail decays.">
              A probe result nobody refreshed inside fifteen minutes ages, and by forty-five it closes. The
              cost of decaying early is a row saying &ldquo;not checked recently&rdquo;; the cost of decaying
              late is selling a hire on an endpoint that died an hour ago.
            </Rule>
            <Rule title="Chain 56 and chain 97 never appear in the same figure.">
              The chain is resolved once at the data layer and travels with every record. An unrecognised
              chain fails closed to mainnet and says it was coerced.
            </Rule>
            <Rule title="We call it before we list it.">
              A registration with an endpoint is a claim. A row on this board is an endpoint that answered
              a call we made, and rows that failed stay listed with the condition that failed.
            </Rule>
          </ul>
        </section>

        {/* ----------------------------------------------------- what we cannot */}
        <section style={{ marginTop: 34 }} aria-labelledby="limits-h">
          <h2 id="limits-h" className="h3">
            What this deployment cannot currently do
          </h2>
          <ul className="stack" style={{ gap: 10, marginTop: 12, maxWidth: "76ch" }}>
            {s.limitations.map((l) => (
              <li key={l} className="prose" style={{ margin: 0 }}>
                {l}
              </li>
            ))}
          </ul>
        </section>

        {/* ------------------------------------------------------------- the API */}
        <section style={{ marginTop: 34 }} aria-labelledby="api-h">
          <h2 id="api-h" className="h3">
            The same data, as an API
          </h2>
          <p className="prose" style={{ marginTop: 10 }}>
            Open, unauthenticated, CORS-open, rate-limited. If you are building a directory, a router or a
            wallet on BNB Smart Chain, use it — and disagree with it in public. A measurement nobody else
            can obtain is indistinguishable from one nobody else can falsify.
          </p>
          <dl className="terms" style={{ marginTop: 14 }}>
            <dt className="num">GET /api/v1/agents</dt>
            <dd>The board. Every row with its rails, its track record, its freshness and its refusals.</dd>
            <dt className="num">GET /api/v1/agents/56/:id</dt>
            <dd>One listing, with every probe result and the reason behind each rail.</dd>
            <dt className="num">GET /api/v1/snapshot</dt>
            <dd>The funnel above, as data, including the origin cohorts and the limitations.</dd>
            <dt className="num">GET /api/v1/jobs/:job</dt>
            <dd>A job&rsquo;s metric definitions and its ranked board.</dd>
            <dt className="num">POST /api/mcp</dt>
            <dd>The same marketplace over MCP, so an agent can browse and plan a hire from an editor.</dd>
          </dl>
        </section>
      </main>
      <Footer snapshot={s} />
    </>
  );
}

function Stage({
  label,
  value,
  reason,
  how,
}: {
  label: string;
  value: string | null;
  reason: string | null;
  how: string;
}) {
  return (
    <tr>
      <td>{label}</td>
      <td className="num">
        {value !== null ? (
          value
        ) : (
          <span className="unmeasured">
            not established
            <span className="unmeasured__why">{reason}</span>
          </span>
        )}
      </td>
      <td className="meta" style={{ maxWidth: "48ch", whiteSpace: "normal" }}>
        {how}
      </td>
    </tr>
  );
}

function Rule({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <li>
      <strong style={{ fontWeight: 500 }}>{title}</strong>
      <p className="prose" style={{ marginTop: 4 }}>
        {children}
      </p>
    </li>
  );
}

function humanKey(k: string): string {
  const map: Record<string, string> = {
    liveChallengeOnBase: "answered a live challenge asking for payment on Base, not BNB Chain",
    payableOnBsc: "answered a challenge we could actually pay on BNB Smart Chain",
    notFound: "answered 404",
    timedOut: "did not answer within the timeout",
    noChallenge: "answered without a payment challenge",
  };
  return map[k] ?? k;
}
