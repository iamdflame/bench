/**
 * The opening mark for an award.
 *
 * Accepting a bid requires an `Observation`: what the agent's wallet is worth
 * at the moment the job starts, priced from a pool on chain, with the block it
 * was read at. Without a fixed starting point there is nothing to measure the
 * agent against later, which is why the contract insists on one.
 *
 * It is computed here rather than in the browser because valuing a wallet means
 * several contract reads and a pool price, and a wallet valued by the person
 * about to be judged on it would not be worth much.
 */

import { NextResponse } from "next/server";
import { isAddress, type Address } from "viem";
import { valueWallet } from "@/lib/chain/prices";

export const runtime = "nodejs";
export const revalidate = 0;

export async function GET(req: Request) {
  const wallet = new URL(req.url).searchParams.get("agent");
  if (!wallet || !isAddress(wallet)) {
    return NextResponse.json({ error: "Pass a valid agent address." }, { status: 400 });
  }

  try {
    const v = await valueWallet(wallet as Address);
    if (v.weiTotal === 0n) {
      return NextResponse.json(
        {
          error:
            "This agent's wallet values at zero, and the contract refuses an opening mark of zero. There would be nothing to measure it against.",
        },
        { status: 409 },
      );
    }
    return NextResponse.json({
      wallet,
      valuationWei: v.weiTotal.toString(),
      gasSpentWei: "0",
      priceX96: v.sqrtPriceX96.toString(),
      blockNumber: v.blockNumber.toString(),
      breakdownRef: `0x${"0".repeat(64)}`,
      // Under a Hold benchmark the starting value is the benchmark: it does not
      // move, so alpha reduces to the raw return.
      benchmarkWei: v.weiTotal.toString(),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "The wallet could not be valued." },
      { status: 502 },
    );
  }
}
