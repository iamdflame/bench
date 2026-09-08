/**
 * The ABIs, hand-written to the fragments actually called.
 *
 * A full artifact ABI is thousands of lines of surface this product never
 * touches, and every unused fragment is a function somebody could later call
 * by accident. These are the reads and writes that appear in this codebase and
 * nothing else.
 */

import { parseAbi } from "viem";

/** ERC-8004 identity. `totalSupply` is deliberately absent: the deployed registry reverts on it. */
export const IDENTITY_ABI = parseAbi([
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function tokenURI(uint256 tokenId) view returns (string)",
  "function balanceOf(address owner) view returns (uint256)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
]);

export const ERC20_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 value) returns (bool)",
  "function transfer(address to, uint256 value) returns (bool)",
]);

/**
 * EIP-3009, the thing x402's `exact` scheme actually needs.
 *
 * Checked directly against BSC USDT and USDC: neither implements
 * `authorizationState` or `DOMAIN_SEPARATOR`, so neither can settle an x402
 * `exact` payment. USD1 and $U can. That is why the price on this site is
 * quoted in those two and not in the stablecoin most people hold.
 */
export const EIP3009_ABI = parseAbi([
  "function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s)",
  "function authorizationState(address authorizer, bytes32 nonce) view returns (bool)",
  "function DOMAIN_SEPARATOR() view returns (bytes32)",
  "function name() view returns (string)",
  "function version() view returns (string)",
]);

export const V3_POOL_ABI = parseAbi([
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint32 feeProtocol, bool unlocked)",
  "function liquidity() view returns (uint128)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function fee() view returns (uint24)",
  "function observe(uint32[] secondsAgos) view returns (int56[] tickCumulatives, uint160[] secondsPerLiquidityCumulativeX128)",
  "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint128 protocolFeesToken0, uint128 protocolFeesToken1)",
]);

export const V3_POSITIONS_ABI = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function positions(uint256 tokenId) view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)",
]);

export const V3_FACTORY_ABI = parseAbi([
  "function getPool(address tokenA, address tokenB, uint24 fee) view returns (address)",
]);

export const VENUS_COMPTROLLER_ABI = parseAbi([
  // `error` is a reserved Solidity keyword, so the first return is named
  // `errCode` here. The position is what matters on the wire; the name is ours.
  "function getAccountLiquidity(address account) view returns (uint256 errCode, uint256 liquidity, uint256 shortfall)",
  "function getAssetsIn(address account) view returns (address[])",
  "function markets(address vToken) view returns (bool isListed, uint256 collateralFactorMantissa, bool isVenus)",
  "function oracle() view returns (address)",
  "function closeFactorMantissa() view returns (uint256)",
  "function liquidationIncentiveMantissa() view returns (uint256)",
]);

export const VTOKEN_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function borrowBalanceStored(address) view returns (uint256)",
  "function exchangeRateStored() view returns (uint256)",
  "function underlying() view returns (address)",
  "function supplyRatePerBlock() view returns (uint256)",
  "function borrowRatePerBlock() view returns (uint256)",
  "function mint(uint256 mintAmount) returns (uint256)",
  "function redeemUnderlying(uint256 redeemAmount) returns (uint256)",
  "function repayBorrow(uint256 repayAmount) returns (uint256)",
]);

export const MASTERCHEF_V3_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
  "function userPositionInfos(uint256 tokenId) view returns (uint128 liquidity, int24 tickLower, int24 tickUpper, uint256 rewardGrowthInside, uint256 reward, address user, uint256 pid, uint256 boostMultiplier)",
  "function pendingCake(uint256 tokenId) view returns (uint256)",
  "function harvest(uint256 tokenId, address to) returns (uint256)",
]);

/**
 * The `RecipientBound` wrapper. Four functions, no recipient argument anywhere.
 *
 * The absence of `recipient` in these signatures is the product claim: a
 * session key can bind a target and four bytes but never an argument, so the
 * destination is not passable because it is not in the interface.
 */
export const RECIPIENT_BOUND_ABI = parseAbi([
  "function principal() view returns (address)",
  "function agent() view returns (address)",
  "function positionManager() view returns (address)",
  "function expiry() view returns (uint64)",
  "function cap0() view returns (uint256)",
  "function cap1() view returns (uint256)",
  "function spent0() view returns (uint256)",
  "function spent1() view returns (uint256)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function mint(uint24 fee, int24 tickLower, int24 tickUpper, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, uint256 deadline) returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)",
  "function increaseLiquidity(uint256 tokenId, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, uint256 deadline) returns (uint128 liquidity, uint256 amount0, uint256 amount1)",
  "function decreaseLiquidity(uint256 tokenId, uint128 liquidity, uint256 amount0Min, uint256 amount1Min, uint256 deadline) returns (uint256 amount0, uint256 amount1)",
  "function collect(uint256 tokenId, uint128 amount0Max, uint128 amount1Max) returns (uint256 amount0, uint256 amount1)",
]);

export const V3_ROUTER_ABI = parseAbi([
  "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) payable returns (uint256 amountOut)",
]);

/**
 * Event signature hashes, precomputed.
 *
 * PancakeSwap's routers emit no events of their own — the `Swap` comes from
 * the pool. A capability scan that looks for logs emitted *by* a router finds
 * nothing however much an agent trades, which is why the grid probe looks for
 * a pool's `Swap` naming the wallet as recipient instead.
 */
export const TOPIC = {
  /** Swap(address indexed sender, address indexed recipient, int256, int256, uint160, uint128, int24, uint128, uint128) */
  v3Swap: "0x19b47279256b2a23a1665c810c8d55a1758940ee09377d4f8d26497a3577dc83",
  /** Swap(address indexed sender, uint, uint, uint, uint, address indexed to) */
  v2Swap: "0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822",
  /** Transfer(address,address,uint256) */
  transfer: "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
  /** Mint(address indexed sender, address indexed owner, int24, int24, uint128, uint256, uint256) — V3 pool */
  v3Mint: "0x7a53080ba414158be7ec69b987b5fb7d07dee101fe85488f0853ae16239d0bde",
} as const;
