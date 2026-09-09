/**
 * Produces the dismissal on mainnet, for the record.
 *
 * Settles mandate 2 catastrophically once its epoch has elapsed. The contract
 * dismisses the incumbent, returns the residue of its bond, and promotes the
 * queued successor in the same transaction — which is the claim the whole
 * design rests on, so it is worth being able to point at a block explorer.
 */
import { formatEther, type Hex } from "viem";
import {
  MANDATE_MARKET_ABI,
  MARKET_ADDRESS,
  marketChain,
  marketClient,
  readMandate,
  walletFor,
} from "@/lib/chain/market";

const norm = (k?: string): Hex => (k?.startsWith("0x") ? k : `0x${k}`) as Hex;
const owner = walletFor(norm(process.env.PRIVATE_KEY));
const ID = BigInt(process.argv[2] ?? 2);
const ALPHA = BigInt(process.argv[3] ?? -1500);
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);

const before = await readMandate(Number(ID));
log(`mandate ${ID} · holder ${before.agent} · bond ${formatEther(before.bond)} BNB`);
const successor = await marketClient.readContract({
  address: MARKET_ADDRESS,
  abi: MANDATE_MARKET_ABI,
  functionName: "successor",
  args: [ID],
});
log(`successor waiting: ${successor}`);

for (let attempt = 0; attempt < 40; attempt++) {
  try {
    const hash = await owner.writeContract({
      address: MARKET_ADDRESS,
      abi: MANDATE_MARKET_ABI,
      functionName: "settleEpoch",
      args: [ID, ALPHA],
      chain: marketChain,
      account: owner.account!,
    } as never);
    const receipt = await marketClient.waitForTransactionReceipt({ hash });
    log(`settled ${Number(ALPHA) / 100}% in block ${receipt.blockNumber}`);
    log(`https://bscscan.com/tx/${hash}`);

    const after = await readMandate(Number(ID));
    log(`holder now  : ${after.agent}`);
    log(`bond now    : ${formatEther(after.bond)} BNB`);
    log(
      after.agent.toLowerCase() !== before.agent.toLowerCase()
        ? "DISMISSED AND REPLACED IN ONE TRANSACTION"
        : `not dismissed yet — strikes ${after.strikes}/3`,
    );
    process.exit(0);
  } catch (error) {
    if (/EpochNotElapsed/.test(String(error))) {
      await new Promise((r) => setTimeout(r, 15_000));
      continue;
    }
    log(`failed: ${String(error).slice(0, 160)}`);
    process.exit(1);
  }
}
log("gave up waiting for the epoch");
