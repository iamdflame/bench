/**
 * Single source of truth for chain selection and the protocol addresses the
 * Capability assay checks against.
 *
 * The mainnet cutover is CHAIN_ID. Nothing else needs to change.
 */

export const CHAIN_ID = Number(process.env.CHAIN_ID ?? 56);
export const IS_TESTNET = CHAIN_ID === 97;

export const RPC_URL = IS_TESTNET
  ? (process.env.BSC_TESTNET_RPC_URL ?? "https://bsc-testnet-rpc.publicnode.com")
  : (process.env.BSC_RPC_URL ?? "https://bsc-rpc.publicnode.com");

/** Fallbacks, tried in order when the primary is rate-limited or down. */
export const RPC_FALLBACKS = IS_TESTNET
  ? ["https://data-seed-prebsc-1-s1.bnbchain.org:8545"]
  : ["https://bsc-dataseed.bnbchain.org", "https://bsc-dataseed1.defibit.io"];

export const EXPLORER = IS_TESTNET
  ? "https://testnet.bscscan.com"
  : "https://bscscan.com";

export const SCAN_BASE_URL =
  process.env.SCAN_BASE_URL ?? "https://api.8004scan.io/api/v1";
export const SCAN_API_KEY = process.env.SCAN_API_KEY ?? "";

/**
 * MANDATE's own ERC-8004 registration.
 *
 * This project grades three hundred thousand registrations on whether the thing
 * they point at actually exists and answers. Standing outside that instrument
 * was the one position it could not defend, so it is registered too, at
 * whatever rung it earns. If the endpoint stops answering the fineness drops
 * and the register shows it — there is no exemption to apply.
 *
 * Minted at block 120,148,918 in
 * 0x02e254124a6df77468ee703148ad2caaa38c0396301a1e0d8044b63c147b6ebf.
 */
export const MANDATE_TOKEN_ID =
  process.env.NEXT_PUBLIC_MANDATE_TOKEN_ID ?? "336161";

/** ERC-8004 Identity Registry — the same singleton address across chains. */
export const IDENTITY_REGISTRY =
  "0x8004a169fb4a3325136eb29fa0ceb6d2e539a432" as const;

/**
 * The four categories the hackathon requires, surfaced at equal depth.
 * Each carries its own on-chain evidence profile — a grid trading agent that
 * never touches a router is not a grid trading agent, whatever its card says.
 */
