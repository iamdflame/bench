/**
 * What the pages read.
 *
 * One module between the stored board and every route, so the ranking rule,
 * the freshness rule and the origin-collapse rule exist once and cannot drift
 * between the homepage and a job board that are supposed to agree.
 *
 * Three rules live here, and each is checked by something in `tools/checks`:
 *
 *   RANKING     a first-party agent never outranks a better-measured third
 *               party. Enforced in `rank`, unit-tested, and stated on /data.
 *   FRESHNESS   a probe result nobody refreshed inside the window decays to
 *               unavailable. Failing in that direction is the safe one.
 *   ORIGIN      one host cannot dominate a board. The cohort collapses and
 *               says how many it collapsed.
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_CHAIN,
  JOB_SLUGS,
  jobBySlug,
  type Agent,
  type BazaarService,
  type JobSlug,
  type RailName,
  type Snapshot,
  type SupportedChain,
} from "@bench/shared";
import { collapseByOrigin } from "@bench/index";

/** How long a probe result stays authoritative. Fifteen minutes is the cycle. */
export const FRESH_MS = 15 * 60_000;
/** After this, a green rail is no longer sold as green. */
export const STALE_MS = 45 * 60_000;

const BIGINT_TAG = "__bigint__:";
const reviver = (_k: string, v: unknown) =>
  typeof v === "string" && v.startsWith(BIGINT_TAG) ? BigInt(v.slice(BIGINT_TAG.length)) : v;

/** One cycle's reading. The trending strip is a diff between two of these. */
export interface Reading {
  at: string;
  block: string;
  totals: { listed: number; callable: number; hireable: number; mandatable: number; probed: number };
  callable: string[];
  hireable: string[];
  mandatable: string[];
}

/** One real mainnet transaction per job, found on chain by the worker. */
export interface WorkedExample {
  job: JobSlug;
  what: string;
  values: { label: string; value: string }[];
  txHash: string;
  block: string;
  at: string;
  venue: string;
  teaches: string;
}

export interface StoredBoard {
  version: 1;
  chainId: SupportedChain;
  generatedAt: string;
  agents: Agent[];
  services: BazaarService[];
  snapshot: Snapshot;
  /** Newest last. Empty until the second worker cycle, and the strip says so. */
  history?: Reading[];
  /** Absent for a job means no example was found, which the page states. */
  examples?: WorkedExample[];
  /**
   * The last counterfactual replay, or absent when none has run.
   *
   * One record, not one per agent: every strategy in it was replayed over the
   * same window against the same opening position, which is the only way the
   * rows are comparable. Splitting it per agent would invite two figures
   * measured differently to sit in one column.
   */
  counterfactual?: CounterfactualRecord;
  /** §9: the published projection, graded against the window that followed. */
  grade?: GradeRecord;
}

/** One strategy's forecast error. Mirrors `worker/src/grade.ts`. */
export interface GradeRow {
  strategy: string;
  name: string;
  projected: string;
  actual: string;
  error: string;
  directionHeld: boolean;
  projectedRecentres: number;
  actualRecentres: number;
}

export interface GradeRecord {
  chainId: number;
  pool: string;
  pair: string;
  token0Symbol: string;
  projectedWindow: { fromBlock: string; toBlock: string; hours: number; swaps: number };
  actualWindow: { fromBlock: string; toBlock: string; hours: number; swaps: number; complete: boolean };
  rows: GradeRow[];
  directionsHeld: number;
  observedAt: string;
  reproduce: string;
  refusedBecause: string | null;
}

/** One strategy's outcome in a replay. Mirrors `worker/src/counterfactual.ts`. */
export interface CounterfactualRow {
  strategy: string;
  name: string;
  describes: string;
  timeInRangePercent: number;
  recentres: number;
  gasCost: string;
  net: string;
  vsHold: string;
}

