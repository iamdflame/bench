/**
 * Every address this product touches, in one file, per chain.
 *
 * An address written into a component is an address nobody can audit. These
 * are checksummed where the source gave them checksummed, lowercased where
 * they are used for comparison, and each carries what it is rather than only
 * what it is called.
 *
 * Sourced from: the ERC-8004 deployment, PancakeSwap's and Venus's own
 * documentation, and `ERC8183_ADDRESSES` in `@altananetwork/sdk` — the last of
 * which is re-exported here rather than copied, so an SDK upgrade that moves a
 * kernel cannot leave a stale constant behind.
 */

import { ERC8183_ADDRESSES, type Erc8183Addresses } from "@altananetwork/sdk";
import type { Address } from "viem";
import type { SupportedChain } from "./chains";

/** ERC-8004 identity registry. The same singleton across mainnets. */
export const IDENTITY_REGISTRY: Record<SupportedChain, Address> = {
  56: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
  97: "0x8004A818BFB912233c491871b3d84c89A494BD9e",
};

/** ERC-8004 reputation registry. Feedback records live here. */
export const REPUTATION_REGISTRY: Record<SupportedChain, Address | null> = {
  56: "0x8004baA17c55a88189aE136b182E5FDa19dE9b63",
  97: null,
};

/**
 * The ERC-8183 job-escrow stack, straight from the SDK.
 *
 * `commerce` holds the escrow and the job state machine, `router` is set as
 * both evaluator and hook, `policy` is the silence-approves verdict engine,
 * and `paymentToken` is $U — the token the kernel escrows and the only one it
 * will accept.
 */
/**
 * Policies the network actually uses, where the SDK's constant is stale.
 *
 * `@altananetwork/sdk@0.7.1` reports chain 97's policy as
 * `0x4F4678D4…78A6`. That contract is deployed and answers `disputeWindow()`
 * with 86,400 — and no job on the network is registered against it. Every live
 * `registerJob` in the last four thousand blocks names
 * `0xd6a42175…1cea` instead, whose window is **900 seconds**.
 *
 * The cost of the stale address is not a warning, it is a dead rail:
 * `registerJob` reverts, so the policy is never bound, so `fund` reverts with
 * `PolicyNotSet()` and the escrow can never be filled. Nothing in the error
 * says "wrong policy".
 *
 * Found by scanning the router's own logs for a `registerJob` that worked and
 * reading the address out of its calldata, which is the general remedy: when a
 * constant and the chain disagree, the chain is the constant.
 *
 * This also vindicates the plan's own figure. An earlier reading here reported
 * testnet's window as 24 hours and marked the plan's 900s as wrong; the plan
 * was right, and the 24 hours belonged to a contract nobody uses.
 */
const POLICY_OVERRIDE: Partial<Record<SupportedChain, Address>> = {
  97: "0xd6a4217588F6B1F5657a92A3e94E6422aD771cEA",
};

export function erc8183(chainId: SupportedChain): Erc8183Addresses {
  const a = ERC8183_ADDRESSES[chainId];
  if (!a) throw new Error(`no ERC-8183 deployment for chain ${chainId}`);
  const override = POLICY_OVERRIDE[chainId];
  return override ? { ...a, policy: override } : a;
}

