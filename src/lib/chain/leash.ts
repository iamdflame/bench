/**
 * The leashes: the contracts a session is granted on instead of a protocol.
 *
 * A session grant is a target and a selector. It cannot constrain arguments,
 * and PancakeSwap's position manager (`mint`, `collect`) and swap router
 * (`exactInputSingle`) both take a `recipient` argument. A session allowed to
 * call them directly may send the principal's tokens to any address it names.
 *
 * So rebalancing sessions are granted on RecipientBound and grid sessions on
 * SwapBound. Neither has a recipient parameter anywhere; both write the
 * principal from immutable storage, cap what can be committed for their whole
 * life, and stop working at their expiry, on chain.
 *
 * Both are verified on Sourcify (full match). Each is bound to one principal;
 * these are the ones bound to the demo address.
 */

import { parseAbi, type Address } from "viem";

export const RECIPIENT_BOUND = (process.env.RECIPIENT_BOUND ?? "0x5863EDAEDe7394470db19395CA05B1439662952E") as Address;
export const SWAP_BOUND = (process.env.SWAP_BOUND ?? "0x1cf9C5E9339E99e3Bfd45f117ca17E6e1A4E59D1") as Address;

export const POSITION_MANAGER: Address = "0x46A15B0b27311cedF172AB29E4f4766fbE7F4364";
export const SWAP_ROUTER: Address = "0x13f4EA83D0bd40E75C8222255bc855a974568Dd4";
export const WBNB_USDT_POOL: Address = "0x36696169C63e42cd08ce11f5deeBbCeBae652050";
export const USDT: Address = "0x55d398326f99059fF775485246999027B3197955";
export const WBNB: Address = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";

export const RECIPIENT_BOUND_ABI = parseAbi([
  "function mint(uint24 fee,int24 tickLower,int24 tickUpper,uint256 amount0Desired,uint256 amount1Desired,uint256 amount0Min,uint256 amount1Min,uint256 deadline) returns (uint256 tokenId,uint128 liquidity,uint256 amount0,uint256 amount1)",
  "function increaseLiquidity(uint256 tokenId,uint256 amount0Desired,uint256 amount1Desired,uint256 amount0Min,uint256 amount1Min,uint256 deadline) returns (uint128 liquidity,uint256 amount0,uint256 amount1)",
  "function decreaseLiquidity(uint256 tokenId,uint128 liquidity,uint256 amount0Min,uint256 amount1Min,uint256 deadline) returns (uint256 amount0,uint256 amount1)",
  "function collect(uint256 tokenId,uint128 amount0Max,uint128 amount1Max) returns (uint256 amount0,uint256 amount1)",
  "function principal() view returns (address)",
  "function agent() view returns (address)",
  "function expiry() view returns (uint64)",
  "function cap0() view returns (uint256)",
  "function cap1() view returns (uint256)",
  "function spent0() view returns (uint256)",
  "function spent1() view returns (uint256)",
  "event Minted(uint256 indexed tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)",
]);

export const SWAP_BOUND_ABI = parseAbi([
  "function swap(bool sellA,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96,uint256 deadline) returns (uint256 amountOut)",
  "function principal() view returns (address)",
  "function agent() view returns (address)",
  "function tokenA() view returns (address)",
  "function tokenB() view returns (address)",
  "function fee() view returns (uint24)",
  "function capA() view returns (uint256)",
  "function capB() view returns (uint256)",
  "function spentA() view returns (uint256)",
  "function spentB() view returns (uint256)",
  "function expiry() view returns (uint64)",
  "event Swapped(address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut)",
]);

/**
 * A call a category may be granted, and the protocol whose use by the agent
 * is the evidence for granting it. For a leash, the evidence is the protocol
 * behind it: an agent that has managed V3 positions has earned RecipientBound.
 */
export interface LeashCall {
  to: Address;
  signature: string;
  protocol: Address;
}

export const RANGE_CALLS: LeashCall[] = [
  { to: RECIPIENT_BOUND, protocol: POSITION_MANAGER, signature: "mint(uint24,int24,int24,uint256,uint256,uint256,uint256,uint256)" },
  { to: RECIPIENT_BOUND, protocol: POSITION_MANAGER, signature: "increaseLiquidity(uint256,uint256,uint256,uint256,uint256,uint256)" },
  { to: RECIPIENT_BOUND, protocol: POSITION_MANAGER, signature: "decreaseLiquidity(uint256,uint128,uint256,uint256,uint256)" },
  { to: RECIPIENT_BOUND, protocol: POSITION_MANAGER, signature: "collect(uint256,uint128,uint128)" },
];

export const GRID_CALLS: LeashCall[] = [
  { to: SWAP_BOUND, protocol: SWAP_ROUTER, signature: "swap(bool,uint256,uint256,uint160,uint256)" },
];
