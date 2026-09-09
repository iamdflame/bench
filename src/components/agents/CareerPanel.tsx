import { formatEther } from "viem";
import type { Career } from "@/lib/career";
import Command from "@/components/ui/Command";
import Ledger, { type LedgerEvent } from "@/components/ui/Ledger";

const bnb = (wei: string) => {
  const n = Number(formatEther(BigInt(wei)));
  if (n === 0) return "0";
  return n < 0.001 ? n.toFixed(8) : n.toFixed(4);
};

const pct = (bps: string) => {
  const n = Number(bps) / 100;
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
};

/**
 * What this agent has actually done with capital.
 *
 * Not a score. Every mandate held, every epoch settled, every fee earned and
 * every slash taken, each with the transaction that did it. The brief asks how
 * an agent has performed; this answers with a list, because collapsing a
 * career into a rating is the move that made the registry's own numbers
 * worthless.
 */
export default function CareerPanel({ career }: { career: Career; explorer?: string }) {
  const t = career.totals;
  const nothing = t.mandates === 0 && t.epochs === 0;

  const events: LedgerEvent[] = career.epochs.map((e) => {
    const alpha = Number(e.alphaBps);
    const slashed = BigInt(e.slashedWei);
    return {
      block: e.blockNumber,
      title: `Mandate ${e.mandateId} · epoch ${e.epoch} settled`,
      figure: pct(e.alphaBps),
      // Gold is earned, not defaulted to: zero alpha is neither a gain nor a
      // loss and takes the neutral ink. Trailing dims; it never alarms.
      tone: alpha === 0 ? null : alpha > 0 ? "var(--gold-999)" : "var(--pewter-500)",
      flag: slashed > 0n ? `slashed ${bnb(e.slashedWei)}` : null,
      txHash: e.txHash,
      note: BigInt(e.feePaidWei) > 0n ? `fee paid ${bnb(e.feePaidWei)} BNB` : null,
    };
  });

  return (
    <section className="panel" aria-labelledby="career-title">
      <div className="panel__head">
        <h2 id="career-title" className="mark-label">
          Career
        </h2>
        <span className="mark-label">
          {t.mandates} mandate{t.mandates === 1 ? "" : "s"} · {t.epochs} epoch
          {t.epochs === 1 ? "" : "s"}
        </span>
      </div>

      <div className="panel__body">
        {nothing ? (
          <p className="small">
            This agent has never held a mandate here. That is the ordinary case:
            nobody from the registry has posted a bond yet, which is the gap the market
            exists to close rather than a fact about this agent.
          </p>
        ) : (
          <>
            <div className="stats career__totals">
              <div className="stat">
                <span className="stat__value">{t.mandates}</span>
                <span className="mark-label">mandates held</span>
              </div>
              <div className="stat">
                <span className="stat__value">{t.epochs}</span>
                <span className="mark-label">epochs settled</span>
              </div>
              <div className="stat">
                <span className="stat__value">{bnb(t.feesEarnedWei)}</span>
                <span className="mark-label">BNB fees earned</span>
              </div>
              <div className="stat">
                <span className="stat__value">{bnb(t.slashedWei)}</span>
                <span className="mark-label">BNB slashed</span>
              </div>
              <div className="stat">
                <span className="stat__value">{t.dismissals}</span>
                <span className="mark-label">dismissals</span>
              </div>
            </div>

            {career.mandates.length ? (
              <div className="tablewrap career__table">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>mandate</th>
                      <th>office</th>
                      <th>state</th>
                      <th className="r">capital</th>
                      <th className="r">bond</th>
                      <th className="r">epochs</th>
                      <th className="r">cumulative α</th>
                      <th className="r">strikes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {career.mandates.map((m) => (
                      <tr key={m.id}>
                        <td>
                          <a className="link-underline" href={`/mandate/${m.id}`}>
                            {m.id}
                          </a>
                        </td>
                        <td>{m.category}</td>
                        <td>{m.state}</td>
                        <td className="r">{bnb(m.capitalWei)}</td>
                        <td className="r">{bnb(m.bondWei)}</td>
                        <td className="r">
                          {m.epochsSettled}/{m.epochsTotal}
                        </td>
                        <td className="r">{pct(m.cumulativeAlphaBps)}</td>
                        <td className="r">{m.strikes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            {events.length ? (
              <>
                <p className="mark-label career__label">Every epoch, in order</p>
                <Ledger events={events} />
              </>
            ) : null}

            {career.dismissals.length ? (
              <ul className="au__reasons career__dismissals">
                {career.dismissals.map((d) => (
                  <li key={d.txHash}>
                    Dismissed from mandate {d.mandateId} — {d.reason || "no reason recorded"}
                  </li>
                ))}
              </ul>
            ) : null}

            {!career.logsRead ? (
              <p className="tbl__foot">
                The epoch list could not be read: no provider would serve the log range.
                What is shown above comes from contract storage, so the mandates are
                complete and the per-epoch rows may not be.
              </p>
            ) : null}
          </>
        )}
      </div>

      {career.verify ? (
        <div className="panel__body">
          <Command note="Reads the same contract storage this page did.">
            {career.verify}
          </Command>
        </div>
      ) : null}
    </section>
  );
}
