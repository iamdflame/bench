/**
 * The board, with §12.1's `FOR YOU` column filled in.
 *
 * ---------------------------------------------------------------------------
 * One walk, not one per row
 * ---------------------------------------------------------------------------
 *
 * The naive reading of "a figure on every row" is a replay per agent, which for
 * fifty rows would be fifty walks of a pool's swap history and a page nobody
 * waits for. It is not needed: the reference strategies are *shared*, so one
 * walk of the reader's own pool produces every row's number at once. The column
 * costs the same as the agent page's single panel.
 *
 * ---------------------------------------------------------------------------
 * Why the whole board streams only when an address is given
 * ---------------------------------------------------------------------------
 *
 * Next streams a Suspense boundary by sending the fallback first and swapping
 * in the real content with an inline script. With JavaScript disabled that swap
 * never happens and the fallback is all a reader gets — so wrapping the board
 * unconditionally would break the plan's own floor (§13.5: the full read path
 * works with JavaScript off) and the smoke check that holds it.
 *
 * So the default board is rendered straight, exactly as before, and only the
 * opt-in `?position=` path streams. The cost of the feature falls entirely on
 * the person who asked for it.
 */

import { chainClient, type SupportedChain } from "@bench/shared";
import { readPositions, replayForPosition } from "@bench/counterfactual";
import { formatUnits } from "viem";
import Board from "./Board";
import type { Row, Sort } from "@/lib/board";

/** The form. A plain GET, so it works with scripting off. */
export function BoardPositionForm({ action, address }: { action: string; address?: string }) {
  return (
    <form method="get" action={action} className="row" style={{ gap: 8, flexWrap: "wrap" }}>
      <input
        name="position"
        defaultValue={address ?? ""}
        placeholder="Your address, to see what each would have done to your position"
        className="search__input"
        style={{ minWidth: 320, flex: "1 1 380px" }}
        spellCheck={false}
        autoComplete="off"
        aria-label="An address holding a PancakeSwap V3 position"
      />
      <button type="submit" className="filter">
        Show me
      </button>
      {address ? (
        <a href={action} className="filter">
          Clear
        </a>
      ) : null}
    </form>
  );
}

export default async function BoardForYou({
  chainId,
  address,
  rows,
  sort,
  sortHref,
  emptyNote,
}: {
  chainId: SupportedChain;
  address: string;
  rows: Row[];
  sort?: Sort;
  sortHref?: (s: Sort) => string;
  emptyNote?: string;
}) {
  const found = await readPositions(chainId, address);

  /*
    A refusal renders the ordinary board plus the reason. The alternative — a
    column of dashes — would tell a reader their agents scored nothing, which is
    a different and false claim from "we could not find a position to measure
    against".
  */
  if (!found.ok) {
    return (
      <>
        <div className="notice" style={{ marginBottom: 12 }}>
          <p className="unmeasured">
            no position to measure against
            <span className="unmeasured__why">
              {found.reason}
              {found.remedy ? ` ${found.remedy}` : ""}
            </span>
          </p>
        </div>
        <Board rows={rows} sort={sort} sortHref={sortHref} emptyNote={emptyNote} />
      </>
    );
  }

  const owned = [...found.positions].sort((a, b) =>
    a.position.liquidity === b.position.liquidity ? 0 : a.position.liquidity > b.position.liquidity ? -1 : 1,
  )[0]!;

  const replay = await replayForPosition(chainId, owned, chainClient(chainId) as never, { hours: 1 });

  if (!replay) {
    return (
      <>
        <div className="notice" style={{ marginBottom: 12 }}>
          <p className="unmeasured">
            position #{owned.tokenId} could not be replayed
            <span className="unmeasured__why">
              Its pool traded too little in the window we can read to say anything about it. That is a fact
              about the window, not about the position or the agents.
            </span>
          </p>
        </div>
        <Board rows={rows} sort={sort} sortHref={sortHref} emptyNote={emptyNote} />
      </>
    );
  }

  /*
    Figures are differences against leaving the position alone, in the pool's
    second token. Not a return, and not converted to dollars — a fiat figure
    would need a price oracle, which is a fourth source of error in a number
    that already carries three.
  */
  const forYou = new Map<string, { text: string; sign: -1 | 0 | 1; title: string }>();
  for (const r of replay.rows) {
    if (r.strategy === "hold") continue;
    const n = Number(formatUnits(r.vsHold1, 18));
    const context = `Against leaving position #${owned.tokenId} alone over ${replay.hours}h and ${replay.swaps} real swaps: ${r.recentres} recentre${r.recentres === 1 ? "" : "s"}, ${r.timeInRangePercent.toFixed(1)}% of the window in range.`;

    /*
      An agent that never acted is worth a sentence, not a rounded zero.

      `0.000` in the same grey as a refusal reads like a missing number, and it
      is the opposite: it is a complete answer — over this window the position
      never left its band, so a patient keeper correctly did nothing and hiring
      it would have changed nothing. Saying that is more useful than the digits,
      and it is the difference between a measurement and a blank.
    */
    if (r.recentres === 0) {
      forYou.set(r.strategy, {
        text: "no change",
        sign: 0,
        title: `${context} It never acted, so hiring it over this window would have left the position exactly as it was.`,
      });
      continue;
    }

    forYou.set(r.strategy, {
      text: `${n > 0 ? "+" : ""}${n.toFixed(3)}`,
      sign: n > 0 ? 1 : n < 0 ? -1 : 0,
      title: context,
    });
  }

  const winners = [...forYou.values()].filter((v) => v.sign > 0).length;
  const idle = [...forYou.values()].filter((v) => v.text === "no change").length;

  return (
    <>
      <p className="provenance" style={{ marginBottom: 10, lineHeight: 1.6 }}>
        Against position <span className="num">#{owned.tokenId}</span> — a band{" "}
        {owned.widthTicks.toLocaleString("en-US")} ticks wide on a {(owned.feePips / 10_000).toFixed(2)}%
        pool — replayed over {replay.swaps.toLocaleString("en-US")} real swaps in {replay.hours}h.{" "}
        {winners > 0
          ? `${winners} of them would have beaten leaving it alone over this window.`
          : idle > 0
            ? `None of them would have beaten leaving it alone — ${idle} never acted at all, because the price stayed inside the band the whole time.`
            : "None of them would have beaten leaving it alone over this window."}{" "}
        Figures are in the pool&rsquo;s second token, against doing nothing, and one window is not a track
        record.
      </p>
      <Board rows={rows} sort={sort} sortHref={sortHref} emptyNote={emptyNote} forYou={forYou} />
    </>
  );
}
