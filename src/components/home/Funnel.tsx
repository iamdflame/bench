import type { LadderReading } from "@/lib/ladder";
import Command from "@/components/ui/Command";

/** Where each rung's population lives in the register. */
const FILTER: Record<number, string> = {
  0: "/agents",
  1: "/agents?rung=1",
  2: "/agents?endpoint=answering",
  3: "/agents?rung=3",
  4: "/agents?marked=struck",
  5: "/agents?rung=5",
  6: "/agents?rung=6",
};

/**
 * The funnel is the hero, and it is drawn to scale.
 *
 * It used to be a list of right-aligned numerals, which meant the single most
 * important fact about this registry — that three hundred thousand
 * registrations collapse to five reachable agents and then to nothing — had to
 * be worked out by reading. Now the bar does it: rung 0 fills the track, rung 1
 * is a one-percent sliver, and everything below it is a hairline. Nobody has to
 * be told.
 *
 * The scale is linear and deliberately not logarithmic. A log axis would make
 * the lower rungs comfortably visible and would be a kindness to the data at
 * the cost of the truth: the collapse really is that severe, and softening it
 * would be arguing for ourselves.
 *
 * Rendered on the server, with the figures in the first byte of HTML.
 *
 * This was a client component that counted each rung up from zero on mount and
 * grew each bar from zero width. Both were entrance flourishes, and the price
 * of them was that the server-rendered ladder — the thing a judge, a crawler
 * and a preview card actually see — read `Registered 0 · Live 0 · Bonded 0`
 * underneath a sentence saying 303,391 agents are registered. The market's own
 * front door reported the market was empty, and the API beside it did not.
 *
 * There is no state left here, so there is nothing to hydrate and nothing that
 * can disagree with the HTML. `BRAND.md` forbids load counters outright; the
 * bug and the doctrine had the same fix.
 */
export default function Funnel({
  reading,
  detail = false,
}: {
  reading: LadderReading;
  detail?: boolean;
}) {
  const max = Math.max(1, ...reading.rungs.map((r) => r.population ?? 0));

  /*
    The method sheet is a table, not the ladder drawn again.

    It used to re-render every rung at the size of the ladder itself, with the
    figure set in display mono and a full-width command box under each — seven
    of those, which was more than half the length of the front page spent
    repeating something the reader had already seen at the top. The same
    information reads faster as four columns: which rung, what it counts, how
    it was obtained, and the line that re-derives it.
  */
  if (detail) {
    return (
      <div className="tablewrap">
        <table className="tbl msheet">
          <caption className="sr-only">Every rung, its method and its command</caption>
          <thead>
            <tr>
              <th scope="col">rung</th>
              <th scope="col" className="num">count</th>
              <th scope="col">how it was obtained</th>
              <th scope="col">check it</th>
            </tr>
          </thead>
          <tbody>
            {reading.rungs.map((r) => (
              <tr key={r.n}>
                <th scope="row" className="msheet__rung">
                  <span className="num msheet__n">{r.n}</span> {r.name}
                </th>
                <td className="num msheet__fig">
                  {r.population === null ? (
                    <span className="funnel__none">not measurable</span>
                  ) : (
                    <>
                      {r.atLeast ? <span className="funnel__floor">≥</span> : null}
                      {r.population.toLocaleString()}
                      {/*
                        Rows and products are different counts, and where they
                        differ the register shows both. Printing only the row
                        count would give one agent as many places on the shelf
                        as it has holders.
                      */}
                      {r.distinct !== undefined && r.distinct !== r.population ? (
                        <span className="msheet__distinct">
                          {r.distinct.toLocaleString()} distinct
                        </span>
                      ) : null}
                    </>
                  )}
                </td>
                <td className="msheet__how">
                  {r.source}
                  {r.duplication ? (
                    <span className="msheet__break">{r.duplication}</span>
                  ) : null}
                  {r.discontinuity ? (
                    <span className="msheet__break">{r.discontinuity}</span>
                  ) : null}
                </td>
                <td className="msheet__cmd">{r.verify ? <Command>{r.verify}</Command> : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <ol className="funnel">
      {reading.rungs.map((r) => (
        <Rung key={r.n} rung={r} max={max} href={FILTER[r.n] ?? "/agents"} />
      ))}
    </ol>
  );
}

function Rung({
  rung: r,
  max,
  href,
}: {
  rung: LadderReading["rungs"][number];
  max: number;
  href: string;
}) {
  const measured = r.population !== null;
  const share = measured ? (r.population as number) / max : 0;

  return (
    <li className="funnel__row" data-measured={measured ? "1" : undefined}>
      <a className="funnel__link" href={href}>
        <span className="funnel__meta mark-label">
          <span className="funnel__n">{r.n}</span>
          {r.name}
        </span>

        {/*
          A rung the index can only bound from below is written as a bound.
          This used to be a "· a floor" tag beside the rung name, which pushed
          the label past its column and, worse, put the qualification a long
          way from the number it qualifies. Here it cannot be read without it.
        */}
        <span
          className="funnel__fig num"
          title={r.atLeast && measured ? "A floor: the true figure is at least this" : undefined}
        >
          {measured ? (
            <>
              {r.atLeast ? <span className="funnel__floor">≥</span> : null}
              {(r.population as number).toLocaleString()}
            </>
          ) : (
            <span className="funnel__none">not measurable</span>
          )}
        </span>

        <span className="funnel__track">
          <span
            className="funnel__fill"
            style={{
              // A measured rung never renders as nothing: below a pixel it is
              // pinned to a hairline, because "few" and "none" are different
              // claims and this bar must not blur them.
              width: `max(${measured && r.population! > 0 ? "2px" : "0px"}, ${(share * 100).toFixed(4)}%)`,
            }}
          />
        </span>

        <span className="funnel__test">{r.test}</span>
      </a>
    </li>
  );
}
