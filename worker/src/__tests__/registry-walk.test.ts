/**
 * Cohort independence, which is the property that failed silently.
 *
 * The cohorts overlap: 313 agents declare both an A2A endpoint and an MCP
 * server. An incremental pass stops at the first row it has seen before, and
 * when "seen before" meant *any* row held from any cohort, the MCP walk
 * stopped at the first agent the A2A walk had already picked up — 111 rows
 * into a population of 5,578 — and recorded itself complete.
 *
 * That is the worst shape a bug can have here. It did not throw, it did not
 * log, and it produced a number that looked exactly like a finished walk. The
 * only way to keep it fixed is a test that makes the cohorts overlap on
 * purpose.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const walkAgents = vi.fn();
const readFunnel = vi.fn(async () => null);

vi.mock("@bench/index", () => ({
  walkAgents: (...args: unknown[]) => walkAgents(...args),
  readFunnel: () => readFunnel(),
  useCrawlTimeouts: () => {},
  SCAN_PAGE_MAX: 100,
  TEMPLATE_REPORT_AT: 25,
  // The real classifier and clusterer are exercised by their own tests. Here
  // they only need to be present, so the walk's own behaviour is what fails.
  classify: () => ({ job: { known: false, reason: "not classified in this test" }, matched: [] }),
  clusterTemplates: () => ({ rows: 0, empty: 0, distinct: 0, clustered: 0, groups: [] }),
}));

/**
 * An in-memory stand-in for the data directory, keyed by path.
 *
 * A single slot will not do: the walk writes two documents — the working set
 * it resumes from and the summary the site serves — and a mock that keeps
 * only the last one hands the summary back when the walk asks for its own
 * checkpoint.
 */
const files = new Map<string, unknown>();
vi.mock("../store", () => ({
  DATA_DIR: "/data",
  writeAtomicJson: (p: string, v: unknown) => {
    files.set(p, v);
  },
  readJson: (p: string) => files.get(p) ?? null,
}));

const { walkRegistry } = await import("../registry-walk");

interface Row {
  token_id: string;
}

/**
 * Serve a cohort's rows one page at a time, honouring the `until` predicate
 * the way the real walk does: the matching row is kept, everything after it
 * is dropped, and the walk ends.
 */
type WalkOpts = { until?: (a: Row) => boolean; filters?: Record<string, unknown> };

function pagesFor(rows: Row[], pageSize = 2) {
  return async function* (_chain: number, opts: WalkOpts) {
    let fetched = 0;
    for (let i = 0; i < rows.length; i += pageSize) {
      let items = rows.slice(i, i + pageSize);
      let stopped: string | null = null;
      if (opts.until) {
        const hit = items.findIndex(opts.until);
        if (hit !== -1) {
          items = items.slice(0, hit + 1);
          stopped = items[hit]!.token_id;
        }
      }
      fetched += items.length;
      const more = stopped === null && i + pageSize < rows.length;
      yield { items, state: { cursor: more ? `c${i}` : null, fetched, pages: 0, total: rows.length, more, stopped } };
      if (!more) return;
    }
  };
}

const rows = (...ids: string[]) => ids.map((token_id) => ({ token_id }));

beforeEach(() => {
  files.clear();
  walkAgents.mockReset();
  readFunnel.mockReset().mockResolvedValue(null);
});

describe("walkRegistry", () => {
  it("reads a later cohort in full even when an earlier one already holds its rows", async () => {
    // "10" and "11" are in both cohorts — the overlap that broke this.
    const byCohort: Record<string, Row[]> = {
      a2a: rows("10", "11", "12", "13"),
      mcp: rows("10", "11", "20", "21"),
      oasf: rows("30"),
    };
    walkAgents.mockImplementation((chain: number, opts: WalkOpts) => {
      const key = opts.filters?.has_a2a ? "a2a" : opts.filters?.has_mcp ? "mcp" : "oasf";
      return pagesFor(byCohort[key]!)(chain, opts);
    });

    const report = await walkRegistry(56);
    const state = Object.fromEntries(report.cohorts.map((c) => [c.key, c]));

    expect(state.mcp!.fetched).toBe(4);
    expect(state.mcp!.complete).toBe(true);
    expect(state.a2a!.fetched).toBe(4);
    // 10, 11, 12, 13, 20, 21, 30 — the overlap counted once.
    expect(report.candidates).toBe(7);
  });

  it("records both cohorts on an agent that appears in each", async () => {
    walkAgents.mockImplementation((chain: number, opts: WalkOpts) =>
      pagesFor(opts.filters?.has_a2a ? rows("10") : opts.filters?.has_mcp ? rows("10") : [])(chain, opts),
    );

    await walkRegistry(56);
    const saved = files.get("/data/registry-56.json") as {
      candidates: Array<{ tokenId: string; cohorts: string[] }>;
    };
    const agent = saved.candidates.find((c) => c.tokenId === "10")!;

    expect(agent.cohorts).toEqual(["a2a", "mcp"]);
  });

  it("leaves a frontier behind and stops there on the next pass", async () => {
    walkAgents.mockImplementation((chain: number, opts: WalkOpts) =>
      pagesFor(opts.filters?.has_a2a ? rows("10", "9", "8") : [])(chain, opts),
    );
    const first = await walkRegistry(56);
    expect(first.cohorts.find((c) => c.key === "a2a")!.frontier).toBe("10");

    // Two new registrations land above the frontier. The pass should read them
    // and the frontier row, and stop — not walk the whole cohort again.
    walkAgents.mockImplementation((chain: number, opts: WalkOpts) =>
      pagesFor(opts.filters?.has_a2a ? rows("12", "11", "10", "9", "8") : [])(chain, opts),
    );
    const second = await walkRegistry(56);

    expect(second.cohorts.find((c) => c.key === "a2a")!.fetched).toBe(3);
    expect(second.added).toBe(2);
  });

  it("does not mark a cohort complete when the run stops on its budget", async () => {
    walkAgents.mockImplementation((chain: number, opts: WalkOpts) =>
      pagesFor(opts.filters?.has_a2a ? rows("1", "2", "3", "4", "5", "6") : [])(chain, opts),
    );

    const report = await walkRegistry(56, { budget: 1 });
    const a2a = report.cohorts.find((c) => c.key === "a2a")!;

    expect(a2a.complete).toBe(false);
    expect(a2a.cursor).not.toBeNull();
  });
});
