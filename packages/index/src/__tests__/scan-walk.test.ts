/**
 * The walk's stopping rules, which are the only part of it that can be wrong
 * quietly.
 *
 * A walk that ends too early reads a fraction of the registry and reports a
 * number that looks like a population. A walk that never ends spins against
 * the same cursor for ever and looks, from the outside, exactly like a slow
 * one. Both failures are invisible without a test that drives the pages, so
 * these mock the transport rather than the module: every assertion is about
 * what the walk did with what it was handed.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

/*
 * The client paces itself against the index's rate limit, and the interval is
 * fixed when the module loads: two and a half seconds without a key, a tenth
 * of that with one. These tests stub the transport, so there is no third party
 * to be polite to — but the unkeyed interval would still make a two-page walk
 * take five seconds and time out. Setting a key here runs the walk in the
 * configuration the worker actually runs in, and `vi.hoisted` is what puts it
 * in the environment before the import below reads it.
 */
vi.hoisted(() => {
  process.env.SCAN_API_KEY = "test-key — the transport is stubbed, nothing is sent";
});

import { walkAgents, SCAN_PAGE_MAX, type WalkOptions } from "../scan";

interface FakePage {
  items: Array<{ token_id: string }>;
  next_cursor?: string | null;
  has_more?: boolean;
  total?: number;
}

/** Serve a fixed list of pages, recording the query each request carried. */
function serve(pages: FakePage[]) {
  const urls: URL[] = [];
  let i = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: URL | string) => {
      urls.push(new URL(String(input)));
      const body = pages[Math.min(i, pages.length - 1)];
      i += 1;
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
  return urls;
}

const rows = (...ids: string[]) => ids.map((token_id) => ({ token_id }));

async function collect(opts: WalkOptions = {}) {
  const seen: string[] = [];
  let last: { pages: number; fetched: number; stopped: string | null; more: boolean } | null = null;
  for await (const { items, state } of walkAgents(56, opts)) {
    for (const a of items) seen.push(a.token_id);
    last = { pages: state.pages, fetched: state.fetched, stopped: state.stopped, more: state.more };
  }
  return { seen, last: last! };
}

afterEach(() => vi.unstubAllGlobals());

describe("walkAgents", () => {
  it("follows the cursor to the end and stops when the index says there is no more", async () => {
    serve([
      { items: rows("3", "2"), next_cursor: "c1", has_more: true, total: 3 },
      { items: rows("1"), next_cursor: null, has_more: false, total: 3 },
    ]);

    const { seen, last } = await collect({ limit: 2 });

    expect(seen).toEqual(["3", "2", "1"]);
    expect(last.pages).toBe(2);
    expect(last.more).toBe(false);
    expect(last.stopped).toBeNull();
  });

  it("stops on an empty page rather than spinning against the same cursor", async () => {
    // The dangerous shape: the index keeps claiming there is more, and keeps
    // handing back a cursor, but returns nothing. Without the emptiness check
    // this walk never terminates.
    serve([
      { items: rows("2"), next_cursor: "c1", has_more: true },
      { items: [], next_cursor: "c2", has_more: true },
    ]);

    const { seen, last } = await collect({ limit: 1 });

    expect(seen).toEqual(["2"]);
    expect(last.pages).toBe(2);
    expect(last.more).toBe(false);
  });

  it("stops when the index issues no cursor, even while claiming more", async () => {
    serve([{ items: rows("9"), next_cursor: null, has_more: true }]);

    const { last } = await collect({ limit: 1 });

    expect(last.pages).toBe(1);
    expect(last.more).toBe(false);
  });

  it("truncates at the first row `until` matches, keeping that row", async () => {
    // The incremental pass: everything after a token we already hold belongs
    // to a previous run, and re-reading it is the cost this avoids.
    serve([
      { items: rows("5", "4", "3", "2"), next_cursor: "c1", has_more: true },
      { items: rows("1"), next_cursor: null, has_more: false },
    ]);

    const { seen, last } = await collect({ limit: 4, until: (a) => a.token_id === "3" });

    expect(seen).toEqual(["5", "4", "3"]);
    expect(last.stopped).toBe("3");
    expect(last.pages).toBe(1);
  });

  it("honours `max` without asking for another page", async () => {
    serve([
      { items: rows("2", "1"), next_cursor: "c1", has_more: true },
      { items: rows("0"), next_cursor: "c2", has_more: true },
    ]);

    const { seen } = await collect({ limit: 2, max: 2 });

    expect(seen).toEqual(["2", "1"]);
  });

  it("never asks for a page larger than the index will serve", async () => {
    // Asking for more is refused with a 422 carrying no `items`, which reads
    // downstream as an empty registry rather than as an error.
    const urls = serve([{ items: rows("1"), next_cursor: null, has_more: false }]);

    await collect({ limit: 5_000 });

    expect(urls[0]!.searchParams.get("limit")).toBe(String(SCAN_PAGE_MAX));
  });

  it("sends the sort only to open the walk, never alongside a cursor", async () => {
    // The sort is baked into the cursor the index issues. Sending both invites
    // the two to disagree, and the index answers that with a 422.
    const urls = serve([
      { items: rows("2"), next_cursor: "c1", has_more: true },
      { items: rows("1"), next_cursor: null, has_more: false },
    ]);

    await collect({ limit: 1, sortOrder: "desc", sortBy: "created_at" });

    expect(urls[0]!.searchParams.get("sort_order")).toBe("desc");
    expect(urls[0]!.searchParams.has("cursor")).toBe(false);
    expect(urls[1]!.searchParams.get("cursor")).toBe("c1");
    expect(urls[1]!.searchParams.has("sort_order")).toBe(false);
  });

  it("resumes from a supplied cursor instead of restarting at the head", async () => {
    const urls = serve([{ items: rows("7"), next_cursor: null, has_more: false }]);

    await collect({ limit: 1, cursor: "saved-cursor" });

    expect(urls[0]!.searchParams.get("cursor")).toBe("saved-cursor");
  });
});
