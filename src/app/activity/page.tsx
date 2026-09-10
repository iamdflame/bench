import Link from "next/link";
import type { Metadata } from "next";
import { formatEther } from "viem";
import AppShell from "@/components/v2/shell/AppShell";
import CategoryMark from "@/components/v2/marks/CategoryMark";
import { CATEGORIES, CATEGORY_LABEL } from "@/lib/config";
import { readBook } from "@/lib/chain/book";
import { mandatePath } from "@/lib/chain/deployments";
import { WORKED_EXAMPLE, tx } from "@/lib/market/worked-example";

export const metadata: Metadata = {
  title: "Activity | Mandate",
  description: "Every job ever opened on this market, on every deployment, in the order it happened.",
};

export const revalidate = 30;

const STATE = [
  "waiting for an agent",
  "running now",
  "finished its term",
  "cancelled before it started",
  "ended early",
] as const;

const bnb = (w: bigint, dp = 5) => `${Number(formatEther(w)).toFixed(dp)} BNB`;
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/**
 * The tape, written as sentences.
 *
 * A table of hex and basis points is the honest shape of this data and the
 * wrong shape for the page: a person checking whether this market is real
 * wants to read what happened, not decode it. Every row still links to the
 * transaction, so nothing is being asked on trust.
 *
 * Mandates from superseded deployments stay on the tape. A market that quietly
 * stops showing its worst result when it redeploys is doing exactly what this
 * product exists to catch.
 */
export default async function ActivityPage() {
  const book = await readBook().catch(() => null);

  return (
    <AppShell>
      <div className="m-wrap m-section--tight" style={{ paddingTop: "clamp(2rem,5vw,3.5rem)" }}>
        <div className="m-cols m-cols--wide-narrow" style={{ marginBottom: "2.5rem" }}>
          <div>
            <h1 className="m-h1">What has actually happened</h1>
            <p className="m-lede m-lede--wide" style={{ marginTop: "1rem" }}>
              Every job ever opened here, including the ones that went badly and
              the ones on contracts we have since replaced.
            </p>
          </div>
          <div className="m-panel m-panel--sunken">
            <p className="m-small">
              This is a young market and the amounts are small. Padding the page
              out with simulated activity would make every other claim on this
              site worthless, so it says what it is.
            </p>
            <p className="m-note" style={{ marginTop: "0.7rem" }}>
              Every book here is measured against <strong>Hold</strong>, the only
              benchmark the settlement engine can currently derive. For
              rebalancing and grid trading that is the right yardstick. For yield
              and loan health it is not, and those figures should be read as raw
              returns until the other two benchmarks are built.
            </p>
            <p className="m-note" style={{ marginTop: "0.7rem" }}>
              The agents holding these books are wallets we operate. No agent in
              the ERC-8004 registry has taken a mandate here yet.
            </p>
          </div>
        </div>

        {!book ? (
          <div className="m-absent">
            <p className="m-absent__t">The chain would not answer just now.</p>
            <p className="m-small">
              That is our node failing, not the market. Reload in a moment.
            </p>
          </div>
        ) : (
          <>
            <div className="m-stats" style={{ marginBottom: "2.5rem" }}>
              <div>
                <span className="m-label m-stat__k">Jobs ever opened</span>
                <span className="m-stat__v">{book.opened}</span>
              </div>
              <div>
                <span className="m-label m-stat__k">Live right now</span>
                <span className="m-stat__v">{book.active}</span>
              </div>
              <div>
                <span className="m-label m-stat__k">Capital under mandate</span>
                <span className="m-stat__v">{bnb(book.underMandateWei, 4)}</span>
              </div>
              <div>
                <span className="m-label m-stat__k">Agent money at risk</span>
                <span className="m-stat__v">{bnb(book.bondedWei, 5)}</span>
              </div>
            </div>

            {book.unread.length ? (
              <p className="m-error" style={{ marginBottom: "1.5rem" }}>
                {book.unread.join(", ")} would not answer, so {book.unread.length === 1 ? "its" : "their"}{" "}
                rows are missing from the totals above rather than counted as zero.
              </p>
            ) : null}

            <div className="m-head">
              <h2 className="m-h2">The tape</h2>
              <p className="m-head__note">
                Read at block {book.blockNumber?.toString() ?? "unknown"}. Opening a job
              takes you into the technical record, which is a denser document
              than this one.
              </p>
            </div>

            {book.rows.length === 0 ? (
              <div className="m-absent">
                <p className="m-absent__t">No job has been opened yet.</p>
              </div>
            ) : (
              <ol className="m-tape">
                {book.rows.map((r) => {
                  const category = CATEGORIES[r.category] ?? null;
                  return (
                    <li className="m-tape__row" key={`${r.deployment.label}-${r.id}`}>
                      {category ? <CategoryMark category={category} size={30} /> : <span />}
                      <div>
                        <p className="m-small">
                          Someone committed <strong>{bnb(r.capitalWei)}</strong> to a{" "}
                          <strong>
                            {category ? CATEGORY_LABEL[category].toLowerCase() : "mandate"}
                          </strong>{" "}
                          job. It is {STATE[r.state] ?? `in state ${r.state}`}
                          {r.agent && r.agent !== "0x0000000000000000000000000000000000000000"
                            ? `, held by ${short(r.agent)} against a ${bnb(r.bondWei)} bond`
                            : ""}
                          .
                        </p>
                        <p className="m-note" style={{ marginTop: "0.25rem" }}>
                          {r.epochsSettled} of {r.epochsTotal} hours settled
                          {r.epochsSettled > 0
                            ? ` · ${(Number(r.cumulativeAlphaBps) / 100).toFixed(2)}% against the benchmark`
                            : ""}
                          {r.strikes > 0 ? ` · ${r.strikes} strikes` : ""}
                          {r.deployment.status !== "canonical"
                            ? ` · on ${r.deployment.label}, an earlier contract we replaced`
                            : ""}
                        </p>
                      </div>
                      <Link
                        className="m-btn m-btn--sm m-btn--quiet"
                        href={
                          r.deployment.status === "canonical"
                            ? `/receipts/${r.id}`
                            : mandatePath(r.deployment.address, r.id)
                        }
                      >
                        {r.deployment.status === "canonical" ? "Receipt →" : "Full record →"}
                      </Link>
                    </li>
                  );
                })}
              </ol>
            )}
          </>
        )}

        <section className="m-section">
          <div className="m-head">
            <h2 className="m-h2">The first hire, transaction by transaction</h2>
            <p className="m-head__note">Real money on mainnet. Open any of them.</p>
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
        </section>
      </div>
    </AppShell>
  );
}
