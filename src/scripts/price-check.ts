import { bnbUsd, readPool, valueWallet, findPool, WBNB, USDT } from "@/lib/chain/prices";

const p = await readPool();
console.log("reference pool", p.pool);
console.log("  token0", p.token0);
console.log("  token1", p.token1);
console.log("  tick  ", p.tick);
console.log(`  BNB    $${(await bnbUsd()).toFixed(2)}`);

console.log("\npool discovery:");
for (const fee of [100, 500, 2500] as const) {
  console.log(`  WBNB/USDT ${fee}:`, await findPool(WBNB, USDT, fee));
}

console.log("\nvaluing the deployer wallet:");
const v = await valueWallet("0x54c06cC2623aAA2Dcc38B17fA07aD2e99b363C90");
for (const part of v.parts) console.log(`  ${part.asset.padEnd(5)} ${part.amount.toFixed(8)} = ${part.bnb.toFixed(8)} BNB`);
console.log(`  total ${v.bnb.toFixed(8)} BNB  ($${v.usd.toFixed(2)})`);