export interface CounterfactualRecord {
  chainId: number;
  pool: string;
  pair: string;
  feePips: number;
  token0Symbol: string;
  fromBlock: string;
  toBlock: string;
  hours: number;
  swaps: number;
  complete: boolean;
  shortenedBecause: string | null;
  via: string | null;
  gasPriceWei: string;
  positionNote: string;
  bandHalfWidthTicks: number;
  rows: CounterfactualRow[];
  observedAt: string;
  reproduce: string;
  dilution: string | null;
}

/**
 * The empty board, which is a real state and not an error.
 *
 * Rendered when the worker has never run. It says so, rather than showing a
 * page that looks broken.
 */
function emptyBoard(chainId: SupportedChain): StoredBoard {
  return {
    version: 1,
    chainId,
    generatedAt: new Date(0).toISOString(),
    agents: [],
    services: [],
    snapshot: {
      generatedAt: new Date(0).toISOString(),
      chainId,
      cutoff: { block: "0", observedAt: new Date(0).toISOString() },
      registry: {
        registered: { known: false, reason: "The registry has not been swept in this deployment yet." },
        declaringEndpoint: { known: false, reason: "Nothing has been read yet." },
        read: 0,
      },
      origins: [],
      totals: {
        listed: 0, callable: 0, hireable: 0, mandatable: 0,
        probed: 0, refused: 0, duplicateOrigin: 0, ours: 0, bazaar: 0,
      },
      perJob: Object.fromEntries(
        JOB_SLUGS.map((s) => [s, { listed: 0, callable: 0, hireable: 0, mandatable: 0, ours: 0 }]),
      ) as Snapshot["perJob"],
      limitations: ["The worker has not written a board for this chain yet."],
    },
    history: [],
  };
}

let cached: { at: number; board: StoredBoard } | null = null;

/**
 * Read the stored board.
 *
 * Held for thirty seconds in process. The file is small enough that reading it
 * per request would work; caching it means a page with six components that
 * each need the board parses it once.
 */
/**
 * The live board, when a worker is publishing one.
 *
 * The gap this closes: the worker keeps the board fresh on its own disk and the
 * site reads a copy committed at deploy time, so within the freshness window of
 * a deploy every rail closes — correctly, since a rail not re-checked is
 * required to shut rather than stay green — and the marketplace shows an empty
 * board while a worker elsewhere knows exactly what is callable.
 *
 * Refreshed in the background rather than awaited, so `getBoard` stays
 * synchronous and no page waits on a third party to render. The first request
 * after a cold start serves the committed copy, which is a real board and
 * simply older; every request after that serves the live one.
 *
 * If `BOARD_URL` is unset or the worker is unreachable, the committed copy is
 * the answer and nothing degrades. That fallback is deliberate: the front door
 * of a marketplace must not go blank because a process somewhere else is
 * unhappy.
 */
let live: { at: number; board: StoredBoard } | null = null;
let refreshing = false;
const LIVE_MS = 60_000;

function refreshLive(chainId: SupportedChain): void {
  const base = process.env.BOARD_URL;
  if (!base || refreshing) return;
  if (live && Date.now() - live.at < LIVE_MS && live.board.chainId === chainId) return;
  refreshing = true;
  const url = `${base.replace(/\/+$/, "")}/board-${chainId}.json`;
  void fetch(url, { signal: AbortSignal.timeout(8_000), cache: "no-store" })
    .then(async (r) => {
      if (!r.ok) return;
      const board = JSON.parse(await r.text(), reviver) as StoredBoard;
      if (board?.chainId === chainId && Array.isArray(board.agents)) {
        live = { at: Date.now(), board };
        if (process.env.BOARD_DEBUG) console.error("[board] live board adopted:", board.agents.length, "agents");
      } else if (process.env.BOARD_DEBUG) {
        console.error("[board] live board rejected: chainId", board?.chainId, "agents", Array.isArray(board?.agents));
      }
    })
    .catch((e) => {
      if (process.env.BOARD_DEBUG) console.error("[board] live fetch failed:", String(e).slice(0, 200));
    })
    .finally(() => {
      refreshing = false;
    });
}

