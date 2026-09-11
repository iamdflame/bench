/**
 * Registers the four reference agents as ERC-8004 identities on BNB Smart Chain.
 *
 *   npx tsx --env-file=.env --env-file-if-exists=.env.local src/scripts/register-reference.ts [run]
 *
 * Each agent is owned by its own key (HOUSE_RANGE_KEY, HOUSE_GRID_KEY,
 * HOUSE_YIELD_KEY, HOUSE_GUARD_KEY). A missing key is generated here and
 * appended to .env; it is never printed. Each key is funded from the principal
 * with enough for its one registration, and mints its own token with
 * `register(tokenURI)`, the URI being this site's registration-v1 file for it.
 * Four agents, four owners: no one wallet counted four times.
 *
 * Writes src/data/reference-agents.json with each token id, owner, tx and block.
 */

import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { formatEther, parseAbi, parseEther, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { marketChain, marketClient, walletFor } from "@/lib/chain/market";
import { gasPrice } from "@/lib/chain/marketV2";
import { IDENTITY_REGISTRY } from "@/lib/config";
import { REFERENCE, type ReferenceRegistration } from "@/lib/house";

const MODE = process.argv[2] === "run" ? "run" : "plan";
const HOST = process.env.NEXT_PUBLIC_HOST ?? "https://mandate-coral.vercel.app";
const OUT = join(process.cwd(), "src/data/reference-agents.json");
const FUND = parseEther("0.00006");
const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const REGISTRY = parseAbi(["function register(string tokenURI) returns (uint256)", "function ownerOf(uint256) view returns (address)"]);
const norm = (k: string) => (k.startsWith("0x") ? k : `0x${k}`) as Hex;

async function main() {
  const principalKey = process.env.PRIVATE_KEY;
  if (!principalKey) throw new Error("PRIVATE_KEY is required (it funds the four keys)");
  const principal = walletFor(norm(principalKey));
  const done: Record<string, ReferenceRegistration> = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : {};

  for (const ref of REFERENCE) {
    const tokenURI = `${HOST}/house/${ref.slug}/registration.json`;
    if (done[ref.slug]) {
      const owner = await marketClient.readContract({ address: IDENTITY_REGISTRY as Address, abi: REGISTRY, functionName: "ownerOf", args: [BigInt(done[ref.slug].tokenId)] }).catch(() => null);
      console.log(`${ref.slug}: already token ${done[ref.slug].tokenId}, owner ${owner}`);
      continue;
    }
    let key = process.env[ref.keyEnv];
    if (!key) {
      if (MODE !== "run") {
        console.log(`${ref.slug}: would generate ${ref.keyEnv}, fund it ${formatEther(FUND)} BNB, register ${tokenURI}`);
        continue;
      }
      key = generatePrivateKey();
      appendFileSync(join(process.cwd(), ".env"), `\n# ${ref.name}, owner of its ERC-8004 registration, generated ${new Date().toISOString()}\n${ref.keyEnv}=${key}\n`);
      process.env[ref.keyEnv] = key;
    }
    const owner = privateKeyToAccount(norm(key)).address;
    const balance = await marketClient.getBalance({ address: owner });
    console.log(`${ref.slug}: owner ${owner}, ${formatEther(balance)} BNB; tokenURI ${tokenURI}`);
    if (MODE !== "run") continue;

    const price = await gasPrice();
    if (balance < FUND / 2n) {
      const fund = await principal.sendTransaction({ account: principal.account!, chain: marketChain, to: owner, value: FUND, gasPrice: price });
      await marketClient.waitForTransactionReceipt({ hash: fund });
      console.log(`  funded ${formatEther(FUND)} BNB: ${fund}`);
    }
    const w = walletFor(norm(key));
    const hash = await w.writeContract({ address: IDENTITY_REGISTRY as Address, abi: REGISTRY, functionName: "register", args: [tokenURI], chain: marketChain, account: w.account!, gasPrice: price });
    const receipt = await marketClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`${ref.slug}: register reverted ${hash}`);
    const log = receipt.logs.find((l) => l.address.toLowerCase() === IDENTITY_REGISTRY.toLowerCase() && l.topics[0] === TRANSFER);
    if (!log?.topics[3]) throw new Error(`${ref.slug}: no Transfer event in ${hash}`);
    const tokenId = BigInt(log.topics[3]).toString();
    done[ref.slug] = { tokenId, owner, tokenURI, tx: hash, block: Number(receipt.blockNumber) };
    writeFileSync(OUT, JSON.stringify(done, null, 2) + "\n");
    console.log(`  registered token ${tokenId}: ${hash} (gas ${receipt.gasUsed})`);
  }
  if (MODE !== "run") console.log("plan only. Re-run with `run`.");
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
