import { createPublicClient, http, parseAbiItem } from "viem";
import { bsc } from "viem/chains";

const RPCS = [
  "https://bsc-dataseed.bnbchain.org",
  "https://bsc.blockrazor.xyz",
  "https://bsc-rpc.publicnode.com",
  "https://bsc-dataseed1.defibit.io",
  "https://bsc.rpc.blxrbdn.com",
];
const TRANSFER = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)");
const IDENTITY = "0x8004a169fb4a3325136eb29fa0ceb6d2e539a432" as const;

async function main() {
  for (const url of RPCS) {
    const c = createPublicClient({ chain: bsc, transport: http(url, { timeout: 20_000, retryCount: 0 }) });
    let head: bigint;
    try { head = await c.getBlockNumber(); } catch { console.log(`${url}  unreachable`); continue; }

    // A range from hours ago: the question is whether historical logs are served.
    const from = head - 90_000n;
    const to = from + 2_000n;
    try {
      const logs = await c.getLogs({ address: IDENTITY, event: TRANSFER, fromBlock: from, toBlock: to });
      console.log(`${url.padEnd(42)} OK  ${logs.length} mints in blocks ${from}..${to}`);
    } catch (e) {
      console.log(`${url.padEnd(42)} NO  ${(e instanceof Error ? e.message : String(e)).split("\n")[0].slice(0, 70)}`);
    }
  }
}
main();
