import { beforeAll, describe, expect, it } from "vitest";
import { createPublicClient, http, parseEther, type Address, type PublicClient } from "viem";
import { bsc } from "viem/chains";
import { valueWallet } from "..";
import type { ValuationResult } from "..";
import { erc20Adapter } from "../erc20";
import { nativeAdapter } from "../native";
import { venusAdapter, VBNB } from "../venus";
import { v3PositionAdapter } from "../v3";
import { priceSource, WBNB } from "../prices";

/**
 * Forked-mainnet tests for the valuation engine.
 *
 * These are the acceptance criteria for the bug that was slashing agents for
 * working. They need a fork because the interesting cases are transitions —
 * supplying, repaying, wrapping — and a transition cannot be observed by
 * reading mainnet once.
 *
 *   anvil --fork-url https://bsc-dataseed.bnbchain.org --port 8547
 *
 * Skipped rather than failed when no fork is reachable, so `npm test` stays
 * green on a machine with no anvil, and the skip is loud in the output.
 *
 * One environmental caveat worth stating: BSC's public nodes serve roughly
 * fifty seconds of state, and anvil fetches fork state lazily. A fork left
 * running longer than that starts failing upstream reads for contracts it has
 * not yet touched, which surfaces here as a refusal. That is the engine
 * behaving correctly — it will not value what it cannot see — but it makes
 * these tests want a warm fork or an archive endpoint. `FORK_RPC_URL` takes
 * either.
 */
/**
 * Opt-in, by an explicit variable rather than by whatever answers on a port.
 *
 * These were gated on reachability, which meant a stale anvil left running
 * from an earlier session silently joined `npm test` and failed on upstream
 * reads that had since been pruned. A test that runs only when someone asked
 * for it is a test whose failures mean something.
 *
 *   npm run test:fork
 */
const FORK = process.env.FORK_RPC_URL;

let client: PublicClient;
let live = false;