export function getBoard(chainId: SupportedChain = DEFAULT_CHAIN): StoredBoard {
  refreshLive(chainId);
  if (live && live.board.chainId === chainId) return live.board;
  if (cached && Date.now() - cached.at < 30_000 && cached.board.chainId === chainId) return cached.board;
  const path = join(process.cwd(), "data", `board-${chainId}.json`);
  const alt = join(process.cwd(), "apps/web/data", `board-${chainId}.json`);
  const p = existsSync(path) ? path : existsSync(alt) ? alt : null;
  if (!p) return emptyBoard(chainId);
  try {
    const board = JSON.parse(readFileSync(p, "utf8"), reviver) as StoredBoard;
    cached = { at: Date.now(), board };
    return board;
  } catch {
    return emptyBoard(chainId);
  }
}

// ---------------------------------------------------------------------------
// Rows: agents and paid services, on one board
// ---------------------------------------------------------------------------

/**
 * A board row.
 *
 * Deliberately covers both an ERC-8004 agent and a B402 paid service, because
 * a buyer looking for something that can answer a question does not care which
 * registry it came from. What they must not be told is that a service has an
 * on-chain identity it does not have, so `tokenId` is null for a service and
 * the row renders its URL as its identity instead.
 */
export interface Row {
  key: string;
  kind: "agent" | "service";
  name: string;
  /**
   * Trimmed, because a Row is serialised into every board response.
   *
   * The board renders only the name, but the whole object crosses the wire in
   * the rendered payload — and with a thousand rows, full descriptions were
   * most of a megabyte of HTML. The agent page reads the untrimmed text from
   * the stored record instead, where it is the only thing on the screen.
   */
  description: string;
  tokenId: string | null;
  /** Owner wallet, or the merchant's payout address for a service. */
  address: string | null;
  href: string;
  job: JobSlug | null;
  jobReason: string | null;
  rails: Record<
    RailName,
    {
      open: boolean;
      reason: string | null;
      detail: string | null;
      price: string | null;
      /** Open, but the check behind it is older than the freshness window. */
      unverified?: boolean;
    }
  >;
  /** The headline measurement, pre-formatted, or the reason there is none. */
  track: { label: string; value: string; basis: string | null; provenance: string } | null;
  trackMissing: string | null;
  /**
   * Every measurement this row carries, keyed by method.
   *
   * A job board ranks and renders by its own metric rather than by whichever
   * one happened to be first, so the whole set travels. Pre-formatted, because
   * formatting a number is the one thing that must happen in exactly one place.
   */
  metrics: Record<string, { label: string; value: string; raw: number; better: "higher" | "lower" }>;
  probedAt: string | null;
  latencyMs: number | null;
  freshness: "fresh" | "ageing" | "stale" | "never";
  originHost: string | null;
  originCohortSize: number;
  isOurs: boolean;
  /** Set when the listing and the live challenge disagree. */
  mismatch: string | null;
}

/** One sentence, at most. The full text lives on the agent page. */
const trim = (t: string) => (t.length > 180 ? `${t.slice(0, 177).trimEnd()}…` : t);

const priceText = (p: { amount: bigint; decimals: number; symbol: string } | undefined): string | null => {
  if (!p) return null;
  if (p.symbol === "fee on performance") return "fee on gains";
  const base = 10n ** BigInt(p.decimals);
  const whole = p.amount / base;
  const frac = (p.amount % base).toString().padStart(p.decimals, "0").slice(0, 4).replace(/0+$/, "") || "0";
  return `${whole}.${frac.padEnd(2, "0")} ${p.symbol}`;
};

function freshnessOf(at: string | null): Row["freshness"] {
  if (!at) return "never";
  const age = Date.now() - new Date(at).getTime();
  if (!Number.isFinite(age)) return "never";
  if (age <= FRESH_MS) return "fresh";
  if (age <= STALE_MS) return "ageing";
  return "stale";
}

