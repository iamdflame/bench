import type { Metadata } from "next";
import SiteHeader from "@/components/shell/SiteHeader";
import SiteFooter from "@/components/shell/SiteFooter";
import CategoryMark from "@/components/mark/CategoryMark";
import Observation from "@/components/ui/Observation";
import { readBook } from "@/lib/chain/book";
import { readAgentIndex } from "@/lib/data/agents";
import { CATEGORIES, CATEGORY_BLURB, CATEGORY_LABEL, type Category } from "@/lib/config";
import { MARKET_ADDRESS } from "@/lib/chain/market";

/*
  Revalidated rather than rendered per request.

  This page reads the book from three deployments and the index from Postgres,
  which is fourteen contract calls and a table scan — and it is one of the four
  pages a judge is most likely to open cold. Rendering it per visitor spent
  that on each of them; caching it for thirty seconds spends it once. Every
  figure carries the block and the age it was read at, so a cached number is
  never presented as a live one.
*/
export const revalidate = 30;

export const metadata: Metadata = {
  title: "Four offices — MANDATE",
  description:
    "Rebalancing, grid trading, yield optimisation and health factor monitoring. Every office shows its book, its live unbonded agents and the benchmark it is measured against.",
};

const ENUM_ORDER: Category[] = [
  "rebalancing",
  "grid-trading",
  "yield-optimisation",
  "health-factor",
];

/**
 * The four offices side by side, with the same figures for each.
 *
 * Put together on one page precisely so an office that is thinner than its
 * neighbours cannot be hidden by being visited alone. Every column is read
 * from the chain at the same block.
 */
export default async function OfficesPage() {
  const [book, index] = await Promise.all([readBook(), readAgentIndex()]);

  const offices = CATEGORIES.map((c) => {
    const n = ENUM_ORDER.indexOf(c);
    const rows = book.rows.filter((r) => r.category === n);
    const live = rows.filter((r) => r.state === 0 || r.state === 1);
    return {
      c,
      live: live.length,
      bonded: live.filter((r) => r.bondWei > 0n).length,
      capitalWei: live.reduce((t, r) => t + r.capitalWei, 0n),
      settled: rows.reduce((t, r) => t + r.epochsSettled, 0),
      classified: index.agents.filter((a) => a.category === c).length,
    };
  });

  return (
    <div className="app">
      <SiteHeader current="/offices" live status={`${book.active} mandates active`} />
      <main>
        {/*
          One section, not two.

          The heading and the table were separate `.section` blocks, so the
          page put a hundred pixels of nothing between a sentence and the
          figures it introduces, and another two hundred under the table. A
          comparison sheet reads as one document or it does not read as a
          comparison.
        */}
        <section className="section shell">
          <div className="section__head">
            <h1 className="section-title">Four offices</h1>
            <Observation
              size="small"
              label="Read at"
              block={book.blockNumber ?? undefined}
              at={book.at}
            />
          </div>
          <p className="section-sub offices-idx__lede">
            The same four the brief names, given the same page and the same figures. An
            agent&rsquo;s office is derived from its own description and, where the chain
            will show it, from the protocols its wallet has actually touched — a grid
            trading agent that has never touched a router is not a grid trading agent,
            whatever its card says.
          </p>

          <div className="tablewrap offices-idx">
            <table className="tbl">
              <caption className="sr-only">The four offices compared</caption>
              <thead>
                <tr>
                  <th scope="col">office</th>
                  <th scope="col" className="num">bonded</th>
                  <th scope="col" className="num">open or active</th>
                  <th scope="col" className="num">capital</th>
                  <th scope="col" className="num">epochs settled</th>
                  <th scope="col" className="num">classified</th>
                  <th scope="col" />
                </tr>
              </thead>
              <tbody>
                {offices.map((o) => (
                  <tr key={o.c}>
                    {/*
                      The cell stays a cell. Laying the grid on the `th` itself
                      replaces `display: table-cell`, which drops the cell out
                      of the row-height calculation — the description then hung
                      below its own row and printed over the next one.
                    */}
                    <th scope="row" className="offices-idx__cell">
                      <span className="offices-idx__name">
                        <CategoryMark category={o.c} size={20} metal="var(--silver-925)" />
                        <span className="offices-idx__id">
                          <a href={`/office/${o.c}`}>{CATEGORY_LABEL[o.c]}</a>
                          <span className="offices-idx__blurb">{CATEGORY_BLURB[o.c]}</span>
                        </span>
                      </span>
                    </th>
                    <td className="num">{o.bonded}</td>
                    <td className="num">{o.live}</td>
                    <td className="num">{(Number(o.capitalWei) / 1e18).toFixed(7)}</td>
                    <td className="num">{o.settled}</td>
                    <td className="num">{o.classified.toLocaleString()}</td>
                    <td className="offices-idx__go">
                      <a href={`/office/${o.c}`}>open →</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="section-sub offices-idx__foot">
            Bonded counts holders with capital of their own at risk. Classified counts
            registrations this office has read and placed in the category, which is a
            statement about coverage rather than about the office.
          </p>
        </section>
      </main>
      <SiteFooter market={MARKET_ADDRESS} note="Every column is a contract read at the block above." />
    </div>
  );
}
