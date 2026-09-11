/**
 * USDT supply rates on Venus and Aave at the current block.
 *
 * Venus quotes a rate per block; the annual figure multiplies it by blocks
 * per year measured from the chain's own recent block times, because BSC's
 * block time has changed twice this year and a constant from a model contract
 * would be quietly wrong. Aave v3 quotes an annual rate in ray; the third word
 * of `getReserveData` is read directly so a pool version with extra trailing
 * fields still decodes.
 */

import { encodeFunctionData, parseAbi, type Address } from "viem";
import { bscClient } from "@/lib/chain/rpc";
import { memo } from "@/lib/cache";

export const VUSDT: Address = "0xfD5840Cd36d94D7229439859C0112a4185BC0255";
export const AAVE_POOL: Address = "0x6807dc923806fE8Fd134338EABCA509979a7e0cB";
const USDT: Address = "0x55d398326f99059fF775485246999027B3197955";

const VTOKEN = parseAbi(["function supplyRatePerBlock() view returns (uint256)"]);
const AAVE = parseAbi(["function getReserveData(address) view returns (uint256)"]);

export interface Rates {
  venusApr: number;
  aaveApr: number | null;
  blocksPerYear: number;
  block: number;
}

async function measuredBlocksPerYear(): Promise<number> {
  const c = bscClient();
  const head = await c.getBlock();
  const back = await c.getBlock({ blockNumber: head.number - 20_000n });
  return 31_536_000 / (Number(head.timestamp - back.timestamp) / 20_000);
}

async function readRates(): Promise<Rates> {
  const c = bscClient();
  const [perBlock, bpy, raw, block] = await Promise.all([
    c.readContract({ address: VUSDT, abi: VTOKEN, functionName: "supplyRatePerBlock" }) as Promise<bigint>,
    measuredBlocksPerYear(),
    c.call({ to: AAVE_POOL, data: encodeFunctionData({ abi: AAVE, functionName: "getReserveData", args: [USDT] }) }).then((r) => r.data ?? null).catch(() => null),
    c.getBlockNumber(),
  ]);
  const aaveApr = raw && raw.length >= 2 + 64 * 3 ? Number(BigInt(`0x${raw.slice(2 + 128, 2 + 192)}`)) / 1e27 : null;
  return { venusApr: (Number(perBlock) / 1e18) * bpy, aaveApr, blocksPerYear: bpy, block: Number(block) };
}

export const usdtRates = () => memo("usdt-rates", { freshMs: 60_000, staleMs: 10 * 60_000 }, readRates);
