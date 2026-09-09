import Command from "./Command";
import Observation from "./Observation";

export interface AttestationView {
  /** Which epoch this commitment covers. "open" is the pre-award reading. */
  epoch: number | "open";
  observationHash: string;
  valuationWei?: bigint | string | null;
  blockNumber: bigint | number | string;
  takenAt?: string | number | Date | null;
  /** Greenfield object holding the token-by-token preimage. */
  breakdownUrl?: string | null;
  /** The digest of that preimage, as committed on chain. */
  breakdownRef?: string | null;
  /** True where the emitted observation re-hashes to the committed digest. */
  matches?: boolean | null;
}

/**
 * A commitment made before the outcome was known.
 *
 * This is the component that answers the only question that ever mattered
 * about this product: where does the number come from. The digest was written
 * to the chain at award time; the preimage is on Greenfield; the settlement
 * event carries the full observation. Anyone can hash the one and compare it
 * to the other, and the command to do it is printed underneath.
 *
 * Nothing here is asserted by us. Every field is a chain read or a link to
 * one.
 */
export default function Attestation({
  attestations,
  mandateId,
  chainId = 56,
}: {
  attestations: AttestationView[];
  mandateId: number;
  chainId?: number;
}) {
  return (
    <section className="panel" aria-labelledby="attest-title">
      <div className="panel__head">
        <h2 id="attest-title" className="mark-label">
          Attestations
        </h2>
        <span className="mark-label">committed before the outcome</span>
      </div>

      <div className="panel__body panel__body--flush">
        {attestations.length === 0 ? (
          <p className="small dim att__empty">No attestation has been committed yet.</p>
        ) : (
          <ul className="att">
            {attestations.map((a) => (
              <li className="att__row" key={String(a.epoch)}>
                <span className="att__epoch mark-label">
                  {a.epoch === "open" ? "opening" : `epoch ${a.epoch}`}
                </span>

                <code className="att__hash num" title={a.observationHash}>
                  {short(a.observationHash)}
                </code>

                <Observation
                  size="small"
                  value={a.valuationWei ? `${weiToBnb(a.valuationWei)} BNB` : undefined}
                  block={a.blockNumber}
                  at={a.takenAt ?? null}
                />

                <span className="att__links">
                  {a.breakdownUrl ? (
                    <a
                      className="num"
                      href={a.breakdownUrl}
                      target="_blank"
                      rel="noreferrer"
                      title={a.breakdownRef ?? undefined}
                    >
                      preimage ↗
                    </a>
                  ) : (
                    <span className="num dim">no preimage</span>
                  )}
                </span>

                {a.matches === null || a.matches === undefined ? null : (
                  <span
                    className="att__match mark-label"
                    style={{ color: a.matches ? "var(--verify)" : "var(--cancelled)" }}
                  >
                    {a.matches ? "re-hashes" : "MISMATCH"}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="panel__body">
        <Command note="Reads the chain and nothing else — no database, no API, no file we control. Exit 0 verified, 1 mismatch, 3 inconclusive.">
          {`npx mandate-verify --mandate ${mandateId} --chain ${chainId}`}
        </Command>
      </div>
    </section>
  );
}

const short = (h: string) => (h.length > 20 ? `${h.slice(0, 10)}…${h.slice(-8)}` : h);

/** Six decimals: enough to see a bond move, few enough to stay tabular. */
export const weiToBnb = (wei: bigint | string | number): string => {
  const v = BigInt(wei);
  const whole = v / 10n ** 18n;
  const frac = (v % 10n ** 18n).toString().padStart(18, "0").slice(0, 6);
  return `${whole}.${frac}`;
};
