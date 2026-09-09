import type { Metadata } from "next";
import SiteHeader from "@/components/shell/SiteHeader";
import SiteFooter from "@/components/shell/SiteFooter";
import Command from "@/components/ui/Command";
import Observation from "@/components/ui/Observation";
import { EXPLORER } from "@/lib/config";
import { MARKET_ADDRESS } from "@/lib/chain/market";
import restatement from "@/data/restatement.json";

export const metadata: Metadata = {
  title: "Restatement — MANDATE",
  description:
    "We measured our own agents wrong and slashed one for it. Every settled epoch, re-run through the corrected gauge, including what we still cannot prove.",
};

const bnb = (wei: string) => (Number(BigInt(wei)) / 1e18).toFixed(8);
const pct = (bps: number | null) =>
  bps === null ? "—" : `${bps >= 0 ? "+" : ""}${(bps / 100).toFixed(2)}%`;

export default function RestatementPage() {
  const r = restatement;
  const slashed = r.epochs.filter((e) => BigInt(e.slashWei) > 0n);

  return (
    <div className="app">
      <SiteHeader current="/evidence" />

      <main className="shell ev-page">
        <p className="mark-label">Evidence · restatement</p>
        <h1 className="display start-title">
          We measured our own agents wrong, and slashed one for it.
        </h1>
        <p className="lede start-sub">
          The valuation read native BNB and USDT and nothing else. Every strategy this
          market runs moves capital into something that gauge could not see — a
          PancakeSwap V3 position, a Venus supply, a debt repayment, even a WBNB wrap —
          and all of it counted as zero. The better an agent performed, the harder it was
          punished.
        </p>

        <section className="panel" aria-labelledby="rs-scale">
          <div className="panel__head">
            <h2 id="rs-scale" className="mark-label">
              The scale of it
            </h2>
            <Observation size="small" at={r.generatedAt} label="Re-run" />
          </div>
          <div className="panel__body">
            <div className="stats">
              <div className="stat">
                <span className="stat__value">{r.totals.settledEpochs}</span>
                <span className="mark-label">settled epochs on record</span>
              </div>
              <div className="stat">
                <span className="stat__value">{r.totals.slashes}</span>
                <span className="mark-label">slashes taken</span>
              </div>
              <div className="stat">
                <span className="stat__value">{bnb(r.totals.slashedWei)}</span>
                <span className="mark-label">BNB slashed</span>
              </div>
              <div className="stat">
                <span className="stat__value">{r.totals.rederived}</span>
                <span className="mark-label">re-derived so far</span>
              </div>
            </div>
            <p className="small au__lede rs__note">
              Not theoretical. The wallet holding mandates on the live market carries a
              Venus supply worth roughly 23% of its total value, and the old gauge valued
              it at nothing.
            </p>
          </div>
        </section>

        <section className="panel" aria-labelledby="rs-slashes">
          <div className="panel__head">
            <h2 id="rs-slashes" className="mark-label">
              The slashes on record
            </h2>
            <span className="mark-label">
              {slashed.filter((s) => !s.slashResolved).length} still pending
            </span>
          </div>
          <div className="panel__body">
            <div className="tablewrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>market</th>
                    <th className="r">mandate</th>
                    <th className="r">epoch</th>
                    <th className="r">reported α</th>
                    <th className="r">slashed</th>
                    <th>state</th>
                  </tr>
                </thead>
                <tbody>
                  {slashed.map((e) => (
                    <tr key={`${e.market}-${e.mandateId}-${e.epoch}`}>
                      <td>
                        <a
                          className="link-underline"
                          href={`${EXPLORER}/address/${e.market}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {e.marketName}
                        </a>
                      </td>
                      <td className="r">{e.mandateId}</td>
                      <td className="r">{e.epoch}</td>
                      <td className="r">{pct(e.reportedAlphaBps)}</td>
                      <td className="r">{bnb(e.slashWei)}</td>
                      <td style={{ color: e.slashResolved ? undefined : "var(--cancelled)" }}>
                        {e.slashResolved ? "resolved" : "pending"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="tbl__foot">
              Every one is against the same agent, and none has been resolved.{" "}
              <code>resolveSlash(mandateId, epoch, false)</code> returns a pending slash
              to the agent, and this project owns both affected contracts, so the remedy
              is one transaction away from the moment the error is established.
            </p>
          </div>
        </section>

        <section className="panel" aria-labelledby="rs-rederive">
          <div className="panel__head">
            <h2 id="rs-rederive" className="mark-label">
              Re-derivation
            </h2>
            <span className="mark-label">
              {r.totals.rederived} of {r.totals.settledEpochs} re-derived
            </span>
          </div>
          <div className="panel__body">
            <div className="tablewrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>market</th>
                    <th className="r">mandate</th>
                    <th className="r">epoch</th>
                    <th className="r">block</th>
                    <th className="r">reported</th>
                    <th className="r">corrected</th>
                    <th>status</th>
                  </tr>
                </thead>
                <tbody>
                  {r.epochs.map((e) => (
                    <tr key={`d-${e.market}-${e.mandateId}-${e.epoch}`}>
                      <td>{e.marketName}</td>
                      <td className="r">{e.mandateId}</td>
                      <td className="r">{e.epoch}</td>
                      <td className="r">{e.attestedBlock ?? "—"}</td>
                      <td className="r">{pct(e.reportedAlphaBps)}</td>
                      <td className="r">{pct(e.correctedAlphaBps)}</td>
                      <td className="rs__status">{e.blockedBy ?? "re-derived"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="panel" aria-labelledby="rs-open">
          <div className="panel__head">
            <h2 id="rs-open" className="mark-label">
              What is not established
            </h2>
          </div>
          <div className="panel__body">
            <p className="small au__unread">
              Re-deriving a valuation at a past block needs archive state, and BSC&rsquo;s
              public endpoints serve about fifty seconds of it — <code>bsc-dataseed</code>{" "}
              answers <code>missing trie node</code>, <code>blockrazor</code> answers{" "}
              <code>not supported</code>, <code>publicnode</code> demands a token. The
              attested blocks are hours old.
            </p>
            <p className="small au__lede">
              So the slashes above are <strong>not yet proven to have been taken in
              error</strong>, and no money has been returned on the strength of an
              assumption. Correcting the record with an unverified correction would repeat
              the exact failure this page exists to report — and it would be worse for
              being inside a confession.
            </p>
            <Command note="Completes the re-derivation and, where a slash is shown to have been taken in error, names the transaction that returns it.">
              npm run restate -- --archive &lt;archive-rpc-url&gt;
            </Command>
          </div>
        </section>
      </main>

      <SiteFooter
        market={MARKET_ADDRESS}
        note="Generated by npm run restate. The page renders from the same data the document does, so the two cannot drift."
      />
    </div>
  );
}
