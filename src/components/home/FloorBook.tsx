import CategoryMark from "@/components/mark/CategoryMark";
import Observation from "@/components/ui/Observation";
import { CATEGORIES, CATEGORY_LABEL } from "@/lib/config";
import type { Book } from "@/lib/chain/book";

/**
 * The book, on the front door, rendered on the server.
 *
 * What stood here was a WebGL window that opened an `EventSource` from an
 * effect. With JavaScript off — a crawler, a preview card, the first paint for
 * everyone — it printed the word `idle` while `/floor` two clicks away listed
 * eight live mandates. The front page of a market reported that the market was
 * not running.
 *
 * So the front door shows the book itself: the same rows, read on the server
 * from the same three deployments `/floor` reads, in the first byte of HTML.
 * The simulation stays on `/floor`, where a reader has already decided to look
 * at the market and where a WebGL context is not being charged to the four
 * seconds that decide whether they stay.
 *
 * The status word is derived from the rows rather than from a socket, so it
 * cannot say `idle` while there are mandates open. When the chain could not be
 * read it says which deployments went unread, because a partial book presented
 * as a whole one is the failure this product exists to catch.
 */
export default function FloorBook({ book, rows = 4 }: { book: Book; rows?: number }) {
  /*
    Canonical deployment first, then by capital.

    Sorting on capital alone put three superseded mandates at the top and left
    the front door showing no row from the contract the footer calls canonical
    — the market's own summary disagreeing with its own address. The earlier
    books stay in the count and stay one click away on /floor; every row names
    the deployment it came from either way.
  */
  const live = book.rows
    .filter((r) => r.state === 0 || r.state === 1)
    .sort(
      (a, b) =>
        a.deployment.rank - b.deployment.rank || Number(b.capitalWei - a.capitalWei),
    )
    .slice(0, rows);

  const more = book.active - live.length;

  return (
    <div className="fbook">
      <div className="fbook__totals">
        <Observation
          size="small"
          label="Active"
          value={`${book.active}`}
          block={book.blockNumber ? Number(book.blockNumber) : undefined}
          at={book.at}
        />
        <Observation size="small" label="Opened all-time" value={`${book.opened}`} />
        <Observation
          size="small"
          label="Under mandate"
          value={`${bnb(book.underMandateWei)} BNB`}
        />
        <Observation size="small" label="Bond at risk" value={`${bnb(book.bondedWei)} BNB`} />
      </div>

      <div className="tablewrap">
        <table className="tbl fbook__tbl">
          <thead>
            <tr>
              <th className="mark-col">mark</th>
              <th>#</th>
              <th>office</th>
              <th className="r">capital</th>
              <th>holder</th>
              <th className="r">bond at risk</th>
              <th className="r">alpha</th>
              <th className="r">epochs</th>
            </tr>
          </thead>
          <tbody>
            {live.length === 0 ? (
              <tr>
                <td colSpan={8} className="empty">
                  {book.unread.length
                    ? `The book could not be read${book.unread.length ? ` for ${book.unread.join(", ")}` : ""}. No count is drawn from a partial read.`
                    : "No mandate is open. That is the finding, not a loading state."}
                </td>
              </tr>
            ) : (
              live.map((r) => {
                const c = CATEGORIES[r.category] ?? null;
                const held = !/^0x0+$/i.test(r.agent);
                return (
                  <tr key={`${r.deployment.label}-${r.id}`}>
                    <td className="mark-col">
                      {c ? (
                        <CategoryMark category={c} size={18} metal="var(--silver-925)" />
                      ) : null}
                    </td>
                    <td className="num">
                      <a href={hrefFor(r.deployment.label, r.id)}>{r.id}</a>
                      {r.deployment.label === "v2" ? null : (
                        <span className="mark-label fbook__dep"> {r.deployment.label}</span>
                      )}
                    </td>
                    <td>{c ? CATEGORY_LABEL[c] : "—"}</td>
                    <td className="r num">{bnb(r.capitalWei)}</td>
                    {/*
                      A mandate nobody has taken has no holder, and printing the
                      zero address as one made an open lot look like a filled
                      one held by a broken wallet. Open for bids is the finding.
                    */}
                    <td className={held ? "num" : undefined}>
                      {held ? (
                        <>
                          {r.agent.slice(0, 8)}…{r.agent.slice(-4)}
                        </>
                      ) : (
                        <span className="mark-label">open for bids</span>
                      )}
                    </td>
                    <td className="r num">{held ? bnb(r.bondWei) : "—"}</td>
                    <td className="r num">{held ? alpha(r.cumulativeAlphaBps) : "—"}</td>
                    <td className="r num">
                      {held ? `${r.epochsSettled}/${r.epochsTotal}` : `0/${r.epochsTotal}`}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="fbook__foot">
        <span className="mark-label">
          {more > 0
            ? `${more} more open on the floor`
            : book.active > 0
              ? "the whole book"
              : "nothing open"}
          {book.unread.length ? ` · ${book.unread.join(", ")} unread` : ""}
        </span>
        <a className="btn btn--sm" href="/floor">
          Open the market floor →
        </a>
      </div>
    </div>
  );
}

/**
 * Mandate 0 exists on all three contracts and means three different things, so
 * only the canonical book keeps the short link.
 */
const hrefFor = (label: string, id: number) =>
  label === "v2" ? `/mandate/${id}` : `/ledger/${label}/${id}`;

const bnb = (wei: bigint) => (Number(wei) / 1e18).toFixed(5);

const alpha = (bps: bigint) =>
  `${bps > 0n ? "+" : ""}${(Number(bps) / 100).toFixed(2)}%`;
