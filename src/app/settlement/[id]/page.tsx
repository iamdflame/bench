import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { formatEther } from "viem";
import Header from "@/components/shell/Header";
import Footer from "@/components/shell/Footer";
import Reproduce from "@/components/instrument/Reproduce";
import Sparkline from "@/components/instrument/Sparkline";
import { ago, blockLabel } from "@/components/instrument/HonestCount";
import {
  CATEGORY_NAMES,
  STATE_NAMES,
  readBids,
  readMandate,
  readMandateCount,
} from "@/lib/chain/market";
import { previousMark, readEpochAttestation, readOpenAttestation } from "@/lib/settlement";
import { addressUrl, EXPLORER } from "@/lib/config";
import { houseByWallet } from "@/lib/house";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `Mandate ${id} · settlement tape`,
    description: `Every measurement mandate ${id} was settled against, committed on chain before the outcome was known.`,
  };
}

const bnb = (wei: bigint) => {
  const n = Number(formatEther(wei));
  return n === 0 ? "0" : n < 0.001 ? n.toFixed(8) : n.toFixed(5);
};
const pct = (bps: bigint | number) => {
  const n = Number(bps) / 100;
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
};

export default async function SettlementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = Number(id);
  if (!Number.isInteger(n) || n < 0) notFound();
  const count = await readMandateCount().catch(() => 0);
  if (n >= count) notFound();

  const m = await readMandate(n);
  const [bids, opening] = await Promise.all([
    readBids(n).catch(() => []),
    readOpenAttestation(n).catch(() => null),
  ]);
  const epochs = await Promise.all(
    Array.from({ length: m.epochsSettled }, async (_, e) => {
      const [att, prev] = await Promise.all([
        readEpochAttestation(n, e).catch(() => null),
        previousMark(n, e).catch(() => null),
      ]);
      const implied = att && prev && prev.valuationWei > 0n ? (att.valuationWei * 10_000n) / prev.valuationWei - 10_000n : null;
      return { e, att, prev, implied };
    }),
  );
  const house = houseByWallet(m.agent);

  /*
    The per-epoch series, for the sparkline beside the totals.

    Only epochs whose mark the contract actually stored contribute a point. A
    missing attestation is a hole in the record, and a line drawn straight
    through it would be a picture of a track record rather than the one that
    exists.
  */
  const alphaSeries = epochs
    .map((x) => (x.implied == null ? null : Number(x.implied) / 100))
    .filter((v): v is number => v != null);

  const stats = [
    { v: bnb(m.capital), l: "BNB capital" },
    { v: bnb(m.bond), l: "BNB bond at risk" },
    { v: `${m.epochsSettled}/${m.epochsTotal}`, l: "epochs settled" },
    { v: pct(m.cumulativeAlphaBps), l: "cumulative alpha" },
    { v: String(m.strikes), l: "strikes" },
  ];

  return (
    <>
      <Header current="/desk" />
      <main className="shell" style={{ paddingBlock: "2rem", display: "flex", flexDirection: "column", gap: "1.25rem", maxWidth: "56rem" }}>
        <div>
          <span className="meta">Mandate {n}</span>
          <h1 className="hd-hero" style={{ fontSize: "var(--text-2xl)" }}>
            {CATEGORY_NAMES[m.category] ?? "Mandate"} · {STATE_NAMES[m.state] ?? ""}
          </h1>
          <p className="sub" style={{ fontSize: "var(--text-sm)", marginTop: "0.35rem" }}>
            Held by{" "}
            {house ? <strong style={{ fontWeight: 500 }}>{house.name}</strong> : null}{" "}
            <a className="link-accent num" href={addressUrl(m.agent)} target="_blank" rel="noopener noreferrer" style={{ fontSize: "var(--text-xs)" }}>{m.agent.slice(0, 10)}…{m.agent.slice(-6)}</a>.
            Tolerance {m.toleranceBps} bps · fee {m.feeBps} bps of positive alpha · slash {m.slashBps} bps of the bond per failing epoch.
          </p>
        </div>

        {/* stat row */}
        <div className="panel" style={{ padding: "1.1rem 1.25rem", display: "flex", gap: "2rem", flexWrap: "wrap", alignItems: "center" }}>
          {stats.map((s, i) => (
            <div key={s.l} className="reveal" style={{ ["--i" as string]: i }}>
              <div className="num" style={{ fontSize: "var(--text-xl)", color: "var(--color-touchstone)" }}>{s.v}</div>
              <div className="meta">{s.l}</div>
            </div>
          ))}
          {alphaSeries.length > 1 ? (
            <div style={{ marginLeft: "auto", textAlign: "right" }}>
              <Sparkline values={alphaSeries} width={96} height={26} label={`Alpha across ${alphaSeries.length} settled epochs`} />
              <div className="meta" style={{ marginTop: "0.2rem" }}>alpha per epoch</div>
            </div>
          ) : null}
        </div>

        {/* challengeable note */}
        <div className="card" style={{ padding: "1rem 1.15rem" }}>
          <p className="sub" style={{ fontSize: "var(--text-sm)" }}>
            Every epoch below was settled against a measurement <strong style={{ fontWeight: 500 }}>committed to the chain before the outcome was known</strong>, so
            the score cannot be written after the fact. Any of these can be disputed on chain: a
            challenger stakes, the observation is re-derived from the pinned block, and the loser&rsquo;s
            stake is forfeit. This is the whole record, including the losses.
          </p>
        </div>

        {/* the tape */}
        <section className="panel" style={{ overflow: "hidden" }}>
          <div style={{ padding: "0.9rem 1.15rem", borderBottom: "1px solid var(--color-line)" }}>
            <h2 className="hd-3" style={{ fontSize: "var(--text-base)" }}>The settlement tape</h2>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", fontSize: "var(--text-sm)" }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--color-ink-3)", fontSize: "var(--text-2xs)" }}>
                  <th style={th}>event</th>
                  <th style={{ ...th, textAlign: "right" }}>previous mark</th>
                  <th style={{ ...th, textAlign: "right" }}>this mark</th>
                  <th style={{ ...th, textAlign: "right" }}>implied α</th>
                  <th style={{ ...th, textAlign: "right" }}>settled α</th>
                  <th style={{ ...th, textAlign: "right" }}>block</th>
                </tr>
              </thead>
              <tbody>
                {opening ? (
                  <tr style={{ borderTop: "1px solid var(--color-line)" }}>
                    <td style={td}>Opening mark<div className="meta num" style={{ fontSize: "10px" }}>{opening.observationHash.slice(0, 18)}…</div></td>
                    <td style={tdR} className="dim">none</td>
                    <td style={tdR} className="num">{bnb(opening.valuationWei)}</td>
                    <td style={tdR} className="dim">none</td>
                    <td style={tdR} className="dim">none</td>
                    <td style={tdR} className="num meta">{Number(opening.blockNumber).toLocaleString()}</td>
                  </tr>
                ) : null}
                {epochs.map(({ e, att, prev, implied }) => {
                  const alpha = implied;
                  const color = alpha == null ? "var(--color-ink-3)" : alpha > 0n ? "var(--color-pass)" : alpha < 0n ? "var(--color-fail)" : "var(--color-ink-2)";
                  return (
                    <tr key={e} style={{ borderTop: "1px solid var(--color-line)" }}>
                      <td style={td}>Epoch {e} settled{att ? <div className="meta num" style={{ fontSize: "10px" }}>{att.observationHash.slice(0, 18)}…</div> : null}</td>
                      <td style={tdR} className="num">{prev ? bnb(prev.valuationWei) : "none"}</td>
                      <td style={tdR} className="num">{att ? bnb(att.valuationWei) : "none"}</td>
                      <td style={{ ...tdR, color }} className="num">{implied == null ? "none" : pct(implied)}</td>
                      <td style={tdR} className="num">{att ? pct(implied ?? 0n) : "none"}</td>
                      <td style={tdR} className="num meta">{att ? Number(att.blockNumber).toLocaleString() : "none"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {epochs.length === 0 ? (
            <p className="sub" style={{ padding: "1.1rem 1.15rem", fontSize: "var(--text-sm)" }}>
              No epoch has settled yet. The opening mark is committed; the first settlement will
              measure this wallet against it, at a block pinned before the outcome.
            </p>
          ) : (
            <p className="meta" style={{ padding: "0.75rem 1.15rem" }}>
              The implied and settled columns are computed independently. One is this page&rsquo;s arithmetic
              over the committed marks, and what the contract wrote. Their agreeing is the check.
            </p>
          )}
        </section>

        {/* succession queue */}
        <section className="panel" style={{ padding: "1.1rem 1.25rem" }}>
          <h2 className="hd-3" style={{ fontSize: "var(--text-base)" }}>Succession queue · {bids.length} waiting</h2>
          {bids.length ? (
            <ul style={{ marginTop: "0.75rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              {bids.map((b, i) => (
                <li key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-sm)", gap: "1rem", flexWrap: "wrap" }}>
                  <a className="link-accent num" href={addressUrl(b.agent)} target="_blank" rel="noopener noreferrer" style={{ fontSize: "var(--text-xs)" }}>{b.agent.slice(0, 16)}…</a>
                  <span className="num">bond {bnb(b.bond)} · target {pct(b.targetAlphaBps)} · {b.spent ? "promoted/withdrawn" : "waiting"}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="sub" style={{ fontSize: "var(--text-sm)", marginTop: "0.5rem" }}>
              Nobody is waiting to take this mandate. A dismissal here would return the capital rather
              than hand it on.
            </p>
          )}
        </section>

        <Reproduce
          title="Verify this settlement yourself"
          commands={[
            { label: "Re-derive every mark and slash", cmd: `npx mandate-verify --mandate ${n} --chain 56` },
            { label: "Read the mandate straight from the contract", cmd: `cast call ${process.env.NEXT_PUBLIC_MARKET_ADDRESS ?? "$MARKET"} "getMandate(uint256)" ${n} --rpc-url https://bsc-rpc.publicnode.com` },
          ]}
        />
      </main>
      <Footer note={`Every figure here is a contract read or an event log on BNB Smart Chain · explorer ${EXPLORER.replace("https://", "")} · read ${ago(new Date().toISOString())}${blockLabel(m.lastSettledAt) ? "" : ""}`} />
    </>
  );
}

const th: React.CSSProperties = { padding: "0.6rem 1.15rem", fontWeight: 400 };
const td: React.CSSProperties = { padding: "0.6rem 1.15rem", verticalAlign: "top" };
const tdR: React.CSSProperties = { ...td, textAlign: "right" };
