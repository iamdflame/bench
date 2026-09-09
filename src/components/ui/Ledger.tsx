import { EXPLORER } from "@/lib/config";

export interface LedgerEvent {
  /** Wall clock, when known. Rendered HH:MM — the day is in the header. */
  at?: string | number | Date | null;
  block?: number | string | bigint | null;
  /** What happened. Two to four words. */
  title: string;
  /** The figure it moved. Monospaced, tabular. */
  figure?: string | null;
  /** A consequence worth naming: SLASHED 25%, DISMISSED. */
  flag?: string | null;
  /** Metal the figure is struck in. */
  tone?: string | null;
  txHash?: string | null;
  /** Anything that needs a sentence. Sits under the row, dimmed. */
  note?: string | null;
}

/**
 * A mandate's life, in the order it happened.
 *
 * Not a chart and not a summary. A mandate is a sequence of things that
 * occurred on chain, each with a transaction anyone can open, and collapsing
 * that into a performance figure would discard exactly the evidence the
 * figure is supposed to rest on.
 *
 * Underperformance is rendered as absence of light and never as alarm. The
 * only red in this product is a defaced mark.
 */
export default function Ledger({ events }: { events: LedgerEvent[] }) {
  if (!events.length) {
    return <p className="small dim">Nothing has happened yet.</p>;
  }

  return (
    <ol className="ledger">
      {events.map((e, i) => (
        <li className="ledger__row" key={`${e.txHash ?? ""}-${i}`}>
          <span className="ledger__time num">{clock(e.at)}</span>
          <span className="ledger__title">{e.title}</span>
          <span
            className="ledger__figure num"
            style={e.tone ? { color: e.tone } : undefined}
          >
            {e.figure ?? ""}
          </span>
          <span className="ledger__flag num">{e.flag ?? ""}</span>
          <span className="ledger__tx">
            {e.txHash ? (
              <a
                className="num"
                href={`${EXPLORER}/tx/${e.txHash}`}
                target="_blank"
                rel="noreferrer"
                title={e.txHash}
              >
                tx
              </a>
            ) : e.block !== undefined && e.block !== null ? (
              <a
                className="num"
                href={`${EXPLORER}/block/${String(e.block)}`}
                target="_blank"
                rel="noreferrer"
              >
                blk
              </a>
            ) : null}
          </span>
          {e.note ? <p className="ledger__note num">{e.note}</p> : null}
        </li>
      ))}
    </ol>
  );
}

/** HH:MM in UTC, so two readers in two timezones see the same ledger. */
function clock(at: LedgerEvent["at"]): string {
  if (at === null || at === undefined) return "—";
  const d = new Date(at);
  if (!Number.isFinite(d.getTime())) return "—";
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}