/**
 * A rail carries the age of its evidence. It does not lie about the evidence.
 *
 * This used to report a stale-but-open rail as **closed**, on the reasoning
 * that decaying early costs a row saying "not checked recently" while decaying
 * late costs selling a hire on an endpoint that died an hour ago.
 *
 * That reasoning was wrong, and wrong in the one way this codebase exists to
 * prevent. "We have not looked in eighty-seven minutes" is an **unknown**.
 * Rendering it as `open: false` converts it into a negative claim about the
 * agent — the same sin as rendering an unmeasured value as a zero, committed by
 * the one function `check:absence` does not read. The visible result was a
 * marketplace whose funnel said *0 callable, 0 hireable* over a board file that
 * said 19 and 8.
 *
 * The safety argument does not need it either, because **every path that spends
 * money re-verifies before it spends**. `/api/rails/call` fetches the endpoint's
 * 402 live and refuses on what it finds; `planFor` calls `probeQuote` live and
 * refuses on what comes back. A dead endpoint is caught at the moment of
 * action, with the real reason, which is strictly better for the reader than a
 * row that quietly vanished an hour earlier.
 *
 * So an open rail stays open and says when it was last checked. `unverified`
 * carries that to the badge; `freshness` on the row carries the age.
 */
function railView(
  state: Agent["rails"][RailName],
  fresh: Row["freshness"],
): Row["rails"][RailName] {
  if (!state.available) {
    return {
      open: false,
      reason: state.reason,
      detail: state.detail ?? null,
      price: null,
    };
  }
  if (fresh === "stale") {
    return {
      open: true,
      unverified: true,
      reason: null,
      detail:
        "This was open when we last checked, and that check is older than our freshness window. Acting on it re-checks the endpoint first and refuses on whatever it finds.",
      price: priceText(state.price),
    };
  }
  return { open: true, reason: null, detail: null, price: priceText(state.price) };
}

/** One formatter for every figure on a row, headline or not. */
function formatMeasurement(m: Agent["track"][number]): string {
  const dp = m.unit === "count" ? 0 : m.unit === "%" ? 1 : 2;
  const n = m.value.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
  return `${n}${m.unit === "%" ? "%" : m.unit === "count" || m.unit === "ratio" ? "" : ` ${m.unit}`}`;
}

function trackView(a: Agent): Pick<Row, "track" | "trackMissing" | "metrics"> {
  const metrics: Row["metrics"] = {};
  for (const m of a.track) {
    /*
      Direction is read from the job's own spec rather than guessed from the
      unit: fewer rotations is better and more fills is better, and both are
      counts. Ranking on the wrong direction is worse than not ranking.
    */
    const job = a.job.known ? jobBySlug(a.job.value) : null;
    const spec = job?.metrics.find((x) => x.method === m.method);
    metrics[m.method] = {
      label: m.name,
      value: formatMeasurement(m),
      raw: m.value,
      better: spec?.better ?? "higher",
    };
  }

  const m = a.track[0];
  if (!m) {
    return {
      metrics,
      track: null,
      trackMissing: a.job.known
        ? "Nothing measurable on chain for this wallet yet."
        : "It is not classified into one of the four jobs, so there is no job-specific measurement to take.",
    };
  }
  const basis =
    m.numerator !== undefined && m.denominator !== undefined
      ? `${m.numerator.toLocaleString("en-US")} of ${m.denominator.toLocaleString("en-US")}`
      : null;
  return {
    metrics,
    track: {
      label: m.name,
      value: formatMeasurement(m),
      basis,
      provenance: `block ${m.block.toLocaleString("en-US")} · ${m.window}`,
    },
    trackMissing: null,
  };
}