async function rpc(method: string, params: unknown[]) {
  const res = await fetch(FORK!, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = (await res.json()) as { result?: unknown; error?: { message: string } };
  if (body.error) throw new Error(`${method}: ${body.error.message}`);
  return body.result;
}

beforeAll(async () => {
  if (!FORK) return;
  try {
    client = createPublicClient({ chain: bsc, transport: http(FORK, { timeout: 20_000 }) }) as PublicClient;
    await client.getBlockNumber();
    live = true;
  } catch {
    live = false;
  }
}, 30_000);

/** A refusal is a legitimate answer, so a test that wanted a number says which adapter withheld it. */
function expectValued(r: ValuationResult) {
  if (!r.valuation) {
    throw new Error(
      `valuation refused by "${r.refusedBy}" at block ${r.blockNumber} ` +
        `(deviation ${r.maxDeviationBps} bps). On a stale fork this usually means an ` +
        `upstream read was pruned, not that the engine is wrong.`,
    );
  }
}

const forked = (name: string, fn: () => Promise<void>, timeout = 120_000) =>
  it(name, async () => {
    if (!live) {
      console.warn(
        FORK
          ? `[skipped: no fork answering at ${FORK}]`
          : "[skipped: set FORK_RPC_URL, or run npm run test:fork]",
      );
      return;
    }
    await fn();
  }, timeout);

/**
 * A funded address on the fork, distinct per test.
 *
 * Drawn from anvil's own prefunded accounts rather than invented. BSC's public
 * nodes serve roughly fifty seconds of state, so an address the fork has never
 * heard of sends anvil upstream for an account that has already been pruned —
 * "missing trie node", and a test failure that is about the node rather than
 * about the code. Anvil's own accounts exist locally and never make that trip.
 */
let accounts: Address[] = [];
let next = 0;

async function freshWallet(bnb: string): Promise<Address> {
  if (accounts.length === 0) accounts = (await rpc("eth_accounts", [])) as Address[];
  const wallet = accounts[next++ % accounts.length]!;
  await rpc("anvil_setBalance", [wallet, `0x${parseEther(bnb).toString(16)}`]);
  return wallet;
}

describe("valuation engine, forked mainnet", () => {
  forked("values a plain BNB wallet at exactly its balance", async () => {
    const w = await freshWallet("3");
    const r = await valueWallet(client, w, {
      adapters: (c) => [nativeAdapter(c), erc20Adapter(c)],
    });
    expectValued(r);
    expect(r.valuation!.netWei).toBe(parseEther("3"));
    expect(r.valuation!.liabilitiesWei).toBe(0n);
  });

  /**
   * The grid strategy's failure, as a test.
   *
   * `exactInputSingle` BNB→WBNB is a wrap: the same value in a different
   * shape. The old gauge counted native and USDT, so the wrap read as a total
   * loss of everything swapped.
   */
  forked("treats a BNB to WBNB wrap as value-neutral", async () => {
    const w = await freshWallet("10");
    // Native and tokens only. Anvil's dev accounts are well-known addresses,
    // and at least one of them holds a real V3 position on BSC in a pair this
    // engine cannot price — so the full adapter set correctly refuses, which
    // would be testing the wrong thing here.
    const only = (c: PublicClient) => [nativeAdapter(c), erc20Adapter(c)];

    const before = await valueWallet(client, w, { adapters: only });
    expectValued(before);

    await rpc("anvil_impersonateAccount", [w]);
    const hash = (await rpc("eth_sendTransaction", [
      { from: w, to: WBNB, value: `0x${parseEther("4").toString(16)}`, data: "0xd0e30db0", gas: "0x30d40" },
    ])) as `0x${string}`;
    await client.waitForTransactionReceipt({ hash });
    await rpc("anvil_stopImpersonatingAccount", [w]);

    const after = await valueWallet(client, w, { adapters: only });
    expectValued(after);

    // Equal to within gas. Before the engine existed this lost four whole BNB.
    const delta = before.valuation!.netWei - after.valuation!.netWei;
    expect(delta).toBeGreaterThanOrEqual(0n);
    expect(delta).toBeLessThan(parseEther("0.01"));
  });

  /**
   * The yield strategy's failure, as a test.
   *
   * Supplying to Venus moves BNB into vBNB. It is not a loss, and an agent
   * doing exactly what it was hired to do must not measure as one.
   */
  forked("treats supplying to Venus as value-neutral", async () => {
    const w = await freshWallet("10");
    const only = (c: PublicClient) => [nativeAdapter(c), erc20Adapter(c), venusAdapter(c)];

    const before = await valueWallet(client, w, { adapters: only });
    expectValued(before);

    await rpc("anvil_impersonateAccount", [w]);
    const hash = (await rpc("eth_sendTransaction", [
      // vBNB.mint() is payable and takes no arguments.
      { from: w, to: VBNB, value: `0x${parseEther("5").toString(16)}`, data: "0x1249c58b", gas: "0x7a120" },
    ])) as `0x${string}`;
    await client.waitForTransactionReceipt({ hash });
    await rpc("anvil_stopImpersonatingAccount", [w]);

    const after = await valueWallet(client, w, { adapters: only });
    expectValued(after);

    const supplied = after.valuation!.parts.filter((p) => p.adapter === "venus");
    expect(supplied.length).toBeGreaterThan(0);

    const delta = before.valuation!.netWei - after.valuation!.netWei;
    // Venus rounds the exchange rate down, so a little dust is expected; a
    // whole five BNB is not.
    expect(delta).toBeLessThan(parseEther("0.02"));
  });

  /**
   * The rule that stops a partial reading masquerading as a total.
   */
  forked("refuses the whole valuation when one adapter cannot see", async () => {
    const w = await freshWallet("1");
    const blind = {
      id: "blind",
      async value() {
        return null;
      },
    };
    const r = await valueWallet(client, w, {
      adapters: (c) => [nativeAdapter(c), blind],
    });
    expect(r.valuation).toBeNull();
    expect(r.refusedBy).toBe("blind");
  });

  forked("refuses when a held token cannot be priced", async () => {
    const w = await freshWallet("1");
    // A contract that is not an ERC-20 pair with WBNB: the adapter must refuse
    // rather than value the holding at nothing.
    const junk = "0x000000000000000000000000000000000000dEaD" as Address;
    const r = await valueWallet(client, w, {
      adapters: (c) => [nativeAdapter(c), erc20Adapter(c, [{ address: junk, symbol: "JUNK" }])],
    });
    // Either it refuses, or the token has a zero balance and is skipped.
    // Both are correct; silently valuing a real balance at zero is not.
    if (r.valuation) {
      expect(r.valuation.parts.some((p) => p.asset === "JUNK")).toBe(false);
    } else {
      expect(r.refusedBy).toBe("erc20");
    }
  });

  forked("reads every adapter at the same pinned block", async () => {
    const w = await freshWallet("2");
    const block = await client.getBlockNumber();
    const r = await valueWallet(client, w, {
      block,
      adapters: (c) => [nativeAdapter(c), erc20Adapter(c)],
    });
    expectValued(r);
    expect(r.valuation!.blockNumber).toBe(block);
    expect(r.blockNumber).toBe(block);
  });

  /**
   * Liabilities subtract.
   *
   * Constructed directly rather than by borrowing, because entering a Venus
   * market and taking a loan on a fork is several transactions of setup that
   * test the fork more than they test the adapter. What is under test is the
   * composition rule: a liability reduces net value.
   */
  forked("subtracts liabilities from assets", async () => {
    const w = await freshWallet("5");
    const indebted = {
      id: "debt",
      async value() {
        return {
          assetsWei: 0n,
          liabilitiesWei: parseEther("2"),
          parts: [
            {
              adapter: "debt",
              asset: "TEST borrowed",
              amount: parseEther("2"),
              decimals: 18,
              bnbWei: parseEther("2"),
              kind: "liability" as const,
            },
          ],
        };
      },
    };
    const r = await valueWallet(client, w, {
      adapters: (c) => [nativeAdapter(c), indebted],
    });
    expect(r.valuation!.assetsWei).toBe(parseEther("5"));
    expect(r.valuation!.liabilitiesWei).toBe(parseEther("2"));
    expect(r.valuation!.netWei).toBe(parseEther("3"));
  });

  /**
   * The invariant, caught in the wild.
   *
   * One of anvil's standard dev accounts turns out to hold a real PancakeSwap
   * V3 position on BSC. The engine must either value it at something positive
   * or refuse the wallet by name. What it must never do is return a total with
   * that position silently counted as nothing — which is precisely what the
   * old gauge did, and precisely why an agent got slashed for working.
   */
  forked("never values a real V3 position at nothing", async () => {
    const holder = "0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc" as Address;
    const count = await client.readContract({
      address: "0x46A15B0b27311cedF172AB29E4f4766fbE7F4364",
      abi: [
        {
          type: "function",
          name: "balanceOf",
          stateMutability: "view",
          inputs: [{ type: "address" }],
          outputs: [{ type: "uint256" }],
        },
      ] as const,
      functionName: "balanceOf",
      args: [holder],
    });
    expect(count).toBeGreaterThan(0n);

    const r = await valueWallet(client, holder, {
      adapters: (c) => [v3PositionAdapter(c)],
    });

    if (r.valuation) {
      // Valued: every part it reported must carry real value.
      expect(r.valuation.assetsWei).toBeGreaterThan(0n);
    } else {
      // Refused: by name, and for a reason the caller can act on.
      expect(r.refusedBy).toBe("v3-position");
    }
  }, 60_000);

  forked("values the live mandate holder including its Venus supply", async () => {
    const holder = "0xd6d11Aa5046dc5C7BE8d63B9223b60D7AD94cBe9" as Address;
    const r = await valueWallet(client, holder);
    expectValued(r);

    const venus = r.valuation!.parts.filter((p) => p.adapter === "venus");
    // This is the position the old gauge valued at zero on mainnet, which is
    // what made this whole engine necessary. If it ever stops being visible,
    // the regression is back.
    expect(venus.length).toBeGreaterThan(0);
    expect(venus.reduce((s, p) => s + p.bnbWei, 0n)).toBeGreaterThan(0n);
  });
});
