/**
 * What these agents would have done to a position somebody actually holds.
 *
 * The plan calls this the single most important thing in the document, and the
 * reason is that every other listing in this field shows an agent's own account
 * of itself. This shows the reader's own money, replayed against the trades
 * that really happened in their own pool.
 *
 * ---------------------------------------------------------------------------
 * An address, not a wallet connection
 * ---------------------------------------------------------------------------
 *
 * Reading somebody's positions needs an address; only *acting* needs a
 * signature. So this is a plain GET form: it works with JavaScript switched
 * off, costs the page nothing in client bundle, and asks for nothing a reader
 * would be right to refuse. A connector here would buy a nicer paste and cost
 * the read path.
 *
 * ---------------------------------------------------------------------------
 * Streamed, because it is slow and honest about being slow
 * ---------------------------------------------------------------------------
 *
 * Walking an hour of a pool's swaps takes seconds. The page renders
 * immediately and this arrives when it is ready, inside a Suspense boundary, so
 * nothing above it waits. The alternative — blocking the whole route on a log
 * walk — is how a hire screen times out mid-scan and refuses for the wrong
 * reason.
 */

import { chainClient, type SupportedChain } from "@bench/shared";
import { readPositions, replayForPosition } from "@bench/counterfactual";
import { formatUnits } from "viem";

/** The form. Always rendered, so the feature is discoverable with no address. */
export function PositionForm({ action, address }: { action: string; address?: string }) {
  return (
    <form method="get" action={action} className="row" style={{ gap: 8, marginTop: 12, flexWrap: "wrap" }}>
      <label className="provenance" htmlFor="position-address" style={{ width: "100%" }}>
        Replay this against a position you hold. Paste the address that holds it — we read it, we never ask
        you to sign anything, and nothing here can move it.
      </label>
      <input
        id="position-address"
        name="position"
        defaultValue={address ?? ""}
        placeholder="0x…"
        className="search__input"
        style={{ maxWidth: 460 }}
        spellCheck={false}
        autoComplete="off"
      />
      <button type="submit" className="filter">
        Replay it
      </button>
    </form>
  );
}

const short = (a: string) => `${a.slice(0, 10)}…${a.slice(-6)}`;

/**
 * The replay itself. Rendered inside a Suspense boundary by the caller.
 *
 * Every failure here is a sentence rather than an empty table. "This address
 * holds no positions" and "we could not read the pool's history" are different
 * facts and are never collapsed into one blank.
 */
export default async function ForYourPosition({
  chainId,
  address,
}: {
  chainId: SupportedChain;
  address: string;
}) {
  const found = await readPositions(chainId, address);

  if (!found.ok) {
    return (
      <div className="notice" style={{ marginTop: 14 }}>
        <p className="unmeasured">
          nothing to replay for {short(address)}
          <span className="unmeasured__why">
            {found.reason}
            {found.remedy ? ` ${found.remedy}` : ""}
          </span>
        </p>
      </div>
    );
  }

  /*
    The largest position, by liquidity. A reader with several wants the one that
    matters, and the page says which it picked rather than silently choosing.
  */
  const owned = [...found.positions].sort((a, b) =>
    a.position.liquidity === b.position.liquidity ? 0 : a.position.liquidity > b.position.liquidity ? -1 : 1,
  )[0]!;

  const replay = await replayForPosition(chainId, owned, chainClient(chainId) as never, { hours: 1 });

  if (!replay) {
    return (
      <div className="notice" style={{ marginTop: 14 }}>
        <p className="unmeasured">
          position #{owned.tokenId} could not be replayed
          <span className="unmeasured__why">
            Its pool traded too little in the window we can read to say anything about it. That is a fact
            about the window, not about the position or the agents.
          </span>
        </p>
      </div>
    );
  }

  const hold = replay.rows.find((r) => r.strategy === "hold");
  const acting = replay.rows.filter((r) => r.strategy !== "hold");
  const best = [...acting].sort((a, b) => (b.vsHold1 > a.vsHold1 ? 1 : -1))[0];
  const anyWins = acting.some((r) => r.vsHold1 > 0n);

  return (
    <div style={{ marginTop: 14 }}>
      <p className="prose" style={{ maxWidth: "76ch" }}>
        Position <span className="num">#{owned.tokenId}</span>, held by {short(address)}: a band{" "}
        {owned.widthTicks.toLocaleString("en-US")} ticks wide on a{" "}
        {(owned.feePips / 10_000).toFixed(2)}% pool.
        {found.positions.length > 1
          ? ` It is the largest of ${found.positions.length} open positions this address holds; the others are not replayed here.`
          : ""}{" "}
        Replayed against {replay.swaps.toLocaleString("en-US")} real swaps over {replay.hours} hours.
      </p>

      <div style={{ overflowX: "auto", marginTop: 12 }}>
        <table className="board">
          <thead>
            <tr>
              <th scope="col">If you had hired</th>
              <th scope="col">In range</th>
              <th scope="col">Recentres</th>
              <th scope="col">Against holding</th>
            </tr>
          </thead>
          <tbody>
            {replay.rows.map((r) => (
              <tr key={r.strategy}>
                <td>
                  <span className="row__name">{r.name}</span>
                </td>
                <td className="num">{r.timeInRangePercent.toFixed(1)}%</td>
                <td className="num">{r.recentres}</td>
                <td
                  className="num"
                  style={{
                    color:
                      r.strategy === "hold"
                        ? "var(--color-dim)"
                        : r.vsHold1 > 0n
                          ? "var(--color-rail-call)"
                          : "var(--color-rail-mandate)",
                  }}
                >
                  {r.strategy === "hold"
                    ? "—"
                    : `${r.vsHold1 > 0n ? "+" : ""}${Number(formatUnits(r.vsHold1, 18)).toFixed(3)}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/*
        The answer stated, including when the answer is "hire none of them".
        A marketplace that could not say that would be a shop.
      */}
      <p className="prose" style={{ marginTop: 12, maxWidth: "76ch" }}>
        {anyWins && best
          ? `Over this window ${best.name} would have left this position ahead of leaving it alone. Figures are in the pool's second token, and every one of them is a difference against doing nothing, not a return.`
          : `Over this window not one of them would have beaten leaving this position alone${hold ? "" : ""} — and each held the price in range more of the time. The recentring cost more than the extra fees were worth. That is a real answer to "should I hire one of these for this position", and it is no.`}
      </p>

      <p className="prose" style={{ marginTop: 10, maxWidth: "76ch" }}>
        <strong>{replay.hours} hour{replay.hours === 1 ? "" : "s"} is not a track record.</strong>{" "}
        {replay.windowNote}
      </p>

      {replay.shortenedBecause ? (
        <p className="unmeasured" style={{ marginTop: 10 }}>
          the window is shorter than it was asked to be
          <span className="unmeasured__why">{replay.shortenedBecause}</span>
        </p>
      ) : null}
      {replay.dilution ? (
        <p className="unmeasured" style={{ marginTop: 10 }}>
          this position is large relative to the pool
          <span className="unmeasured__why">{replay.dilution}</span>
        </p>
      ) : null}

      <p className="provenance" style={{ marginTop: 10, lineHeight: 1.6 }}>
        pool {replay.pool} · blocks {Number(replay.fromBlock).toLocaleString("en-US")}–
        {Number(replay.toBlock).toLocaleString("en-US")} ·{" "}
        {replay.complete ? "every range served" : "some ranges refused"} · read via{" "}
        {replay.via ?? "an unnamed host"}
      </p>
    </div>
  );
}