export function agentRow(a: Agent): Row {
  const fresh = freshnessOf(a.probe?.at ?? null);
  return {
    key: `a:${a.chainId}:${a.tokenId}`,
    kind: "agent",
    name: a.name,
    description: trim(a.description),
    tokenId: a.tokenId,
    address: a.agentWallet ?? a.owner,
    href: `/a/${a.chainId}/${encodeURIComponent(a.tokenId)}`,
    job: a.job.known ? a.job.value : null,
    jobReason: a.job.known ? null : a.job.reason,
    rails: {
      call: railView(a.rails.call, fresh),
      hire: railView(a.rails.hire, fresh),
      // A capability scan is a chain read, not an endpoint call, so it does
      // not decay when an endpoint goes quiet. Its evidence is the chain.
      mandate: railView(a.rails.mandate, "fresh"),
    },
    ...trackView(a),
    probedAt: a.probe?.at ?? null,
    latencyMs: a.probe?.latencyMs ?? null,
    freshness: fresh,
    originHost: a.originHost,
    originCohortSize: a.originCohortSize,
    isOurs: a.isOurs,
    mismatch: null,
  };
}

export function serviceRow(s: BazaarService): Row {
  const fresh = freshnessOf(s.probe?.at ?? null);
  const host = s.originHost;
  let path = s.resource;
  try {
    path = new URL(s.resource).pathname;
  } catch {
    /* keep the raw string: a resource we cannot parse is still a listing */
  }
  return {
    key: `s:${s.resource}`,
    kind: "service",
    name: path.split("/").filter(Boolean).slice(-2).join(" / ") || host,
    description: trim(s.description),
    tokenId: null,
    address: s.advertised[0]?.payTo ?? null,
    href: `/a/56/${encodeURIComponent(`svc:${s.resource}`)}`,
    job: s.job.known ? s.job.value : null,
    jobReason: s.job.known ? null : s.job.reason,
    rails: {
      call: railView(s.call, fresh),
      hire: {
        open: false,
        reason: "no-8183-seller",
        detail: "This is a paid endpoint indexed by B402, not an ERC-8004 registration, so there is no provider address to escrow a job against.",
        price: null,
      },
      mandate: {
        open: false,
        reason: "no-wallet",
        detail: "It has no on-chain agent identity, so there is no account to scope a session over.",
        price: null,
      },
    },
    track: null,
    metrics: {},
    trackMissing:
      "It is a paid endpoint rather than an on-chain agent, so there is no wallet whose behaviour we could measure.",
    probedAt: s.probe?.at ?? null,
    latencyMs: s.probe?.latencyMs ?? null,
    freshness: fresh,
    originHost: host,
    originCohortSize: s.originCohortSize,
    isOurs: false,
    mismatch: s.advertisedMismatch,
  };
}

// ---------------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------------

/**
 * How a board is ordered.
 *
 * The four general sorts apply everywhere. A job board adds its own three —
 * `metric:time-in-range`, `metric:fills`, and so on — because §10.2 gives each
 * job different sort options and a single "track record" ordering would rank a
 * grid by a rebalancer's yardstick.
 */
export type Sort = "hireable" | "fresh" | "price" | "track" | `metric:${string}`;

export const isMetricSort = (s: Sort): s is `metric:${string}` => s.startsWith("metric:");
export const metricKeyOf = (s: Sort): string | null => (isMetricSort(s) ? s.slice(7) : null);

const openCount = (r: Row) => Number(r.rails.call.open) + Number(r.rails.hire.open) + Number(r.rails.mandate.open);

/**
 * The ranking function, and the one rule inside it that matters.
 *
 * **A first-party agent never outranks a better-measured third party.** There
 * is no `isOurs` term anywhere in the comparison, and `tools/checks/ranking.ts`
 * asserts it by constructing a third-party row that measures better than ours
 * and failing the build if ours comes first. A marketplace that quietly
 * favours its own supply is the whole failure mode of this category, and the
 * defence has to be executable rather than stated.
 *
 * Ties break on freshness, then on name — never on ownership.
 */
