/**
 * Spending limits on an endpoint that anybody can call.
 *
 * `/api/activate` grants a real session key and registers it in the Altana
 * KeyStore, which costs the principal gas. That is the point: the hire has to
 * actually happen or the product is a mock. It also means an unauthenticated
 * POST spends money, and the honest name for that is a faucet.
 *
 * Left alone it fails in the worst possible order. The first few callers get a
 * working hire, the reserve empties, and every judge after that gets an error
 * on the one screen the whole submission rests on. So the limits are here, and
 * they are chosen to fail early and legibly rather than late and silently:
 *
 *   PER CALLER   a short window, because a person hiring an agent does it once
 *                and a script does it a thousand times.
 *   PER DAY      a global ceiling, so a distributed caller cannot walk around
 *                the per-caller limit.
 *   FLOOR        a balance below which no grant is attempted at all. Reaching
 *                it returns the plan and says the reserve is out, which is a
 *                true sentence, rather than letting a transaction fail on chain
 *                and reporting that as a bug.
 *
 * In-memory, so it resets when an instance recycles. That is the wrong tool for
 * a bank and the right one here: it costs nothing, it needs no service, and the
 * balance floor is the backstop that actually bounds the loss.
 */

import { formatEther } from "viem";
import { marketClient } from "@/lib/chain/market";

/** Grants per caller per window. */
const PER_CALLER = 3;
const WINDOW_MS = 15 * 60_000;
/** Grants across all callers per day. */
const PER_DAY = 40;
/**
 * Gas the principal must still hold after a grant, in wei.
 *
 * A KeyStore registration is roughly 0.0005 BNB at the gas prices this chain
 * has been running at. The floor is well above one so the reserve never empties
 * mid-demo, and what is left still pays for the revocations that follow.
 */
const FLOOR_WEI = 800_000_000_000_000n; // 0.0008 BNB

const callers = new Map<string, number[]>();
let dayStamp = "";
let dayCount = 0;

export interface GuardVerdict {
  ok: boolean;
  /** Why it was refused, in a sentence a caller can act on. */
  reason?: string;
  /** What the principal still holds, for the honest message. */
  balanceBnb?: string;
}

/** Best-effort caller identity behind a proxy. Never used for anything but rate limiting. */
export function callerOf(request: Request): string {
  const h = request.headers;
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    h.get("cf-connecting-ip") ||
    "unknown"
  );
}

export async function checkGrantBudget(caller: string): Promise<GuardVerdict> {
  const now = Date.now();

  const today = new Date().toISOString().slice(0, 10);
  if (today !== dayStamp) {
    dayStamp = today;
    dayCount = 0;
  }
  if (dayCount >= PER_DAY) {
    return {
      ok: false,
      reason:
        `This deployment has granted its daily maximum of ${PER_DAY} sessions. The limit exists because ` +
        "each grant registers a key on chain and costs the principal gas, and an endpoint that spends " +
        "without a ceiling is a faucet. It resets at midnight UTC.",
    };
  }

  const hits = (callers.get(caller) ?? []).filter((t) => now - t < WINDOW_MS);
  if (hits.length >= PER_CALLER) {
    return {
      ok: false,
      reason:
        `You have granted ${PER_CALLER} sessions in the last ${Math.round(WINDOW_MS / 60_000)} minutes, ` +
        "which is the limit for one caller. Every one of them is on the desk and revocable.",
    };
  }

  /*
    The balance is read rather than assumed. A grant attempted with no gas
    fails on chain and reads to a visitor as a broken product; refused here it
    reads as a reserve that ran out, which is what actually happened.
  */
  let balance: bigint;
  try {
    const { adminAddress } = await import("@/lib/chain/session");
    balance = await marketClient.getBalance({ address: adminAddress() });
  } catch {
    // A balance we could not read is not a balance of zero, and refusing on an
    // RPC hiccup would turn an outage into a policy.
    return { ok: true };
  }
  if (balance < FLOOR_WEI) {
    return {
      ok: false,
      balanceBnb: Number(formatEther(balance)).toFixed(6),
      reason:
        `The gas reserve behind this deployment is down to ${Number(formatEther(balance)).toFixed(6)} BNB, ` +
        "below the floor a registered grant needs. Nothing was attempted, because a transaction sent " +
        "without gas would fail on chain and look like a broken product rather than an empty wallet.",
    };
  }

  return { ok: true };
}

/** Records a grant that actually happened. Called only on success. */
export function recordGrant(caller: string) {
  const now = Date.now();
  const hits = (callers.get(caller) ?? []).filter((t) => now - t < WINDOW_MS);
  hits.push(now);
  callers.set(caller, hits);
  dayCount += 1;
}
