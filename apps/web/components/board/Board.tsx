import Link from "next/link";
import { REFUSAL_TEXT, jobBySlug, type RailRefusal } from "@bench/shared";
import type { Row, Sort } from "@/lib/board";
import RailBadge from "./RailBadge";
import Thumb from "./Thumb";

/**
 * The board. A dense table, not a grid of cards.
 *
 * There are a thousand listings and a few dozen that deserve attention. A
 * table with the rail column leading tells that truth structurally before a
 * word is read, and it looks like infrastructure rather than a storefront —
 * the correct impression for people deciding whether they could run this.
 *
 * Four things make it a board rather than a list, and each is here because a
 * document-shaped page was the first thing this rebuild got wrong:
 *
 *   THE MARK      a deterministic glyph per row, so the eye can find a row
 *                 again after a sort.
 *   THE HEADERS   are the sort control. A pill row above a table is a filter;
 *                 a clickable column is a sort, and a trading board does the
 *                 latter.
 *   THE CHIPS     job, operator, cohort, standard — dense, 12px, scannable
 *                 without reading.
 *   THE DELTA     latency and freshness as a moving figure, so the board reads
 *                 as live rather than as a snapshot someone pasted in.
 *
 * Rows that cannot be hired are listed, not hidden, with the condition that
 * failed. That is the difference between a marketplace and a funnel.
 */

function refusalText(row: Row): string {
  for (const r of ["call", "hire", "mandate"] as const) {
    const s = row.rails[r];
    if (!s.open && s.reason) return s.detail ?? REFUSAL_TEXT[s.reason as RailRefusal];
  }
  return "We have not checked this one yet.";
}

/** Latency as a live figure. Colour follows speed, not preference. */
function Latency({ row }: { row: Row }) {
  if (row.latencyMs === null) {
    return <span className="delta__flat num">—</span>;
  }
  const tone = row.latencyMs < 800 ? "up" : row.latencyMs < 4000 ? "flat" : "down";
  return (
    <span className="delta">
      <span
        className={`delta__v delta__${tone}`}
        data-live={`${row.key}:latency`}
        data-live-value={String(row.latencyMs)}
      >
        {row.latencyMs.toLocaleString("en-US")}
      </span>
      <span className="ticker__label">ms</span>
    </span>
  );
}

function Age({ row }: { row: Row }) {
  if (!row.probedAt) return <span className="dim">never</span>;
  const s = Math.max(0, Math.round((Date.now() - new Date(row.probedAt).getTime()) / 1000));
  const text = s < 90 ? `${s}s` : s < 5400 ? `${Math.round(s / 60)}m` : `${Math.round(s / 3600)}h`;
  return (
    <span className={row.freshness === "stale" ? "dim num" : "num"} title={`Last called ${text} ago`}>
      {text}
    </span>
  );
}

/**
 * One entry per cell, in order.
 *
 * This list and the `<td>`s below have to stay the same length: a spare header
 * shifts every column after it, which is how "Rails" ended up sitting over the
 * track record. The order here is the order a person reads a row — what can I
 * do with it, what is it, what has it done, how fresh, what does it cost.
 */
function columns(metric?: { key: string; label: string }, compare?: boolean, forYou?: boolean) {
  return [
    ...(compare ? [{ key: "pick", label: "" as string }] : []),
    { key: "rails", label: "Rails", sort: "hireable" as Sort },
    { key: "agent", label: "Agent" },
    {
      key: "track",
      label: metric?.label ?? "Track record",
      sort: (metric ? `metric:${metric.key}` : "track") as Sort,
    },
    ...(forYou ? [{ key: "foryou", label: "For you", align: "right" as const }] : []),
    { key: "latency", label: "Latency", sort: "fresh" as Sort, align: "right" as const },
    { key: "price", label: "Price", sort: "price" as Sort, align: "right" as const },
    { key: "action", label: "" },
  ];
}

