import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { formatEther } from "viem";
import AppShell from "@/components/v2/shell/AppShell";
import CategoryMark from "@/components/v2/marks/CategoryMark";
import { CATEGORIES, CATEGORY_LABEL } from "@/lib/config";
import { readBook } from "@/lib/chain/book";
import { openAttestation, epochAttestation, alphaBetween } from "@/lib/chain/marketV2";
import { OPERATED_WALLETS } from "@/lib/market/hires";
import { MARKET_V2 } from "@/lib/chain/deployments";

export const revalidate = 30;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return { title: `Receipt for job ${id} | Mandate` };
}

const bnb = (w: bigint, dp = 5) => `${Number(formatEther(w)).toFixed(dp)} BNB`;
const short = (a: string) => `${a.slice(0, 8)}…${a.slice(-6)}`;
const STATE = ["waiting for an agent", "running", "finished its term", "cancelled before it started", "ended early"] as const;

/**
 * One job, and everything that has happened to it.
 *
 * The point of a receipt is that it is checkable by somebody who does not
 * trust the person handing it over, so every figure here is read from the
 * chain at request time and every one of them links to the block explorer.
 * Nothing on this page comes from a database.
 */
export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const mandateId = Number(id);
  if (!Number.isInteger(mandateId) || mandateId < 0) notFound();

  const book = await readBook().catch(() => null);
  const row = book?.rows.find(
    (r) => r.id === mandateId && r.deployment.status === "canonical",
  );
  if (!row) notFound();

  const category = CATEGORIES[row.category] ?? null;
  const open = await openAttestation(mandateId).catch(() => null);
  const marks = await Promise.all(
    Array.from({ length: Math.max(0, row.epochsSettled) }, (_, e) =>
      epochAttestation(mandateId, e).catch(() => null),
    ),
  );
  const operated = OPERATED_WALLETS.has(row.agent.toLowerCase());
  const explorer = "https://bscscan.com";

  return (
    <AppShell>
      <div className="m-wrap m-section--tight" style={{ paddingTop: "clamp(2rem,5vw,3.5rem)" }}>
        <p className="m-small">
          <Link className="m-link" href="/activity">
            All activity
          </Link>
        </p>

        <div className="m-agent-hero__row" style={{ marginTop: "1.25rem" }}>
          <div>
            <h1 className="m-h1">Job #{mandateId}</h1>
            <p className="m-lede m-lede--wide" style={{ marginTop: "1rem" }}>
              {bnb(row.capitalWei)} committed to a{" "}
              {category ? CATEGORY_LABEL[category].toLowerCase() : "mandate"} job. It is{" "}
              {STATE[row.state] ?? `in state ${row.state}`}.
            </p>
          </div>
          {category ? <CategoryMark category={category} size={96} className="m-agent-hero__mark" /> : null}
        </div>

        <section className="m-section--tight">
          <div className="m-head">
            <h2 className="m-h2">The terms</h2>
            <p className="m-head__note">Written into the contract when the job opened.</p>
          </div>
          <dl className="m-kv">
            <div>
              <dt>Capital committed</dt>
              <dd className="m-fig">{bnb(row.capitalWei)}</dd>
            </div>
            <div>
              <dt>Agent&rsquo;s bond at risk</dt>
              <dd className="m-fig">{row.bondWei === 0n ? "none yet" : bnb(row.bondWei)}</dd>
            </div>
            <div>
              <dt>Term</dt>
              <dd className="m-fig">
                {row.epochsSettled} of {row.epochsTotal} hours settled
              </dd>
            </div>
            <div>
              <dt>Against the benchmark</dt>
              <dd className="m-fig">
                {row.epochsSettled === 0
                  ? "nothing settled yet"
                  : `${(Number(row.cumulativeAlphaBps) / 100).toFixed(2)}%`}
              </dd>
            </div>
            <div>
              <dt>Buyer</dt>
              <dd className="m-mono">
                <a className="m-link" href={`${explorer}/address/${row.principal}`} target="_blank" rel="noreferrer">
                  {short(row.principal)}
                </a>
              </dd>
            </div>
            <div>
              <dt>Agent holding it</dt>
              <dd className="m-mono">
                {row.agent && !/^0x0+$/.test(row.agent) ? (
                  <a className="m-link" href={`${explorer}/address/${row.agent}`} target="_blank" rel="noreferrer">
                    {short(row.agent)}
                  </a>
                ) : (
                  "nobody yet"
                )}
              </dd>
            </div>
            <div>
              <dt>Contract</dt>
              <dd className="m-mono">
                <a className="m-link" href={`${explorer}/address/${MARKET_V2}`} target="_blank" rel="noreferrer">
                  {short(MARKET_V2)}
                </a>
              </dd>
            </div>
          </dl>

          {operated ? (
            <p className="m-note" style={{ marginTop: "1rem", maxWidth: "64ch" }}>
              This job is held by a wallet we operate. It carries a real bond on the
              same slashing terms as any other agent, and it is not a third party
              choosing this market. Every row on this site that is ours says so.
            </p>
          ) : null}

          <p className="m-note" style={{ marginTop: "0.7rem", maxWidth: "64ch" }}>
            Measured against <strong>Hold</strong>, which is what the settlement
            engine can currently derive. For rebalancing and grid trading that is
            the right yardstick. For yield and loan health it is not, and the
            figure above should be read as a raw return until the other two
            benchmarks are implemented.
          </p>
        </section>

        <section className="m-section--tight">
          <div className="m-head">
            <h2 className="m-h2">The marks</h2>
            <p className="m-head__note">
              Every valuation this job has been settled against, committed on chain
              before the outcome was known.
            </p>
          </div>
          {!open ? (
            <div className="m-absent">
              <p className="m-absent__t">No opening mark yet.</p>
              <p className="m-small">
                The opening valuation is written when the buyer accepts a bid. Until
                then there is nothing to measure against.
              </p>
            </div>
          ) : (
            <ol className="m-tape">
              <li className="m-tape__row">
                <span />
                <div>
                  <p className="m-small">
                    <strong>Opening mark.</strong> The agent&rsquo;s wallet valued at{" "}
                    {bnb(open.valuationWei)} at block{" "}
                    <a
                      className="m-link m-mono"
                      href={`${explorer}/block/${open.blockNumber}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {open.blockNumber.toString()}
                    </a>
                    .
                  </p>
                  <p className="m-note">Benchmark set at {bnb(open.benchmarkWei)}.</p>
                </div>
                <span />
              </li>
              {marks.map((m, e) => {
                if (!m) return null;
                const prev = e === 0 ? open : marks[e - 1];
                const a = prev ? alphaBetween(prev, m) : null;
                return (
                  <li className="m-tape__row" key={e}>
                    <span />
                    <div>
                      <p className="m-small">
                        <strong>Hour {e + 1}.</strong> Valued at {bnb(m.valuationWei)} at block{" "}
                        <a
                          className="m-link m-mono"
                          href={`${explorer}/block/${m.blockNumber}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {m.blockNumber.toString()}
                        </a>
                        {a !== null ? `, ${(Number(a) / 100).toFixed(2)}% against the benchmark` : ""}.
                      </p>
                    </div>
                    <span />
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        <section className="m-section--tight">
          <div className="m-head">
            <h2 className="m-h2">Check it yourself</h2>
            <p className="m-head__note">Reads the chain and nothing we control.</p>
          </div>
          <pre className="m-pre">npx mandate-verify --mandate {mandateId} --chain 56</pre>
        </section>
      </div>
    </AppShell>
  );
}
