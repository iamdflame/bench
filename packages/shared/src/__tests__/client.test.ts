/**
 * The log walker, and the one property it must never lose again.
 *
 * `scanLogs` is the only way this codebase reads events, and Rail 3 derives
 * standing authority over somebody's money from what it returns. On 2026-09-08
 * it was returning every event on a contract regardless of the topic filter,
 * because viem's `getLogs` builds its filter from `event`/`events` and silently
 * discards a bare `topics` array — a cast to `never` had suppressed the type
 * error that would have said so.
 *
 * Nothing threw. The scan simply "proved" that a wallet had used Venus on the
 * strength of a stranger's transaction, and the capability scan handed that to
 * `grantEngagement` as evidence. A filter that is dropped rather than rejected
 * is the worst kind of bug this product can have, because every downstream
 * check still passes.
 *
 * So these tests assert on the JSON-RPC request that actually leaves the
 * process, not on what a client library was asked to do.
 */

import { describe, expect, it } from "vitest";
import { numberToHex, type Hex } from "viem";
import { scanLogs, topics } from "../client";

type Body = { method: string; params: [Record<string, unknown>] };

/**
 * Every request that left the process during `fn`, decoded from the wire.
 *
 * `fetch` is stubbed rather than the client, because the property under test is
 * what the node is actually asked — which is exactly what a mocked client would
 * hide.
 */
async function capture(fn: () => Promise<unknown>): Promise<Body[]> {
  const seen: Body[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    const parsed = JSON.parse(String(init?.body ?? "{}")) as Body | Body[];
    for (const b of Array.isArray(parsed) ? parsed : [parsed]) seen.push(b);
    const ids = (Array.isArray(parsed) ? parsed : [parsed]).map(
      (b) => (b as unknown as { id?: number }).id ?? 1,
    );
    const payload = Array.isArray(parsed)
      ? ids.map((id) => ({ jsonrpc: "2.0", id, result: [] }))
      : { jsonrpc: "2.0", id: ids[0], result: [] };
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  try {
    await fn();
  } finally {
    globalThis.fetch = real;
  }
  return seen;
}

describe("topics()", () => {
  it("trims trailing nulls, which providers read as an arity requirement", () => {
    const sig = "0xdd" as Hex;
    const wallet = "0x00000000000000000000000054c06cc2623aaa2dcc38b17fa07ad2e99b363c90" as Hex;
    expect(topics(sig, null, wallet, null)).toEqual([sig, null, wallet]);
    expect(topics(sig, null, null)).toEqual([sig]);
    expect(topics(null, wallet)).toEqual([null, wallet]);
  });

  it("keeps an interior null, which is a real wildcard", () => {
    const sig = "0xdd" as Hex;
    const w = "0xaa" as Hex;
    expect(topics(sig, null, w)).toHaveLength(3);
  });
});

describe("scanLogs sends the filter it was given", () => {
  const VUSDT = "0xfd5840cd36d94d7229439859c0112a4185bc0255";
  const WALLET = "0x00000000000000000000000054c06cc2623aaa2dcc38b17fa07ad2e99b363c90" as Hex;

  it("puts the topics on the wire, not merely in the arguments", async () => {
    const sent = await capture(() =>
      scanLogs(56, {
        address: VUSDT,
        topics: topics(null, WALLET),
        fromBlock: 100n,
        toBlock: 110n,
      }),
    );

    const getLogs = sent.filter((b) => b.method === "eth_getLogs");
    expect(getLogs.length).toBeGreaterThan(0);

    const filter = getLogs[0]!.params[0];
    /*
      The assertion that would have caught the original bug. viem's `getLogs`
      dropped this key entirely and the scan matched every event on the
      contract.
    */
    expect(filter.topics).toEqual([null, WALLET]);
    expect(String(filter.address).toLowerCase()).toBe(VUSDT);
    expect(filter.fromBlock).toBe(numberToHex(100n));
    expect(filter.toBlock).toBe(numberToHex(110n));
  });

  it("omits the topics key entirely when none was asked for", async () => {
    const sent = await capture(() => scanLogs(56, { address: VUSDT, fromBlock: 1n, toBlock: 2n }));
    const filter = sent.filter((b) => b.method === "eth_getLogs")[0]!.params[0];
    expect("topics" in filter).toBe(false);
  });
});