export default function Board({
  rows,
  showJob = true,
  emptyNote,
  sort,
  sortHref,
  metric,
  compare,
  forYou,
}: {
  rows: Row[];
  showJob?: boolean;
  emptyNote?: string;
  /** The active sort, so the header can show which column decides the order. */
  sort?: Sort;
  /** Builds the link for a header. Omitted where sorting is not offered. */
  sortHref?: (s: Sort) => string;
  /**
   * The job's headline metric, when this is a job board.
   *
   * §10.2: the column that changes per job. A rebalancer is judged on time in
   * range and a grid on realized profit, and a shared "track record" column
   * would rank one by the other's yardstick.
   */
  metric?: { key: string; label: string };
  /** Row keys currently selected for comparison, when compare mode is offered. */
  compare?: Set<string>;
  /**
   * §12.1's "FOR YOU" column: what each agent would have done to the reader's
   * own position, keyed by the row's strategy slug.
   *
   * One replay serves the whole board. The reference strategies are shared, so
   * a board with an address behind it costs a single walk of one pool's swaps
   * rather than one per row — which is the only reason this column can exist on
   * a page rather than in a batch job.
   *
   * A row with no entry is not a zero. An agent whose strategy is not published
   * cannot be replayed at all, and the cell says so.
   */
  forYou?: Map<string, { text: string; sign: -1 | 0 | 1; title: string }>;
}) {
  if (rows.length === 0) {
    return (
      <div className="panel" style={{ padding: 20, marginTop: 12 }}>
        <p className="prose">
          {emptyNote ??
            "Nothing is listed for this filter yet. That is a state of the data rather than a state of the market: the board fills as probe results land, and every row carries when it was last checked."}
        </p>
      </div>
    );
  }

  return (
    <table className="board">
      {/*
        Announced, not printed.

        A caption is genuinely useful to a screen reader arriving at a table
        with no other context. Sighted readers now get the same two facts from
        the stat strip directly beneath and from the footer's standing line, so
        printing it a third time was the paragraph that made the bottom of the
        page read as prose.
      */}
      <caption className="sr-only">
        Every listing here was called by us before it was listed. A row with no lit rail is shown with the
        condition that failed rather than removed.
      </caption>
      <thead>
        <tr>
          {columns(metric, Boolean(compare), Boolean(forYou)).map((c) => (
            <th
              key={c.key}
              scope="col"
              data-col={c.key}
              style={c.align === "right" ? { textAlign: "right" } : undefined}
            >
              {c.sort && sortHref ? (
                <Link href={sortHref(c.sort)} {...(sort === c.sort ? { "data-sorted": "" } : {})}>
                  {c.label}
                  <span className="caret" aria-hidden>
                    {sort === c.sort ? "▼" : "▽"}
                  </span>
                  <span className="sr-only">{sort === c.sort ? ", sorted by this" : ", sort by this"}</span>
                </Link>
              ) : (
                c.label || <span className="sr-only">{c.key}</span>
              )}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const open = row.rails.call.open || row.rails.hire.open || row.rails.mandate.open;
          const price = row.rails.call.price ?? row.rails.hire.price ?? row.rails.mandate.price;
          const job = row.job ? jobBySlug(row.job) : null;
          const hireHref = `/hire/56/${encodeURIComponent(row.tokenId ?? `svc:${row.key.slice(2)}`)}`;
          return (
            <tr key={row.key} {...(open ? {} : { "data-refused": "" })}>
              {/*
                The pick cell is first because its header is first. They are
                written adjacently for that reason: a cell emitted in a
                different order than its header shifts every column after it,
                which is how "Rails" once ended up over the track record.
              */}
              {compare ? (
                <td data-col="pick">
                  <input
                    type="checkbox"
                    name="pick"
                    value={row.key}
                    defaultChecked={compare.has(row.key)}
                    aria-label={`Compare ${row.name}`}
                  />
                </td>
              ) : null}

              <td data-col="rails">
                <RailBadge row={row} />
              </td>

              <td data-col="agent">
                <span className="board__id">
                  <Thumb
                    seed={row.address ?? row.tokenId ?? row.key}
                    rail={
                      row.rails.mandate.open
                        ? "mandate"
                        : row.rails.hire.open
                          ? "hire"
                          : row.rails.call.open
                            ? "call"
                            : undefined
                    }
                  />
                  <span className="board__idtext">
                    <span className="board__namerow">
                      <Link href={row.href} className="board__name">
                        {row.name}
                      </Link>
                      {row.isOurs ? <span className="chip chip--ours">ours</span> : null}
                      {showJob && job ? (
                        <Link href={`/j/${job.slug}`} className="chip">
                          {job.title}
                        </Link>
                      ) : null}
                      {/*
                        A refusal, in the colour refusals use.

                        This carried `chip--mandate`, which is the ember the rail
                        ramp reserves for standing authority — the most serious
                        state on the board. Most rows carry a mismatch, so the
                        loudest colour on the page was attached to its least
                        important information, and it read as a rail badge for a
                        rail nobody had granted. §13.2 is explicit: a refusal is
                        an absence of light, never a signal colour.
                      */}
                      {row.mismatch ? (
                        <span className="chip chip--refused" title={row.mismatch}>
                          listing disagrees
                        </span>
                      ) : null}
                    </span>
                    <span className="board__sub clamp1">
                      <span className="num">
                        {row.tokenId ? `${row.kind === "agent" ? "token " : ""}${row.tokenId}` : row.originHost}
                      </span>
                      {row.originCohortSize > 1 ? (
                        <span className="dim"> · {row.originCohortSize} on this host</span>
                      ) : null}
                    </span>
                  </span>
                </span>
              </td>

              <td data-col="track">
                {metric && row.metrics[metric.key] ? (
                  <>
                    <span className="clamp1">
                      <span className="num">{row.metrics[metric.key]!.value}</span>{" "}
                      <span className="meta">{row.metrics[metric.key]!.label.toLowerCase()}</span>
                    </span>
                    <span className="board__sub provenance clamp1">{row.track?.provenance ?? ""}</span>
                  </>
                ) : metric ? (
                  <>
                    <span className="unmeasured">not measured</span>
                    <span className="board__sub clamp1" title={row.trackMissing ?? refusalText(row)}>
                      {row.trackMissing ?? refusalText(row)}
                    </span>
                  </>
                ) : row.track ? (
                  <>
                    <span className="clamp1">
                      <span className="num">{row.track.value}</span>{" "}
                      <span className="meta">{row.track.label.toLowerCase()}</span>
                    </span>
                    <span className="board__sub provenance clamp1">
                      {row.track.basis ? `${row.track.basis} · ` : ""}
                      {row.track.provenance}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="unmeasured">not measured</span>
                    {/*
                      Clamped to one line and carried in full on the title, so a
                      long refusal cannot push a row past 56px. The whole reason
                      is on the agent page, where it is the point rather than a
                      footnote.
                    */}
                    <span className="board__sub clamp1" title={row.trackMissing ?? refusalText(row)}>
                      {row.trackMissing ?? refusalText(row)}
                    </span>
                  </>
                )}
              </td>

              {forYou ? (
                <td data-col="foryou" style={{ textAlign: "right" }}>
                  {(() => {
                    /*
                      A house agent's identity already carries its strategy:
                      `tokenId` is `house:<slug>`. Deriving it here beats adding
                      a field to `Row`, which crosses the wire a thousand times
                      per board render.
                    */
                    const slug = row.tokenId?.startsWith("house:") ? row.tokenId.slice(6) : null;
                    const hit = slug ? forYou.get(slug) : undefined;
                    if (!hit) {
                      return (
                        <span
                          className="dim"
                          title={
                            row.job && row.job !== "rebalancing"
                              ? `This agent does a different job — ${row.job} — so there is nothing to replay against a liquidity position. Its record can only be measured after it is hired.`
                              : "This agent publishes no replayable strategy, so there is nothing to run against your position. Its record can only be measured after it is hired."
                          }
                        >
                          not replayable
                        </span>
                      );
                    }
                    return (
                      <span
                        className="num"
                        title={hit.title}
                        style={{
                          color:
                            hit.sign > 0
                              ? "var(--color-rail-call)"
                              : hit.sign < 0
                                ? "var(--color-rail-mandate)"
                                : "var(--color-dim)",
                        }}
                      >
                        {hit.text}
                      </span>
                    );
                  })()}
                </td>
              ) : null}
              <td data-col="latency" style={{ textAlign: "right" }}>
                <Latency row={row} />
                <span className="board__sub provenance" style={{ display: "block" }}>
                  <Age row={row} /> ago
                </span>
              </td>

              <td data-col="price" className="num" style={{ textAlign: "right" }}>
                {price ? price : <span className="dim">no price</span>}
              </td>

              <td data-col="action">
                {open ? (
                  <Link href={hireHref} className="btn btn--sm btn--hire">
                    Put it to work
                  </Link>
                ) : (
                  <Link href={row.href} className="btn btn--sm">
                    Why not
                  </Link>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
