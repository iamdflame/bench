/**
 * The agents we operate, evaluated live.
 *
 * Runs all four strategies in dry mode against the chain on request and
 * returns what each observed, alongside the session authority it currently
 * holds. Nothing is sent: this is the read side.
 *
 * Showing the observation rather than a status badge is deliberate. "Healthy"
 * tells a visitor nothing; "Venus pays 0.06% APR and moving 0.000195 BNB would
 * earn less than the gas to move it" tells them the agent is reasoning.
 */

import type { Address } from "viem";
import { CATEGORIES, CATEGORY_LABEL } from "@/lib/config";
import { STRATEGIES, buildContext } from "@/agents/registry";
import { loadMeta } from "@/lib/chain/session";
import { readOpenAttestation } from "@/lib/settlement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FALLBACK_WALLET = (process.env.AGENT_A_ADDR ??
  "0x54c06cC2623aAA2Dcc38B17fA07aD2e99b363C90") as Address;

/** Which mandate each operated agent is currently attached to, if any. */
const MANDATE_FOR: Record<string, number> = {
  rebalancing: 0,
  "health-factor": 1,
  "grid-trading": 2,
};

export async function GET() {
  const now = Math.floor(Date.now() / 1000);

  const agents = await Promise.all(
    CATEGORIES.map(async (category) => {
      const strategy = STRATEGIES[category];
      const mandateId = MANDATE_FOR[category] ?? 0;
      const session = mandateId ? loadMeta(mandateId) : null;
      const wallet = (session?.walletAddress ?? FALLBACK_WALLET) as Address;
      const capWei = session ? BigInt(session.capWei) : 500_000_000_000_000n;

      const base = {
        category,
        label: CATEGORY_LABEL[category],
        name: strategy.name,
        describes: strategy.describe(),
        mandateId,
        wallet,
        session: session
          ? {
              key: session.sessionKey,
              allowlist: session.allowlist,
              capBnb: Number(session.capWei) / 1e18,
              expiresIn: Math.max(0, session.expiry - now),
              registered: session.registered,
              revoked: Boolean((session as { revokedAt?: string }).revokedAt),
            }
          : null,
        // The opening mark now comes from the chain, not a local file.
        benchmark: await readOpenAttestation(mandateId)
          .then((a) => (a ? { openBnb: Number(a.valuationWei) / 1e18, block: String(a.blockNumber) } : null))
          .catch(() => null),
      };

      try {
        const ctx = await buildContext({ category, wallet, capWei, mandateId });
        const decision = await strategy.evaluate(ctx);
        return {
          ...base,
          managingBnb: ctx.valuation.bnb,
          priceUsd: ctx.price.token0PerToken1,
          observed: decision.observed,
          actions: decision.actions.map((a: (typeof decision.actions)[number]) => ({
            kind: a.kind,
            reason: a.reason,
            expect: a.expect,
            to: a.call.address,
            call: a.call.functionName,
          })),
        };
      } catch (error) {
        return {
          ...base,
          managingBnb: null,
          priceUsd: null,
          observed: `could not evaluate: ${String(error).slice(0, 140)}`,
          actions: [],
        };
      }
    }),
  );

  return Response.json(
    { at: new Date().toISOString(), agents },
    { headers: { "cache-control": "no-store" } },
  );
}
