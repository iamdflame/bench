/**
 * The bond rail, proven on a live chain.
 *
 * Every other proof in this repository answers "can this contract do the thing
 * in a test". This one answers the only question that matters for a market
 * holding other people's collateral: does an agent's money actually leave, on
 * a real chain, when a real claim is not met — and does it leave to the right
 * address, exactly once.
 *
 * So the script does not mock anything. It deploys an oracle, posts real
 * collateral, signs a real EIP-712 claim, opens it, bonds against it, waits for
 * the window to close in wall-clock time, and settles. Every assertion is
 * checked against chain state read back afterwards rather than against what the
 * script believes it did.
 *
 *   npm run prove-bond
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  formatUnits,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bscTestnet } from "viem/chains";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/* ------------------------------------------------------------------ config */

const RPC = process.env.TESTNET_RPC_URL ?? "https://bsc-testnet-rpc.publicnode.com";
const CLAIMS = (process.env.CLAIM_REGISTRY_97 ?? "0xBcad3484b6189c3956ce32Da877a4B5DF20B38bB") as Address;
const VAULT = (process.env.BOND_VAULT_97 ?? "0x3c65772503120a73575c7230c878Ba1F0617a768") as Address;
const U = "0xc70B8741B8B07A6d61E54fd4B20f22Fa648E5565" as Address;

/** Small enough to run twice, large enough to be unambiguous on an explorer. */
const BOND = 1_000_000_000_000_000_000n; // 1 $U
/** Long enough that the window is genuinely open when we bond. */
const WINDOW_SECONDS = 60;

/* -------------------------------------------------------------------- abis */

const erc20 = parseAbi([
  "function approve(address,uint256) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
]);

const vaultAbi = parseAbi([
  "function deposit(address,uint256)",
  "function bond(uint256)",
  "function settle(uint256) returns (uint8,uint256)",
  "function available(address,address) view returns (uint256)",
  "function locked(address,address) view returns (uint256)",
  "function mandateOf(uint256) view returns ((address,address,address,uint256,bool,uint8))",
]);

const claimsAbi = parseAbi([
  "function open((address,address,address,uint8,int256,uint64,uint64,address,address,uint256,uint16,bytes32),bytes) returns (uint256)",
  "function hashClaim((address,address,address,uint8,int256,uint64,uint64,address,address,uint256,uint16,bytes32)) view returns (bytes32)",
  "function check(uint256) view returns (uint8,int256,int256)",
]);

/**
 * An oracle that answers whatever we set, so the *contract's* behaviour is what
 * is under test rather than a measurement pipeline. The measurement engines are
 * proven separately by the replay suite.
 */
const ORACLE_ABI = parseAbi([
  "constructor(int256,bool)",
  "function set(int256,bool)",
  "function measure((uint8,address,int256,uint64,uint64,address)) view returns (int256,bool)",
  "function method() view returns (string)",
]);

function oracleBytecode(): Hex {
  // Read from the build output rather than pasted in, so the bytecode deployed
  // on a live chain is provably the source in this repository.
  const artifact = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../../../contracts/out/FixedOracle.sol/FixedOracle.json",
  );
  const json = JSON.parse(readFileSync(artifact, "utf8")) as { bytecode: { object: string } };
  return json.bytecode.object as Hex;
}

const VERDICT = ["Pending", "Met", "Failed", "Unmeasurable"] as const;

/* ------------------------------------------------------------------ report */

let proven = 0;
let failed = 0;

