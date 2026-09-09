import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { formatEther } from "viem";
import SiteHeader from "@/components/shell/SiteHeader";
import SiteFooter from "@/components/shell/SiteFooter";
import Ledger, { type LedgerEvent } from "@/components/ui/Ledger";
import Attestation, { type AttestationView } from "@/components/ui/Attestation";
import Observation from "@/components/ui/Observation";
import {
  CATEGORY_NAMES,
  MARKET_ADDRESS,
  readBids,
  readMandate,
  readMandateCount,
  STATE_NAMES,
} from "@/lib/chain/market";
import { previousMark, readEpochAttestation, readOpenAttestation } from "@/lib/settlement";
import { bucketName, objectName } from "@/lib/chain/greenfield";
import { readCareerForWallet } from "@/lib/career";
import { CHAIN_ID, EXPLORER } from "@/lib/config";
import { withTimeout } from "@/lib/cache";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `Mandate ${id} — the ledger — MANDATE`,
    description: `Every measurement mandate ${id} was settled against, committed on chain before the outcome was known, with the command that re-derives them.`,
  };
}

interface EpochRead {
  e: number;
  att: Awaited<ReturnType<typeof readEpochAttestation>> | null;
  prev: Awaited<ReturnType<typeof previousMark>> | null;
  implied: bigint | null;
}

/** A panel that is still reading. A hairline pulse, never a spinner. */
function PendingPanel({ title }: { title: string }) {
  return (
    <section className="panel" aria-busy="true">
      <div className="panel__head">
        <h2 className="mark-label">{title}</h2>
        <span className="mark-label">scanning event logs</span>
      </div>
      <div className="panel__body">
        <span className="hairline" aria-hidden />
      </div>
    </section>
  );
}

/**
 * The life of the mandate, in the order it happened.
 *
 * Each row is an event the chain recorded, with the transaction that did it. A
 * mandate is a sequence of occurrences, not a performance figure — and the
 * figure would rest on these rows anyway, so the rows are what is published.
 */
