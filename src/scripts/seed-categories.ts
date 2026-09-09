/**
 * Opens one mandate per category that does not yet have one.
 *
 * R3.2 asks for a live session in each of the four categories. A session is
 * keyed by mandate, so a session for a mandate that does not exist would be a
 * row on the site pointing at nothing. This makes the mandates real first.
 *
 * Deliberately tiny: the funds behind this deployment are about three dollars
 * and the mechanism is identical at any size.
 */

import { formatEther, parseEther, type Hex } from "viem";
import {
  MANDATE_MARKET_ABI,
  MARKET_ADDRESS,
  marketChain,
  marketClient,
  readMandate,
  walletFor,
} from "@/lib/chain/market";

const norm = (k?: string) => (k?.startsWith("0x") ? k : `0x${k}`) as Hex;
const owner = walletFor(norm(process.env.PRIVATE_KEY));

/** Contract enum order. */
const CATEGORY_ENUM = { rebalancing: 0, "grid-trading": 1, "yield-optimisation": 2, "health-factor": 3 } as const;

const CAPITAL = parseEther("0.00005");
const EPOCH_SECONDS = 3600;
const EPOCHS_TOTAL = 6;

const count = Number(
  await marketClient.readContract({
    address: MARKET_ADDRESS,
    abi: MANDATE_MARKET_ABI,
    functionName: "mandateCount",
  }),
);

const covered = new Set<number>();
for (let i = 0; i < count; i++) covered.add((await readMandate(i)).category);

const missing = Object.entries(CATEGORY_ENUM).filter(([, e]) => !covered.has(e));
if (missing.length === 0) {
  console.log("\n  every category already has a mandate.\n");
  process.exit(0);
}

const balance = await marketClient.getBalance({ address: owner.account!.address });
const gasPrice = await marketClient.getGasPrice();
const need = (CAPITAL + gasPrice * 300_000n) * BigInt(missing.length);

console.log(`\n  ${count} mandate(s) exist, covering ${covered.size} categor${covered.size === 1 ? "y" : "ies"}`);
console.log(`  opening ${missing.length}: ${missing.map(([k]) => k).join(", ")}`);
console.log(`  ${formatEther(CAPITAL)} BNB each · balance ${formatEther(balance)} · needs about ${formatEther(need)}\n`);

if (balance < need) {
  console.error("  refusing: not enough to open them all. Nothing sent.\n");
  process.exit(1);
}

for (const [name, enumValue] of missing) {
  const hash = await owner.writeContract({
    address: MARKET_ADDRESS,
    abi: MANDATE_MARKET_ABI,
    functionName: "openMandate",
    args: [enumValue, 200, 2_000, 2_500, EPOCH_SECONDS, EPOCHS_TOTAL],
    value: CAPITAL,
    chain: marketChain,
    account: owner.account!,
  } as never);
  const r = await marketClient.waitForTransactionReceipt({ hash });
  if (r.status === "reverted") {
    console.error(`  ${name}: reverted (${hash})`);
    continue;
  }
  const now = Number(
    await marketClient.readContract({
      address: MARKET_ADDRESS,
      abi: MANDATE_MARKET_ABI,
      functionName: "mandateCount",
    }),
  );
  console.log(`  mandate ${now - 1}  ${name.padEnd(20)} https://bscscan.com/tx/${hash}`);
}

const after = await marketClient.getBalance({ address: owner.account!.address });
console.log(`\n  balance now ${formatEther(after)} BNB\n`);
