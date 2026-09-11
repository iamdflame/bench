/**
 * Yield-1 and Guard-1 act once each on the demo account, through their own sessions, on Venus.
 *
 *   npx tsx --env-file=.env --env-file-if-exists=.env.local src/scripts/venus-agents.ts [run] [yield|guard|both]
 *
 * Yield-1 reads the USDT supply rate on Venus and on Aave at this block and
 * supplies to Venus. It does not supply to Aave even when Aave pays more:
 * Aave's `supply` takes `onBehalfOf`, the address credited, and no session
 * here is ever granted a call where the caller names who is paid. Venus's
 * `mint` credits the caller. When Aave pays more, the record says so.
 *
 * Guard-1 reads the account's health factor with Venus's own oracle. Its
 * published trigger for this account is 3.00. Below it, it repays part of the
 * account's own USDT debt through a session that cannot borrow, redeem or
 * repay for anyone else.
 *
 * Both sessions are unregistered (the KeyStore fee buys visibility, not
 * safety; /desk labels them) and expire in a day.
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { formatEther, parseAbi, parseEther, type Abi, type Address, type Hex } from "viem";
import { marketClient } from "@/lib/chain/market";
import { USDT } from "@/lib/chain/leash";
import { getSession, grantScopedSession, providerFor } from "@/lib/chain/session";
import { recordExecution } from "@/lib/chain/session-store";
import { readVenus } from "@/lib/diagnose/positions";
import { DEMO_ADDRESS } from "@/lib/demo";
import { usdtRates } from "@/lib/venus/rates";
import { closeDb } from "@/lib/db/client";

const MODE = process.argv[2] === "run" ? "run" : "plan";
const WHICH = process.argv[3] ?? "both";
const VUSDT: Address = "0xfD5840Cd36d94D7229439859C0112a4185BC0255";
const SUPPLY = parseEther("0.05");
const REPAY = parseEther("0.02");
const TRIGGER = 3.0;

const VTOKEN = parseAbi([
  "function supplyRatePerBlock() view returns (uint256)",
  "function blocksPerYear() view returns (uint256)",
  "function interestRateModel() view returns (address)",
  "function mint(uint256) returns (uint256)",
  "function repayBorrow(uint256) returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function borrowBalanceStored(address) view returns (uint256)",
]);

/** Rates come from the shared reader, the same one Yield-1's x402 endpoint answers from. */
async function rates() {
  const r = await usdtRates();
  return { venusApr: r.venusApr, venusAprDeclared: null as number | null, blocksPerYearMeasured: r.blocksPerYear, blocksPerYearDeclared: null as number | null, aaveApr: r.aaveApr, block: r.block };
}

async function session(id: string, label: string, category: "yield-optimisation" | "health-factor", calls: { to: Address; signature: string }[], limit: bigint, meta: Record<string, unknown>) {
  const existing = await getSession(id);
  if (existing && !existing.revokedAt && existing.expiry * 1000 > Date.now() + 600_000) return existing;
  return grantScopedSession({ id, kind: "house", label, category, calls, tokenSpend: [{ token: USDT, limit }], nativeSpendWei: parseEther("0.001"), capWei: 0n, ttlSeconds: 24 * 3600, register: false, meta });
}

async function exec(id: string, functionName: "mint" | "repayBorrow", amount: bigint, description: string): Promise<Hex> {
  const executor = (await providerFor(id)).makeExecutor({ client: marketClient });
  const r = (await executor.execute({ call: { address: VUSDT, abi: VTOKEN as unknown as Abi, functionName, args: [amount] }, description } as never)) as { transactionHash: Hex };
  const receipt = await marketClient.waitForTransactionReceipt({ hash: r.transactionHash });
  if (receipt.status !== "success") throw new Error(`${functionName} reverted: ${r.transactionHash}`);
  await recordExecution(id, { tx: r.transactionHash, description, status: "success" }).catch(() => undefined);
  return r.transactionHash;
}