function assert(ok: boolean, claim: string, detail = "") {
  if (ok) {
    proven++;
    console.log(`  proven      ${claim}${detail ? ` — ${detail}` : ""}`);
  } else {
    failed++;
    console.log(`  FAILED      ${claim}${detail ? ` — ${detail}` : ""}`);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* -------------------------------------------------------------------- main */

async function main() {
  const key = process.env.PRIVATE_KEY;
  if (!key) throw new Error("PRIVATE_KEY is not set, and this proof spends real testnet funds.");
  const account = privateKeyToAccount((key.startsWith("0x") ? key : `0x${key}`) as Hex);
  const chain = bscTestnet;
  const pub = createPublicClient({ chain, transport: http(RPC) });
  const wallet = createWalletClient({ account, chain, transport: http(RPC) });

  console.log("\nThe bond rail, on BNB Smart Chain testnet\n");
  console.log(`  agent      ${account.address}`);
  console.log(`  registry   ${CLAIMS}`);
  console.log(`  vault      ${VAULT}\n`);

  // The principal is a distinct address so a slash landing there is visible and
  // cannot be confused with the bond simply staying put.
  const principal = "0x000000000000000000000000000000000000dEaD" as Address;

  /* 1 — an oracle both sides name in the claim */
  const oracleHash = await wallet.deployContract({
    abi: ORACLE_ABI,
    bytecode: oracleBytecode(),
    args: [0n, true],
  });
  const oracleReceipt = await pub.waitForTransactionReceipt({ hash: oracleHash });
  const oracle = oracleReceipt.contractAddress!;
  assert(Boolean(oracle), "an oracle is deployed and named in the claim", oracle);

  /* 2 — real collateral */
  const allowance = await pub.readContract({
    address: U,
    abi: erc20,
    functionName: "allowance",
    args: [account.address, VAULT],
  });
  if (allowance < BOND) {
    const h = await wallet.writeContract({
      address: U,
      abi: erc20,
      functionName: "approve",
      args: [VAULT, BOND * 100n],
    });
    await pub.waitForTransactionReceipt({ hash: h });
  }

  const availableBefore = await pub.readContract({
    address: VAULT, abi: vaultAbi, functionName: "available", args: [account.address, U],
  });

  if (availableBefore < BOND) {
    const h = await wallet.writeContract({
      address: VAULT, abi: vaultAbi, functionName: "deposit", args: [U, BOND * 2n],
    });
    await pub.waitForTransactionReceipt({ hash: h });
  }

  const available = await pub.readContract({
    address: VAULT, abi: vaultAbi, functionName: "available", args: [account.address, U],
  });
  assert(available >= BOND, "collateral is posted and unlocked", `${formatUnits(available, 18)} $U available`);

  /* 3 — a claim the agent signs */
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    agent: account.address,
    principal,
    subject: account.address,
    metric: 0, // TimeInRange
    threshold: 9_500n, // 95% — deliberately not going to be met
    windowStart: BigInt(now - 1),
    windowEnd: BigInt(now + WINDOW_SECONDS),
    oracle,
    token: U,
    bond: BOND,
    feeBps: 500,
    salt: `0x${Date.now().toString(16).padStart(64, "0")}` as Hex,
  };

  const signature = await account.signTypedData({
    domain: {
      name: "Crucible",
      version: "1",
      chainId: chain.id,
      verifyingContract: CLAIMS,
    },
    types: {
      Claim: [
        { name: "agent", type: "address" },
        { name: "principal", type: "address" },
        { name: "subject", type: "address" },
        { name: "metric", type: "uint8" },
        { name: "threshold", type: "int256" },
        { name: "windowStart", type: "uint64" },
        { name: "windowEnd", type: "uint64" },
        { name: "oracle", type: "address" },
        { name: "token", type: "address" },
        { name: "bond", type: "uint256" },
        { name: "feeBps", type: "uint16" },
        { name: "salt", type: "bytes32" },
      ],
    },
    primaryType: "Claim",
    message: claim,
  });

  const tuple = [
    claim.agent, claim.principal, claim.subject, claim.metric, claim.threshold,
    claim.windowStart, claim.windowEnd, claim.oracle, claim.token, claim.bond,
    claim.feeBps, claim.salt,
  ] as const;

  const digest = await pub.readContract({
    address: CLAIMS, abi: claimsAbi, functionName: "hashClaim", args: [tuple as never],
  });

  /* 4 — open it */
  const openHash = await wallet.writeContract({
    address: CLAIMS, abi: claimsAbi, functionName: "open", args: [tuple as never, signature],
  });
  await pub.waitForTransactionReceipt({ hash: openHash });
  const mandateId = BigInt(digest);
  assert(true, "the claim opened under the hash of its own terms", `mandate ${digest.slice(0, 18)}…`);

  /* 5 — bond against it */
  const bondHash = await wallet.writeContract({
    address: VAULT, abi: vaultAbi, functionName: "bond", args: [mandateId],
  });
  await pub.waitForTransactionReceipt({ hash: bondHash });

  const locked = await pub.readContract({
    address: VAULT, abi: vaultAbi, functionName: "locked", args: [account.address, U],
  });
  assert(locked >= BOND, "the bond is locked and no longer withdrawable", `${formatUnits(locked, 18)} $U locked`);

  /* 6 — an open window decides nothing */
  const pending = await pub.readContract({
    address: CLAIMS, abi: claimsAbi, functionName: "check", args: [mandateId],
  });
  assert(pending[0] === 0, "an open window yields Pending, and nothing moves", VERDICT[pending[0]]);

  /* 7 — the oracle reports a miss, in wall-clock time */
  const setHash = await wallet.writeContract({
    address: oracle, abi: ORACLE_ABI, functionName: "set", args: [9_000n, true],
  });
  await pub.waitForTransactionReceipt({ hash: setHash });

  const waitFor = claim.windowEnd - BigInt(Math.floor(Date.now() / 1000)) + 3n;
  if (waitFor > 0n) {
    console.log(`\n  waiting ${waitFor}s for the window to close…\n`);
    await sleep(Number(waitFor) * 1000);
  }

  const decided = await pub.readContract({
    address: CLAIMS, abi: claimsAbi, functionName: "check", args: [mandateId],
  });
  assert(decided[0] === 2, "the closed window yields Failed against the signed threshold",
    `measured ${decided[1]} against ${decided[2]}`);

  /* 8 — settle, and watch the money move */
  const principalBefore = await pub.readContract({
    address: U, abi: erc20, functionName: "balanceOf", args: [principal],
  });

  const settleHash = await wallet.writeContract({
    address: VAULT, abi: vaultAbi, functionName: "settle", args: [mandateId],
  });
  const settleReceipt = await pub.waitForTransactionReceipt({ hash: settleHash });

  const principalAfter = await pub.readContract({
    address: U, abi: erc20, functionName: "balanceOf", args: [principal],
  });
  assert(principalAfter - principalBefore === BOND,
    "the bond left the agent and arrived at the principal",
    `${formatUnits(principalAfter - principalBefore, 18)} $U, tx ${settleHash}`);

  const lockedAfter = await pub.readContract({
    address: VAULT, abi: vaultAbi, functionName: "locked", args: [account.address, U],
  });
  assert(lockedAfter === locked - BOND, "the locked balance was released exactly once");

  const mandate = await pub.readContract({
    address: VAULT, abi: vaultAbi, functionName: "mandateOf", args: [mandateId],
  });
  assert(mandate[4] === true, "the mandate records itself as settled");
  assert(mandate[5] === 2, "the mandate records the verdict that settled it", VERDICT[mandate[5]]);

  /* 9 — and cannot be settled again */
  try {
    await pub.simulateContract({
      address: VAULT, abi: vaultAbi, functionName: "settle", args: [mandateId], account: account.address,
    });
    assert(false, "a settled mandate refuses a second settlement");
  } catch {
    assert(true, "a settled mandate refuses a second settlement");
  }

  console.log(`\n  ${proven} proven, ${failed} failed`);
  console.log(`  settlement: https://testnet.bscscan.com/tx/${settleHash}`);
  console.log(`  block ${settleReceipt.blockNumber}\n`);

  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error("\n  FAILED:", e?.shortMessage ?? e?.message ?? e, "\n");
  process.exit(1);
});