export function rank(rows: Row[], sort: Sort = "hireable"): Row[] {
  const freshRank = { fresh: 0, ageing: 1, stale: 2, never: 3 } as const;
  const out = [...rows];
  out.sort((a, b) => {
    switch (sort) {
      case "fresh":
        return (
          freshRank[a.freshness] - freshRank[b.freshness] ||
          (b.probedAt ?? "").localeCompare(a.probedAt ?? "") ||
          openCount(b) - openCount(a)
        );
      case "price": {
        // Cheapest open rail first. A row with no open rail sorts last.
        const p = (r: Row) => {
          const s = r.rails.call.open ? r.rails.call.price : r.rails.hire.open ? r.rails.hire.price : null;
          const n = s ? Number.parseFloat(s) : Number.POSITIVE_INFINITY;
          return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
        };
        return p(a) - p(b) || openCount(b) - openCount(a);
      }
      case "track": {
        const t = (r: Row) => (r.track ? 1 : 0);
        return t(b) - t(a) || openCount(b) - openCount(a) || freshRank[a.freshness] - freshRank[b.freshness];
      }
      case "hireable":
        return (
          openCount(b) - openCount(a) ||
          freshRank[a.freshness] - freshRank[b.freshness] ||
          a.name.localeCompare(b.name)
        );

      default: {
        /*
          A job's own metric.

          A row that has not been measured on this metric sorts last whichever
          way the metric runs — it is not a zero and it is not a worst case, it
          is an unknown, and putting unknowns at either extreme would read as a
          ranking they have not earned.
        */
        const key = metricKeyOf(sort);
        if (!key) return openCount(b) - openCount(a);
        const va = a.metrics[key];
        const vb = b.metrics[key];
        if (!va && !vb) return openCount(b) - openCount(a) || a.name.localeCompare(b.name);
        if (!va) return 1;
        if (!vb) return -1;
        const dir = va.better === "lower" ? 1 : -1;
        return (va.raw - vb.raw) * dir || openCount(b) - openCount(a);
      }
    }
  });
  return out;
}

export interface BoardView {
  rows: Row[];
  /** Cycle readings, so the trending strip can diff rather than invent. */
  history: Reading[];
  /** Rows a cohort collapse removed, and from where. Never silently dropped. */
  collapsed: number;
  collapsedByHost: { host: string; count: number }[];
  snapshot: Snapshot;
  generatedAt: string;
  chainId: SupportedChain;
}

export interface BoardQuery {
  chainId?: SupportedChain;
  job?: JobSlug | null;
  rail?: RailName | null;
  sort?: Sort;
  /** Include rows with no open rail. The board lists them; it does not hide them. */
  includeClosed?: boolean;
  limit?: number;
  q?: string | null;
}