async function main() {
  const pct = (x: number | null) => (x === null ? "unread" : `${(x * 100).toFixed(2)}%`);
  if (WHICH === "yield" || WHICH === "both") {
    const r = await rates();
    console.log(`Yield-1 at block ${r.block}: Venus vUSDT ${pct(r.venusApr)} (declared model ${pct(r.venusAprDeclared)}), Aave USDT ${pct(r.aaveApr)}; ${Math.round(r.blocksPerYearMeasured).toLocaleString()} blocks a year measured`);
    const aaveBetter = r.aaveApr !== null && r.aaveApr > r.venusApr;
    console.log(`  decision: supply ${formatEther(SUPPLY)} USDT to Venus${aaveBetter ? " (Aave pays more, and its supply names who is credited, which no session here may call)" : ""}`);
    if (MODE === "run") {
      const id = `house:yield-1:${DEMO_ADDRESS.toLowerCase()}`;
      await session(id, "Yield-1 on the demo address", "yield-optimisation", [
        { to: VUSDT, signature: "mint(uint256)" },
        { to: VUSDT, signature: "redeemUnderlying(uint256)" },
      ], parseEther("0.1"), { venusApr: r.venusApr, aaveApr: r.aaveApr });
      const before = (await marketClient.readContract({ address: VUSDT, abi: VTOKEN, functionName: "balanceOf", args: [DEMO_ADDRESS] })) as bigint;
      const tx = await exec(id, "mint", SUPPLY, `supply ${formatEther(SUPPLY)} USDT to Venus at ${pct(r.venusApr)}`);
      const after = (await marketClient.readContract({ address: VUSDT, abi: VTOKEN, functionName: "balanceOf", args: [DEMO_ADDRESS] })) as bigint;
      const summary = `Supplied ${formatEther(SUPPLY)} USDT to Venus at ${pct(r.venusApr)} a year (Aave paid ${pct(r.aaveApr)}${aaveBetter ? "; Aave's supply takes the address to credit, so no session here may call it" : ""}), through a session that can only mint and redeem vUSDT.`;
      writeFileSync(join(process.cwd(), "src/data/yield-1.json"), JSON.stringify({ tx, summary, rates: r, vTokensBefore: before.toString(), vTokensAfter: after.toString(), at: new Date().toISOString() }, null, 2) + "\n");
      console.log(`  supplied: ${tx}; vUSDT ${before} -> ${after}`);
    }
  }
  if (WHICH === "guard" || WHICH === "both") {
    const v = await readVenus(DEMO_ADDRESS);
    const hf = v?.healthFactor ?? null;
    console.log(`Guard-1: health factor ${hf === null ? "none (no debt)" : hf === undefined ? "unread" : hf.toFixed(6)} against a trigger of ${TRIGGER.toFixed(2)}`);
    if (typeof hf !== "number" || hf >= TRIGGER) {
      console.log("  decision: nothing to do");
    } else {
      console.log(`  decision: repay ${formatEther(REPAY)} USDT of the account's own debt`);
      if (MODE === "run") {
        const id = `house:guard-1:${DEMO_ADDRESS.toLowerCase()}`;
        await session(id, "Guard-1 on the demo address", "health-factor", [{ to: VUSDT, signature: "repayBorrow(uint256)" }], parseEther("0.05"), { trigger: TRIGGER });
        const tx = await exec(id, "repayBorrow", REPAY, `repay ${formatEther(REPAY)} USDT: health factor ${hf.toFixed(2)} is under the ${TRIGGER.toFixed(2)} trigger`);
        const after = await readVenus(DEMO_ADDRESS);
        const summary = `Health factor was ${hf.toFixed(6)} against its ${TRIGGER.toFixed(2)} trigger; repaid ${formatEther(REPAY)} USDT of the account's own debt through a session that cannot borrow or repay for anyone else; now ${typeof after?.healthFactor === "number" ? after.healthFactor.toFixed(2) : "unread"}.`;
        writeFileSync(join(process.cwd(), "src/data/guard-1.json"), JSON.stringify({ tx, summary, before: hf, after: after?.healthFactor ?? null, trigger: TRIGGER, at: new Date().toISOString() }, null, 2) + "\n");
        console.log(`  repaid: ${tx}; health factor now ${after?.healthFactor}`);
      }
    }
  }
  if (MODE !== "run") console.log("plan only. Re-run with `run`.");
}

main()
  .catch((e) => {
    console.error("FAILED:", e);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