async function Life({
  mandateId,
  mandate: m,
  opening,
  epochs,
}: {
  mandateId: number;
  mandate: Awaited<ReturnType<typeof readMandate>>;
  opening: Awaited<ReturnType<typeof readOpenAttestation>> | null;
  epochs: EpochRead[];
}) {
  const n = mandateId;
  // Capped: a log scan with no deadline holds the response open indefinitely.
  const career = await withTimeout(
    readCareerForWallet(m.agent).catch(() => null),
    20_000,
  );
  const settledHere = (career?.epochs ?? []).filter((x) => x.mandateId === n);
  const dismissedHere = (career?.dismissals ?? []).filter((x) => x.mandateId === n);

  const events: LedgerEvent[] = [];
  if (opening) {
    events.push({
      at: Number(opening.takenAt) * 1000,
      block: opening.blockNumber,
      title: "Opening mark taken",
      figure: `${bnb(opening.valuationWei)} BNB`,
      note: `Committed as ${opening.observationHash.slice(0, 18)}… before any outcome existed`,
    });
    events.push({
      at: Number(opening.takenAt) * 1000,
      block: opening.blockNumber,
      title: "Capital escrowed",
      figure: `${bnb(m.capital)} BNB`,
    });
    if (m.bond > 0n) {
      events.push({
        at: Number(opening.takenAt) * 1000,
        block: opening.blockNumber,
        title: "Bond posted by holder",
        figure: `${bnb(m.bond)} BNB`,
        note: m.agent,
      });
    }
  }
  for (const { e, att, implied } of epochs) {
    const settled = settledHere.find((x) => x.epoch === e);
    const slashed = settled ? BigInt(settled.slashedWei) : 0n;
    const alpha = settled ? Number(settled.alphaBps) : implied === null ? null : Number(implied);
    events.push({
      at: att ? Number(att.takenAt) * 1000 : null,
      block: att?.blockNumber ?? settled?.blockNumber,
      title: `Epoch ${e} settled`,
      figure: alpha === null ? "—" : pct(alpha),
      // Gold is earned, not defaulted to: zero alpha is neither a gain nor a
      // loss and takes the neutral ink. Trailing dims; it never alarms.
      tone:
        alpha === null || alpha === 0
          ? null
          : alpha > 0
            ? "var(--gold-999)"
            : "var(--pewter-500)",
      flag:
        slashed > 0n
          ? `slashed ${bnb(slashed)}`
          : settled && BigInt(settled.feePaidWei) > 0n
            ? `fee ${bnb(BigInt(settled.feePaidWei))}`
            : null,
      txHash: settled?.txHash ?? null,
      note: att
        ? `Against mark ${att.observationHash.slice(0, 18)}… at block ${att.blockNumber}`
        : "No attestation stored for this epoch",
    });
  }
  for (const d of dismissedHere) {
    events.push({
      block: d.blockNumber,
      title: "Holder dismissed",
      figure: "bond forfeit",
      tone: "var(--cancelled)",
      flag: "dismissed",
      txHash: d.txHash,
      note: d.reason || "no reason recorded",
    });
  }

  return (
    <>
      <section className="panel" aria-labelledby="life-title">
        <div className="panel__head">
          <h2 id="life-title" className="mark-label">
            The ledger
          </h2>
          <Observation size="small" at={m.lastSettledAt ? m.lastSettledAt * 1000 : null} />
        </div>
        <div className="panel__body">
          <Ledger events={events} />
          {career && !career.logsRead ? (
            <p className="tbl__foot">
              No provider would serve the log range, so the transactions behind these
              epochs could not be listed. The attestations below are contract storage and
              are complete.
            </p>
          ) : null}
        </div>
      </section>

      {epochs.length ? (
        <section className="panel" aria-labelledby="marks-title">
          <div className="panel__head">
            <h2 id="marks-title" className="mark-label">
              What the marks imply
            </h2>
            <span className="mark-label">recomputed here from the two commitments</span>
          </div>
          <div className="panel__body">
            <div className="tablewrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>epoch</th>
                    <th className="r">previous mark</th>
                    <th className="r">this mark</th>
                    <th className="r">implied α</th>
                    <th className="r">settled α</th>
                  </tr>
                </thead>
                <tbody>
                  {epochs.map(({ e, att, prev, implied }) => {
                    const settled = settledHere.find((x) => x.epoch === e);
                    return (
                      <tr key={e}>
                        <td>{e}</td>
                        <td className="r">{prev ? bnb(prev.valuationWei) : "—"}</td>
                        <td className="r">{att ? bnb(att.valuationWei) : "—"}</td>
                        <td className="r">{implied === null ? "—" : pct(implied)}</td>
                        <td className="r">{settled ? pct(Number(settled.alphaBps)) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="tbl__foot">
              The two right-hand columns are computed independently: the implied figure is
              this page&rsquo;s arithmetic over the committed marks, the settled figure is
              what the contract wrote. Their agreeing is the check.
            </p>
          </div>
        </section>
      ) : null}
    </>
  );
}

const bnb = (wei: bigint) => {
  const n = Number(formatEther(wei));
  return n === 0 ? "0" : n < 0.001 ? n.toFixed(8) : n.toFixed(5);
};
const pct = (bps: bigint | number) => {
  const n = Number(bps) / 100;
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
};

export default async function MandatePage({ params }: { params: Promise<{ id: string }> }) {
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

  /*
    One row per settled epoch, each against the mark before it.

    Read in parallel. Sequentially this was two round trips per epoch against a
    free provider, and the page took eighteen seconds to paint for a mandate
    with a handful of epochs behind it.
  */
  const epochs = await Promise.all(
    Array.from({ length: m.epochsSettled }, async (_, e) => {
      const [att, prev] = await Promise.all([
        readEpochAttestation(n, e).catch(() => null),
        previousMark(n, e).catch(() => null),
      ]);
      const implied =
        att && prev && prev.valuationWei > 0n
          ? (att.valuationWei * 10_000n) / prev.valuationWei - 10_000n
          : null;
      return { e, att, prev, implied };
    }),
  );

  const bucket = bucketName();
  const gwUrl = (epoch: number | "open") =>
    `https://greenfield-sp.lumibot.org:443/view/${bucket}/${objectName(n, epoch)}`;

  /*
    The life of the mandate, in the order it happened.

    Each row is an event the chain recorded, with the transaction that did it.
    A mandate is a sequence of occurrences, not a performance figure — and the
    figure would rest on these rows anyway, so the rows are what is published.
  */
  const attestations: AttestationView[] = [
    ...(opening
      ? [
          {
            epoch: "open" as const,
            observationHash: opening.observationHash,
            valuationWei: opening.valuationWei,
            blockNumber: opening.blockNumber,
            takenAt: Number(opening.takenAt) * 1000,
            breakdownUrl: gwUrl("open"),
          },
        ]
      : []),
    ...epochs
      .filter((x) => x.att)
      .map((x) => ({
        epoch: x.e,
        observationHash: x.att!.observationHash,
        valuationWei: x.att!.valuationWei,
        blockNumber: x.att!.blockNumber,
        takenAt: Number(x.att!.takenAt) * 1000,
        breakdownUrl: gwUrl(x.e),
      })),
  ];

  return (
    <div className="app">
      <SiteHeader live status={`mandate ${n} of ${count}`} />

      <main className="shell mandate-page">
        <header className="mandate__head">
          <div>
            <p className="mark-label">Mandate {n}</p>
            <h1 className="h1">
              {CATEGORY_NAMES[m.category] ?? "Mandate"} · {STATE_NAMES[m.state] ?? ""}
            </h1>
          </div>
          <div className="stats">
            <div className="stat">
              <span className="stat__value">{bnb(m.capital)}</span>
              <span className="mark-label">BNB capital</span>
            </div>
            <div className="stat">
              <span className="stat__value">{bnb(m.bond)}</span>
              <span className="mark-label">BNB bond at risk</span>
            </div>
            <div className="stat">
              <span className="stat__value">
                {m.epochsSettled}/{m.epochsTotal}
              </span>
              <span className="mark-label">epochs</span>
            </div>
            <div className="stat">
              <span className="stat__value">{pct(m.cumulativeAlphaBps)}</span>
              <span className="mark-label">cumulative α</span>
            </div>
            <div className="stat">
              <span className="stat__value">{m.strikes}</span>
              <span className="mark-label">strikes</span>
            </div>
          </div>
        </header>

        <p className="small mandate__terms">
          Held by{" "}
          <a className="link-underline num" href={`${EXPLORER}/address/${m.agent}`} rel="noreferrer" target="_blank">
            {m.agent}
          </a>{" "}
          for{" "}
          <a className="link-underline num" href={`${EXPLORER}/address/${m.principal}`} rel="noreferrer" target="_blank">
            {m.principal.slice(0, 14)}…
          </a>
          . Tolerance {m.toleranceBps} bps, fee {m.feeBps} bps of positive alpha, slash{" "}
          {m.slashBps} bps of the bond per failing epoch.
        </p>

        {/*
          The ledger and the settled-alpha column both come from an event log
          scan, which against a free provider is the whole cost of this page —
          eighteen seconds for a mandate with a few epochs behind it. The
          attestations are contract reads and arrive at once, so they are not
          made to wait behind the logs.
        */}
        <Suspense fallback={<PendingPanel title="The ledger" />}>
          <Life mandateId={n} mandate={m} opening={opening} epochs={epochs} />
        </Suspense>

        <Attestation attestations={attestations} mandateId={n} chainId={CHAIN_ID} />

        <section className="panel" aria-labelledby="queue-title">
          <div className="panel__head">
            <h2 id="queue-title" className="mark-label">
              Succession queue
            </h2>
            <span className="mark-label">{bids.length} waiting</span>
          </div>
          <div className="panel__body">
            {bids.length ? (
              <>
                <p className="small excl__lede">
                  If the incumbent is dismissed, one of these takes the mandate in the
                  same transaction. Each has its own capital escrowed against the target
                  it is committing to.
                </p>
                <div className="tablewrap">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>agent</th>
                        <th className="r">bond</th>
                        <th className="r">target α</th>
                        <th>state</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bids.map((b, i) => (
                        <tr key={`${b.agent}-${i}`}>
                          <td>
                            <a
                              className="link-underline num"
                              href={`${EXPLORER}/address/${b.agent}`}
                              rel="noreferrer"
                              target="_blank"
                            >
                              {b.agent.slice(0, 16)}…
                            </a>
                          </td>
                          <td className="r">{bnb(b.bond)}</td>
                          <td className="r">{pct(b.targetAlphaBps)}</td>
                          <td>{b.spent ? "promoted or withdrawn" : "waiting"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <p className="small">
                Nobody is waiting to take this mandate. A dismissal here would return the
                capital rather than hand it on.
              </p>
            )}
          </div>
        </section>
      </main>

      <SiteFooter market={MARKET_ADDRESS} note="Every figure on this page is a contract read or an event log. Nothing is served from our database." />
    </div>
  );
}
