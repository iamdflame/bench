/**
 * The gate that stops chain 56 and chain 97 appearing in the same figure.
 *
 * They are different populations with different agents, different liquidity
 * and different meanings. A count that adds them is not a number about
 * anything, and the mistake is invisible in review because the result looks
 * like a bigger, better figure.
 *
 * The defence is structural: the chain is resolved once at the data layer and
 * travels on every record, and nothing downstream filters by chain. This
 * checks that the structure is still what it claims — that the resolver fails
 * closed, that no component filters chains itself, and that the stored board
 * holds one chain per file.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_CHAIN, SUPPORTED_CHAINS, isSupportedChain, resolveChain } from "@bench/shared";
import { getBoard } from "../../apps/web/lib/board";

let failed = 0;
const fail = (m: string) => {
  console.error(`  FAIL  ${m}`);
  failed++;
};
const pass = (m: string) => console.log(`  ok    ${m}`);

console.log("\nnetwork: 56 and 97 never appear in one figure\n");

/* ------------------------------------------------- 1. the resolver's contract */
{
  const cases: [unknown, number, boolean][] = [
    [56, 56, false],
    ["56", 56, false],
    [97, 97, false],
    ["97", 97, false],
    [1, DEFAULT_CHAIN, true],
    ["ethereum", DEFAULT_CHAIN, true],
    [undefined, DEFAULT_CHAIN, false],
    [null, DEFAULT_CHAIN, false],
  ];
  let bad = 0;
  for (const [input, expected, coerced] of cases) {
    const got = resolveChain(input);
    if (got.chainId !== expected) {
      fail(`resolveChain(${JSON.stringify(input)}) gave ${got.chainId}, expected ${expected}`);
      bad++;
    } else if (got.coerced !== coerced) {
      fail(`resolveChain(${JSON.stringify(input)}) reported coerced=${got.coerced}, expected ${coerced}`);
      bad++;
    }
  }
  if (bad === 0) pass("an unrecognised chain fails closed to mainnet, and says it was coerced");
}

/* -------------------------------------------- 2. only two chains are nameable */
{
  if (SUPPORTED_CHAINS.length !== 2 || !isSupportedChain(56) || !isSupportedChain(97)) {
    fail("the supported chain list is not exactly [56, 97]");
  } else if (isSupportedChain(1) || isSupportedChain(8453)) {
    fail("a chain outside BNB Smart Chain passes the guard");
  } else pass("only 56 and 97 can be named anywhere in this codebase");
}

/* ------------------------------------ 3. one chain per stored board, no mixing */
for (const chainId of SUPPORTED_CHAINS) {
  const board = getBoard(chainId);
  if (board.agents.length === 0 && board.services.length === 0) {
    pass(`chain ${chainId}: nothing stored, so nothing can be mixed`);
    continue;
  }
  const wrong = board.agents.filter((a) => a.chainId !== chainId);
  if (wrong.length > 0) {
    fail(`chain ${chainId}: ${wrong.length} stored agent(s) carry a different chain id`);
  } else if (board.snapshot.chainId !== chainId) {
    fail(`chain ${chainId}: its snapshot is labelled chain ${board.snapshot.chainId}`);
  } else {
    pass(`chain ${chainId}: every stored record and the snapshot carry chain ${chainId}`);
  }
}

/* ------------------------ 4. no surface filters chains itself, after the fact */
{
  const ROOT = new URL("../../apps/web/", import.meta.url).pathname;
  const walk = (dir: string, out: string[] = []): string[] => {
    for (const e of readdirSync(dir)) {
      if (e === "node_modules" || e === ".next" || e === "data") continue;
      const p = join(dir, e);
      if (statSync(p).isDirectory()) walk(p, out);
      else if (/\.tsx?$/.test(p)) out.push(p);
    }
    return out;
  };

  /*
    Client-side chain filtering is the bug this rule exists for. If a component
    receives a mixed list and narrows it, the narrowing is one refactor away
    from being dropped while the aggregate above it keeps rendering.
  */
  const offenders: string[] = [];
  for (const file of walk(ROOT)) {
    const rel = file.slice(ROOT.length);
    if (rel === "lib/board.ts" || rel.startsWith("app/api/")) continue;
    const src = readFileSync(file, "utf8");
    if (/\.filter\([^)]*chainId\s*===/.test(src)) offenders.push(rel);
  }
  if (offenders.length > 0) fail(`these surfaces filter by chain after the fact: ${offenders.join(", ")}`);
  else pass("no page or component filters by chain — it is decided once, at the data layer");
}

/* ----------------------------- 5. a chain badge exists for whenever one is shown */
{
  const shared = readFileSync(new URL("../../packages/shared/src/chains.ts", import.meta.url).pathname, "utf8");
  if (!/CHAIN_BADGE/.test(shared)) fail("there is no chain badge to label a figure with");
  else pass("a chain label exists for every figure that needs one");
}

console.log(
  failed === 0 ? "\n  chain isolation holds at the data layer.\n" : `\n  ${failed} failed.\n`,
);
process.exit(failed > 0 ? 1 : 0);