export const CATEGORIES = [
  "rebalancing",
  "grid-trading",
  "yield-optimisation",
  "health-factor",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABEL: Record<Category, string> = {
  rebalancing: "Rebalancing",
  "grid-trading": "Grid Trading",
  "yield-optimisation": "Yield Optimisation",
  "health-factor": "Health Factor Monitoring",
};

export const CATEGORY_BLURB: Record<Category, string> = {
  rebalancing: "Manages LP ranges and resets positions as price moves.",
  "grid-trading": "Places and manages automated grid orders within a band.",
  "yield-optimisation": "Routes liquidity toward the highest available yield.",
  "health-factor": "Watches lending positions and acts before liquidation.",
};

/**
 * Protocol contracts on BSC mainnet. The Capability assay checks whether an
 * agent's wallet has ever actually touched the contracts its claimed category
 * implies. Addresses are lowercased for comparison.
 */
/**
 * The ladder's rung names.
 *
 * Here rather than in `lib/rung.ts` because client components render them, and
 * that module reaches the chain and the filesystem — importing it from the
 * browser bundle pulled `node:fs` in and broke the build.
 */
export const RUNG_NAMES = [
  "Registered",
  "Resolvable",
  "Live",
  "Capable",
  "Assayed",
  "Bonded",
  "Settled",
] as const;

export const PROTOCOLS = {
  pancakeV3Router: "0x13f4ea83d0bd40e75c8222255bc855a974568dd4",
  pancakeV2Router: "0x10ed43c718714eb63d5aa57b78b54704e256024e",
  pancakeV3PositionManager: "0x46a15b0b27311cedf172ab29e4f4766fbe7f4364",
  pancakeMasterChefV3: "0x556b9306565093c855aea9ae92a594704c2cd59e",
  pancakeSmartRouter: "0x13f4ea83d0bd40e75c8222255bc855a974568dd4",
  venusComptroller: "0xfd36e2c2a6789db23113685031d7f16329158384",
  venusVBNB: "0xa07c5b74c9b40447a954e1466938b865b6bbea36",
  aaveV3Pool: "0x6807dc923806fe8fd134338eabca509979a7e0cb",
} as const;

/** Which contracts count as evidence for which category claim. */
export const CATEGORY_EVIDENCE: Record<Category, readonly string[]> = {
  rebalancing: [
    PROTOCOLS.pancakeV3PositionManager,
    PROTOCOLS.pancakeMasterChefV3,
  ],
  "grid-trading": [
    PROTOCOLS.pancakeV3Router,
    PROTOCOLS.pancakeV2Router,
    PROTOCOLS.pancakeSmartRouter,
  ],
  "yield-optimisation": [
    PROTOCOLS.pancakeMasterChefV3,
    PROTOCOLS.venusComptroller,
    // vBNB was missing while the category granted calls on it, so those calls
    // could never be earned: `granted ⊆ proven` intersects the category's
    // calls with the protocols its evidence list looks for, and a target
    // absent from the evidence is permanently unprovable. Enforced now by
    // contracts/../config.test — every granted target must be searchable.
    PROTOCOLS.venusVBNB,
    PROTOCOLS.aaveV3Pool,
  ],
  "health-factor": [
    PROTOCOLS.venusComptroller,
    PROTOCOLS.venusVBNB,
    PROTOCOLS.aaveV3Pool,
  ],
};

/**
 * Capabilities that leave no trace at the contract you called.
 *
 * Measured on live BSC: over 3,000 blocks the PancakeSwap V3 SwapRouter and
 * the V2 Router emit **zero** logs. They are pass-through contracts — the
 * `Swap` event comes from the pool, not the router. So scanning for logs
 * emitted *by* a router finds nothing however much an agent trades, and every
 * grid-trading agent was being recorded as having touched nothing.
 *
 * That is silent and total: with `granted ⊆ proven` it would deny authority to
 * every grid agent forever, for a reason that has nothing to do with the agent.
 *
 * These probes look instead for the evidence a swap actually leaves: a pool's
 * `Swap` event naming the wallet as the recipient.
 */
export interface EventProbe {
  /** keccak of the event signature. */
  topic0: string;
  /** Which indexed position carries the wallet. */
  position: 1 | 2 | 3;
  /** Attributed to this protocol when found. */
  protocol: string;
  label: string;
}

export const CATEGORY_EVENT_PROBES: Record<Category, readonly EventProbe[]> = {
  "grid-trading": [
    {
      // Swap(address indexed sender, address indexed recipient, int256, int256,
      //      uint160, uint128, int24, uint128, uint128)
      topic0: "0x19b47279256b2a23a1665c810c8d55a1758940ee09377d4f8d26497a3577dc83",
      position: 2,
      protocol: PROTOCOLS.pancakeV3Router,
      label: "PancakeSwap V3 swap, wallet as recipient",
    },
    {
      // Swap(address indexed sender, uint, uint, uint, uint, address indexed to)
      topic0: "0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822",
      position: 2,
      protocol: PROTOCOLS.pancakeV2Router,
      label: "PancakeSwap V2 swap, wallet as recipient",
    },
  ],
  rebalancing: [],
  "yield-optimisation": [],
  "health-factor": [],
};

export const PROTOCOL_LABEL: Record<string, string> = {
  [PROTOCOLS.pancakeV3Router]: "PancakeSwap V3 Router",
  [PROTOCOLS.pancakeV2Router]: "PancakeSwap V2 Router",
  [PROTOCOLS.pancakeV3PositionManager]: "PancakeSwap V3 Positions",
  [PROTOCOLS.pancakeMasterChefV3]: "PancakeSwap MasterChef V3",
  [PROTOCOLS.venusComptroller]: "Venus Comptroller",
  [PROTOCOLS.venusVBNB]: "Venus vBNB",
  [PROTOCOLS.aaveV3Pool]: "Aave V3 Pool",
};

export const txUrl = (hash: string) => `${EXPLORER}/tx/${hash}`;
export const addressUrl = (addr: string) => `${EXPLORER}/address/${addr}`;