export function readBoardView(query: BoardQuery = {}): BoardView {
  const chainId = query.chainId ?? DEFAULT_CHAIN;
  const board = getBoard(chainId);

  let rows: Row[] = [...board.agents.map(agentRow), ...board.services.map(serviceRow)];
  /*
    The funnel counts the whole board, not the filtered view. A reader who has
    clicked "Hire it for one job" is still owed the true callable count in the
    doors above, or the filter would appear to change the market rather than the
    view of it.
  */
  const allRows = rows;

  if (query.job) rows = rows.filter((r) => r.job === query.job);
  if (query.rail) rows = rows.filter((r) => r.rails[query.rail!].open);
  if (query.q) {
    const q = query.q.toLowerCase();
    rows = rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        (r.tokenId ?? "").includes(q) ||
        (r.address ?? "").toLowerCase().includes(q),
    );
  }

  rows = rank(rows, query.sort ?? "hireable");

  /*
    Origin collapse, after ranking so the best row from each host survives.
    Doing it before would keep an arbitrary five and discard a better sixth.
  */
  const { shown, hidden, hiddenByHost } = collapseByOrigin(
    rows,
    (r) => r.originHost,
    (r) => r.key,
  );
  rows = shown;

  if (query.includeClosed === false) rows = rows.filter((r) => openCount(r) > 0);
  if (query.limit) rows = rows.slice(0, query.limit);

  return {
    rows,
    history: board.history ?? [],
    collapsed: hidden,
    collapsedByHost: [...hiddenByHost.entries()]
      .map(([host, count]) => ({ host, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8),
    snapshot: decay(board.snapshot, allRows),
    generatedAt: board.generatedAt,
    chainId,
  };
}

/**
 * Make the funnel agree with the rows underneath it.
 *
 * `railView` closes an open rail whose probe has gone stale, on the reasoning
 * that the cost of decaying early is a row saying "not checked recently" and
 * the cost of decaying late is selling a hire on an endpoint that died an hour
 * ago. That reasoning is right and the implementation was half done: the rows
 * decayed and the snapshot did not.
 *
 * The visible result was a board whose four doors read "2 hireable" in gold
 * over fifty rows every one of which said the rail was closed for want of a
 * recent check. Both numbers were computed correctly. They described different
 * moments, and nothing on the page said so, which is exactly the failure
 * `Measurement` exists to prevent — a figure without the time it belongs to.
 *
 * So the counts a reader can act on are recomputed from the rows they can act
 * on. `registered` and `probed` are left alone: they are cumulative facts about
 * what has been read, not claims about what is reachable this minute, and they
 * do not decay.
 */
function decay(snapshot: Snapshot, rows: Row[]): Snapshot {
  const openOn = (rail: RailName) => rows.filter((r) => r.rails[rail].open).length;

  const perJob = { ...snapshot.perJob };
  for (const job of Object.keys(perJob) as (keyof typeof perJob)[]) {
    const mine = rows.filter((r) => r.job === job);
    perJob[job] = {
      ...perJob[job],
      callable: mine.filter((r) => r.rails.call.open).length,
      hireable: mine.filter((r) => r.rails.hire.open).length,
      mandatable: mine.filter((r) => r.rails.mandate.open).length,
    };
  }

  return {
    ...snapshot,
    totals: {
      ...snapshot.totals,
      callable: openOn("call"),
      hireable: openOn("hire"),
      mandatable: openOn("mandate"),
    },
    perJob,
  };
}

/**
 * The worked example for a job, or nothing.
 *
 * Nothing is a real answer: the scan window is only the few thousand blocks
 * free providers serve, and a job whose work did not appear in it has no
 * example. The page says so rather than substituting an illustration.
 */
export function readExample(job: JobSlug, chainId: SupportedChain = DEFAULT_CHAIN): WorkedExample | null {
  return getBoard(chainId).examples?.find((e) => e.job === job) ?? null;
}

/** One row, by the key the board built. Used by /a and /hire. */
/**
 * Find one listing by any identifier the product hands out.
 *
 * It used to accept only the bare id — a token id, or `svc:<url>` — and the
 * machine surface hands out the row *key*, which is `a:<chain>:<id>`. So an
 * agent could call `find_agents`, take the id it was given, pass it straight to
 * `plan_hire`, and be told the deployment had never heard of it. The browser
 * never hit this because a page carries the id inside an href it built itself;
 * only a caller round-tripping our own output could see it.
 *
 * The rule this settles: **anything this product emits as an identifier must be
 * accepted back as one.** A surface that will not take its own output is not an
 * API, and §8's claim is that an agent can go from discovery to hire without a
 * browser.
 */
export function findRow(chainId: SupportedChain, rawId: string): { row: Row; agent: Agent | null; service: BazaarService | null } | null {
  const board = getBoard(chainId);

  /* `a:56:<id>` and `s:56:<resource>` are row keys; unwrap to the id inside. */
  const keyed = /^[as]:\d+:(.+)$/.exec(rawId);
  const id = keyed ? keyed[1]! : rawId;

  if (id.startsWith("svc:")) {
    const resource = id.slice(4);
    const s = board.services.find((x) => x.resource === resource);
    return s ? { row: serviceRow(s), agent: null, service: s } : null;
  }
  const a = board.agents.find((x) => x.tokenId === id);
  if (a) return { row: agentRow(a), agent: a, service: null };

  /* A service key unwraps to a bare URL rather than an `svc:` id. */
  if (/^https?:\/\//.test(id)) {
    const s2 = board.services.find((x) => x.resource === id);
    if (s2) return { row: serviceRow(s2), agent: null, service: s2 };
  }
  return null;
}
