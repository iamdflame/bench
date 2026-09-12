/**
 * Judge Mode: we pay a stranger, so a visitor with no wallet can still see a
 * hire complete end to end.
 *
 * Everything else on this site asks a person to sign. That is right for money
 * that is theirs, and it is a wall for a judge with twelve minutes and no BNB.
 * So for a short list of agents that have already delivered for us, Mandate
 * pays the call itself, from a wallet whose address is printed next to the
 * button, and hands back the settlement transaction and the agent's answer.
 *
 * The limits are the interesting part, because a public endpoint that spends
 * money is a faucet unless they hold:
 *
 *   - one call a minute, globally, and a daily count shared by everyone
 *   - three a day per caller
 *   - a per-call ceiling, and never more than the payer actually holds
 *   - an off switch (`JUDGE_MODE=off`) that takes effect immediately
 *
 * The remaining allowance is computed from the payer's own balance rather than
 * promised, so the button never offers a call the wallet cannot cover.
 */

import { createHash } from "node:crypto";
import { parseAbi, parseEther, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { marketClient } from "@/lib/chain/market";
import { sql as pg } from "@/lib/db/client";
import { ensureTables as ensure } from "@/lib/db/tables";

/** The most a single sponsored call may cost, in token units (18 decimals). */
export const MAX_CALL = parseEther(process.env.JUDGE_MAX_CALL ?? "0.05");
/** Calls a day, across everyone. */
export const DAILY = Number(process.env.JUDGE_DAILY ?? 10);
/** Calls a day from one caller. */
export const PER_CALLER = Number(process.env.JUDGE_PER_CALLER ?? 3);
/** One call a minute, globally. */
export const MIN_GAP_MS = 60_000;

const ERC20 = parseAbi(["function balanceOf(address) view returns (uint256)"]);

export function judgeModeOn(): boolean {
  return (process.env.JUDGE_MODE ?? "on").toLowerCase() !== "off";
}

export function sponsorKey(): Hex | null {
  const raw = process.env.AGENT_A_KEY;
  return raw ? ((raw.startsWith("0x") ? raw : `0x${raw}`) as Hex) : null;
}

export function sponsorAddress(): Address | null {
  const k = sponsorKey();
  return k ? privateKeyToAccount(k).address : null;
}

/** A caller, identified without keeping their address: a salted hash of the IP. */
export function callerHash(request: Request): string {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";
  return createHash("sha256").update(`${process.env.SESSION_SECRET ?? "mandate"}:${ip}`).digest("hex").slice(0, 32);
}

export interface Allowance {
  ok: boolean;
  /** Why a call cannot be made now, in a sentence for the page. */
  reason: string | null;
  /** Calls left today, the lower of the daily cap and what the wallet can cover. */
  left: number;
  usedToday: number;
  /** What the sponsoring wallet holds of the asset, in atomic units. */
  balance: bigint | null;
  sponsor: Address | null;
}

/**
 * Whether one more sponsored call may run, for this caller, for this price.
 *
 * Reads the counters and the payer's balance; writes nothing. The call itself
 * is logged by `noteSponsored` only once it has actually been attempted.
 */
export async function allowance(opts: { caller: string; asset?: Address; price?: bigint }): Promise<Allowance> {
  const sponsor = sponsorAddress();
  if (!judgeModeOn()) return { ok: false, reason: "Judge Mode is switched off on this deployment.", left: 0, usedToday: 0, balance: null, sponsor };
  if (!sponsor) return { ok: false, reason: "This deployment holds no sponsoring key, so it cannot pay for you.", left: 0, usedToday: 0, balance: null, sponsor: null };

  let usedToday = 0;
  let usedByCaller = 0;
  let lastAt: Date | null = null;
  if (await ensure()) {
    try {
      const rows = (await pg!`
        select
          count(*) filter (where at > now() - interval '1 day') as today,
          count(*) filter (where at > now() - interval '1 day' and caller = ${opts.caller}) as mine,
          max(at) as last_at
        from sponsored_calls
      `) as { today: string; mine: string; last_at: Date | null }[];
      usedToday = Number(rows[0]?.today ?? 0);
      usedByCaller = Number(rows[0]?.mine ?? 0);
      lastAt = rows[0]?.last_at ?? null;
    } catch {
      /* no counters: the caps below still apply per request */
    }
  }

  const balance =
    opts.asset && sponsor
      ? ((await marketClient.readContract({ address: opts.asset, abi: ERC20, functionName: "balanceOf", args: [sponsor] }).catch(() => null)) as bigint | null)
      : null;
  const affordable = opts.price && opts.price > 0n && balance !== null ? Number(balance / opts.price) : DAILY;
  const left = Math.max(0, Math.min(DAILY - usedToday, affordable));

  if (opts.price && opts.price > MAX_CALL) {
    return { ok: false, reason: "That call costs more than a sponsored hire may spend.", left, usedToday, balance, sponsor };
  }
  if (usedToday >= DAILY) {
    return { ok: false, reason: `Today's sponsored calls are used up (${DAILY}). It resets on the hour, or you can pay it yourself with a wallet.`, left: 0, usedToday, balance, sponsor };
  }
  if (usedByCaller >= PER_CALLER) {
    return { ok: false, reason: `You have used your ${PER_CALLER} sponsored calls for today. You can still pay the agent yourself.`, left, usedToday, balance, sponsor };
  }
  if (lastAt && Date.now() - new Date(lastAt).getTime() < MIN_GAP_MS) {
    const wait = Math.ceil((MIN_GAP_MS - (Date.now() - new Date(lastAt).getTime())) / 1000);
    return { ok: false, reason: `Somebody else is being served. Try again in ${wait} seconds.`, left, usedToday, balance, sponsor };
  }
  if (opts.price && balance !== null && balance < opts.price) {
    return { ok: false, reason: "The sponsoring wallet is out of that stablecoin. You can still pay the agent yourself.", left: 0, usedToday, balance, sponsor };
  }
  return { ok: true, reason: null, left, usedToday, balance, sponsor };
}

/** Records that a sponsored call was attempted, whatever the seller then did. */
export async function noteSponsored(caller: string, tokenId: string): Promise<void> {
  if (!(await ensure())) return;
  await pg!`insert into sponsored_calls (caller, token_id) values (${caller}, ${tokenId})`.catch(() => undefined);
}
