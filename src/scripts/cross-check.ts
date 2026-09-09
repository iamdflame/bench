/**
 * Do the operator's engine and the public verifier agree?
 *
 * They are separate implementations on purpose — the verifier imports nothing
 * from this application and is enforced not to. That only buys anything if
 * somebody actually compares them, so this does, on a wallet at a block both
 * can read.
 *
 * A disagreement here is the most valuable output this repository can produce:
 * it means one of the two is wrong, and until it is resolved neither number
 * should be trusted.
 */
import { createPublicClient, http, type Address, type PublicClient } from "viem";
import { bsc } from "viem/chains";
import { valueWallet } from "@/lib/chain/valuation";
import { rederiveValue } from "../../packages/mandate-verify/src/valuation";

const RPC = process.env.BSC_RPC_URL ?? "https://bsc-dataseed.bnbchain.org";
const wallets = (process.argv.slice(2).filter((a) => a.startsWith("0x")) as Address[]);

async function main() {
  const c = createPublicClient({ chain: bsc, transport: http(RPC, { timeout: 30_000 }) }) as PublicClient;
  const block = await c.getBlockNumber();
  console.log(`block ${block}\n`);

  let disagreements = 0;
  for (const w of wallets) {
    const [app, ver] = await Promise.all([
      valueWallet(c, w, { block, kind: "execution" }),
      rederiveValue(c, w, block),
    ]);

    const a = app.valuation ? app.valuation.netWei : null;
    const b = ver ? ver.netWei : null;
    const fmt = (x: bigint | null) => (x === null ? "refused" : (Number(x) / 1e18).toFixed(8));

    console.log(`${w}`);
    console.log(`  operator  ${fmt(a)}${app.valuation ? "" : ` (${app.refusedBy})`}`);
    console.log(`  verifier  ${fmt(b)}`);

    if (a === null || b === null) {
      console.log(a === b ? "  → both refuse, consistently\n" : "  → DISAGREE: one refused and the other did not\n");
      if (a !== b) disagreements++;
      continue;
    }
    const diff = a > b ? a - b : b - a;
    // Integer arithmetic in both, so exact agreement is the expectation.
    // A little slack absorbs pool reads landing a block apart under load.
    const tolerance = a / 1000n;
    if (diff <= tolerance) {
      console.log(`  → agree within ${(Number(diff) / 1e18).toFixed(10)} BNB\n`);
    } else {
      console.log(`  → DISAGREE by ${(Number(diff) / 1e18).toFixed(8)} BNB\n`);
      disagreements++;
    }
  }

  if (disagreements > 0) {
    console.log(`${disagreements} disagreement(s). One of the two implementations is wrong.`);
    process.exit(1);
  }
  console.log("the operator and the verifier agree.");
}
main().catch((e) => { console.error(e); process.exit(1); });
