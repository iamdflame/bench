/**
 * Read-only probe of the Altana stack.
 *
 * Constructs the admin provider and reads balances. Grants nothing and
 * registers nothing: KeyStore registration costs about $0.50 in BNB and the
 * deployer is holding roughly $1.30, so nothing here is allowed to spend.
 */
import {
  AltanaWalletProvider,
  defaultAgentPermissions,
  DEFAULT_NATIVE_GAS_ALLOWANCE_WEI,
  DEFAULT_AGENT_AUTHORIZATION_ROLES,
} from "@bnbagent/sdk/wallets";
import { getAddress } from "@bnbagent/sdk/networks";

const norm = (k?: string) => (k?.startsWith("0x") ? k : `0x${k}`) as `0x${string}`;

console.log("network preset for chain 56:");
try {
  console.log(" ", JSON.stringify(getAddress(56), null, 2).replace(/\n/g, "\n  "));
} catch (e) {
  console.log("  getAddress(56) failed:", String(e).slice(0, 160));
}

console.log("\nroles available:", DEFAULT_AGENT_AUTHORIZATION_ROLES.join(", "));
console.log("default native gas allowance:", DEFAULT_NATIVE_GAS_ALLOWANCE_WEI.toString(), "wei/day");

// Compose the permission set a mandate would grant: a working budget, a gas
// budget, and PancakeSwap's router bound to the one selector a grid agent uses.
const perms = defaultAgentPermissions({
  chainId: 56,
  tokenSpend: { limit: 10n ** 15n }, // 0.001 in payment-token units
  extraCalls: [
    {
      to: "0x13f4ea83d0bd40e75c8222255bc855a974568dd4",
      signature: "exactInputSingle((address,address,uint24,address,uint256,uint256,uint160))",
    },
  ],
});
console.log("\ncomposed permissions:");
console.log(JSON.stringify(perms, (_k, v) => (typeof v === "bigint" ? `${v}n` : v), 2).slice(0, 900));

const admin = new AltanaWalletProvider({ privateKey: norm(process.env.PRIVATE_KEY) });
console.log("\nadmin wallet:", admin.address, "· mode:", admin.mode);
try {
  const b = await admin.balances();
  console.log("balances:", JSON.stringify(b, (_k, v) => (typeof v === "bigint" ? `${v}n` : v)).slice(0, 300));
} catch (e) {
  console.log("balances failed:", String(e).slice(0, 200));
}