/** Tokens, with the decimals that break naive integrations. */
export const TOKENS = {
  56: {
    WBNB: { address: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c" as Address, decimals: 18, symbol: "WBNB" },
    // 18 decimals on BNB Chain, not 6. $20 is 20n * 10n ** 18n.
    USDT: { address: "0x55d398326f99059fF775485246999027B3197955" as Address, decimals: 18, symbol: "USDT" },
    USDC: { address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d" as Address, decimals: 18, symbol: "USDC" },
    // World Liberty Financial USD. The one BSC stablecoin that implements
    // EIP-3009, which is why x402's `exact` scheme can settle in it here.
    USD1: { address: "0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d" as Address, decimals: 18, symbol: "USD1" },
    // United Stables — the ERC-8183 kernel's escrow token.
    U: { address: "0xcE24439F2D9C6a2289F741120FE202248B666666" as Address, decimals: 18, symbol: "$U" },
  },
  97: {
    WBNB: { address: "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd" as Address, decimals: 18, symbol: "WBNB" },
    USDT: { address: "0x337610d27c682E347C9cD60BD4b3b107C9d34dDd" as Address, decimals: 18, symbol: "USDT" },
    USDC: { address: "0x64544969ed7EBf5f083679233325356EbE738930" as Address, decimals: 18, symbol: "USDC" },
    USD1: null,
    U: { address: "0xc70B8741B8B07A6d61E54fd4B20f22Fa648E5565" as Address, decimals: 18, symbol: "$U" },
  },
} as const;

/** $U faucet on chain 97: `requestTokens()`, 10 $U per address per 30 minutes. */
export const U_FAUCET_97 = "0x86e9197CC0F76E4e4aaa7082180945196bBAb5D3" as Address;

/**
 * Venues. Lowercased, because their only use is comparison against the `to`
 * and `address` fields of transactions and logs, which arrive lowercased.
 */
export const VENUES = {
  pancakeV3PositionManager: "0x46a15b0b27311cedf172ab29e4f4766fbe7f4364",
  pancakeV3Router: "0x13f4ea83d0bd40e75c8222255bc855a974568dd4",
  pancakeV2Router: "0x10ed43c718714eb63d5aa57b78b54704e256024e",
  pancakeMasterChefV3: "0x556b9306565093c855aea9ae92a594704c2cd59e",
  pancakeV3Factory: "0x0bfbcf9fa4f9c56b0f40a671ad40e0805a091865",
  venusComptroller: "0xfd36e2c2a6789db23113685031d7f16329158384",
  venusVBNB: "0xa07c5b74c9b40447a954e1466938b865b6bbea36",
  venusVUSDT: "0xfd5840cd36d94d7229439859c0112a4185bc0255",
  aaveV3Pool: "0x6807dc923806fe8fd134338eabca509979a7e0cb",
} as const;

export type VenueKey = keyof typeof VENUES;

/**
 * PancakeSwap V3 pools deep enough to be worth scanning, resolved from the
 * factory and checked for traffic.
 *
 * They exist because of a provider limit rather than a preference: free BSC
 * nodes refuse an `eth_getLogs` with no `address`, so a topic-only scan for
 * swaps returns an error on every host and finds nothing forever. That is
 * silent and total — a grid agent could never prove capability, however much
 * it traded, and the failure looks exactly like an agent that never traded.
 *
 * Filtering by pool address turns the same query into one the providers serve.
 * Measured over 200 blocks: WBNB/USDT at 0.01% carried 2,061 swaps, WBNB/USDC
 * 165, BTCB/WBNB 57. A wallet trading a pair not listed here is invisible to
 * this scan, which is a real limit and is why an incomplete scan refuses
 * rather than denying.
 */
export const LIQUID_POOLS: { pool: Address; pair: string; feeBps: number }[] = [
  { pool: "0x172fcD41E0913e95784454622d1c3724f546f849", pair: "WBNB/USDT", feeBps: 1 },
  { pool: "0xf2688Fb5B81049DFB7703aDa5e770543770612C4", pair: "WBNB/USDC", feeBps: 1 },
  { pool: "0x6bbc40579ad1BBD243895cA0ACB086BB6300d636", pair: "BTCB/WBNB", feeBps: 5 },
  { pool: "0x36696169C63e42cd08ce11f5deeBbCeBae652050", pair: "WBNB/USDT", feeBps: 5 },
  { pool: "0x62Edaf2a56c9FB55be5F9B1399Ac067f6a37013b", pair: "BTCB/WBNB", feeBps: 1 },
];

export const POOL_ADDRESSES = LIQUID_POOLS.map((p) => p.pool);

export const VENUE_LABEL: Record<string, string> = {
  [VENUES.pancakeV3PositionManager]: "PancakeSwap V3 Positions",
  [VENUES.pancakeV3Router]: "PancakeSwap V3 Router",
  [VENUES.pancakeV2Router]: "PancakeSwap V2 Router",
  [VENUES.pancakeMasterChefV3]: "PancakeSwap MasterChef V3",
  [VENUES.pancakeV3Factory]: "PancakeSwap V3 Factory",
  [VENUES.venusComptroller]: "Venus Comptroller",
  [VENUES.venusVBNB]: "Venus vBNB",
  [VENUES.venusVUSDT]: "Venus vUSDT",
  [VENUES.aaveV3Pool]: "Aave V3 Pool",
};

/**
 * The Altana KeyStore, where a session's authority becomes publicly checkable.
 *
 * A session enforces identically whether or not it is registered here.
 * Registration is what lets a counterparty verify the scope without asking us,
 * which is the entire reason we pay for it.
 */
export const KEYSTORE: Record<SupportedChain, Address> = {
  56: "0x6572427ED530BadcF7375Cf9A4709D8d2b0E7E0a",
  97: "0x6572427ED530BadcF7375Cf9A4709D8d2b0E7E0a",
};

/**
 * Our own `RecipientBound` deployment, per chain, once it exists.
 *
 * Read from the environment because it is deployed per (principal, agent)
 * pair. Null is a legitimate state and renders as "no wrapper deployed for
 * this pair", never as a silently unbound grant.
 */
export function recipientBound(chainId: SupportedChain): Address | null {
  const key = chainId === 97 ? "RECIPIENT_BOUND_97" : "RECIPIENT_BOUND";
  const v = process.env[key] ?? process.env[`NEXT_PUBLIC_${key}`] ?? "";
  return /^0x[0-9a-fA-F]{40}$/.test(v) ? (v as Address) : null;
}
