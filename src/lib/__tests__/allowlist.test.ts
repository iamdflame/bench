/**
 * The session allowlist cannot send value anywhere but the principal.
 *
 * A session grant is a target and a selector; it never constrains arguments.
 * So the only way to promise "a stolen session key cannot pay itself" is to
 * grant no call that takes an address the caller chooses. This test parses
 * every signature every category can be granted and fails on any address
 * argument (top level or inside a tuple) and on any approve-shaped selector.
 */

import { describe, expect, it } from "vitest";
import { CATEGORY_CALLS, exactPermissions } from "@/lib/chain/session";
import { RECIPIENT_BOUND, SWAP_BOUND } from "@/lib/chain/leash";

/** Splits "name(a,(b,c),d[])" into its top-level parameter types. */
function params(signature: string): string[] {
  const inner = signature.slice(signature.indexOf("(") + 1, signature.lastIndexOf(")"));
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of inner) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

const flatten = (types: string[]): string[] =>
  types.flatMap((t) => (t.startsWith("(") ? flatten(params(`x${t.replace(/\[\]$/, "")}`)) : [t]));

/** An address argument that is a list of markets to join, not a destination. */
const ALLOWED_ADDRESS_ARGS = new Set(["enterMarkets(address[])"]);

const DENIED_NAMES = [
  "approve",
  "increaseAllowance",
  "permit",
  "transfer",
  "transferFrom",
  "setApprovalForAll",
  "borrow",
  "repayBorrowBehalf",
  "mintBehalf",
  "redeemBehalf",
  "exactInputSingle",
  "exactInput",
  "multicall",
  "harvest",
];

describe("category allowlists", () => {
  for (const [category, calls] of Object.entries(CATEGORY_CALLS)) {
    for (const c of calls) {
      it(`${category}: ${c.signature} takes no address it could pay`, () => {
        if (ALLOWED_ADDRESS_ARGS.has(c.signature)) return;
        const types = flatten(params(c.signature));
        expect(types.filter((t) => t.startsWith("address")), c.signature).toEqual([]);
      });
      it(`${category}: ${c.signature} is not approve-shaped`, () => {
        const name = c.signature.slice(0, c.signature.indexOf("("));
        expect(DENIED_NAMES, c.signature).not.toContain(name);
      });
    }
  }

  it("rebalancing is granted only on RecipientBound", () => {
    for (const c of CATEGORY_CALLS.rebalancing) expect(c.to.toLowerCase()).toBe(RECIPIENT_BOUND.toLowerCase());
  });

  it("grid is granted only on SwapBound", () => {
    for (const c of CATEGORY_CALLS["grid-trading"]) expect(c.to.toLowerCase()).toBe(SWAP_BOUND.toLowerCase());
  });

  it("a session without roles gets exactly its calls and a native allowance", () => {
    const calls = CATEGORY_CALLS.rebalancing;
    const p = exactPermissions({ calls, capWei: 0n }) as { calls: { to: string; signature: string }[]; spend: { token?: string }[] };
    expect(p.calls.map((c) => c.signature)).toEqual(calls.map((c) => c.signature));
    expect(p.spend.some((s) => !s.token)).toBe(true);
  });
});
